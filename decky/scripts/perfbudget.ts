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
  { pattern: /^index-.*\.css$/, maxKB: 260, label: 'stylesheet' },
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
