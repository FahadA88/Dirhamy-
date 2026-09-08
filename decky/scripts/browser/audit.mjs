import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

// Playing every game like a person would, and writing down anything that looks wrong.
//
// Not assertions — observations. The point is to surface things a player would notice and a
// unit test never will: a button that does nothing, a panel that says the wrong thing, a table
// that stops responding, a score that does not move.

const BROWSER = existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const base = process.argv[2] || 'http://localhost:4173';
const only = (process.argv.find((a) => a.startsWith('only=')) ?? '').slice(5);

const b = await chromium.launch(BROWSER);
const page = await b.newPage({ viewport: { width: 1360, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });

await page.goto(base, { waitUntil: 'networkidle' });
await page.evaluate(() => {
  localStorage.clear();
  localStorage.setItem('decky.seenintro.v1', '1');
  localStorage.setItem('decky.settings.v1', JSON.stringify({ botSpeed: 'instant', motion: 'reduced' }));
});
await page.goto(base, { waitUntil: 'networkidle' });

let names = await page.$$eval('.shelf-grid .sc-main h3', (els) => els.map((e) => e.textContent.trim()));
if (only) names = names.filter((n) => only.split(',').includes(n));

const findings = [];
const note = (game, what) => { findings.push(`${game}: ${what}`); };

async function openGame(name) {
  await page.goto(base, { waitUntil: 'networkidle' });
  const dismiss = page.locator('.resume-actions .ghost');
  if (await dismiss.count()) await dismiss.first().click().catch(() => {});
  await page.locator('.searchbox').fill(name);
  await page.waitForTimeout(320);
  const card = page.locator('.shelf-grid .shelfcard')
    .filter({ has: page.locator('.sc-main h3', { hasText: new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }) }).first();
  await card.locator('.sc-play').click({ force: true });
  await page.waitForSelector('.table-wrap', { timeout: 10000 });
}

// Everything a player can press at a table.
const ACTIONABLE = [
  '.hand .card-btn.playable:not([disabled])',
  '.sol-card.live:not([disabled])', '.sol-slot.stock', '.sol-col.target', '.sol-slot.target',
  '.draw-btn', '.meld-btn', '.bomb-btn', '.knock-btn',
  '.suit-btn', '.bid-panel button', '.cr-bid', '.contract-panel .ghost',
  '.war-controls .primary', '.reflex-controls button', '.poker-actions button',
  '.pit-market button', '.pit-offer-maker .primary',
  '.bluff-challenge', '.bluff-controls .card-btn', '.bluff-rankpicker .primary',
  '.set-card',
  '.modal-box .primary',
].join(', ');

for (const name of names) {
  errors.length = 0;
  process.stdout.write(`\n=== ${name} `);
  try {
    await openGame(name);
  } catch (e) {
    note(name, `COULD NOT OPEN: ${String(e).slice(0, 100)}`);
    console.log('FAILED TO OPEN');
    continue;
  }

  // --- what a player sees the moment it opens ---
  const opening = await page.evaluate(() => ({
    handCards: document.querySelectorAll('.hand .card-btn').length,
    boardCards: document.querySelectorAll('.set-card').length,
    solCards: document.querySelectorAll('.sol-card').length,
    warPile: document.querySelectorAll('.war-controls, .war-center').length,
    logLines: document.querySelectorAll('.log-row').length,
    yourTurn: document.querySelectorAll('.turn-badge').length,
    opponents: document.querySelectorAll('.opponents .seat').length,
    anyAction: document.querySelectorAll('button:not([disabled])').length,
    title: document.querySelector('.crumb-title')?.textContent ?? '',
    emptyHand: document.querySelectorAll('.empty-hand').length,
  }));
  if (opening.logLines === 0) note(name, 'no opening line in the game log');
  if (opening.handCards === 0 && opening.boardCards === 0 && opening.solCards === 0
      && opening.warPile === 0) {
    note(name, 'nothing to look at on open: no hand, no board, no tableau');
  }

  // --- play it ---
  let moves = 0, refusals = 0, stuckRounds = 0, ended = false;
  const refusalTexts = new Set();
  for (let i = 0; i < 200; i++) {
    await page.waitForTimeout(45);

    const refused = page.locator('.refused.bad');
    if (await refused.count()) {
      refusals++;
      refusalTexts.add((await refused.first().innerText().catch(() => '')).replace(/^✕\s*/, '').slice(0, 90));
    }

    // Finished?
    if (await page.locator('.modal-box.celebrate.final').count()) { ended = true; break; }

    const c = page.locator(ACTIONABLE);
    const n = await c.count();
    if (n === 0) {
      stuckRounds++;
      // Give bots a chance; if nothing appears for a long time the table has stopped.
      if (stuckRounds > 45) break;
      continue;
    }
    stuckRounds = 0;
    try { await c.nth(Math.floor(Math.random() * n)).click({ timeout: 900 }); moves++; }
    catch { /* element went away mid-click, which is normal with fast bots */ }
  }

  const after = await page.evaluate(() => ({
    crashed: document.querySelectorAll('.eb-box, .error-boundary').length,
    logLines: document.querySelectorAll('.log-row').length,
    stillActionable: document.querySelectorAll('button:not([disabled])').length,
    phase: document.querySelector('.modal-box.celebrate.final') ? 'match over'
      : document.querySelector('.modal-box.celebrate') ? 'hand over' : 'playing',
    nan: (document.body.innerText.match(/NaN|undefined|\[object|Infinity/g) || []).slice(0, 4),
  }));

  if (after.crashed) note(name, 'the table crashed into an error boundary');
  if (after.nan.length) note(name, `broken text on screen: ${after.nan.join(', ')}`);
  if (stuckRounds > 45) note(name, `table stopped responding after ${moves} moves — nothing left to click and no result`);
  if (moves === 0) note(name, 'could not make a single move as a player');
  if (after.logLines <= opening.logLines && moves > 3) note(name, `${moves} moves made but the log never grew`);
  if (refusals > 0) note(name, `${refusals} refusals: ${[...refusalTexts].join(' | ')}`);
  if (errors.length) note(name, `page errors: ${errors.slice(0, 2).join(' | ')}`);

  console.log(`moves=${moves} log=${after.logLines} ${after.phase}${after.crashed ? ' CRASHED' : ''}`);
}

console.log('\n\n──────── FINDINGS ────────');
if (findings.length === 0) console.log('Nothing to report.');
else findings.forEach((f) => console.log('• ' + f));
await b.close();
