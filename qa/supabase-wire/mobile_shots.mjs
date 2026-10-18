import { chromium } from 'playwright-core'
import { writeFileSync } from 'fs'
const out = '/workspace/Anthreed/qa/supabase-wire'
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome-stable', headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await page.goto('http://127.0.0.1:48740/', { waitUntil: 'networkidle', timeout: 60000 })
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}/m390-subscribe.png`, fullPage: false })
// open first article
const link = page.locator('a.article-link, a.read-link').first()
if (await link.count()) {
  await link.click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${out}/m390-article.png`, fullPage: false })
  // scroll for body
  await page.evaluate(() => window.scrollBy(0, 500))
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/m390-article-body.png`, fullPage: false })
}
const html = await page.content()
const checks = {
  hasBookLogoNextToBrand: /brand[^<]*<svg|brand">\s*<svg/i.test(html) && /Anthreed/.test(html),
  hasWodeDingyue: html.includes('我的订阅'),
  hasPlayfair: html.includes('Playfair') || (await page.evaluate(() => getComputedStyle(document.querySelector('.brand')||document.body).fontFamily)),
  brandText: await page.locator('.brand').innerText().catch(()=>null),
  hasOriginalCta: html.includes('阅读原文') || html.includes('original-link'),
}
writeFileSync(`${out}/ui-checks.json`, JSON.stringify(checks, null, 2))
console.log(checks)
await browser.close()
