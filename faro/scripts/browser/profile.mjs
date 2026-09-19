import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
const BROWSER = existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const base = process.argv[2] || 'http://localhost:4173';
const b = await chromium.launch(BROWSER);
const p = await b.newPage({ viewport: { width: 1360, height: 1000 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
let failed = false;
const ok = (l, c) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}`); if (!c) failed = true; };

// A fresh device has no record at all — that path has to hold up on its own.
await p.goto(base, { waitUntil: 'networkidle' });
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('faro.seenintro.v1', '1'); localStorage.setItem('faro.settings.v1', JSON.stringify({ botSpeed: 'instant' })); });
await p.goto(base, { waitUntil: 'networkidle' });

console.log('\nAn empty record');
await p.locator('nav button', { hasText: 'You' }).first().click();
await p.waitForTimeout(300);
ok('the profile opens', (await p.locator('.profile').count()) === 1);
ok('it says there is nothing yet', (await p.locator('.empty-hero').count()) === 1);

console.log('\nWith games behind it');
// Write results straight in: this is testing the page, not replaying twelve games through the UI.
await p.evaluate(() => {
  const games = [['classic-crazy-eights','Crazy Eights'],['classic-war','War'],['classic-hearts','Hearts']];
  const rs = [];
  for (let i = 0; i < 12; i++) {
    const [gameId, gameName] = games[i % games.length];
    const youWon = i % 3 !== 0;
    rs.push({
      gameId, gameName, at: Date.now() - i * 3600000, seats: 3,
      standings: youWon
        ? [{ name: 'You', score: 10, isYou: true }, { name: 'Bot 2', score: 4, isYou: false }]
        : [{ name: 'Bot 2', score: 12, isYou: false }, { name: 'You', score: 3, isYou: true }],
      youWon,
      highlight: { key: 'score', label: 'Best score', value: 10 + i },
    });
  }
  localStorage.setItem('faro.results.v1', JSON.stringify(rs));
});
await p.reload({ waitUntil: 'networkidle' });
await p.locator('nav button', { hasText: 'You' }).first().click();
await p.waitForTimeout(300);
// By label, not by count. This asserted `=== 4` from the day it was written, and a fifth stat
// (the day streak, worklist #79) arrived later without anyone noticing — a count is a test that
// fails when the page gains something correct, and says nothing about whether the right things
// are there. verify:all is not part of `npm test`, so it sat red without being run.
const statLabels = await p.locator('.stat .stat-label, .stat dt, .stat > span:last-child')
  .allInnerTexts().then((xs) => xs.map((x) => x.trim().toLowerCase()));
ok(`the summary appears (${statLabels.join(', ')})`,
  ['played', 'won', 'win rate'].every((l) => statLabels.includes(l)));
const played = await p.locator('.stat').first().locator('.stat-value').innerText();
ok(`it counted the games (${played})`, played === '12');
ok('best-of is shown', (await p.locator('.highlight-list li').count()) > 0);
ok('recent games are listed', (await p.locator('.recent-list li').count()) > 0);

console.log('\nBy game');
await p.locator('.profile-tabs button', { hasText: 'By game' }).click();
await p.waitForTimeout(250);
ok('a row per game played', (await p.locator('.record-table tbody tr').count()) === 3);

console.log('\nBadges');
await p.locator('.profile-tabs button', { hasText: 'Badges' }).click();
await p.waitForTimeout(250);
const badges = await p.locator('.badge').count();
ok(`badges render (${badges})`, badges >= 8);
ok('some are earned', (await p.locator('.badge.earned').count()) > 0);
ok('progress is exposed to assistive tech', (await p.locator('.badge-bar[role="progressbar"]').count()) === badges);

await p.screenshot({ path: '/tmp/profile.png', fullPage: true });
console.log('\npageerrors: ' + JSON.stringify(errs.slice(0, 4)));
await b.close();
process.exit(failed || errs.length ? 1 : 0);
