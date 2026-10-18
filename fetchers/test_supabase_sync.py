import unittest
from unittest.mock import Mock

import requests

from fetchers.supabase_sync import sync_feed


class SupabaseSyncTests(unittest.TestCase):
    def setUp(self):
        self.config = {'SUPABASE_URL': 'https://example.supabase.co', 'SUPABASE_SERVICE_ROLE_KEY': 'test-server-key'}
        self.session = Mock(headers={})
        self.response = Mock(ok=True)
        self.response.json.return_value = []
        self.session.request.return_value = self.response
        self.feed = {'selection_mode': 'deepseek', 'sources': [
            {'id': 'source', 'name': 'Source', 'url': 'https://example.com', 'status': 'ok'}],
            'articles': [{'id': 'new-id', 'source': 'source', 'title': 'Event',
                          'url': 'https://example.com/article', 'event_cluster_id': 'event',
                          'body': 'First paragraph.\n\nSecond paragraph.'}]}

    def sync(self):
        return sync_feed(self.feed, config=self.config, session=self.session)

    def writes(self):
        return [call for call in self.session.request.call_args_list if call.args[0] == 'POST']

    def test_missing_credentials_never_contacts_cloud(self):
        result = sync_feed(self.feed, config={}, session=self.session)
        self.assertEqual(result['status'], 'skipped')
        self.session.request.assert_not_called()

    def test_body_and_event_aliases_are_uploaded_in_dependency_order(self):
        result = self.sync()
        self.assertEqual(result['status'], 'synced')
        self.assertEqual(result['bodies'], 1)
        writes = self.writes()
        self.assertEqual([w.args[1].rsplit('/', 1)[1] for w in writes], ['sources', 'clusters', 'articles'])
        row = writes[-1].kwargs['json'][0]
        self.assertEqual(row['content'], self.feed['articles'][0]['body'])
        self.assertEqual(row['cluster_id'], 'event')
        self.assertNotIn('body', row)
        self.assertNotIn('event_cluster_id', row)
        self.assertTrue(all(w.kwargs['params']['on_conflict'] == 'id' for w in writes))
        self.assertEqual(self.session.headers['Authorization'], 'Bearer test-server-key')

    def test_existing_url_keeps_persisted_id_body_and_cluster_winner(self):
        self.response.json.return_value = [{'id': 'persisted', 'url': self.feed['articles'][0]['url'], 'content': 'Already fetched body'}]
        self.feed['articles'][0]['body'] = ' '
        self.sync()
        clusters, articles = self.writes()[1:]
        self.assertEqual(clusters.kwargs['json'][0]['winner_id'], 'persisted')
        self.assertEqual(articles.kwargs['json'][0]['id'], 'persisted')
        self.assertEqual(articles.kwargs['json'][0]['content'], 'Already fetched body')

    def test_changed_url_for_existing_id_updates_the_same_row(self):
        self.response.json.return_value = [{'id': 'new-id', 'url': 'https://example.com/previous', 'content': None}]
        self.assertEqual(self.sync()['status'], 'synced')
        self.assertEqual(self.writes()[-1].kwargs['json'][0]['id'], 'new-id')

    def test_duplicate_winners_fail_before_any_write(self):
        self.feed['articles'].append({**self.feed['articles'][0], 'id': 'second', 'url': 'https://example.com/second'})
        self.assertEqual(self.sync()['status'], 'failed')
        self.assertEqual(self.writes(), [])

    def test_network_exceptions_never_log_request_or_secret_values(self):
        self.session.request.side_effect = requests.ConnectionError('test-server-key in exception URL')
        with self.assertLogs('anthreed.supabase', level='WARNING') as logs:
            result = self.sync()
        self.assertEqual(result['reason'], 'ConnectionError')
        self.assertNotIn('test-server-key', ''.join(logs.output))

    def test_http_failures_keep_local_feed_usable(self):
        self.response.ok = False
        self.response.status_code = 503
        self.assertEqual(self.sync()['reason'], 'HTTP 503')
        self.assertEqual(self.writes(), [])


if __name__ == '__main__':
    unittest.main()
