# Anthreed font + icon polish

DEMO_URL=http://127.0.0.1:48740/
DEMO_DIR=/workspace/Anthreed
CONFIRM=Playfair only on brand Anthreed; Newsreader+Noto Serif SC for titles/body; new green-A icon wired; .env untouched
NOTES=仅品牌名 Anthreed 用 Playfair Display Italic；正文与标题用 Newsreader + Noto Serif SC；控件用系统无衬线。新图标已写入 assets/icons 与 web/public（含 favicon / apple-touch / PWA / Android 尺寸）。Supabase `.env` 未改。Codex（gpt-6.1-sol）因 ChatGPT usage limit（约 23:09 后可再试）中途中断，图标源已由其复制后剩余改动由执行侧收尾。

## Checks
- `node web/scripts/check-tokens.mjs`: pass (brand-only Playfair; Newsreader reading)
- Browser computed styles: `.brand` → Playfair italic; `h1` / `.article-link h2` / `.reading-content h1` → Newsreader + Noto Serif SC, normal
- Vite listening on `0.0.0.0:48740`

## Screenshots
- `01-subscribe.png`
- `02-article.png`
- `03-bookshelf.png`
- `04-brand-closeup.png`
- `05-icon-192.png`
