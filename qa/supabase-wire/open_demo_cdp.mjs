import { chromium } from 'playwright-core'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9225')
const context = browser.contexts()[0]
const page = await context.newPage()
await page.setViewportSize({ width: 390, height: 844 })
await page.goto('http://127.0.0.1:48740/', { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(1500)
console.log('opened', page.url(), await page.title())
