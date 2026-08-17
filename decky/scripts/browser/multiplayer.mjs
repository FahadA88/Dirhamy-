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

await p.goto(base, { waitUntil: 'networkidle' });
await p.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('decky.settings.v1', JSON.stringify({ botSpeed: 'instant' }));
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
// Clear whatever the loop left on screen — a hand-off, a suit picker, or a hand-over modal.
for (let i = 0; i < 4; i++) {
  const overlay = p.locator('.modal .primary, .suit-btn');
  if (!(await overlay.count())) break;
  await overlay.first().click({ timeout: 2000 }).catch(() => {});
  await p.waitForTimeout(250);
}
await p.locator('.restart-btn', { hasText: 'History' }).click();
await p.waitForSelector('.movelist');
const rows = await p.locator('.movelist li').count();
ok(`${rows} moves listed`, rows > 3);
const first = (await p.locator('.movelist li').first().textContent()).replace(/\s+/g, ' ').trim();
ok('each row names the seat and what happened', first.length > 6, first);
console.log('       ' + first);
await p.locator('.modal-box button.primary').click();

console.log('\nAsking the table for a takeback');
await p.locator('.restart-btn', { hasText: 'Take back' }).click();
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
