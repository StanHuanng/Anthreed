# Anthreed UI rebuild — stacked swipe feed + Legado-style EPUB reader (CDS)

Owner: Sol executor. Implement inside `/workspace/Anthreed/web/`. Do not recreate Supabase project. Secrets stay in root `.env` (gitignored).

## Authorization for DeepSeek sub-agent
You MAY spawn/call DeepSeek via OpenCode as a sub-agent for bulk translation helpers or repetitive UI boilerplate:

```bash
opencode run --model deepseek/deepseek-flash "…"
```

Sol authorized this. Prefer Codex for architecture and critical interactive UI; DeepSeek for volume (CSS dumps, repetitive component shells, copy variants). Do not hand architecture or motion physics to DeepSeek alone.

## Design system (mandatory)
- Read `/workspace/design/open-claude-ui/AGENTS.md` and reuse tokens already in `web/src/cds-theme.css`.
- Clay accent `#d97757` / dark `#cc6b49`. Surfaces 0–3, hairline borders, 4 Framer Motion spring presets (add `framer-motion` if missing).
- Brand word **Anthreed** alone → Playfair Display Italic. Everything else → Newsreader + Noto Serif SC / system sans.
- No book logo beside the name. No 「我的订阅」 bar. No primary 「原文链接」 button.
- CJK IME guard on any composer-like inputs.

## C1 — 订阅：层叠划走卡片
Replace the current article list in the subscriptions tab with a **stacked card deck**:

1. Top card can be swiped away with rotation (like/tinder-ish but editorial, not dating-app chrome).
2. Next card rises up underneath with a CDS spring.
3. Card face shows **title + author** only (optional tiny source chip). No full body on the card.
4. Swipe away = not interested (dismiss locally; persist to localStorage/idb optional, key like `anthreed-dismissed-v1`).
5. **Tap** card → open article body with a deliberate transition (shared-element / expand / morph). Use CDS springs, not linear.
6. Keep source filters (全部/归藏/乔木/AIHOT), refresh, saved-only if they still fit; restyle to CDS, no heavy chrome.
7. Article body view: keep font size / theme / bookmark / excerpt; remove primary external-link CTA. If a subtle secondary text link to source is needed, de-emphasize it.

Suggested files (feel free to split):
- `web/src/components/SwipeDeck.tsx`
- `web/src/components/FeedCard.tsx`
- `web/src/components/ArticleReader.tsx` (extract from App.tsx)
- Update `web/src/App.tsx`, `web/src/styles.css`

## C2 — 书架 EPUB：Legado-style reading chrome, CDS skin
Current `BookReader` is a plain chapter HTML preview. Rebuild into a dedicated novel-reader:

References (inspiration only, do NOT copy Material 1:1):
- https://github.com/Luoyacheng/legado-E (interaction ideas)
- Yuque wiki may be hard to fetch; ignore if blocked

Requirements:
- User **imports EPUB only**. No 换源, no book sources, no online catalog.
- Open book → full-screen reader chrome: toolbar (back, TOC, font, theme), reading surface, progress.
- Prefer `epub.js` / `react-reader` (add deps). Keep local IndexedDB via existing `web/src/lib/storage.ts` patterns (Echo at `/workspace/echo-github` is a good reference for idb + react-reader).
- Features: font size, line spacing, light/dark theme, TOC drawer, progress persistence, page-turn feel — at least **scroll** + **slide/cover** if feasible with epub.js.
- Visuals MUST follow CDS (warm clay, surfaces, springs), not Legado green Material clone.
- Ship everything inside Anthreed `web/`. Demo EPUB may stay at `web/public/demo.epub`.

Suggested files:
- `web/src/components/NovelReader.tsx`
- `web/src/components/ReaderSettings.tsx`
- `web/src/lib/readerTheme.ts` (new)
- Reuse / extend `web/src/lib/storage.ts`

## Constraints
- TypeScript + Vite + React. Keep Capacitor android folder compiling conceptually (no need to rebuild APK).
- `npm run build` in `web/` must succeed when you finish.
- Do not commit `.env`. Do not print secrets.
- Chinese UI copy: short, spoken+written mix like current Anthreed strings. No AI fluff.
- After implementation, briefly list changed files at the end of your reply.

## Out of scope
- APK rebuild
- Supabase schema changes
- 换源 / book sources
- Renaming brand away from Anthreed
