DEMO_URL=http://127.0.0.1:48740
MOBILE_NOTE=host 0.0.0.0; Vite network URL http://172.30.0.2:48740 (phone access requires routing to this workspace host)
CONFIRM=Anthreed UI polish live (no book logo, no 我的订阅, inline body, Playfair Display Italic)
BODY_INGEST=Real fetch cycle completed; DeepSeek selected 34 winners from 40 source articles; 33/34 have extracted content (250896 characters); 1 WeChat page remains null with a pending note; no synthetic bodies seeded.

Preview is running on `0.0.0.0:48740`. Start it again with `cd /workspace/Anthreed/web && npm run dev`. The current Vite PID is in [vite.pid](vite.pid), with startup output in [vite.log](vite.log).

Inline reader example: [每天涨10%、没花一分钱营销：这个只有短信入口的AI助理，一年交易额快到10亿美元](http://127.0.0.1:48740/#article/eabb63fb402fba696a32).

Changes:

- Text-only Anthreed header; subscription heading book illustration and the 我的订阅 / 我的收藏 toolbar removed. Source filters share their row with bookmark filtering and refresh.
- Reader renders trimmed `content`, with `body` as a fallback alias, as full inline paragraphs. Missing or whitespace-only content gets 正文尚未同步. Any available summary appears separately under 来源摘要. The primary original-page CTA is removed. Full-text list badges require actual body text.
- Google Fonts loads Playfair Display; brand, page, article and reader titles use the italic display stack. Normal reading text retains Noto Serif SC / Songti fallbacks. CDS clay and surface tokens are preserved; `cds-theme.css` is unchanged.
- `fetchers/body.py` fetches only missing winner bodies after selection, including retained curated winners during model outages. It uses trafilatura with BeautifulSoup fallback, a polite Anthreed User-Agent, 8s connect / 15s read timeouts, three workers, a 3 MB HTML limit and a 100,000-character text cap. Successful bodies are reused by URL from the prior output; failures stay null with a small note and can retry next cycle. JSON writes remain atomic.
- Dependency added: `trafilatura>=2,<3`. No raw HTML cache was needed. [body-ingest.json](body-ingest.json) records the result; [fetch-cycle.log](fetch-cycle.log) records the real cycle.

Verification:

- `npm run typecheck`: passed.
- `npm run check:tokens`: passed with Playfair Display Italic and CJK fallback checks.
- `npm run build`: passed; production output includes the enriched JSON.
- `.venv/bin/python -m unittest fetchers.test_body fetchers.test_pipeline -v`: 18 passed. Includes mocked Chinese HTML extraction with and without trafilatura, network limits, failure states, previous-body reuse, and persistence after local/model selection. See [python-tests.log](python-tests.log).
- `npm run qa`: 39 real Chrome browser/data checks passed. Covers source and bookmark filters, full paragraph rendering, whitespace/empty states, body alias and precedence, excerpts from selected body text, font loading, EPUB persistence/resume, dark mode and offline feed caching. No uncaught browser errors. See [checks.json](checks.json).
- Viewports: 390 × 844, 768 × 1024, 1440 × 900; additional 320px overflow check. No horizontal overflow.
- Configured secret values were scanned across source, build, data, fetchers and QA artifacts; no matches. No commit or push performed.

Screenshots:

- [Mobile feed](01-subscribe.png)
- [Inline article](02-article.png) · [body paragraphs](02-article-body.png)
- [Pending body and separate source summary](09-body-pending.png)
- [Desktop](07-desktop.png) · [Tablet](08-tablet.png)
- [Bookshelf](03-bookshelf.png) · [EPUB reader](05-epub-reader.png) · [Excerpts](04-excerpts.png) · [Dark mode](06-dark.png)

Visual review kept the existing reading-app composition and CDS identity; no new direction or image assets were introduced. Screenshots were reviewed in real Chrome using Playwright. The design skill's dedicated inspector could not run on installed Node 20 (it requires Node 22); its startup error is recorded in [design-before.log](design-before.log). Its marketing-page linter continues to flag existing CDS borders, shadows and secondary labels, retained for this scoped UI polish; a clean marketing-style lint pass is not claimed. Subjective final visual review: design 7/10, usability 8/10, creativity 6/10, content 8/10 (weighted 7.2/10). Full article titles and paragraph lengths are preserved rather than edited to fit marketing headline limits.

Remaining source limitation: the first WeChat article returned no extractable text. It deliberately shows the pending body state; all other selected articles have actual fetched content. Extraction is a plain-text reading view; source images and complex table formatting are outside this pass.
