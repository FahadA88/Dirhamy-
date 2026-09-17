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

/** Pull `--name: #hex;` or `--name: rgba(...);` pairs out of one `selector { ... }` block
 *  (first match, flat — no nested braces expected in a variable block). The glass system's
 *  panels are translucent rgba fills, not opaque hex, so both forms have to parse or every
 *  check that reads --panel silently goes missing. */
function tokensIn(selector: string): Record<string, string> {
  // This stylesheet has five :root blocks and two light-theme blocks, and a later one shadows
  // an earlier one — which is how --serif ended up defined twice with the first definition's
  // comment describing the opposite of what shipped. Reading only the first block meant the
  // checker could not see --brass, --gold or anything else declared further down, so whole
  // families of colour were invisible to it. All matching blocks are merged in cascade order.
  const needle = `${selector} {`;
  const tokens: Record<string, string> = {};
  let found = 0;
  for (let at = CSS.indexOf(needle); at >= 0; at = CSS.indexOf(needle, at + 1)) {
    // Only a rule that starts a line — otherwise `:root` matches inside `:root[data-theme=...]`.
    const lineStart = CSS.lastIndexOf('\n', at) + 1;
    if (CSS.slice(lineStart, at).trim() !== '') continue;
    found += 1;
    const bodyStart = CSS.indexOf('{', at) + 1;
    let depth = 1;
    let i = bodyStart;
    while (depth > 0 && i < CSS.length) {
      if (CSS[i] === '{') depth += 1;
      else if (CSS[i] === '}') depth -= 1;
      i += 1;
    }
    const block = CSS.slice(bodyStart, i - 1);
    for (const m of block.matchAll(/--([a-zA-Z0-9-]+):\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|var\(--[a-zA-Z0-9-]+\)|color-mix\([^;]+\))\s*;/g)) {
      tokens[m[1]] = m[2];
    }
  }
  if (!found) throw new Error(`theme block not found: ${selector}`);
  return tokens;
}

/** [r, g, b, a] — a a plain hex is treated as fully opaque. */
function parseColor(value: string): [number, number, number, number] {
  if (value.startsWith('#')) {
    let h = value.slice(1);
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const parts = value.replace(/rgba?\(|\)/g, '').split(',').map((s) => parseFloat(s.trim()));
  const [r, g, b, a = 1] = parts;
  return [r, g, b, a];
}

/** Resolve `color-mix(in srgb, <a> <p>%, <b>)` the way a browser does, so a token written that
 *  way can be checked rather than skipped. Only the srgb, two-colour, one-percentage form is
 *  handled, because that is the only form this stylesheet uses — anything else throws rather
 *  than guessing, since a check that silently passes on a colour it could not read is worse
 *  than no check. */
function resolveMix(value: string, tokens: Record<string, string>): string {
  const m = value.match(/^color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*(.+?)\s*\)$/);
  if (!m) throw new Error(`cannot resolve: ${value}`);
  const p = parseFloat(m[2]) / 100;
  const side = (v: string): [number, number, number, number] => {
    const t = v.trim();
    if (t === 'transparent') return [0, 0, 0, 0];
    const varMatch = t.match(/^var\(\s*--([a-zA-Z0-9-]+)\s*\)$/);
    if (varMatch) return parseColor(deref(varMatch[1], tokens));
    return parseColor(t);
  };
  const a = side(m[1]);
  const b = side(m[3]);
  const out = [0, 1, 2].map((i) => a[i] * p + b[i] * (1 - p));
  const alpha = a[3] * p + b[3] * (1 - p);
  return `rgba(${out.map((x) => Math.round(x)).join(', ')}, ${alpha})`;
}

/** Follow `var(--x)` chains and colour-mixes down to something parseColor understands. */
function deref(name: string, tokens: Record<string, string>, depth = 0): string {
  if (depth > 8) throw new Error(`--${name} does not resolve to a colour`);
  const v = (tokens[name] ?? '').trim();
  if (!v) throw new Error(`token missing: --${name}`);
  const varMatch = v.match(/^var\(\s*--([a-zA-Z0-9-]+)\s*\)$/);
  if (varMatch) return deref(varMatch[1], tokens, depth + 1);
  if (v.startsWith('color-mix(')) return resolveMix(v, tokens);
  return v;
}

/** A translucent panel's real, rendered colour depends on what sits behind it — the glass
 *  system is built on exactly that fact. `under` is the honest stand-in for "whatever is most
 *  commonly behind this panel": the page background, since that's what a panel floats over in
 *  the ordinary case this check exists to catch a regression in. */
function compositeOver(fg: [number, number, number, number], under: [number, number, number, number]): [number, number, number] {
  const a = fg[3];
  return [0, 1, 2].map((i) => fg[i] * a + under[i] * (1 - a)) as [number, number, number];
}

