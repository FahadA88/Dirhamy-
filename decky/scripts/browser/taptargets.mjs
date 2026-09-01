// Tap targets, measured rather than eyeballed.
//
// The contrast script already stops a colour regression from shipping. Nothing stopped a size
// one: the five nav buttons had been shrunk to about 30px tall to make them fit beside the
// brand, which is under the 44px floor in WCAG 2.5.5 and both platform guidelines, and no check
// in the repo noticed. This is that check.
//
// It measures the real rendered box at a phone width, on the screens a first-time visitor
// actually touches. Anything interactive and visible has to clear 44x44 — with the documented
// exceptions below, each of which is a deliberate choice rather than an oversight.

import { existsSync } from 'node:fs';
import { chromium } from 'playwright';

// Same probe the other browser suites use.
const BROWSER = existsSync('/opt/pw-browsers/chromium') ? { executablePath: '/opt/pw-browsers/chromium' } : {};

const URL = process.env.DECKY_URL || 'http://localhost:4173/';
const MIN = 44;

// Controls that are legitimately smaller, and why. Keep this list short and argued.
const ALLOWED = [
  // Inline text links inside a paragraph: making these 44px tall would space the prose out
  // rather than make anything easier to hit. WCAG 2.5.5 exempts inline text for this reason.
  '.footer-links button',
  // The carousel's dots: a redundant control. The arrows either side of the same carousel are
  // full size, they scroll the same slides, and the dots stay a 32px hit area inside a 44px row
  // so a near-miss lands on nothing rather than on the wrong slide.
  '.car-dot',
];

async function measure(page, label) {
  return page.evaluate(({ min, allowed }) => {
    const bad = [];
    for (const el of document.querySelectorAll('button, a[href], select, input, [role="button"], [role="tab"]')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;              // not rendered
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (el.disabled) continue;
      if (allowed.some((sel) => el.matches(sel))) continue;
      if (r.width < min || r.height < min) {
        bad.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ').filter(Boolean).join('.')} `
          + `— ${Math.round(r.width)}x${Math.round(r.height)} — "${(el.textContent || '').trim().slice(0, 24)}"`);
      }
    }
    return bad;
  }, { min: MIN, allowed: ALLOWED }).then((bad) => ({ label, bad }));
}

const browser = await chromium.launch(BROWSER);
const page = await browser.newPage({ viewport: { width: 375, height: 780 }, hasTouch: true });
const results = [];

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
const skip = page.locator('button:has-text("Skip")');
if (await skip.count()) { await skip.click().catch(() => {}); await page.waitForTimeout(300); }

results.push(await measure(page, 'front page'));

await page.locator('text=Deal me in').first().click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(3500);
results.push(await measure(page, 'a table'));

await browser.close();

let failed = 0;
for (const { label, bad } of results) {
  if (bad.length === 0) {
    console.log(`  PASS   ${label} — every visible control clears ${MIN}x${MIN}`);
  } else {
    failed += bad.length;
    console.log(`  FAIL   ${label} — ${bad.length} under ${MIN}px:`);
    for (const b of bad) console.log(`           ${b}`);
  }
}

console.log(failed === 0
  ? '\nTAP TARGETS: all checks passed'
  : `\nTAP TARGETS: ${failed} control(s) under ${MIN}px at 375px wide`);
process.exit(failed === 0 ? 0 : 1);
