import { chromium } from 'playwright-core'
import { writeFileSync, readFileSync } from 'fs'

const browser = await chromium.connectOverCDP('http://127.0.0.1:9225')
const context = browser.contexts()[0]
const page = await context.newPage()
page.setDefaultTimeout(90000)
const out = '/workspace/Anthreed/qa/supabase-wire'
const shot = async (n) => { await page.screenshot({ path: `${out}/create-${n}.png` }); console.log('shot', n) }

try {
  await page.goto('https://supabase.com/dashboard/new/sdyinhwjhrenjoejjppl', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  await shot('01-new')
  console.log('url', page.url())
  const body = await page.locator('body').innerText()
  writeFileSync(`${out}/create-01.txt`, body.slice(0, 6000))
  console.log('BODY', body.slice(0, 800).replace(/\n/g, ' | '))

  // Fill project name
  const nameInput = page.getByLabel(/project name/i).or(page.locator('input[name="name"]')).or(page.getByPlaceholder(/project name/i)).first()
  if (await nameInput.count()) {
    await nameInput.fill('anthreed')
  } else {
    // try first text input
    const inputs = page.locator('input[type="text"]')
    if (await inputs.count()) await inputs.first().fill('anthreed')
  }

  // DB password - generate and store
  const dbPass = 'Anthreed_' + Math.random().toString(36).slice(2) + 'A1!'
  writeFileSync(`${out}/db-pass.txt`, dbPass, { mode: 0o600 })
  const passInput = page.getByLabel(/database password/i).or(page.locator('input[type="password"]')).first()
  if (await passInput.count()) {
    await passInput.fill(dbPass)
  }

  // Region - leave default if possible
  await shot('02-filled')

  // Create project button
  const createBtn = page.getByRole('button', { name: /create new project|create project/i }).first()
  console.log('create_btn', await createBtn.count())
  if (await createBtn.count()) {
    await createBtn.click()
  }
  await page.waitForTimeout(8000)
  await shot('03-after-click')
  console.log('url_after', page.url())
  writeFileSync(`${out}/create-03.txt`, (await page.locator('body').innerText()).slice(0, 6000))

  // Wait for project to provision - poll URL for /project/
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(5000)
    const u = page.url()
    console.log('poll', i, u)
    if (/\/project\/[a-z]+/.test(u) && !u.includes('/new/')) {
      await shot('04-ready')
      const m = u.match(/\/project\/([a-z0-9]+)/)
      writeFileSync(`${out}/new-project-ref.txt`, m[1])
      console.log('REF', m[1])
      break
    }
    // Also check for errors
    const t = await page.locator('body').innerText()
    if (/error|limit|upgrade|cannot/i.test(t) && i > 2) {
      writeFileSync(`${out}/create-error.txt`, t.slice(0, 4000))
      console.log('possible_error', t.slice(0, 300).replace(/\n/g,' '))
    }
  }
} catch (e) {
  console.error('ERR', e)
  await shot('err')
}
