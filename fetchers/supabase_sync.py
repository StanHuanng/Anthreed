"""Server-only, retryable feed upload. Run: python3 -m fetchers.supabase_sync.

Local ingestion remains usable when cloud configuration or connectivity is missing.
Only sanitized status codes/counts are logged; never response bodies or credentials.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
LOG = logging.getLogger('anthreed.supabase')


class SyncError(Exception):
    pass


def _request(session, method, endpoint, **kwargs):
    response = session.request(method, endpoint, timeout=(10, 45), **kwargs)
    if not response.ok:
        raise SyncError(f'HTTP {response.status_code}')
    return response


def _existing_articles(session, base):
    rows, offset = [], 0
    while True:
        page = _request(session, 'GET', base + '/articles', params={
            'select': 'id,url,content', 'order': 'id.asc', 'limit': 1000, 'offset': offset,
        }).json()
        rows.extend(page)
        if len(page) < 1000:
            return rows
        offset += len(page)


def _upsert(session, base, table, rows):
    for start in range(0, len(rows), 100):
        _request(session, 'POST', base + '/' + table,
                 params={'on_conflict': 'id'}, json=rows[start:start + 100],
                 headers={'Prefer': 'resolution=merge-duplicates,return=minimal'})


def sync_feed(feed, *, config=None, session=None):
    """Upsert winners by stable id, resolving existing URL identities before writes.

    Retried batches converge after interrupted uploads. Missing bodies preserve a
    previously synchronized body. All payloads are validated before the first write.
    An explicit config/session also permits isolated tests without live credentials.
    """
    if config is None:
        load_dotenv(ROOT / '.env')
        config = os.environ
    url, key = config.get('SUPABASE_URL', ''), config.get('SUPABASE_SERVICE_ROLE_KEY', '')
    if not url or not key:
        LOG.info('Supabase sync skipped: server credentials missing')
        return {'status': 'skipped', 'articles': 0, 'reason': 'server credentials missing'}
    owned_session = session is None
    try:
        if urlsplit(url).scheme != 'https' or not urlsplit(url).hostname:
            raise SyncError('invalid Supabase URL')
        session = session or requests.Session()
        session.headers.update({'apikey': key, 'Authorization': 'Bearer ' + key})
        base = url.rstrip('/') + '/rest/v1'
        existing = _existing_articles(session, base)
        by_url = {a['url']: a for a in existing}
        by_id = {a['id']: a for a in existing}
        articles, clusters, seen_ids, seen_urls, seen_clusters = [], [], set(), set(), set()
        for item in feed['articles']:
            incoming_id, article_url = item['id'], item['url']
            cluster_id = item.get('cluster_id') or item.get('event_cluster_id')
            if not incoming_id or not cluster_id or not item.get('source') or not item.get('title'):
                raise SyncError('invalid winner fields')
            if urlsplit(article_url).scheme not in ('https', 'http') or not urlsplit(article_url).hostname:
                raise SyncError('invalid article URL')
            old = by_url.get(article_url) or by_id.get(incoming_id)
            article_id = old['id'] if old else incoming_id
            if incoming_id in by_id and article_id != incoming_id:
                raise SyncError('conflicting article identities')
            if article_id in seen_ids or article_url in seen_urls or cluster_id in seen_clusters:
                raise SyncError('duplicate event winner')
            seen_ids.add(article_id); seen_urls.add(article_url); seen_clusters.add(cluster_id)
            content = (item.get('content') or '').strip() or (item.get('body') or '').strip() or (old or {}).get('content')
            articles.append({
                'id': article_id, 'url': article_url, 'source': item['source'],
                'title': item['title'], 'summary': item.get('summary') or '',
                'content': content or None, 'author': item.get('author'),
                'published_at': item.get('published_at'), 'cluster_id': cluster_id,
                'fetched_at': feed.get('generated_at') or datetime.now(timezone.utc).isoformat(),
                'also_covered_by': item.get('also_covered_by') or [],
                'is_fixture': bool(item.get('is_fixture')),
                'selection_reason': item.get('selection_reason') or '',
            })
            clusters.append({
                'id': cluster_id, 'winner_id': article_id, 'event': item['title'],
                'reason': item.get('selection_reason') or '',
                'selection_mode': feed.get('selection_mode') or 'unknown',
            })
        source_map = {s['id']: {
            'id': s['id'], 'name': s.get('name') or s['id'], 'url': s['url'],
            'status': s.get('status') or 'waiting', 'last_success_at': s.get('last_success'),
        } for s in feed.get('sources', [])}
        for item in articles:
            if item['source'] not in source_map:
                raise SyncError('winner source is missing')
        _upsert(session, base, 'sources', list(source_map.values()))
        _upsert(session, base, 'clusters', clusters)
        _upsert(session, base, 'articles', articles)
        result = {'status': 'synced', 'articles': len(articles), 'clusters': len(clusters),
                  'sources': len(source_map), 'bodies': sum(bool(a['content']) for a in articles)}
        LOG.info('Supabase sync: %d articles, %d bodies, %d clusters, %d sources',
                 result['articles'], result['bodies'], result['clusters'], result['sources'])
        return result
    except Exception as error:
        reason = str(error) if isinstance(error, SyncError) else type(error).__name__
        LOG.warning('Supabase sync failed (%s); local feed retained', reason)
        return {'status': 'failed', 'articles': 0, 'reason': reason}
    finally:
        if owned_session and session is not None:
            session.close()


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', type=Path, default=ROOT / 'data/articles.json')
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format='%(levelname)s %(message)s')
    result = sync_feed(json.loads(args.file.read_text()))
    print(json.dumps(result))
    raise SystemExit(1 if result['status'] == 'failed' else 0)
