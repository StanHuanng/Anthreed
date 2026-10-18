import { chromium } from 'playwright-core'
import { writeFileSync } from 'fs'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9225')
const context = browser.contexts()[0]
const page = context.pages().find(p => (p.url()||'').includes('supabase.com')) || await context.newPage()
await page.goto('https://supabase.com/dashboard/organizations', { waitUntil: 'domcontentloaded', timeout: 60000 })
await page.waitForTimeout(2500)
const data = await page.evaluate(() => {
  const keys = Object.keys(localStorage)
  return { keys, samples: Object.fromEntries(keys.slice(0,40).map(k => [k, (localStorage.getItem(k)||'').slice(0,160)])) }
})
writeFileSync('/workspace/Anthreed/qa/supabase-wire/ls-keys.json', JSON.stringify(data, null, 2))
console.log('keys', data.keys)

const projects = await page.evaluate(async () => {
  const r = await fetch('https://api.supabase.com/v1/projects', { credentials: 'include' })
  return { status: r.status, text: (await r.text()).slice(0, 3000) }
})
console.log('projects', projects.status, projects.text.slice(0,500))
writeFileSync('/workspace/Anthreed/qa/supabase-wire/mgmt-projects.json', projects.text)

const orgs = await page.evaluate(async () => {
  const r = await fetch('https://api.supabase.com/v1/organizations', { credentials: 'include' })
  return { status: r.status, text: (await r.text()).slice(0, 2000) }
})
console.log('orgs', orgs.status, orgs.text.slice(0,400))
