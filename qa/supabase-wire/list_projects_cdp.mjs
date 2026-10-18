import { chromium } from 'playwright-core'
import { writeFileSync } from 'fs'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9225')
const context = browser.contexts()[0]
let page = context.pages().find(p => (p.url()||'').includes('supabase.com/dashboard')) || context.pages()[0]
console.log('url', page.url())
await page.goto('https://supabase.com/dashboard/org/sdyinhwjhrenjoejjppl', { waitUntil: 'networkidle', timeout: 60000 }).catch(()=>{})
await page.waitForTimeout(3000)
const text = await page.locator('body').innerText()
writeFileSync('/workspace/Anthreed/qa/supabase-wire/org-page.txt', text.slice(0, 8000))
await page.screenshot({ path: '/workspace/Anthreed/qa/supabase-wire/org-page.png' })
// collect project links
const hrefs = await page.$$eval('a[href*="/project/"]', as => as.map(a => a.href))
console.log('project_links', [...new Set(hrefs)].slice(0, 20))
console.log('BODY', text.slice(0, 1500).replace(/\n/g,' | '))
