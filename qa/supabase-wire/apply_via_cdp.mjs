import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync } from 'fs'

const sql = readFileSync('/workspace/Anthreed/supabase/schema_apply.sql', 'utf8')
const out = '/workspace/Anthreed/qa/supabase-wire'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9225')
const contexts = browser.contexts()
const context = contexts[0]
let page = context.pages().find(p => (p.url() || '').includes('supabase.com/dashboard'))
if (!page) page = await context.newPage()

const shot = async (n) => { await page.screenshot({ path: `${out}/${n}.png` }); console.log('shot', n) }

try {
  console.log('start_url', page.url())
  await page.goto('https://supabase.com/dashboard/project/dpcgjryqsotqlbgdgbil/sql/new', { waitUntil: 'domcontentloaded', timeout: 90000 })
  await page.waitForTimeout(6000)
  await shot('10-sql-editor')
  console.log('url', page.url())
  console.log('title', await page.title())

  if (page.url().includes('sign-in')) {
    writeFileSync(`${out}/cdp-status.json`, JSON.stringify({ ok:false, reason:'sign-in' }))
    console.log('SIGN_IN')
    process.exit(2)
  }

  // Focus monaco
  const monaco = page.locator('.monaco-editor').first()
  await monaco.waitFor({ timeout: 30000 })
  await monaco.click()
  await page.waitForTimeout(400)

  // Use CDP to insert text into monaco via clipboard permission
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://supabase.com' })
  await page.evaluate(async (text) => {
    await navigator.clipboard.writeText(text)
  }, sql)
  await page.keyboard.press('Control+a')
  await page.waitForTimeout(100)
  await page.keyboard.press('Control+v')
  await page.waitForTimeout(1500)
  await shot('11-pasted')

  // Run: button or Ctrl+Enter
  const run = page.getByRole('button', { name: /^run$/i }).or(page.getByRole('button', { name: /run query/i }))
  if (await run.count()) {
    await run.first().click()
  } else {
    await page.keyboard.press('Control+Enter')
  }
  await page.waitForTimeout(8000)
  await shot('12-ran')
  const text = await page.locator('body').innerText()
  writeFileSync(`${out}/cdp-after-run.txt`, text.slice(0, 12000))
  const ok = /success|success\.|rows? affected|no rows|done/i.test(text) || !/error|failed/i.test(text.slice(-2000))
  writeFileSync(`${out}/cdp-status.json`, JSON.stringify({ ok, url: page.url() }, null, 2))
  console.log('TAIL', text.slice(-800).replace(/\n/g, ' | '))
} catch (e) {
  console.error('ERR', e)
  await shot('cdp-error')
  writeFileSync(`${out}/cdp-status.json`, JSON.stringify({ ok:false, error:String(e) }, null, 2))
} finally {
  // do not close shared browser
}
