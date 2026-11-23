// Responsiveness check: measures main-thread long tasks (> 50 ms) per page while a user drags a parameter
// slider, scrubs time with the Dynamics card open, and changes the Information card's settings.
//   npm run build && npx vite preview --port 4173 &
//   node scripts/perf-check.mjs [--url http://localhost:4173/] [--throttle 4] [--pages attention,memory]
// --throttle N slows the CPU N× (Chrome DevTools emulation), roughly a mid-range phone at 4.
import { chromium } from 'playwright-core';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1]]] : acc), []));
const base = args.url ?? 'http://localhost:4173/';
const throttle = Number(args.throttle ?? 1);
const pages = (args.pages ?? 'oscillator,walker,visual,guided,relcat,chemotaxis,orientation,memory,attention,learning').split(',');
const exe = process.env.CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await chromium.launch({ executablePath: exe });
const fmt = (s) => (s.n ? `max ${s.max.toFixed(0).padStart(5)} ms, total ${s.sum.toFixed(0).padStart(6)} ms` : 'none'.padEnd(29));
const take = (p) => p.evaluate(() => { const a = window.__lt; window.__lt = []; return { n: a.length, max: Math.max(0, ...a), sum: a.reduce((x, y) => x + y, 0) }; });

console.log(`CPU throttle ${throttle}×; long tasks during each interaction (none = always responsive)`);
for (const pg of pages) {
  const p = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await p.addInitScript(() => { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push(e.duration); }).observe({ type: 'longtask', buffered: true }); });
  if (throttle > 1) { const cdp = await p.context().newCDPSession(p); await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle }); }
  await p.goto(base + '#/' + pg, { waitUntil: 'load' });
  await p.waitForTimeout(3000 * throttle);
  const load = await take(p);
  const row = { load };
  // 1. Parameter slider (first range input in the sidebar)
  const slider = p.locator('aside input[type=range]').first();
  if (await slider.count()) {
    await slider.focus();
    for (let k = 0; k < 10; k++) await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(1500);
    row.slider = await take(p);
  }
  // 2. Time scrubbing with the Dynamics card open
  const dyn = p.locator('.card', { has: p.locator('h2', { hasText: 'Dynamics' }) });
  if (await dyn.count()) {
    await dyn.locator('button', { hasText: 'Analyze' }).click();
    await p.waitForTimeout(500);
    const t = p.locator('.main-col input[type=range]').first();
    await t.focus();
    for (let k = 0; k < 10; k++) await p.keyboard.press('ArrowRight');
    await p.waitForTimeout(1500);
    row.dynamics = await take(p);
  }
  // 3. Information card: open, then change the stimulus and the binning
  const info = p.locator('.card', { has: p.locator('h2', { hasText: /^Information$/ }) });
  if (await info.count()) {
    await info.locator('button', { hasText: 'Analyze' }).click();
    await p.waitForTimeout(6000 * throttle);
    await take(p);
    // The stimulus and bin selectors are the panel's first two visible selects (elements can re-render, so allow retries)
    const selects = info.locator('select:visible');
    try {
      if (await selects.count() >= 2) {
        const opts = await selects.nth(0).locator('option').count();
        await selects.nth(0).selectOption({ index: Math.min(1, opts - 1) }, { timeout: 5000 });
        await selects.nth(1).selectOption({ index: 0 }, { timeout: 5000 });
        await p.waitForTimeout(1500);
        row.info = await take(p);
      }
    } catch { row.info = undefined; }
  }
  console.log(pg.padEnd(12), '| load', fmt(row.load), '| slider', row.slider ? fmt(row.slider) : 'n/a'.padEnd(29),
    '| dynamics', row.dynamics ? fmt(row.dynamics) : 'n/a'.padEnd(29), '| info', row.info ? fmt(row.info) : 'n/a');
  await p.close();
}
await browser.close();