function hexToRgb(hex: string): [number, number, number] {
  const [r, g, b] = parseColor(hex);
  return [r, g, b];
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

/** The site's name and the win banner are painted with a gradient clipped to the letterforms,
 *  so a token check never saw them: three separate rules had accumulated over the same three
 *  words, and between them one stop sat at 1.07:1 on dark and another at about 1.9:1 on light.
 *  A wordmark with a band of invisible letters in the middle is the thing that reads as broken
 *  from across the room, so every stop of the foil is checked here. 3:1 rather than 4.5:1 is
 *  WCAG's own threshold for text this size — the wordmark is 30px at weight 600. */
function foilStops(selectorNeedle: string): string[] {
  const at = CSS.indexOf(selectorNeedle);
  if (at < 0) throw new Error(`foil rule not found: ${selectorNeedle}`);
  const open = CSS.indexOf('background: linear-gradient(', at);
  if (open < 0) throw new Error(`foil gradient not found after ${selectorNeedle}`);
  let depth = 0, i = CSS.indexOf('(', open);
  const start = i;
  do { if (CSS[i] === '(') depth += 1; else if (CSS[i] === ')') depth -= 1; i += 1; } while (depth > 0);
  const inner = CSS.slice(start + 1, i - 1);
  // Split on commas that are not inside nested parens, drop the angle, drop the positions.
  const parts: string[] = [];
  let buf = '', d = 0;
  for (const ch of inner) {
    if (ch === '(') d += 1;
    if (ch === ')') d -= 1;
    if (ch === ',' && d === 0) { parts.push(buf); buf = ''; continue; }
    buf += ch;
  }
  parts.push(buf);
  return parts.slice(1).map((x) => x.trim().replace(/\s+[\d.]+%$/, ''));
}

const darkTokens = tokensIn(':root');
const lightTokens = tokensIn(':root[data-theme="light"]');

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`;
}

let failed = false;

for (const theme of ['dark', 'light'] as const) {
  const tokens = theme === 'dark' ? darkTokens : lightTokens;
  const needle = theme === 'dark'
    ? '.foil,\nheader h1, header .wordmark,'
    : ':root[data-theme="light"] .foil,';
  const bg0 = toHex([parseColor(tokens.bg0)[0], parseColor(tokens.bg0)[1], parseColor(tokens.bg0)[2]]);
  foilStops(needle).forEach((stop, n) => {
    let hex: string;
    try {
      const varMatch = stop.match(/^var\(\s*--([a-zA-Z0-9-]+)\s*\)$/);
      const raw = varMatch ? deref(varMatch[1], tokens)
        : stop.startsWith('color-mix(') ? resolveMix(stop, tokens)
        : stop;
      const c = parseColor(raw);
      hex = toHex([c[0], c[1], c[2]]);
    } catch (e) {
      failed = true;
      console.log(`  FAIL   [${theme}] wordmark foil stop ${n + 1} — unreadable (${stop}): ${(e as Error).message}`);
      return;
    }
    const ratio = contrastRatio(hex, bg0);
    const ok = ratio >= 3;
    if (!ok) failed = true;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}   [${theme}] ${`wordmark foil stop ${n + 1} of 5`.padEnd(58)} ${ratio.toFixed(2)}:1 (needs 3:1) — ${hex} on --bg0 ${bg0}`);
  });
}

for (const { theme, label, fg, bg, min } of CHECKS) {
  const tokens = theme === 'dark' ? darkTokens : lightTokens;
  const fgVal = tokens[fg];
  const bgVal = tokens[bg];
  if (!fgVal || !bgVal) {
    failed = true;
    console.log(`  FAIL   [${theme}] ${label} — token missing (--${fg}: ${fgVal ?? 'undefined'}, --${bg}: ${bgVal ?? 'undefined'})`);
    continue;
  }
  // A translucent panel (the glass system's --panel) has no colour of its own to check —
  // composite it over the page background first, the same colour a browser would actually
  // paint, rather than let a #rrggbbaa-less parse of an rgba() silently pass or fail on noise.
  const bgParsed = parseColor(bgVal);
  const bg0 = parseColor(tokens.bg0);
  const bgHex = toHex(compositeOver(bgParsed, bg0));
  const fgParsed = parseColor(fgVal);
  const fgHex = toHex([fgParsed[0], fgParsed[1], fgParsed[2]]);
  const ratio = contrastRatio(fgHex, bgHex);
  const ok = ratio >= min;
  if (!ok) failed = true;
  const bgNote = bgParsed[3] < 1 ? `${bgVal} composited over --bg0 = ${bgHex}` : bgHex;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}   [${theme}] ${label.padEnd(58)} ${ratio.toFixed(2)}:1 (needs ${min}:1) — --${fg} ${fgHex} on --${bg} ${bgNote}`);
}

if (failed) {
  console.log('\nA text/background pairing above WCAG AA has regressed below it. If the token');
  console.log('change was deliberate, either pick a value that still clears the ratio or, for a');
  console.log('genuinely new use case, add its own token the way --red-text was added for item 23');
  console.log('rather than dimming a token something else already relies on.');
}
console.log(failed ? '\nCONTRAST: FAILED' : '\nCONTRAST: all checks passed');
process.exit(failed ? 1 : 0);
