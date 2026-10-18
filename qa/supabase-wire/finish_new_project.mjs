import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync } from 'fs'

const ref = readFileSync('/workspace/Anthreed/qa/supabase-wire/new-project-ref.txt', 'utf8').trim()
const sql = readFileSync('/workspace/Anthreed/supabase/schema_apply.sql', 'utf8')
const out = '/workspace/Anthreed/qa/supabase-wire'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9225')
const context = browser.contexts()[0]
const page = await context.newPage()
page.setDefaultTimeout(120000)
const shot = async (n) => { await page.screenshot({ path: `${out}/fin-${n}.png` }); console.log('shot', n) }

async function waitReady() {
  for (let i = 0; i < 40; i++) {
    await page.goto(`https://supabase.com/dashboard/project/${ref}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(4000)
    const t = await page.locator('body').innerText()
    console.log('ready_poll', i, page.url(), t.includes('Setting up') || t.includes('Project is setting'), t.slice(0,120).replace(/\n/g,' '))
    await shot(`ready-${i}`)
    if (!/setting up|is being created|provision/i.test(t) && /Table Editor|SQL|Project/i.test(t)) return true
  }
  return false
}

try {
  const ready = await waitReady()
  console.log('READY', ready)

  // API settings page for keys
  await page.goto(`https://supabase.com/dashboard/project/${ref}/settings/api`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  await shot('api-settings')
  const apiText = await page.locator('body').innerText()
  writeFileSync(`${out}/api-settings.txt`, apiText.slice(0, 12000))

  // Try reveal/copy keys via page evaluate of network or DOM
  // Modern dashboard often shows publishable/anon - click reveal for service_role
  const reveals = page.getByRole('button', { name: /reveal|copy|show/i })
  console.log('reveal_buttons', await reveals.count())

  // Use management token from localStorage to fetch keys
  const keysResp = await page.evaluate(async (projectRef) => {
    const blob = JSON.parse(localStorage.getItem('supabase.dashboard.auth.token') || '{}')
    const access = blob.access_token || blob.accessToken || blob?.currentSession?.access_token
    const headers = { Authorization: `Bearer ${access}`, Accept: 'application/json' }
    const api = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/api-keys`, { headers })
    const apiText = await api.text()
    const detail = await fetch(`https://api.supabase.com/v1/projects/${projectRef}`, { headers })
    return { apiStatus: api.status, apiText, detailStatus: detail.status, detailText: await detail.text() }
  }, ref)
  writeFileSync(`${out}/api-keys-raw.json`, keysResp.apiText)
  writeFileSync(`${out}/project-detail.json`, keysResp.detailText)
  console.log('api_keys_status', keysResp.apiStatus, keysResp.apiText.slice(0, 200))
  console.log('detail_status', keysResp.detailStatus)

  // Apply SQL via migrations API
  const mig = await page.evaluate(async ({ projectRef, sql }) => {
    const blob = JSON.parse(localStorage.getItem('supabase.dashboard.auth.token') || '{}')
    const access = blob.access_token || blob.accessToken || blob?.currentSession?.access_token
    const headers = { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', Accept: 'application/json' }
    const r1 = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/migrations`, {
      method: 'POST', headers, body: JSON.stringify({ query: sql, name: 'anthreed_init' })
    })
    const t1 = await r1.text()
    const r2 = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST', headers, body: JSON.stringify({ query: sql })
    })
    const t2 = await r2.text()
    return { migStatus: r1.status, migText: t1.slice(0, 2000), qStatus: r2.status, qText: t2.slice(0, 2000) }
  }, { projectRef: ref, sql })
  console.log('MIG', mig)
  writeFileSync(`${out}/mig-result.json`, JSON.stringify(mig, null, 2))

  // Also try SQL editor UI as backup if API failed
  if (mig.migStatus >= 400 && mig.qStatus >= 400) {
    await page.goto(`https://supabase.com/dashboard/project/${ref}/sql/new`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(5000)
    await shot('sql-new')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://supabase.com' })
    const monaco = page.locator('.monaco-editor').first()
    if (await monaco.count()) {
      await monaco.click()
      await page.evaluate(async (text) => { await navigator.clipboard.writeText(text) }, sql)
      await page.keyboard.press('Control+a')
      await page.keyboard.press('Control+v')
      await page.waitForTimeout(800)
      const run = page.getByRole('button', { name: /^run$/i }).first()
      if (await run.count()) await run.click()
      else await page.keyboard.press('Control+Enter')
      await page.waitForTimeout(6000)
      await shot('sql-ran')
      writeFileSync(`${out}/sql-ui-after.txt`, (await page.locator('body').innerText()).slice(0, 8000))
    }
  }
} catch (e) {
  console.error('ERR', e)
  await shot('err')
} finally {
  await page.close().catch(()=>{})
}
