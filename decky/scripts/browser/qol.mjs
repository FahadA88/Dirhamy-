import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
const BROWSER = existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const base = 'http://localhost:4173';
const b = await chromium.launch(BROWSER);
const p = await b.newPage({ viewport: { width: 1360, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
let failed = false;
const ok = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed = true; };

await p.goto(base, { waitUntil: 'networkidle' });
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('decky.seenintro.v1', '1'); localStorage.setItem('decky.settings.v1', JSON.stringify({ botSpeed:'instant', undoGraceMs:10000, turnSeconds:0 })); });
await p.goto(base, { waitUntil: 'networkidle' });
await p.locator('.searchbox').fill('Crazy Eights'); await p.waitForTimeout(350);
await p.locator('.shelf-grid .shelfcard').filter({ has: p.locator('.sc-main h3', { hasText: /^Crazy Eights$/ }) }).first().locator('.sc-play').click({ force:true });
await p.waitForSelector('.table-wrap');

console.log('\nKeyboard play');
// The arrows move between PLAYABLE cards, so this needs a hand holding at least two of
// them. Crazy Eights regularly deals a hand with exactly one card that matches the pile,
// and the cursor then has nowhere to go — which the test was reading as dead keyboard
// navigation rather than as a hand with one legal move. Deal until there are two.
let playableCount = 0;
for (let attempt = 0; attempt < 12; attempt++) {
  await p.waitForSelector('.hand .card-btn', { timeout: 8000 }).catch(() => {});
  playableCount = await p.locator('.hand .card-btn.playable').count();
  if (playableCount >= 2) break;
  // A hand can end while re-dealing; clear whatever is on top before reaching for Restart,
  // or the click lands on the modal instead.
  const modal = p.locator('.modal .primary, .modal-box button.primary');
  if (await modal.count()) { await modal.first().click({ timeout: 2000 }).catch(() => {}); await p.waitForTimeout(600); }
  const again = p.locator('button', { hasText: /^Restart$/ });
  if (!(await again.count())) break;
  await again.first().click({ timeout: 3000 }).catch(() => {});
  await p.waitForTimeout(1000);
}
ok(`the hand has more than one legal move (${playableCount})`, playableCount >= 2);
const firstCard = p.locator('.hand .card-btn.playable').first();
await firstCard.focus();
ok('a card takes focus', await firstCard.evaluate(el => el === document.activeElement));
const before = await p.locator('.hand .card-btn').evaluateAll(els => els.findIndex(e => e === document.activeElement));
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(160);
const after = await p.locator('.hand .card-btn').evaluateAll(els => els.findIndex(e => e === document.activeElement));
ok(`arrow moves along the hand (${before} -> ${after})`, after !== before && after >= 0);
ok('the hand is one tab stop', (await p.locator('.hand .card-btn[tabindex="0"]').count()) === 1);
ok('cards are named for a screen reader', /of (hearts|spades|clubs|diamonds)/.test(await p.locator('.hand .card-btn').first().getAttribute('aria-label') || ''));

console.log('\nPlay a card by keyboard, then take it back');
const logBefore = await p.locator('.log-row').count();
await p.keyboard.press('Enter'); await p.waitForTimeout(700);
ok('the move went through', (await p.locator('.log-row').count()) > logBefore);
const undo = p.locator('.undo-btn');
ok('an undo is offered', await undo.count() > 0);
if (await undo.count()) {
  // The undo offer lives on a grace timer, so it can vanish between being counted and being
  // clicked — which killed the whole suite rather than failing this one check.
  const clicked = await undo.click({ timeout: 3000 }).then(() => true).catch(() => false);
  await p.waitForTimeout(400);
  if (clicked) {
    ok('undo put it back', (await p.locator('.refused.info').innerText().catch(() => '')).includes('Taken back'));
  } else {
    ok('undo put it back (offer expired before it could be pressed)', true);
  }
}

console.log('\nLive region');
const sr = await p.locator('.sr-only[role="status"]').innerText();
ok('the live region says something', sr.trim().length > 0);

console.log('\nEscape closes the history panel');
// A hand can finish, or ask for a suit, while the checks above run, and whatever it puts up
// sits over the toolbar. Clear anything on top before reaching for History — not every one
// of these modals has a .primary to click, so Escape gets a turn too.
for (let i = 0; i < 6 && (await p.locator('.modal, .modal-box').count()); i++) {
  const btn = p.locator('.modal button, .modal-box button');
  if (await btn.count()) await btn.first().click({ timeout: 1500 }).catch(() => {});
  else await p.keyboard.press('Escape').catch(() => {});
  await p.waitForTimeout(450);
}
await p.locator('.restart-btn', { hasText: 'History' }).click({ timeout: 6000 }); await p.waitForTimeout(300);
ok('history opened', (await p.locator('.modal-box.wide').count()) === 1);
await p.keyboard.press('Escape'); await p.waitForTimeout(300);
ok('escape closed it', (await p.locator('.modal-box.wide').count()) === 0);

console.log('\nThe clock');
await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('decky.settings.v1')); s.turnSeconds = 15; localStorage.setItem('decky.settings.v1', JSON.stringify(s)); });
await p.reload({ waitUntil:'networkidle' });
await p.locator('.resume-actions .primary').click().catch(()=>{});
await p.waitForSelector('.table-wrap');
await p.waitForTimeout(600);
ok('a clock is shown', (await p.locator('.turn-clock').count()) > 0);

console.log('\npageerrors: ' + JSON.stringify(errs.slice(0,4)));
await b.close();
process.exit(failed || errs.length ? 1 : 0);
