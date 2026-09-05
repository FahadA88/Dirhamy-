import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

// Installable, and playable with the network switched off.
//
// The claim being tested is not "a service worker registered" but "the app still deals a game
// when nothing can reach the network", which is the only version of offline anybody cares about.

const BROWSER = existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const base = process.argv[2] || 'http://localhost:4173';
const b = await chromium.launch(BROWSER);
const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
let failed = false;
const ok = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed = true; };

console.log('\nThe app declares itself installable');
await p.goto(base, { waitUntil: 'networkidle' });
// A fresh context is a first-time visitor, and a first-time visitor gets the introduction over
// the shelf. This suite is about installing and playing offline, so it starts past it.
await p.evaluate(() => localStorage.setItem('decky.seenintro.v1', '1'));
await p.reload({ waitUntil: 'networkidle' });
ok('a manifest is linked', (await p.locator('link[rel="manifest"]').count()) === 1);
ok('a theme colour is set', (await p.locator('meta[name="theme-color"]').count()) === 1);
// index.html deliberately carries two: the SVG icon, and an explicit favicon.ico link whose own
// comment explains why — without it, a browser makes its own automatic, wasted /favicon.ico
// request. "=== 1" was true before that second, intentional link existed.
ok('an icon is linked', (await p.locator('link[rel="icon"]').count()) >= 1);

const man = await (await fetch(`${base}/manifest.webmanifest`)).json();
ok('the manifest names the app', man.name && man.short_name === 'Decky');
ok('it is standalone', man.display === 'standalone');
ok('it has a maskable icon', man.icons.some((i) => i.purpose === 'maskable'));

console.log('\nThe worker takes over');
await p.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 15000 })
  .catch(() => {});
const controlled = await p.evaluate(() => navigator.serviceWorker.controller !== null);
ok('a service worker is controlling the page', controlled);

console.log('\nWith the network switched off');
// Warm the cache by visiting a game first, then cut the network entirely.
await p.locator('.searchbox').fill('War');
await p.waitForTimeout(300);
await p.locator('.shelf-grid .shelfcard').filter({ has: p.locator('.sc-main h3', { hasText: /^War$/ }) })
  .first().locator('.sc-play').click({ force: true });
await p.waitForSelector('.table-wrap');
await p.waitForTimeout(500);

await ctx.setOffline(true);
await p.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
await p.waitForTimeout(1500);
ok('the app still loads offline', (await p.locator('#root').count()) === 1);
const shelfOrTable = await p.locator('.shelf-grid, .table-wrap, .resume').count();
ok('it renders its own interface, not a browser error', shelfOrTable > 0);

// The real proof: deal and play a hand with no network at all.
await p.locator('.resume-actions .ghost').click().catch(() => {});
await p.locator('.searchbox').fill('War').catch(() => {});
await p.waitForTimeout(300);
const card = p.locator('.shelf-grid .shelfcard').filter({ has: p.locator('.sc-main h3', { hasText: /^War$/ }) }).first();
if (await card.count()) {
  await card.locator('.sc-play').click({ force: true });
  await p.waitForSelector('.table-wrap', { timeout: 5000 }).catch(() => {});
  const flip = p.locator('.war-controls .primary');
  if (await flip.count()) { await flip.click(); await p.waitForTimeout(500); }
  ok('a game deals and plays with no network', (await p.locator('.log-row').count()) > 0);
} else {
  ok('a game deals and plays with no network', false);
}

await ctx.setOffline(false);
console.log('\npageerrors: ' + JSON.stringify(errs.slice(0, 4)));
await b.close();
process.exit(failed ? 1 : 0);
