"""Bounded, best-effort page ingestion for Anthreed's inline reader."""
from __future__ import annotations

import concurrent.futures
import logging
import re
from urllib.parse import urlsplit

import requests
from bs4 import BeautifulSoup

try:
    from trafilatura import extract as extract_main
except ImportError:
    extract_main = None

LOG = logging.getLogger('anthreed.fetch')
MAX_CONTENT_CHARS = 100_000
MAX_HTML_BYTES = 3_000_000
MIN_CONTENT_CHARS = 160


def normalize_body(text):
    paragraphs = [re.sub(r'[^\S\n]+', ' ', p).strip()
                  for p in re.split(r'\n\s*\n', text or '')]
    return '\n\n'.join(p for p in paragraphs if p)[:MAX_CONTENT_CHARS].rstrip()


def extract_body(html, url=None):
    """Return actual article paragraphs, or None for shells and access errors."""
    soup = BeautifulSoup(html, 'html.parser')
    title = ' '.join(node.get_text(' ', strip=True) for node in soup.select('title, h1'))
    if re.search(r'just a moment|access denied|page not found|verify you are human|页面不存在|访问过于频繁', title, re.I):
        return None
    if extract_main is not None:
        try:
            text = extract_main(html, url=url, output_format='txt', include_comments=False,
                                include_tables=False, favor_precision=True)
        except Exception as error:
            LOG.warning('Main extractor unavailable (%s); trying HTML paragraphs', type(error).__name__)
            text = None
        # Plain text output uses single newlines between blocks. Keep paragraphs
        # distinct for the reader rather than collapsing them into one summary.
        body = normalize_body(re.sub(r'\n+', '\n\n', text or ''))
        if len(body) >= MIN_CONTENT_CHARS:
            return body
    for node in soup.select('script, style, nav, header, footer, aside, form, noscript, [hidden], [role="navigation"], .comments, .share, .related, .cookie-banner'):
        node.decompose()
    candidates = soup.select('article, main, [role="main"], .article-content, .post-content, .entry-content, #js_content')
    # A generic body is accepted only when it contains real prose paragraphs.
    if not candidates:
        candidates = [soup.body or soup]
    best = ''
    for candidate in candidates:
        blocks = []
        for node in candidate.select('p, h2, h3, li, blockquote, pre'):
            if node.find_parent(['p', 'li', 'blockquote', 'pre']) is not None:
                continue
            text = node.get_text(' ', strip=True)
            if text and (len(text) >= 35 or node.name in ('h2', 'h3')):
                blocks.append(text)
        # WeChat articles often use nested sections and line breaks rather than p.
        if not blocks and candidate.get('id') == 'js_content':
            blocks = candidate.get_text('\n', strip=True).splitlines()
        body = normalize_body('\n\n'.join(blocks))
        if len(body) > len(best):
            best = body
    return best if len(best) >= MIN_CONTENT_CHARS else None


def fetch_body(url):
    parts = urlsplit(url)
    if parts.scheme not in ('http', 'https') or not parts.hostname:
        raise ValueError('invalid article URL')
    with requests.get(url, headers={
        'User-Agent': 'Anthreed/0.1 (personal article reader; best-effort body sync)',
        'Accept': 'text/html,application/xhtml+xml',
    }, timeout=(8, 15), stream=True) as response:
        response.raise_for_status()
        content_type = response.headers.get('Content-Type', '').lower()
        if content_type and not any(t in content_type for t in ('text/html', 'application/xhtml+xml')):
            raise ValueError('not an HTML page')
        chunks, size = [], 0
        for chunk in response.iter_content(64 * 1024):
            size += len(chunk)
            if size > MAX_HTML_BYTES:
                raise ValueError('page too large')
            chunks.append(chunk)
        raw = b''.join(chunks)
        # Prefer the declared HTML charset over requests' text/html latin-1 default.
        encoding = requests.utils.get_encoding_from_headers(response.headers)
        if not encoding or encoding.lower() == 'iso-8859-1':
            encoding = BeautifulSoup(raw, 'html.parser').original_encoding or 'utf-8'
        return extract_body(raw.decode(encoding, errors='replace'), url=response.url)


def enrich_articles(articles, previous=()):
    """Fill missing winner bodies, reusing successful text from the prior cycle.

    Failures are deliberately not cached so later cycles can retry. No generated
    prose or summaries are ever substituted for a failed page extraction.
    """
    known = {a['url']: a['content'] for a in previous
             if isinstance(a.get('content'), str) and a['content'].strip()}
    known.update({a['url']: a['content'] for a in articles
                  if isinstance(a.get('content'), str) and a['content'].strip()})
    pending = {}
    for row in articles:
        if isinstance(row.get('content'), str) and row['content'].strip():
            row.pop('content_note', None)
            continue
        if row['url'] in known:
            row['content'] = known[row['url']]
            row.pop('content_note', None)
        else:
            pending.setdefault(row['url'], []).append(row)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        jobs = {pool.submit(fetch_body, url): rows for url, rows in pending.items()}
        for job in concurrent.futures.as_completed(jobs):
            rows = jobs[job]
            try:
                body = job.result()
                note = None if body else '正文尚未同步：未提取到可读正文'
            except Exception as error:
                body, note = None, '正文尚未同步：页面获取失败'
                LOG.warning('Body unavailable id=%s (%s)', rows[0]['id'], type(error).__name__)
            for row in rows:
                row['content'] = body
                if note:
                    row['content_note'] = note
                else:
                    row.pop('content_note', None)
                    LOG.info('Body synced id=%s chars=%d', row['id'], len(body))
    return articles
