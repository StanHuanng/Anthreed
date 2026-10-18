import unittest
from unittest.mock import Mock, patch

import requests

from fetchers.body import MAX_CONTENT_CHARS, MAX_HTML_BYTES, enrich_articles, extract_body, fetch_body


PARAGRAPHS = [
    '阅读不只是收集信息，也是在完整的上下文中理解作者的思考。一个好的阅读器应该保留文章原有的段落，让读者能够停下来，重新思考前后两段之间的联系，而不是只看到一段压缩过的来源摘要。',
    '正文同步时，程序从公开页面获取真实文字，移除导航和重复的页脚信息。遇到无法访问的页面时，阅读器会清楚说明正文尚未同步。已经获取成功的段落会保留在本地数据中，下一次打开时可以继续阅读。',
    '在手机上阅读时，合适的行宽、段落间距和字号同样重要。读者可以选中一段文字，保存到自己的摘录中；也可以收藏整篇文章，留到时间更充裕的时候，再慢慢读完这些内容。',
]
HTML = '<html><head><meta charset="utf-8"><title>阅读的上下文</title></head><body><nav>菜单垃圾文字</nav><article><h1>阅读的上下文</h1>' + ''.join(f'<p>{p}</p>' for p in PARAGRAPHS) + '</article><footer>页脚垃圾文字</footer></body></html>'


class BodyTests(unittest.TestCase):
    def test_extractor_keeps_real_paragraphs_without_navigation(self):
        for fallback in (False, True):
            with self.subTest(fallback=fallback):
                if fallback:
                    with patch('fetchers.body.extract_main', None):
                        body = extract_body(HTML)
                else:
                    body = extract_body(HTML)
                self.assertTrue(all(p in body for p in PARAGRAPHS))
                self.assertIn('\n\n', body)
                self.assertNotIn('菜单垃圾文字', body)
                self.assertNotIn('页脚垃圾文字', body)

    def test_challenge_and_empty_shell_are_not_bodies(self):
        self.assertIsNone(extract_body('<html><title>Just a moment...</title><article><p>' + PARAGRAPHS[0] * 4 + '</p></article></html>'))
        self.assertIsNone(extract_body('<html><div id="root"></div></html>'))

    def test_main_extractor_error_still_uses_real_html_paragraphs(self):
        with patch('fetchers.body.extract_main', side_effect=ValueError('unsupported page')):
            body = extract_body(HTML)
        self.assertTrue(all(p in body for p in PARAGRAPHS))

    def test_content_length_is_capped(self):
        with patch('fetchers.body.extract_main', None):
            body = extract_body('<article><p>' + PARAGRAPHS[0] * 1500 + '</p></article>')
        self.assertLessEqual(len(body), MAX_CONTENT_CHARS)

    @patch('fetchers.body.requests.get')
    def test_http_fetch_decodes_chinese_html_and_uses_polite_limits(self, get):
        response = Mock(headers={'Content-Type': 'text/html'}, url='https://example.com/read')
        response.iter_content.return_value = [HTML.encode('utf8')]
        get.return_value.__enter__.return_value = response
        body = fetch_body('https://example.com/read')
        self.assertIn(PARAGRAPHS[0], body)
        self.assertEqual(get.call_args.kwargs['timeout'], (8, 15))
        self.assertIn('Anthreed', get.call_args.kwargs['headers']['User-Agent'])
        response.raise_for_status.assert_called_once()

    @patch('fetchers.body.requests.get')
    def test_download_limit_and_non_html_are_rejected(self, get):
        response = Mock(headers={'Content-Type': 'text/html'})
        response.iter_content.return_value = [b'x' * (MAX_HTML_BYTES + 1)]
        get.return_value.__enter__.return_value = response
        with self.assertRaises(ValueError):
            fetch_body('https://example.com/large')
        response.headers = {'Content-Type': 'application/pdf'}
        with self.assertRaises(ValueError):
            fetch_body('https://example.com/document')

    @patch('fetchers.body.fetch_body')
    def test_only_missing_bodies_are_fetched_and_prior_success_is_reused(self, fetch):
        rows = [{'id': 'kept', 'url': 'https://example.com/1', 'content': PARAGRAPHS[0]},
                {'id': 'cached', 'url': 'https://example.com/2', 'content': None},
                {'id': 'empty', 'url': 'https://example.com/3', 'content': ' \n '},
                {'id': 'same-url', 'url': 'https://example.com/3', 'content': None}]
        fetch.return_value = '\n\n'.join(PARAGRAPHS)
        enrich_articles(rows, [{'url': 'https://example.com/2', 'content': PARAGRAPHS[1]}])
        fetch.assert_called_once_with('https://example.com/3')
        self.assertEqual(rows[0]['content'], PARAGRAPHS[0])
        self.assertEqual(rows[1]['content'], PARAGRAPHS[1])
        self.assertEqual(rows[2]['content'], rows[3]['content'])

    def test_fetch_and_extraction_failures_never_substitute_summary(self):
        for outcome in (requests.Timeout(), None):
            with self.subTest(outcome=outcome):
                rows = [{'id': 'failed', 'url': 'https://example.com/1', 'content': '', 'summary': PARAGRAPHS[0]}]
                with patch('fetchers.body.fetch_body', side_effect=outcome if isinstance(outcome, Exception) else None, return_value=None):
                    enrich_articles(rows)
                self.assertIsNone(rows[0]['content'])
                self.assertIn('正文尚未同步', rows[0]['content_note'])


if __name__ == '__main__':
    unittest.main()
