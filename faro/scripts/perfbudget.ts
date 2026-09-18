// Item #58 of the audit pass: nothing in the test pipeline ever checked that the SHIPPED bundle
// stayed a reasonable size. A full Lighthouse run is heavyweight and network-shaped — wrong fit
// for a fast, deterministic `npm test` chain — so this is the practical version of the same
// idea: build for real, then fail loudly if any shipped chunk crosses a byte budget.
//
// Budgets are set with real headroom above what the app measures today, not at today's exact
// number — the point is to catch a chunk that has quietly doubled, not to block ordinary growth.

import { execSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist', 'assets');

console.log('Building for a real production-size check...');
execSync('npx vite build', { cwd: ROOT, stdio: 'inherit' });

interface Budget { pattern: RegExp; maxKB: number; label: string }
const BUDGETS: Budget[] = [
  { pattern: /^index-.*\.js$/, maxKB: 650, label: 'main app JS' },
  { pattern: /^vendor-.*\.js$/, maxKB: 200, label: 'vendor (react/react-dom) JS' },
  { pattern: /^CreateView-.*\.js$/, maxKB: 250, label: 'Create view JS (lazy-loaded)' },
  { pattern: /^OnlineTable-.*\.js$/, maxKB: 40, label: 'online table JS (lazy-loaded)' },
  // 264 -> 268, in two steps and for two reasons. First: eight of the seventeen card faces
  // had stopped working — written against the old corner-index markup, their rules no longer
  // matched anything, so they cost bytes and rendered as the classic face. Making them real
  // again is net new CSS. Second: the table-layout settings (where the seats sit, where the
  // piles sit) and the drawn chips are new surface.
  //
  // A correction to what this comment used to claim. It said the card-back patterns were
  // "about 2.9 KB of duplication that a shared selector list would recover", on the strength
  // of the deck rules and the swatch rules looking alike. Diffing all twenty pairs: six are
  // byte-identical and have now been merged into shared selectors. The other fourteen differ
  // on purpose — the swatch scales its pattern down (checker 14px -> 12px, confetti 17px ->
  // 15px, wave 14x8 -> 12x7 and so on) so the print still reads at 40x56 instead of turning
  // into mush. That is tuning, not debt, and merging them would have flattened it.
  //
  // 268 -> 272: the trick games that now keep a stock (Briscola, Sixty-Six) need it drawn —
  // the face-up trump lying half under the back of the pile, with a count, and a second
  // arrangement for phones and landscape where there is no room to the right of the trick.
  // Without it the rule is implemented and invisible, which is the same as not having it.
  //
  // 272 -> 278: the palette was rebuilt twice in one pass — once down to muted pigments and once
  // back up to casino colour — and what survives is a third set of felts, a fourth room light,
  // two gold edge tokens, and the gilt inlay the tables wear. Sitting 0.4 KB under a ceiling is
  // not a budget, it is a tripwire.
  { pattern: /^index-.*\.css$/, maxKB: 278, label: 'stylesheet' },
];

const files = readdirSync(DIST);
let failed = false;

for (const { pattern, maxKB, label } of BUDGETS) {
  const match = files.find((f) => pattern.test(f));
  if (!match) {
    console.log(`  SKIP   ${label} — no file matched ${pattern} (renamed or removed?)`);
    continue;
  }
  const kb = statSync(join(DIST, match)).size / 1024;
  const ok = kb <= maxKB;
  if (!ok) failed = true;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}   ${label.padEnd(32)} ${kb.toFixed(1)} KB / ${maxKB} KB budget  (${match})`);
}

if (failed) {
  console.log('\nA shipped chunk is over its budget — either trim it or, if the growth is a');
  console.log('deliberate tradeoff (a new feature, a new dependency), raise that one budget');
  console.log('in scripts/perfbudget.ts with a comment saying why.');
}
process.exit(failed ? 1 : 0);
