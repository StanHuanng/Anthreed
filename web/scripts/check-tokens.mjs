import { readFileSync } from 'node:fs'
const canonical = readFileSync('src/cds-theme.css', 'utf8')
const app = readFileSync('src/styles.css', 'utf8')
const definitions = new Set([...`${canonical}\n${app}`.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]))
const missing = [...app.matchAll(/var\((--[\w-]+)/g)].map(match => match[1]).filter(name => !definitions.has(name))
if (missing.length || /#[a-f\d]{3,8}\b/i.test(app)) throw new Error(`Use CDS tokens. Undefined tokens: ${[...new Set(missing)].join(', ')}`)
if (!/--font-brand:\s*'Playfair Display'/.test(app) || !/\.brand \{ font-family: var\(--font-brand\); font-style: italic; \}/.test(app)) {
  throw new Error('Only .brand may use Playfair Display Italic via --font-brand.')
}
if (/--font-display/.test(app) || /\.page-heading h1[^{]*\{[^}]*--font-brand/.test(app)) {
  throw new Error('Do not apply Playfair/display brand font to page or reading titles.')
}
if (!/--font-reading:\s*'Newsreader'/.test(app) || !app.includes("'Noto Serif SC'") || !app.includes("'Songti SC'")) {
  throw new Error('Reading stack must prefer Newsreader + Noto Serif SC / Songti.')
}
if (!/\.page-heading h1, \.reading-content h1, \.article-link h2, \.reader-book-title \{ font-family: var\(--font-reading\)/.test(app)) {
  throw new Error('Titles must use --font-reading, not Playfair.')
}
console.log('CDS tokens; Playfair brand-only; Newsreader reading: 0 errors')
