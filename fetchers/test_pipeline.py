import json
import unittest
import tempfile
from pathlib import Path
from unittest.mock import Mock, patch
from fetchers.run import article, canonical_url, deepseek_clusters, fallback_clusters, parse_feed, run


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.sync = patch('fetchers.run.sync_feed').start()
        self.addCleanup(patch.stopall)
        self.a = article('guizang', '同一模型发布', '深度介绍', 'https://example.com/a', '2026-10-18')
        self.b = article('qiaomu', '同一模型发布', '完整的介绍及评测', 'https://example.com/b', '2026-10-18')

    def model(self, clusters):
        response = Mock()
        response.json.return_value = {'choices': [{'message': {'content': json.dumps({'clusters': clusters})}}]}
        return response

    def test_canonical_tracking_preserves_event_anchor(self):
        self.assertEqual(canonical_url('https://Example.com/updates/?utm_source=feed#model-a'), 'https://example.com/updates#model-a')

    def test_reject_javascript_article_url(self):
        with self.assertRaises(ValueError): canonical_url('javascript:alert(1)')

    def test_html_is_not_silently_accepted_as_rss(self):
        with self.assertRaises(ValueError): parse_feed('<html><body>Not RSS</body></html>')

    def test_rss_namespaces_and_dates(self):
        rows = parse_feed('<rss><channel><item><title>文章</title><link>https://example.com/read</link><description>摘要</description><pubDate>Sun, 18 Oct 2026 00:00:00 GMT</pubDate></item></channel></rss>')
        self.assertEqual(rows[0]['source'], 'qiaomu')
        self.assertTrue(rows[0]['published_at'].startswith('2026-10-18'))

    def test_fallback_merges_identical_titles(self):
        groups = fallback_clusters([self.a, self.b])
        self.assertEqual(len(groups), 1)
        self.assertEqual(groups[0]['winner_id'], self.b['id'])

    @patch.dict('os.environ', {'DEEPSEEK_API_KEY': 'test-only-not-a-secret'})
    def test_model_rejects_missing_or_repeated_ids(self):
        for ids in [[self.a['id']], [self.a['id'], self.a['id']]]:
            with patch('fetchers.run.requests.post', return_value=self.model([{'article_ids': ids, 'winner_id': self.a['id'], 'reason': 'reason'}])):
                with self.assertRaises(ValueError): deepseek_clusters([self.a, self.b])

    @patch.dict('os.environ', {'DEEPSEEK_API_KEY': 'test-only-not-a-secret'})
    def test_model_rejects_winner_outside_cluster(self):
        with patch('fetchers.run.requests.post', return_value=self.model([{'article_ids': [self.a['id'], self.b['id']], 'winner_id': 'unknown', 'reason': 'reason'}])):
            with self.assertRaises(ValueError): deepseek_clusters([self.a, self.b])

    @patch.dict('os.environ', {'DEEPSEEK_API_KEY': 'test-only-not-a-secret'})
    def test_hard_duplicate_guard_merges_split_model_clusters(self):
        groups = [{'article_ids': [a['id']], 'winner_id': a['id'], 'reason': 'reason'} for a in [self.a, self.b]]
        with patch('fetchers.run.requests.post', return_value=self.model(groups)):
            result = deepseek_clusters([self.a, self.b])
        self.assertEqual(len(result), 1)
        self.assertEqual(set(result[0]['article_ids']), {self.a['id'], self.b['id']})

    def test_model_outage_preserves_previous_curated_winners(self):
        rows = [article('aihot', f'Article {i}', 'summary', f'https://example.com/{i}', '2026-10-18') for i in range(6)]
        previous = {'selection_mode': 'deepseek', 'articles': [self.a], 'generated_at': 'previous'}
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            (path / 'articles.json').write_text(json.dumps(previous))
            with patch('fetchers.run.DATA', path), patch('fetchers.run.fetch_aihot', return_value=(rows, {})), patch('fetchers.run.fetch_qiaomu', return_value=([], {})), patch('fetchers.run.fetch_guizang', return_value=([], {})), patch('fetchers.run.deepseek_clusters', side_effect=RuntimeError('offline')), patch('fetchers.run.enrich_articles') as enrich:
                run()
                enrich.assert_called_once_with(previous['articles'])
                self.sync.assert_called_once()
                self.assertTrue(self.sync.call_args.args[0]['selection_stale'])
            result = json.loads((path / 'articles.json').read_text())
        self.assertEqual(result['articles'], previous['articles'])
        self.assertTrue(result['selection_stale'])
        self.assertEqual(result['generated_at'], 'previous')

    def test_selected_body_is_persisted_with_local_or_model_selection(self):
        rows = [article('aihot', f'独立事件 {i}', 'summary', f'https://example.com/{i}', '2026-10-18') for i in range(6)]
        groups = [{'article_ids': [a['id']], 'winner_id': a['id'], 'reason': 'selected'} for a in rows]
        body = 'This is the actual fetched page body.\n\nA second paragraph from the same page.'
        for local in (True, False):
            with self.subTest(local=local), tempfile.TemporaryDirectory() as directory:
                path = Path(directory)
                with patch('fetchers.run.DATA', path), patch('fetchers.run.fetch_aihot', return_value=(rows, {})), patch('fetchers.run.fetch_qiaomu', return_value=([], {})), patch('fetchers.run.fetch_guizang', return_value=([], {})), patch('fetchers.run.deepseek_clusters', side_effect=RuntimeError('offline') if local else None, return_value=groups), patch('fetchers.body.fetch_body', return_value=body):
                    run()
                self.assertEqual(self.sync.call_args.args[0]['articles'][0]['content'], body)
                result = json.loads((path / 'articles.json').read_text())
                self.assertTrue(result['articles'])
                self.assertTrue(all(a['content'] == body for a in result['articles']))


if __name__ == '__main__':
    unittest.main()
