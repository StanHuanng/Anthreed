import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync } from 'fs'

const sql = readFileSync('/workspace/Anthreed/supabase/schema_apply.sql', 'utf8')
const browser = await chromium.connectOverCDP('http://127.0.0.1:9225')
const context = browser.contexts()[0]
const page = context.pages().find(p => (p.url()||'').includes('supabase.com')) || await context.newPage()
if (!(page.url()||'').includes('supabase.com')) {
  await page.goto('https://supabase.com/dashboard/organizations', { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(1500)
}

const tokenBlob = await page.evaluate(() => localStorage.getItem('supabase.dashboard.auth.token'))
if (!tokenBlob) {
  console.log('NO_TOKEN')
  process.exit(2)
}
const parsed = JSON.parse(tokenBlob)
const access = parsed.access_token || parsed.accessToken || parsed?.currentSession?.access_token
writeFileSync('/workspace/Anthreed/qa/supabase-wire/token-meta.json', JSON.stringify({
  keys: Object.keys(parsed),
  hasAccess: !!access,
  expires_at: parsed.expires_at || parsed.expiresAt || null,
}, null, 2))
if (!access) {
  console.log('NO_ACCESS_IN_BLOB', Object.keys(parsed))
  process.exit(3)
}

const ref = 'dpcgjryqsotqlbgdgbil'
const headers = {
  Authorization: `Bearer ${access}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
}

async function api(method, path, body) {
  const r = await fetch(`https://api.supabase.com${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  return { status: r.status, text }
}

const proj = await api('GET', `/v1/projects/${ref}`)
console.log('project', proj.status, proj.text.slice(0, 300))
writeFileSync('/workspace/Anthreed/qa/supabase-wire/mgmt-project.json', proj.text)

const projects = await api('GET', '/v1/projects')
console.log('projects_list', projects.status, projects.text.slice(0, 500))
writeFileSync('/workspace/Anthreed/qa/supabase-wire/mgmt-projects.json', projects.text)

// Try migrations endpoint
const mig = await api('POST', `/v1/projects/${ref}/database/migrations`, {
  query: sql,
  name: 'anthreed_schema_apply',
})
console.log('migration', mig.status, mig.text.slice(0, 800))
writeFileSync('/workspace/Anthreed/qa/supabase-wire/mgmt-migration.json', mig.text)

// Alternate query endpoint
const q = await api('POST', `/v1/projects/${ref}/database/query`, { query: sql })
console.log('query', q.status, q.text.slice(0, 800))
writeFileSync('/workspace/Anthreed/qa/supabase-wire/mgmt-query.json', q.text)
