import { GameDefinition } from '../engine/types';
import { applyMove, createMatch, isTerminal } from '../engine/engine';
import { chooseSolitaireMove, positionKey } from '../bots/solitaireBot';

// Puzzles from stacked positions (item 41). The test suite already builds a stacked position to
// prove one exact rule; a puzzle is the same idea pointed at a player instead of an assertion —
// a real deal, known ahead of time to have a solution, rather than the ordinary gamble of "maybe
// this shuffle is winnable, maybe it isn't."
//
// Found the same way selftest.ts already measures every patience game's greedy solve rate: deal
// a seed, let the same no-lookahead greedy player (see solitaireBot.ts) play it to the end, and
// keep the shortest seed that actually won. "Short" has no one absolute number across a family
// that spans Golf (a handful of moves) and Klondike (the whole deck has to walk to the
// foundations, a hundred-plus moves even on an easy deal) — so this samples a batch of deals and
// keeps whichever greedy win took the fewest moves, rather than filtering by a fixed ceiling.
//
// Not offered for every patience game. FreeCell, Spider, Spider (Two Suits) and Forty Thieves
// are all real, winnable games — but winning them takes real look-ahead, and this player has
// none. Measured directly (a batch of deals, same player, same harness as selftest.ts's own
// solve-rate report): it wins zero of them. Searching anyway would mean a long wait on click,
// followed by quietly serving an ordinary deal wearing a "puzzle" badge it did not earn — so
// those games skip the search and this list is how the UI knows to leave the entry point off.
// Scorpion isn't on this list: item 14's fix to solitaireBot.ts's handling of its one-shot deal
// took its solve rate from 3/120 to 36/120 — a real rate, not a guaranteed one, but enough that
// the batch-and-keep-the-best search below reliably turns one up.
const NO_QUICK_SOLVE = new Set([
  'classic-freecell',
  'classic-spider',
  'classic-spider-2',
  'classic-forty-thieves',
]);

export function canFindPuzzle(def: GameDefinition): boolean {
  return !NO_QUICK_SOLVE.has(def.meta.id);
}

export interface Puzzle {
  seed: number;
  moves: number;
}

const SEARCH_CAP = 300;   // every solve found so far tops out around 130 moves — plenty of headroom, still fast

export function findPuzzle(def: GameDefinition, tries = 80): Puzzle | null {
  if (!canFindPuzzle(def)) return null;
  let best: Puzzle | null = null;
  // A range of its own — distinct from the daily deal's date-derived seeds and from an ordinary
  // random deal's — so a puzzle never coincides with either by accident. Randomized per call, not
  // a fixed scan from the same start every time, so clicking for another puzzle actually looks at
  // a different batch of deals instead of always landing on the same one.
  const start = 8_000_000 + Math.floor(Math.random() * 1_000_000);
  for (let i = 0; i < tries; i++) {
    const seed = start + i * 104_729;
    let s = createMatch(def, ['P1'], seed);
    const seen = new Set([positionKey(s)]);
    let steps = 0;
    while (!isTerminal(s) && steps < SEARCH_CAP) {
      const m = chooseSolitaireMove(s, seen, (st, mv) => applyMove(st, 'P1', mv));
      if (!m) break;
      s = applyMove(s, 'P1', m);
      seen.add(positionKey(s));
      steps++;
    }
    if (s.winner && (!best || steps < best.moves)) {
      best = { seed, moves: steps };
    }
  }
  return best;
}
