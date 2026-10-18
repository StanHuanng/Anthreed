// Run from the repo root: node --env-file=.env scripts/apply_supabase_schema.mjs
// Credentials stay in memory; only HTTP status and project identity are reported.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { chromium } from '../web/node_modules/playwright-core/index.mjs'

const root = new URL('../', import.meta.url)
const sql = await readFile(new URL('supabase/schema_apply.sql', root), 'utf8')
const project = new URL(process.env.SUPABASE_URL).hostname.split('.')[0]
const output = new URL('qa/supabase-wire/', root)
await mkdir(output, { recursive: true })
let browser
let result
try {
  let token = process.env.SUPABASE_ACCESS_TOKEN
  let route = 'management-token'
  if (!token) {
    route = 'dashboard-session'
    browser = await chromium.connectOverCDP('http://127.0.0.1:9225')
    let page = browser.contexts()[0].pages().find(p => p.url().startsWith('https://supabase.com/dashboard'))
    if (!page) {
      page = await browser.contexts()[0].newPage()
      await page.goto(`https://supabase.com/dashboard/project/${project}/sql/new`, { waitUntil: 'networkidle' })
    }
    token = await page.evaluate(() => {
      const auth = JSON.parse(localStorage.getItem('supabase.dashboard.auth.token') || '{}')
      return (auth.currentSession || auth).access_token
    })
  }
  if (!token) throw new Error('No authorized management session or token available')
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  const access = await fetch(`https://api.supabase.com/v1/projects/${project}`, { headers })
  if (!access.ok) result = { applied: false, project, route, access_status: access.status, reason: 'Project access denied' }
  else {
    const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/migrations`, {
      method: 'POST', headers, body: JSON.stringify({ name: 'anthreed_feed_schema', query: sql }),
    })
    result = { applied: response.ok, project, route, migration_status: response.status }
  }
} catch (error) {
  result = { applied: false, project, reason: error instanceof Error ? error.name : 'Error' }
} finally {
  if (browser) await browser.close()
}
await writeFile(new URL('schema-status.json', output), JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result))
process.exitCode = result.applied ? 0 : 1
