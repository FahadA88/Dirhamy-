// Play every classic through the real UI, now that the client talks to the service.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

// This container ships Chromium at a fixed path; anywhere else, let Playwright find its own.
const BROWSER = existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const base = process.argv[2] || 'http://localhost:4173';
const shots = process.argv[3] || '/tmp/decky-shots';
const browser = await chromium.launch(BROWSER);
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(`console: ${m.text()}`); });

await page.goto(base, { waitUntil: 'networkidle' });
// Bots at full speed so a run actually reaches the end of a hand.
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('decky.settings.v1') || '{}');
  localStorage.setItem('decky.settings.v1', JSON.stringify({ ...raw, botSpeed: 'instant' }));
});
await page.reload({ waitUntil: 'networkidle' });

// The front page shows curated shelves; "Browse all" is the full grid.
await page.locator('.chip', { hasText: 'Browse all' }).click();
await page.waitForSelector('.shelf-grid');
const names = await page.$$eval('.shelf-grid .sc-main h3', (els) => els.map((e) => e.textContent.trim()));
const report = [];
for (const name of names) {
  errors.length = 0;
  await page.goto(base, { waitUntil: 'networkidle' });
  const d = page.locator('.resume-actions .ghost');
  if (await d.count()) await d.first().click();
  await openGame(page, name);
  await page.waitForSelector('.table-wrap', { timeout: 8000 });

  let moves = 0, refusals = 0, roundsSeen = 0;
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(70);
    if (await page.locator('.refused').count()) refusals++;
    const sel = '.card-btn.playable:not([disabled]), .sol-card.live:not([disabled]), .draw-btn, .meld-btn, .bomb-btn, .knock-btn, .bid-btn, .suit-btn, .sol-slot.stock, .modal .primary';
    const c = page.locator(sel);
    const n = await c.count();
    if (n === 0) continue;
    if (await page.locator('.modal .primary').count()) roundsSeen++;
    try { await c.nth(Math.floor(Math.random() * n)).click({ timeout: 1200 }); moves++; } catch { /* detached */ }
  }
  await page.waitForTimeout(500);
  const crashed = await page.locator('.eb-box, .error-boundary').count();
  await page.screenshot({ path: `${shots}/${name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.png` });
  report.push({ name, moves, refusals, crashed, errors: errors.slice(0, 3) });
  console.log(`${errors.length === 0 && !crashed ? 'OK  ' : 'BAD '} ${name.padEnd(16)} moves=${String(moves).padStart(3)} handEnds=${roundsSeen > 0 ? 'yes' : 'no '} refusals=${refusals} ${errors.length ? JSON.stringify(errors.slice(0, 2)) : ''}`);
}
const bad = report.filter((r) => r.errors.length || r.crashed);
console.log(bad.length === 0 ? `\nALL ${report.length} GAMES CLEAN` : `\n${bad.length} PROBLEM(S)`);
await browser.close();
process.exit(bad.length ? 1 : 0);

/** The library is a shelf now: search for a game, then play it from its card. */
async function openGame(page, name) {
  await page.locator('.searchbox').fill(name);
  await page.waitForTimeout(280);
  await page.locator('.shelf-grid .shelfcard').first().locator('.sc-foot button.primary').click();
}
