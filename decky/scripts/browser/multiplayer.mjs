// Phase 3 in the browser: pass-and-play, the hand-off screen, history and takeback.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const BROWSER = existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const base = process.argv[2] || 'http://localhost:4173';

const b = await chromium.launch(BROWSER);
const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
let failed = false;
const ok = (l, c, x) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '  ' + (x ?? '')}`); if (!c) failed = true; };

// Two local seats hand off on every turn that isn't a bot's, and with bots at instant speed a
// new one can land in any gap between clicks — a real race, not a fixed number of stale overlays
// to clear once (a fixed count of 4, then 20, both still found a run that needed one more).
// Dismisses whatever's covering the screen and retries the click itself, rather than only
// clearing before it and hoping the screen holds still for the click to land.
//
// The overlay locator deliberately does NOT include a generic ".modal .primary" — a target that
// is itself a modal's own primary button (the movelist's "OK", say) matches that just as well as
// a foreign one covering it, and the loop then spends its whole budget "dismissing" its own
// target instead of ever attempting the real click. Handoff and the suit-picker are the only two
// screens that genuinely interrupt something else.
const FOREIGN_OVERLAY = '.handoff button.primary, .suit-btn';
async function clickThrough(page, locator, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const overlay = page.locator(FOREIGN_OVERLAY);
    if (await overlay.count()) {
      await overlay.first().click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(150);
      if (Date.now() > deadline) { await locator.click({ timeout: 1000 }); return; }
      continue;
    }
    const clicked = await locator.click({ timeout: 1000 }).then(() => true).catch(() => false);
    if (clicked) return;
    if (Date.now() > deadline) { await locator.click({ timeout: 1000 }); return; }
  }
}

// Opening the table menu and then picking an item from it is two clicks, and a hand-off landing
// between them closes the dropdown along with everything else on screen — clickThrough alone
// would keep retrying a click on a menu item that isn't there to click any more. This reopens
// the menu itself as one of the things it retries.
async function menuAction(page, itemText, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const overlay = page.locator(FOREIGN_OVERLAY);
    if (await overlay.count()) {
      await overlay.first().click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(150);
      if (Date.now() > deadline) break;
      continue;
    }
    if (!(await page.locator('.menu-pop').count())) {
      await page.locator('.menu-btn').click({ timeout: 1000 }).catch(() => {});
      await page.waitForTimeout(120);
      if (Date.now() > deadline) break;
      continue;
    }
    const clicked = await page.locator('.menu-pop button', { hasText: itemText })
      .click({ timeout: 1000 }).then(() => true).catch(() => false);
    if (clicked) return;
    if (Date.now() > deadline) break;
  }
  await page.locator('.menu-pop button', { hasText: itemText }).click({ timeout: 1000 });
}

await p.goto(base, { waitUntil: 'networkidle' });
await p.evaluate(() => {
  localStorage.clear();
    localStorage.setItem('decky.seenintro.v1', '1');
  // Not 'instant' (40ms) here specifically: two LOCAL seats means a hand-off can land between
  // any two clicks this script makes, and 40ms between bot moves left near-zero room for a
  // click to land in a state that was still true by the time it arrived. 'fast' costs this one
  // test a few extra seconds and buys the UI enough of a gap to actually be stable when asked.
  localStorage.setItem('decky.settings.v1', JSON.stringify({ botSpeed: 'fast' }));
});
await p.goto(base, { waitUntil: 'networkidle' });

console.log('\nSetting up a pass-and-play table');
await p.locator('.searchbox').fill('Crazy Eights');
await p.waitForTimeout(300);
await p.locator('.shelf-grid .shelfcard').first().locator('.sc-main').click();
await p.waitForSelector('.gd-actions');
await p.locator('.gd-actions button', { hasText: 'Set up a table' }).click();
await p.waitForSelector('.seatlist');
ok('a seat list appeared', (await p.locator('.seatrow').count()) >= 2);

// Turn seat 2 into a second person at this device.
await p.locator('.seatrow').nth(1).locator('button', { hasText: 'Person here' }).click();
await p.locator('.seatrow').nth(1).locator('.seatrow-name').fill('Bea');
const note = await p.locator('.seat-note').textContent();
ok('the screen explains what that means', /Pass-and-play/.test(note), note);
await p.locator('button', { hasText: 'Deal' }).click();
await p.waitForSelector('.table-wrap');

console.log('\nPlaying, and handing the device over');
let handoffs = 0, plays = 0;
for (let i = 0; i < 30; i++) {
  const ho = p.locator('.handoff');
  if (await ho.count()) {
    const title = await ho.locator('h3').textContent();
    if (handoffs === 0) console.log('       ' + title.trim());
    await ho.locator('button.primary').click();
    handoffs++;
    await p.waitForTimeout(150);
    continue;
  }
  // Crazy Eights can stop for a wild-suit choice; deal with any modal before touching the hand.
  const suit = p.locator('.suit-btn');
  if (await suit.count()) { await suit.first().click({ timeout: 1500 }).catch(() => {}); await p.waitForTimeout(150); continue; }
  const modalBtn = p.locator('.modal .primary');
  if (await modalBtn.count()) { await modalBtn.first().click({ timeout: 1500 }).catch(() => {}); await p.waitForTimeout(150); continue; }
  const c = p.locator('.card-btn.playable, .draw-btn');
  if (await c.count()) { await c.first().click({ timeout: 1500 }).catch(() => {}); plays++; }
  await p.waitForTimeout(160);
}
ok(`the device changed hands ${handoffs} times`, handoffs >= 2);
ok(`${plays} moves were played`, plays > 4);
await p.screenshot({ path: '/tmp/mp-table.png' });

console.log('\nThe move history');
// History, take back and restart live behind the table menu now.
await menuAction(p, 'History');
await p.waitForSelector('.movelist');
const rows = await p.locator('.movelist li').count();
ok(`${rows} moves listed`, rows > 3);
const first = (await p.locator('.movelist li').first().textContent()).replace(/\s+/g, ' ').trim();
ok('each row names the seat and what happened', first.length > 6, first);
console.log('       ' + first);
await clickThrough(p, p.locator('.modal-box button.primary'));

console.log('\nAsking the table for a takeback');
await menuAction(p, 'Take back');
await p.waitForTimeout(300);
const bar = await p.locator('.takeback-bar').count();
const toast = await p.locator('.refused').textContent().catch(() => '');
ok('the other player is asked, not obeyed', bar > 0 || /waiting on/i.test(toast || ''), `bar=${bar} toast=${toast}`);
await p.screenshot({ path: '/tmp/mp-takeback.png' });

console.log('\npageerrors: ' + JSON.stringify(errs.slice(0, 3)));
if (errs.length) failed = true;
console.log(failed ? '\nMULTIPLAYER: FAILED' : '\nMULTIPLAYER: pass-and-play, history and takeback all work');
await b.close();
process.exit(failed ? 1 : 0);
