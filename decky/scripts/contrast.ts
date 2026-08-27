// Items 22/23 of the site-audit pass found two WCAG AA contrast failures — --dim measuring
// ~3.5:1 against --panel on Settings section headings, and .warn-text's hardcoded #c0392b
// measuring ~3.3:1 on dark — and fixed them by hand (--dim swapped for --muted; a new
// --red-text token added). Both fixes were verified once with a manual computation, then never
// checked again. This is the automated version of that same check: it reads the real theme
// tokens straight out of styles.css and re-derives the ratios on every run, so a later edit to
// a color token can't quietly reintroduce either failure without `npm test` catching it.
//
// This is not a sweep of every color pairing in the stylesheet — see items 37-39 (queued
// separately) for that larger, higher-risk exercise. It covers the pairs items 22/23 actually
// fixed, plus the two most fundamental reading pairs (body text on the page, and on a panel),
// since those are the cheapest, highest-value checks to have and any regression there would be
// the worst kind of accessibility bug: everyone hits it, on every screen.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(ROOT, 'src', 'ui', 'styles.css'), 'utf8');

/** Pull `--name: #hex;` pairs out of one `selector { ... }` block (first match, flat — no
 *  nested braces expected in a variable block). */
function tokensIn(selector: string): Record<string, string> {
  const start = CSS.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`theme block not found: ${selector}`);
  const bodyStart = CSS.indexOf('{', start) + 1;
  let depth = 1;
  let i = bodyStart;
  while (depth > 0 && i < CSS.length) {
    if (CSS[i] === '{') depth += 1;
    else if (CSS[i] === '}') depth -= 1;
    i += 1;
  }
  const block = CSS.slice(bodyStart, i - 1);
  const tokens: Record<string, string> = {};
  for (const m of block.matchAll(/--([a-zA-Z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    tokens[m[1]] = m[2];
  }
  return tokens;
}

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.slice(1);
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// WCAG 2.x relative luminance and contrast ratio — https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const chan = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [rl, gl, bl] = [chan(r), chan(g), chan(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastRatio(hexA: string, hexB: string): number {
  const la = relativeLuminance(hexToRgb(hexA));
  const lb = relativeLuminance(hexToRgb(hexB));
  const [lighter, darker] = la >= lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

interface CheckSpec { theme: 'dark' | 'light'; label: string; fg: string; bg: string; min: number }

const CHECKS: CheckSpec[] = [];
for (const theme of ['dark', 'light'] as const) {
  CHECKS.push(
    { theme, label: 'body text on the page background', fg: 'ink', bg: 'bg0', min: 4.5 },
    { theme, label: 'body text on a panel', fg: 'ink', bg: 'panel', min: 4.5 },
    { theme, label: 'muted text on a panel (item 22 — Settings section headings)', fg: 'muted', bg: 'panel', min: 4.5 },
    { theme, label: 'muted text on the page background', fg: 'muted', bg: 'bg0', min: 4.5 },
    { theme, label: 'warning text on a panel (item 23 — .warn-text)', fg: 'red-text', bg: 'panel', min: 4.5 },
  );
}

const darkTokens = tokensIn(':root');
const lightTokens = tokensIn(':root[data-theme="light"]');

let failed = false;
for (const { theme, label, fg, bg, min } of CHECKS) {
  const tokens = theme === 'dark' ? darkTokens : lightTokens;
  const fgHex = tokens[fg];
  const bgHex = tokens[bg];
  if (!fgHex || !bgHex) {
    failed = true;
    console.log(`  FAIL   [${theme}] ${label} — token missing (--${fg}: ${fgHex ?? 'undefined'}, --${bg}: ${bgHex ?? 'undefined'})`);
    continue;
  }
  const ratio = contrastRatio(fgHex, bgHex);
  const ok = ratio >= min;
  if (!ok) failed = true;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}   [${theme}] ${label.padEnd(58)} ${ratio.toFixed(2)}:1 (needs ${min}:1) — --${fg} ${fgHex} on --${bg} ${bgHex}`);
}

if (failed) {
  console.log('\nA text/background pairing above WCAG AA has regressed below it. If the token');
  console.log('change was deliberate, either pick a value that still clears the ratio or, for a');
  console.log('genuinely new use case, add its own token the way --red-text was added for item 23');
  console.log('rather than dimming a token something else already relies on.');
}
console.log(failed ? '\nCONTRAST: FAILED' : '\nCONTRAST: all checks passed');
process.exit(failed ? 1 : 0);
