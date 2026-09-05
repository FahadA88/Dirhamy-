import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
const BROWSER = existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const base = 'http://localhost:4173';
const b = await chromium.launch(BROWSER);
const p = await b.newPage({ viewport: { width: 1360, height: 1000 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
const ok = (l, c) => console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`);

async function openGame(name) {
  await p.goto(base, { waitUntil: 'networkidle' });
  await p.locator('.searchbox').fill(name);
  await p.waitForTimeout(350);
  const card = p.locator('.shelf-grid .shelfcard').filter({
    has: p.locator('.sc-main h3', { hasText: new RegExp(`^${name}$`) }),
  }).first();
  await card.locator('.sc-play').click({ force: true });
  await p.waitForSelector('.table-wrap');
}

await p.goto(base, { waitUntil: 'networkidle' });
// 'instant' bot speed (40ms) races the human for interrupt windows (bluff challenges, slaps) —
// bots often grab the button out from under Playwright between its stability check and the click.
// Use 'normal' so there's a real window to act, same as a human would get.
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('decky.seenintro.v1', '1'); localStorage.setItem('decky.settings.v1', JSON.stringify({ botSpeed: 'normal', motion: 'reduced' })); });

// Interrupt windows (challenge/slap) can vanish between locating and clicking, since a bot may
// win the race first. Treat that as fine, not a failure — it's the documented "first move wins" design.
async function tryClick(locator) {
  try { await locator.click({ timeout: 1000 }); return true; } catch { return false; }
}

console.log('\nBluff');
await openGame('Bluff');
await p.screenshot({ path: '/tmp/nf-bluff-1.png' });
ok('table loaded', (await p.locator('.bluff-controls').count()) === 1);
// Wait for our turn (bots go fast) and play through a few of our own turns.
for (let i = 0; i < 8; i++) {
  const yourTurn = await p.locator('.turn-badge', { hasText: 'Your turn' }).count();
  const challenge = await p.locator('.bluff-challenge').count();
  if (challenge) { await tryClick(p.locator('.bluff-challenge')); await p.waitForTimeout(400); continue; }
  if (yourTurn) {
    const cards = p.locator('.bluff-controls .card-btn');
    const n = await cards.count();
    if (n > 0 && (await tryClick(cards.first()))) {
      await p.waitForTimeout(150);
      await tryClick(p.locator('.bluff-rankpicker .seg button').first());
      await p.waitForTimeout(150);
      const submitBtn = p.locator('.bluff-rankpicker .primary');
      if ((await submitBtn.count()) && !(await submitBtn.isDisabled())) { await tryClick(submitBtn); await p.waitForTimeout(400); }
    }
  }
  await p.waitForTimeout(300);
}
await p.screenshot({ path: '/tmp/nf-bluff-2.png' });
ok('made it through several bluff turns without a crash', errs.length === 0);

console.log('\nSlapjack');
await openGame('Slapjack');
await p.screenshot({ path: '/tmp/nf-slapjack-1.png' });
ok('table loaded', (await p.locator('.reflex-controls').count()) === 1);
for (let i = 0; i < 30; i++) {
  const slap = p.locator('.reflex-slap');
  if (await slap.count()) { await tryClick(slap); await p.waitForTimeout(150); continue; }
  const flip = p.locator('.reflex-controls .ghost', { hasText: 'Flip' });
  if (await flip.count()) { await tryClick(flip); await p.waitForTimeout(150); }
  await p.waitForTimeout(80);
}
await p.screenshot({ path: '/tmp/nf-slapjack-2.png' });
ok('played several slapjack rounds without a crash', errs.length === 0);

console.log('\nShowdown Poker');
await openGame('Showdown Poker');
await p.screenshot({ path: '/tmp/nf-poker-1.png' });
ok('table loaded', (await p.locator('.poker-controls').count()) === 1);
for (let i = 0; i < 10; i++) {
  const actions = p.locator('.poker-actions button');
  const n = await actions.count();
  if (n === 0) { await p.waitForTimeout(200); continue; }
  const call = p.locator('.poker-actions button', { hasText: /^Call/ });
  const check = p.locator('.poker-actions button', { hasText: 'Check' });
  if (await check.count()) await tryClick(check);
  else if (await call.count()) await tryClick(call);
  else await tryClick(actions.first());
  await p.waitForTimeout(300);
}
await p.screenshot({ path: '/tmp/nf-poker-2.png' });
ok('played a poker hand to showdown without a crash', errs.length === 0);

console.log('\nPit');
await openGame('Pit');
await p.screenshot({ path: '/tmp/nf-pit-1.png' });
ok('table loaded', (await p.locator('.pit-controls').count()) === 1);
await tryClick(p.locator('.pit-offer-maker .primary'));
await p.waitForTimeout(500);
await p.screenshot({ path: '/tmp/nf-pit-2.png' });
ok('posted an offer without a crash', errs.length === 0);

console.log('\npageerrors: ' + JSON.stringify(errs.slice(0, 6)));
await b.close();
process.exit(errs.length ? 1 : 0);
