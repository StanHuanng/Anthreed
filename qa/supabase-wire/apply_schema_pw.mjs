import { chromium } from 'playwright-core'
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'

const sql = readFileSync('/workspace/Anthreed/supabase/schema_apply.sql', 'utf8')
const out = '/workspace/Anthreed/qa/supabase-wire'
const projectSql = 'https://supabase.com/dashboard/project/dpcgjryqsotqlbgdgbil/sql/new'

// Copy profile lightly for Playwright (avoid lock on live profile)
const src = '/home/box/chrome-profile/Default'
const udd = join(tmpdir(), 'anthreed-chrome-sb')
mkdirSync(udd, { recursive: true })
mkdirSync(join(udd, 'Default'), { recursive: true })
for (const f of ['Cookies', 'Cookies-journal', 'Local Storage', 'Network', 'Preferences', 'Secure Preferences', 'Login Data', 'Web Data']) {
  const from = join(src, f)
  const to = join(udd, 'Default', f)
  try {
    if (existsSync(from)) {
      execSync(`cp -a ${JSON.stringify(from)} ${JSON.stringify(to)}`, { shell: '/bin/bash' })
    }
  } catch {}
}

const browser = await chromium.launchPersistentContext(udd, {
  executablePath: '/usr/bin/google-chrome-stable',
  headless: false,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  viewport: { width: 1440, height: 960 },
})
const page = browser.pages()[0] || await browser.newPage()
page.setDefaultTimeout(60000)

const shot = async (n) => { await page.screenshot({ path: `${out}/${n}.png` }); console.log('shot', n) }

try {
  await page.goto(projectSql, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(5000)
  await shot('02-after-goto')
  console.log('url', page.url())
  console.log('title', await page.title())

  // If still on sign-in, abort with status
  if (page.url().includes('sign-in')) {
    writeFileSync(`${out}/pw-status.json`, JSON.stringify({ ok: false, reason: 'still_sign_in', url: page.url() }, null, 2))
    console.log('STILL_SIGN_IN')
    await browser.close()
    process.exit(2)
  }

  // Wait for Monaco / SQL editor
  await page.waitForTimeout(3000)
  // Try common selectors for SQL editor
  const editor = page.locator('.monaco-editor textarea, .monaco-editor .inputarea, textarea').first()
  // Paste via clipboard keyboard into monaco
  await page.keyboard.press('Control+a').catch(()=>{})
  await page.waitForTimeout(200)
  // Focus editor by clicking center of monaco
  const monaco = page.locator('.monaco-editor').first()
  if (await monaco.count()) {
    await monaco.click()
    await page.waitForTimeout(300)
    await page.keyboard.press('Control+a')
    await page.keyboard.press('Backspace')
    // type is slow; use clipboard
    await page.evaluate(async (text) => {
      await navigator.clipboard.writeText(text)
    }, sql).catch(async () => {
      // fallback: fill via CDP
    })
    await page.keyboard.press('Control+v')
    await page.waitForTimeout(1000)
  } else {
    // fallback: find run SQL textarea
    const ta = page.locator('textarea').first()
    if (await ta.count()) await ta.fill(sql)
  }
  await shot('03-sql-pasted')

  // Click Run
  const runBtn = page.getByRole('button', { name: /run/i }).first()
  if (await runBtn.count()) {
    await runBtn.click()
  } else {
    await page.keyboard.press('Control+Enter')
  }
  await page.waitForTimeout(5000)
  await shot('04-after-run')
  const body = await page.locator('body').innerText()
  writeFileSync(`${out}/pw-after-run.txt`, body.slice(0, 8000))
  writeFileSync(`${out}/pw-status.json`, JSON.stringify({ ok: true, url: page.url() }, null, 2))
  console.log('BODY_TAIL', body.slice(-500).replace(/\n/g, ' | '))
} catch (e) {
  console.error('ERR', e)
  await shot('pw-error')
  writeFileSync(`${out}/pw-status.json`, JSON.stringify({ ok: false, error: String(e) }, null, 2))
} finally {
  await browser.close()
}
