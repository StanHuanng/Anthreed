"""Verify cloud migration without printing credentials, URLs, or article data."""
from __future__ import annotations

import json
from pathlib import Path

import requests
from dotenv import dotenv_values

ROOT = Path(__file__).resolve().parents[1]


def verify():
    config = dotenv_values(ROOT / '.env')
    base = config['SUPABASE_URL'].rstrip('/') + '/rest/v1/'
    local = json.loads((ROOT / 'data/articles.json').read_text())
    result = {'local_winners': len(local['articles']),
              'local_bodies': sum(bool((a.get('content') or a.get('body') or '').strip()) for a in local['articles'])}
    for role, key_name, tables in [
        ('service', 'SUPABASE_SERVICE_ROLE_KEY', ['articles']),
        ('anon', 'SUPABASE_ANON_KEY', ['sources', 'clusters', 'articles', 'feed_articles']),
    ]:
        key = config[key_name]
        headers = {'apikey': key, 'Authorization': 'Bearer ' + key, 'Prefer': 'count=exact'}
        for table in tables:
            response = requests.head(base + table, params={'select': 'id', 'limit': 1}, headers=headers, timeout=(10, 30))
            count = response.headers.get('Content-Range', '').split('/')[-1]
            result[role + '_' + table] = {'status': response.status_code, 'count': int(count) if response.ok and count.isdigit() else None}
    result.update({'matched_urls': 0, 'matched_bodies': 0, 'cloud_bodies': None})
    if result['anon_feed_articles']['status'] == 200:
        key = config['SUPABASE_ANON_KEY']
        headers = {'apikey': key, 'Authorization': 'Bearer ' + key}
        rows, offset = [], 0
        while True:
            response = requests.get(base + 'feed_articles', params={
                'select': 'id,url,cluster_id,content', 'order': 'id.asc', 'limit': 1000, 'offset': offset,
            }, headers=headers, timeout=(10, 30))
            if not response.ok:
                return result
            page = response.json()
            rows.extend(page)
            if len(page) < 1000:
                break
            offset += len(page)
        by_url = {a['url']: a for a in rows}
        result['cloud_bodies'] = sum(bool((a.get('content') or '').strip()) for a in rows)
        result['unique_urls'] = len(by_url)
        result['unique_clusters'] = len({a['cluster_id'] for a in rows})
        for article in local['articles']:
            cloud = by_url.get(article['url'])
            if cloud and cloud['cluster_id'] == (article.get('cluster_id') or article.get('event_cluster_id')):
                result['matched_urls'] += 1
                body = (article.get('content') or article.get('body') or '').strip()
                if body and body == (cloud.get('content') or '').strip():
                    result['matched_bodies'] += 1
    return result


if __name__ == '__main__':
    try:
        result = verify()
    except Exception as error:
        # An exception may contain request headers/URLs. Report only its class.
        result = {'verification_error': type(error).__name__}
    output = ROOT / 'qa/supabase-wire/live-verification.json'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + '\n')
    print(json.dumps(result))
    passed = (result.get('local_winners', 0) > 0
              and result.get('matched_urls') == result.get('local_winners')
              and result.get('matched_bodies') == result.get('local_bodies')
              and result.get('service_articles', {}).get('status') == 200)
    raise SystemExit(0 if passed else 1)
