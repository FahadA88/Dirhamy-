// Phase 4 in the browser: discovery, ratings, favourites, creator profiles, play counts.
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

const BROWSER = existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};
const base = process.argv[2] || 'http://localhost:4173';

const b = await chromium.launch(BROWSER);
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const errs = [];
p.on('pageerror', (e) => errs.push(e.message));
let failed = false;
const ok = (l, c, x) => { console.log(`  ${c ? 'PASS' : 'FAIL'}  ${l}${c ? '' : '  ' + (x ?? '')}`); if (!c) failed = true; };

await p.goto(base, { waitUntil: 'networkidle' });
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('decky.seenintro.v1', '1'); });
await p.goto(base, { waitUntil: 'networkidle' });

console.log('\nThe front page is curated, not a dump');
await p.waitForSelector('.filterbar');
ok('a featured game is on top', (await p.locator('.hero').count()) === 1);
const shelves = await p.locator('.shelf .section-head h2').allTextContents();
ok(`${shelves.length} shelves`, shelves.length >= 2, JSON.stringify(shelves));
console.log('       ' + shelves.join(' · '));
ok('classics appear as ordinary cards', (await p.locator('.shelfcard').count()) > 3);
await p.screenshot({ path: '/tmp/shelf-front.png' });

console.log('\nSearching and filtering');
await p.locator('.searchbox').fill('hearts');
await p.waitForTimeout(300);
ok('search found something', (await p.locator('.shelf-grid .shelfcard').count()) >= 1);
await p.locator('.searchbox').fill('');
await p.locator('select[aria-label="Number of players"]').selectOption('1');
await p.waitForTimeout(300);
const soloNames = await p.locator('.shelf-grid .sc-main h3').allTextContents();
// "<= 4" was the whole solo shelf once; the catalog has grown past it since (eleven patience
// games plus Trio, which genuinely supports one player as a timed puzzle) and this failed on
// every run once it did, not because the filter was ever wrong. The real invariant a player-count
// filter has to hold isn't a headcount that drifts every time a solo game ships — it's that the
// filter actually filtered (fewer than the whole catalog) and didn't let in something that
// can't be played alone.
ok(`filtering to 1 player narrows the shelf (${soloNames.length} games)`,
  soloNames.length >= 2 && soloNames.length < 30, JSON.stringify(soloNames));
ok('and does not include a game that needs a second player',
  !soloNames.includes('Hearts') && !soloNames.includes('Spades'), JSON.stringify(soloNames));
await p.locator('select[aria-label="Number of players"]').selectOption('');
await p.waitForTimeout(250);

console.log('\nAn empty state that says something useful');
await p.locator('.chip', { hasText: 'Favourites' }).click();
await p.waitForTimeout(300);
const emptyText = await p.locator('.empty-shelf p').textContent();
ok('the empty favourites shelf says what to do', /Tap ♥/.test(emptyText), emptyText);
await p.locator('.chip', { hasText: 'Favourites' }).click();
await p.waitForTimeout(250);

console.log('\nFavouriting, rating and reviewing');
await p.locator('.searchbox').fill('FreeCell');
await p.waitForTimeout(300);
const card = p.locator('.shelf-grid .shelfcard').first();
await card.locator('.star').click();
await p.waitForTimeout(250);
ok('the star lit up', (await p.locator('.shelf-grid .shelfcard').first().locator('.star.on').count()) === 1);
await p.locator('.shelf-grid .shelfcard').first().locator('.sc-main').click();
await p.waitForSelector('.gd-grid');
ok('the detail page explains how it plays', (await p.locator('.explain-list li').count()) >= 2);
await p.locator('.rate-row .star').nth(3).click();
await p.locator('.review-box').fill('Good for a quiet ten minutes.');
await p.locator('button', { hasText: 'Post review' }).click();
await p.waitForTimeout(400);
ok('the review is listed',
  (await p.locator('.reviewlist li').first().textContent()).includes('quiet ten minutes'));
ok('and the average shows', (await p.locator('.gd-avg').count()) === 1);
await p.screenshot({ path: '/tmp/shelf-detail.png' });

console.log('\nCreator profiles');
await p.locator('.gd-by .linkish').click();
await p.waitForSelector('.creator');
const heading = (await p.locator('.creator h2').textContent()).trim();
ok(`the creator page opened (${heading})`, heading.length > 0);
ok(`${await p.locator('.creator .shelfcard').count()} games by them`,
  (await p.locator('.creator .shelfcard').count()) > 3);
await p.locator('.chip', { hasText: 'Follow' }).click();
await p.waitForTimeout(250);
ok('following sticks', (await p.locator('.chip.on').filter({ hasText: 'Following' }).count()) === 1);
const followed = await p.evaluate(() => JSON.parse(localStorage.getItem('decky.follows.v1') || '[]'));
ok('and is stored', followed.length === 1, JSON.stringify(followed));

console.log('\nPlay counts');
await p.locator('button', { hasText: 'Browse' }).first().click();
await p.waitForSelector('.filterbar');
await p.locator('.searchbox').fill('FreeCell');
await p.waitForTimeout(300);
await p.locator('.shelf-grid .shelfcard').first().locator('.sc-play').click({ force: true });
await p.waitForSelector('.table-wrap');
const stats = await p.evaluate(() => JSON.parse(localStorage.getItem('decky.builtinstats.v1') || '{}'));
ok('playing a game counted', Object.values(stats).some((s) => s.plays >= 1), JSON.stringify(stats));

console.log('\npageerrors: ' + JSON.stringify(errs.slice(0, 3)));
if (errs.length) failed = true;
console.log(failed ? '\nSHELF: FAILED' : '\nSHELF: browse, filter, rate, review, follow and count all work');
await b.close();
process.exit(failed ? 1 : 0);
