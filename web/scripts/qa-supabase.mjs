// Run from the repo root: node --env-file=.env web/scripts/qa-supabase.mjs
import { chromium } from 'playwright-core'
import assert from 'node:assert/strict'
import { readFile, writeFile, mkdir } from 'node:fs/promises'

const base = 'http://127.0.0.1:48740'
const output = new URL('../../qa/supabase-wire/', import.meta.url)
const feed = JSON.parse(await readFile(new URL('../../data/articles.json', import.meta.url), 'utf8'))
const cloud = process.env.SUPABASE_URL.replace(/\/$/, '')
const anon = process.env.SUPABASE_ANON_KEY
assert.ok(cloud && anon, 'Public Supabase configuration is required')
const checks = []
const check = (name, condition) => { assert.ok(condition, name); checks.push(name) }
await mkdir(output, { recursive: true })
const live = {}
for (const table of ['articles', 'feed_articles']) {
  const response = await fetch(`${cloud}/rest/v1/${table}?select=id&limit=1`, {
    method: 'HEAD', headers: { apikey: anon, Authorization: `Bearer ${anon}`, Prefer: 'count=exact' },
  })
  live[table] = { status: response.status, count: response.ok ? Number(response.headers.get('content-range')?.split('/')[1]) : null }
}
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] })
const errors = []
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  page.on('pageerror', error => errors.push(error.name))
  let mode = 'cloud'
  const bodyArticle = feed.articles.find(a => a.content?.length > 1000)
  const alias = { ...bodyArticle, cluster_id: undefined, event_cluster_id: bodyArticle.cluster_id, content: ' ', body: bodyArticle.content }
  await context.route(`${cloud}/rest/v1/**`, async route => {
    const request = route.request()
    check('Browser cloud requests use the anon credential', request.headers().apikey === anon && request.headers().authorization === `Bearer ${anon}`)
    const url = new URL(request.url())
    const table = url.pathname.split('/').at(-1)
    if (mode === 'outage' || mode === 'cache' || mode === 'unavailable') return route.fulfill({ status: 503, json: {} })
    if (table === 'sources') return route.fulfill({ json: feed.sources })
    if (table === 'clusters') return route.fulfill({ json: feed.articles.map(a => ({ id: a.cluster_id, selection_mode: feed.selection_mode })) })
    if (mode === 'alias') return route.fulfill({ status: table === 'feed_articles' ? 404 : 200, json: table === 'feed_articles' ? {} : [alias] })
    if (mode === 'empty') return route.fulfill({ json: [] })
    if (mode === 'pagination') {
      const offset = Number(url.searchParams.get('offset'))
      const count = offset === 0 ? 1000 : 1
      return route.fulfill({ json: Array.from({ length: count }, (_, i) => ({ ...bodyArticle,
        id: `row-${offset + i}`, cluster_id: `cluster-${offset + i}`, url: `https://example.com/${offset + i}` })) })
    }
    return route.fulfill({ json: [...feed.articles,
      { ...feed.articles[0], id: 'duplicate-cluster', url: 'https://example.com/duplicate-cluster' },
      { ...feed.articles[0], id: 'duplicate-url', cluster_id: 'duplicate-url' }] })
  })
  await context.route('**/data/articles.json', route => ['cache', 'unavailable'].includes(mode) ? route.abort() : route.fulfill({ json: feed }))
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.locator('.article-card').first().waitFor()
  const cached = () => page.evaluate(() => JSON.parse(localStorage.getItem('anthreed-feed-v1')))
  check('Cloud rows render and retain one article per event and URL', await page.locator('.article-card').count() === feed.articles.length)
  check('Cloud origin and selection mode are preserved', (await cached()).data_origin === 'supabase' && (await cached()).selection_mode === feed.selection_mode)
  await page.locator(`.article-link[href="#article/${bodyArticle.id}"]`).click()
  check('Cloud content renders as the inline article body', await page.locator('.reading-body').innerText() === bodyArticle.content.trim())
  mode = 'alias'
  await page.reload({ waitUntil: 'networkidle' })
  check('Missing view falls back to articles with body and event aliases', await page.locator('.reading-body').innerText() === bodyArticle.content.trim() && (await cached()).articles[0].cluster_id === bodyArticle.cluster_id)
  await page.goto(base, { waitUntil: 'networkidle' })
  mode = 'outage'
  await page.getByRole('button', { name: '重新读取订阅' }).click()
  await page.getByText('云端暂不可用，正在阅读本地订阅').waitFor()
  check('Cloud outage falls back to local JSON', await page.locator('.article-card').count() === feed.articles.length && (await cached()).data_origin === 'local')
  await page.getByRole('button', { name: '订阅与数据状态', exact: true }).click()
  check('Cloud fallback discloses the HTTP error', (await page.locator('dialog').innerText()).includes('HTTP 503'))
  await page.keyboard.press('Escape')
  mode = 'cache'
  await page.getByRole('button', { name: '重新读取订阅' }).click()
  await page.getByText('正在阅读离线缓存', { exact: true }).waitFor()
  check('Cloud and JSON failure retain cached articles', await page.locator('.article-card').count() === feed.articles.length)
  mode = 'empty'
  await page.getByRole('button', { name: '重新读取订阅' }).click()
  await page.getByText('云端暂不可用，正在阅读本地订阅').waitFor()
  check('An empty cloud does not hide an available local feed', (await cached()).data_warning.includes('尚无文章'))
  mode = 'pagination'
  const paginated = await page.evaluate(async () => {
    const { loadFeed } = await import('/src/lib/data.ts')
    const f = await loadFeed()
    return { count: f.articles.length, origin: f.data_origin }
  })
  check('Cloud reads paginate beyond 1000 rows', paginated.count === 1001 && paginated.origin === 'supabase')
  mode = 'unavailable'
  await page.evaluate(() => localStorage.removeItem('anthreed-feed-v1'))
  await page.reload({ waitUntil: 'networkidle' })
  check('No cloud, JSON, or cache produces a clear recoverable error', (await page.locator('.empty-state').innerText()).includes('离线缓存均不可用'))
  check('No uncaught browser errors', errors.length === 0)
  const result = { passed: [...new Set(checks)].length, checks: [...new Set(checks)], live_anon: live, browser_errors: errors, tested_at: new Date().toISOString() }
  await writeFile(new URL('checks.json', output), JSON.stringify(result, null, 2) + '\n')
  console.log(JSON.stringify({ passed: result.passed, live_anon: live }))
} finally { await browser.close() }
