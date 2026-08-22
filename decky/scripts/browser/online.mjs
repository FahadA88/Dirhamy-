import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

// Two people, one table, one referee across a socket.
//
// This is the test the multiplayer wiring exists for: the host is a real GameHost process, the
// two pages are two separate browser contexts (no shared storage), and the only thing connecting
// them is the WebSocket. If a move made in one window does not appear in the other, it failed.

const BROWSER = existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const base = process.argv[2] || 'http://localhost:8799';
const b = await chromium.launch(BROWSER);
let failed = false;
const ok = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed = true; };
const errs = [];

async function page(name) {
  const ctx = await b.newContext({ viewport: { width: 1200, height: 900 } });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errs.push(`${name}: ${e.message}`));
  await p.goto(base, { waitUntil: 'networkidle' });
  await p.evaluate((n) => {
    localStorage.clear();
    localStorage.setItem('decky.settings.v1', JSON.stringify({ botSpeed: 'instant', playerName: n }));
  }, name);
  await p.goto(base, { waitUntil: 'networkidle' });
  return p;
}

async function openGame(p, name) {
  await p.locator('.searchbox').fill(name);
  await p.waitForTimeout(350);
  await p.locator('.shelf-grid .shelfcard')
    .filter({ has: p.locator('.sc-main h3', { hasText: new RegExp(`^${name}$`) }) })
    .first().locator('.sc-main h3').click();
  await p.waitForSelector('.detail, .gd-actions, .game-detail', { timeout: 5000 }).catch(() => {});
}

console.log('\nThe host is reachable');
const host = await (await fetch(`${base}/health`)).json();
ok('a host answered /health', host.ok === true);

const alice = await page('Alice');
const bob = await page('Bob');

console.log('\nAlice opens a table');
await openGame(alice, 'Crazy Eights');
const onlineBtn = alice.locator('button', { hasText: 'Play with people' });
ok('the online button is offered when a host is up', (await onlineBtn.count()) > 0);
await onlineBtn.first().click();
await alice.waitForSelector('.online-choices', { timeout: 5000 });
ok('the online screen opens', (await alice.locator('.online-card').count()) === 3);
await alice.locator('.online-card', { hasText: 'Open a table' }).locator('.primary').click();
await alice.waitForSelector('.table-wrap, .invite-code', { timeout: 8000 });
await alice.waitForTimeout(800);
const code = (await alice.locator('.table-code b').innerText().catch(() => ''))
  || (await alice.locator('.invite-code').innerText().catch(() => '')).replace(/\s/g, '');
ok(`an invite code was issued (${code})`, !!code && code.length >= 3);
ok('Alice is at the table', (await alice.locator('.table-wrap').count()) === 1);

console.log('\nBob joins with the code');
await openGame(bob, 'Crazy Eights');
await bob.locator('button', { hasText: 'Play with people' }).first().click();
await bob.waitForSelector('.online-choices', { timeout: 5000 });
await bob.locator('.code-input').fill(code);
await bob.locator('.online-card', { hasText: 'Join a table' }).locator('.primary').click();
await bob.waitForSelector('.table-wrap', { timeout: 8000 });
ok('Bob reached the same table', (await bob.locator('.table-wrap').count()) === 1);

console.log('\nThe two windows see the same game');
const aliceLog = await alice.locator('.log-row').count();
const bobLog = await bob.locator('.log-row').count();
ok(`both windows have a log (${aliceLog} / ${bobLog})`, aliceLog > 0 && bobLog > 0);

// Whoever is owed a move makes one; the other window must see it without being touched.
async function whoseTurn() {
  const a = await alice.locator('.turn-badge', { hasText: 'Your turn' }).count();
  const bb = await bob.locator('.turn-badge', { hasText: 'Your turn' }).count();
  return a ? alice : bb ? bob : null;
}
const mover = await whoseTurn();
ok('somebody is owed a move', mover !== null);
if (mover) {
  const watcher = mover === alice ? bob : alice;
  const before = await watcher.locator('.log-row').count();
  const card = mover.locator('.hand .card-btn.playable').first();
  if (await card.count()) await card.click();
  else await mover.locator('.draw-btn').first().click();
  // No interaction with the watcher at all — the push has to carry it.
  await watcher.waitForFunction(
    (n) => document.querySelectorAll('.log-row').length > n, before, { timeout: 8000 },
  ).catch(() => {});
  const after = await watcher.locator('.log-row').count();
  ok(`the move crossed the socket unaided (${before} -> ${after})`, after > before);
}

console.log('\nNo hands leak across the wire');
const bobSawAliceHand = await bob.evaluate(() => {
  // Bob's page should never have been sent Alice's cards. The redacted view is the only thing
  // that crosses, so nothing in Bob's DOM can name a card he does not hold.
  return document.querySelectorAll('.opponents .card.face').length;
});
ok('opponent hands are face down', bobSawAliceHand === 0);

console.log('\npageerrors: ' + JSON.stringify(errs.slice(0, 6)));
await b.close();
process.exit(failed || errs.length ? 1 : 0);
