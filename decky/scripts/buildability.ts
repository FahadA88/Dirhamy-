// Does "Create from scratch" actually reach every shipped game?
//
// Each classic in the catalog is a hand-authored GameDefinition; the guided builder produces one
// too, through a Knobs object. Nothing ever checked that the two paths could describe the same
// game — a family or a twist could ship on the shelf while being unbuildable in the editor, and
// the only way to find out was a user hitting the gap.
//
// The check: run every catalog game backward through knobsFromDefinition() (which infers a
// Knobs object from a GameDefinition), then forward again through buildDefinition(), and compare
// the family-specific config object (trick/swap/maid/layout/…) the round trip produced against
// the one the game shipped with. This is not asking for the whole GameDefinition to match byte
// for byte — zones, ids and deal mechanics are presentation, and the knob builder is free to
// express them differently. It IS asking that every RULE the family config carries — trump,
// bidding shape, jacksAreTrumps, meld patterns, swap ranks, whatever — survives the trip, because
// that's the actual claim "buildable from scratch" is making.

import { catalog } from '../src/games/catalog';
import { buildDefinition, knobsFromDefinition } from '../src/authoring/knobs';

const FAMILY_KEYS = [
  'trick', 'climb', 'fish', 'rummy', 'war', 'solitaire', 'bluff', 'reflex',
  'poker', 'pit', 'kent', 'set', 'maid', 'layout', 'swap',
] as const;

/**
 * Deep-equal that treats a missing key, an explicit `undefined`, and an explicit `false` as the
 * same "not this rule" state. Every boolean field in these config objects reads as off when
 * absent (`if (cfg.someTwist)`), and buildDefinition() writes plenty of literal `field: false`
 * or `field: undefined` where a hand-authored file simply never mentions the field at all — that
 * is a real equivalence, not a difference this check should report.
 */
function isOff(v: unknown): boolean {
  return v === undefined || v === false;
}
function sameShape(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (isOff(a) && isOff(b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((x, i) => sameShape(x, b[i]));
  }
  const ao = a as Record<string, unknown>;
  const bo = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ao), ...Object.keys(bo)]);
  for (const k of keys) {
    if (!sameShape(ao[k], bo[k])) return false;
  }
  return true;
}

/**
 * Real, understood limitations — not bugs, and not silently accepted either. Each one was found
 * by this exact check, investigated, and left as a deliberate scope boundary rather than fixed:
 *
 * - The ten solitaire games: buildSolitaireDefinition() writes several fields (foundationStart,
 *   reserve, wrap, wasteIsTarget, faceUpCount, a stockTurn of 1 where the shipped file leaves it
 *   at the schema's own implicit default) explicitly, where the hand-authored files simply never
 *   mention them and rely on the same default. Same behaviour, terser source — not a missing
 *   capability.
 * - Sixty-Six: an explicit `9: 0` penalty override is indistinguishable, on the way back through
 *   the knob builder, from "9 was never priced at all" — buildTrickDefinition() drops any
 *   penaltyCards entry priced at exactly 0 rather than writing a no-op override.
 * - Pinochle: its literal named melds ("a run in trumps", "a hundred aces"...) are a fixed list
 *   of exact card combinations, not a repeating pattern — meldMarriage only covers the one
 *   pattern shape every OTHER meld game here actually uses. A fully generic meld-combination
 *   editor is a bigger authoring surface than the other ~30 knobs in this family combined; an
 *   author who needs one still has the JSON override.
 * - Skat: its trump suit order (D-H-S-C, clubs strongest) is not the conventional C-D-H-S-NT
 *   ranking every other contract game here uses. `Strain[]` order is meaningful — see its own
 *   doc comment — so this needs a reorderable strain list, not a single knob; not built.
 * - Three Thirteen: `wildRotatesByHand` climbs the wild rank one step every hand of the match.
 *   The builder's rummy wild knob is a fixed rank for the whole sitting — a rank that moves on
 *   its own schedule is a different shape of knob, not built.
 * - Five Hundred: `numericAuction.kittyZone` — the auction winner picks up a widow and buries
 *   cards back down before play. The contract-auction knobs cover level, strain and scoring;
 *   picking a zone for a kitty that may or may not exist is a new knob, not built.
 *
 * A game added here should mean "found a new limitation, understood it, decided it's worth
 * shipping anyway" — never "the check got noisy so I stopped reading it."
 */
const KNOWN_GAPS: Record<string, string> = {
  Solitaire: 'default-value bookkeeping only, not a missing rule — see file header',
  FreeCell: 'default-value bookkeeping only, not a missing rule — see file header',
  Spider: 'default-value bookkeeping only, not a missing rule — see file header',
  'Spider (One Suit)': 'default-value bookkeeping only, not a missing rule — see file header',
  'Spider (Two Suits)': 'default-value bookkeeping only, not a missing rule — see file header',
  Scorpion: 'default-value bookkeeping only, not a missing rule — see file header',
  'Forty Thieves': 'default-value bookkeeping only, not a missing rule — see file header',
  'Tri Peaks': 'default-value bookkeeping only, not a missing rule — see file header',
  Yukon: 'default-value bookkeeping only, not a missing rule — see file header',
  Golf: 'default-value bookkeeping only, not a missing rule — see file header',
  Canfield: 'default-value bookkeeping only, not a missing rule — see file header',
  'Sixty-Six': 'an explicit zero-point penalty override cannot be told apart from "never priced"',
  Pinochle: 'literal named melds beyond the one marriage pattern — no generic meld editor',
  Skat: 'non-alphabetical trump suit order — no reorderable strain list',
  'Three Thirteen': 'a wild rank that climbs one step every hand — no such knob in the builder',
  'Five Hundred': 'the kitty — pick up and bury — has no knob in the builder yet',
};

let failed = false;
let checked = 0;
const newGaps: string[] = [];
const knownGaps: string[] = [];

for (const game of catalog) {
  const family = FAMILY_KEYS.find((f) => (game as unknown as Record<string, unknown>)[f] !== undefined);
  if (!family) continue; // shedding: no dedicated config object to compare
  checked++;

  const knobs = knobsFromDefinition(game);
  const rebuilt = buildDefinition(knobs, game.meta.id) as unknown as Record<string, unknown>;
  const original = (game as unknown as Record<string, unknown>)[family];
  const roundTripped = rebuilt[family];

  if (sameShape(original, roundTripped)) continue;

  const known = KNOWN_GAPS[game.meta.name];
  if (known) {
    knownGaps.push(game.meta.name);
    console.log(`  KNOWN  ${game.meta.name} (${family}) — ${known}`);
    continue;
  }
  failed = true;
  newGaps.push(game.meta.name);
  console.log(`  GAP    ${game.meta.name} (${family})`);
  console.log(`         shipped:   ${JSON.stringify(original)}`);
  console.log(`         rebuilt:   ${JSON.stringify(roundTripped)}`);
}

console.log(`\n${checked} games checked (the rest are 'shedding', which has no dedicated config object).`);
console.log(`${knownGaps.length} documented, accepted limitation(s) — see the KNOWN_GAPS comment in this file.`);
if (failed) {
  console.log(`${newGaps.length} NEW, undocumented gap(s): ${newGaps.join(', ')}.`);
  console.log('Either fix it, or if it\'s a genuine, understood scope boundary, add it to KNOWN_GAPS with a real reason.');
} else {
  console.log('No undocumented gaps — every classic\'s family rules round-trip through the guided builder, or their gap is a known, written-down one.');
}
console.log(failed ? '\nBUILDABILITY: FAILED' : '\nBUILDABILITY: all checks passed');
process.exit(failed ? 1 : 0);
