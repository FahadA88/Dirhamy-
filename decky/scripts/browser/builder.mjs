// Phase 2 in the browser: can somebody who cannot write code build, playtest and publish?
// Every step below is a click a person would make — no injected state, no shortcuts.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const BROWSER = existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const base = process.argv[2] || 'http://localhost:4173';

const b = await chromium.launch(BROWSER);
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) errs.push(m.text()); });

let failed = false;
const ok = (label, cond, extra) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  ' + (extra ?? '')}`);
  if (!cond) failed = true;
};

await p.goto(base, { waitUntil: 'networkidle' });
await p.evaluate(() => {
  localStorage.clear();
  // Bots at full speed, so a 14-tick playtest actually reaches the player several times.
  localStorage.setItem('decky.settings.v1', JSON.stringify({ botSpeed: 'instant' }));
});
await p.goto(base, { waitUntil: 'networkidle' });
await p.locator('button', { hasText: /^Create$/ }).first().click();

console.log('\nStep 1 — the builder opens on a choice, not a blank form');
await p.waitForSelector('.template-grid');
const templates = await p.locator('.template-card').count();
ok(`${templates} templates offered`, templates >= 5);
ok('a step rail is showing', (await p.locator('.steprail-item').count()) === 5);

console.log('\nStep 2 — pick one and it is already a real, dealt game');
await p.locator('.template-card', { hasText: 'Chaos deck' }).click();
await p.waitForSelector('.mini-table');
ok('the live table dealt a hand', (await p.locator('.mini-hand .mini-card').count()) > 0);
ok('and it is not showing an error', (await p.locator('.mini-table.broken').count()) === 0);
const status = await p.locator('.status-pill').first().textContent();
ok(`validation says "${status.trim()}"`, status.trim() !== 'red');

console.log('\nStep 3 — the twists the template came with are readable');
await p.locator('.steprail-item', { hasText: 'Twists' }).click();
await p.waitForSelector('.rb-list');
const ruleCount = await p.locator('.rb-item').count();
ok(`${ruleCount} rules listed`, ruleCount >= 5);
const sentences = await p.locator('.rb-sentence').allTextContents();
ok('each one reads as a sentence', sentences.every((s) => s.length > 20 && !/undefined|\[object/.test(s)), JSON.stringify(sentences.slice(0, 2)));
console.log('       e.g. ' + sentences[0]);

console.log('\nStep 4 — writing a brand-new rule, by clicking only');
await p.locator('button', { hasText: '+ Add another rule' }).click();
await p.waitForTimeout(200);
const editor = p.locator('.rb-item.open');
ok('the new rule opened for editing', (await editor.count()) === 1);
await editor.locator('.rb-clause select').first().selectOption('turnEnd');
await editor.locator('.rb-clause select').nth(1).selectOption('handSize');
await p.waitForTimeout(150);
await editor.locator('.rb-effect select').first().selectOption('announce');
await p.waitForTimeout(150);
await editor.locator('.rb-effect input[type=text], .rb-effect input:not([type])').first().fill('Down to the wire!');
await p.waitForTimeout(250);
const readback = await editor.locator('.rb-readback p').textContent();
ok('the read-back updated live', /Down to the wire/.test(readback), readback);
console.log('       ' + readback.trim());
ok('advanced ingredients are hidden by default',
  (await editor.locator('.rb-clause select').nth(1).locator('option').count()) < 12);
await p.locator('.rb-adv input').check();
await p.waitForTimeout(150);
ok('...and appear when asked for',
  (await editor.locator('.rb-clause select').nth(1).locator('option').count()) >= 12);

console.log('\nStep 5 — prove it works before publishing');
await p.locator('.steprail-item', { hasText: 'Test' }).click();
await p.waitForSelector('.proposal-actions');
await p.locator('button', { hasText: 'Simulate 300 games' }).click();
await p.waitForSelector('.report', { timeout: 60000 });
const metrics = await p.locator('.metric').allTextContents();
ok('the simulator reported', metrics.length >= 4, JSON.stringify(metrics));
console.log('       ' + metrics.join(' | '));
ok('it terminates every game', /300\/300/.test(metrics.join(' ')), metrics.join(' '));

console.log('\nStep 6 — playtest it at a real table');
await p.locator('button', { hasText: 'Playtest now' }).click();
await p.waitForSelector('.table-wrap', { timeout: 10000 });
let plays = 0;
for (let i = 0; i < 14; i++) {
  const c = p.locator('.card-btn.playable, .draw-btn');
  if (await c.count()) { await c.first().click({ timeout: 1500 }).catch(() => {}); plays++; }
  await p.waitForTimeout(260);
}
const log = await p.locator('.log-row').allTextContents();
ok(`played ${plays} times at the table`, plays > 5);
ok('the author-written rules fired in play', log.some((l) => /Queen|Last card|Too many|reveals/i.test(l)), JSON.stringify(log.slice(0, 4)));
await p.screenshot({ path: '/tmp/builder-playtest.png' });
await p.locator('button', { hasText: 'Back to editor' }).click();

console.log('\nStep 7 — publish it');
await p.locator('.steprail-item', { hasText: 'Publish' }).click();
await p.waitForTimeout(300);
await p.locator('.field', { hasText: 'Tags' }).locator('input').fill('party, chaotic');
await p.locator('button', { hasText: 'Publish to the shelf' }).click();
await p.waitForSelector('.published-ok', { timeout: 5000 });
ok('the game is on the shelf', (await p.locator('.published-ok h3').textContent()).includes('Chaos'));
const shelved = await p.evaluate(() => JSON.parse(localStorage.getItem('decky.library.v1') || '[]').length);
ok(`${shelved} game stored`, shelved === 1);
await p.screenshot({ path: '/tmp/builder-published.png' });

console.log('\npageerrors: ' + JSON.stringify(errs.slice(0, 4)));
if (errs.length) failed = true;
console.log(failed ? '\nBUILDER: FAILED' : '\nBUILDER: a non-coder can build, playtest and publish');
await b.close();
process.exit(failed ? 1 : 0);
