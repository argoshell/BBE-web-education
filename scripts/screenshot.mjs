// Usage: node scripts/screenshot.mjs <url> <out.png> [width] [actions-json]
// Drives the locally installed Chrome to screenshot the app (dev tool).
import { chromium } from 'playwright-core';

const [url = 'http://localhost:5173/', out = 'shot.png', width = '1440', actions = '[]'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const page = await browser.newPage({ viewport: { width: Number(width), height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url, { waitUntil: 'networkidle' });
for (const a of JSON.parse(actions)) {
  if (a.click) await page.click(a.click);
  if (a.select) await page.selectOption(a.select[0], a.select[1]);
  if (a.fill) await page.fill(a.fill[0], a.fill[1]);
  if (a.wait) await page.waitForTimeout(a.wait);
  if (a.waitFor) await page.waitForSelector(a.waitFor, { timeout: a.timeout ?? 60000 });
  if (a.eval) console.log(await page.evaluate(a.eval));
}
await page.waitForTimeout(300);
await page.screenshot({ path: out, fullPage: true });
console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'no console errors');
await browser.close();
