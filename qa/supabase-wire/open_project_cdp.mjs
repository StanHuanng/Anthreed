import { chromium } from 'playwright-core'
import { writeFileSync } from 'fs'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9225')
const context = browser.contexts()[0]
const page = await context.newPage()
const urls = [
  'https://supabase.com/dashboard/project/dpcgjryqsotqlbgdgbil',
  'https://supabase.com/dashboard/project/dpcgjryqsotqlbgdgbil/editor',
  'https://supabase.com/dashboard/project/dpcgjryqsotqlbgdgbil/sql/new',
  'https://supabase.com/dashboard/projects',
]
for (const u of urls) {
  console.log('GOTO', u)
  const resp = await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(e => ({ error: e.message }))
  await page.waitForTimeout(3500)
  console.log('NOW', page.url(), 'title', await page.title())
  const t = await page.locator('body').innerText().catch(()=> '')
  console.log('BODY', t.slice(0, 400).replace(/\n/g,' | '))
  await page.screenshot({ path: `/workspace/Anthreed/qa/supabase-wire/nav-${urls.indexOf(u)}.png` })
  writeFileSync(`/workspace/Anthreed/qa/supabase-wire/nav-${urls.indexOf(u)}.txt`, t.slice(0,5000))
}
await page.close()
