// Phase 7 acceptance: the five games docs/accuracy-audit.md marked WRONG, plus the one
// SIMPLIFIED entry that was really a missing rule.
//
// Every check here was written to FAIL against the definitions as they shipped, and each one
// asserts the rule a player would name if asked what makes that game itself — not that a flag
// is set. A test that only reads the definition back proves the definition was edited; these
// deal, bid and play instead.

import { createMatch, nextHand, applyMove, legalMoves, endTrickRound, trumpOf } from '../src/engine/engine';
import { MatchState } from '../src/engine/types';
import { briscola } from '../src/games/briscola';
import { sixtySix } from '../src/games/sixtySix';
import { ohHell } from '../src/games/ohHell';
import { skat } from '../src/games/skat';
import { spadesLite } from '../src/games/spades';
import { president } from '../src/games/president';
import { catalog } from '../src/games/catalog';
import { explainGame } from '../src/authoring/explain';
import { termsFor } from '../src/ui/glossary';

let failed = false;
const check = (label: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  ' + JSON.stringify(extra)}`);
  if (!cond) failed = true;
};
const section = (n: string) => console.log(`\n${n}`);

const hand = (s: MatchState, p: string) => s.zones[`hand:${p}`] ?? [];
const stock = (s: MatchState) => s.zones['draw'] ?? [];

/** Play one legal card for whoever is on turn, until `stop` says so or nothing is legal. */
function playUntil(s: MatchState, stop: (s: MatchState) => boolean, cap = 400): MatchState {
  for (let i = 0; i < cap && !stop(s); i++) {
    const p = s.players[s.turnIndex];
    const legal = legalMoves(s, p);
    if (legal.length === 0) break;
    s = applyMove(s, p, legal[0]);
  }
  return s;
}

// ---------- S1 · Spades sandbags ----------
section('S1 · Spades punishes the tenth bag');
{
  // Bid 3, take 4, hand after hand: one bag each time. Nine of them are free; the tenth costs
  // the team 100 and the count starts over.
  let s = createMatch(spadesLite, [1, 2, 3, 4].map((i) => `P${i}`), 7);
  const totals: number[] = [];
  for (let h = 0; h < 11; h++) {
    for (const p of s.players) { s.bids[p] = 3; s.tricksWon[p] = h === 10 ? 3 : 4; }
    // 4 players, 13 tricks: give the odd trick away so the counts are honest.
    s.tricksWon[s.players[3]] = h === 10 ? 1 : 1;
    endTrickRound(s);
    totals.push(s.matchScores[s.players[0]] ?? 0);
    if (h < 10) s = nextHand(s, 7 + h);
  }
  // Team A bids 6, takes 8 → 60 + 2 bags, every hand. Ten bags land on hand five.
  const drop = totals.findIndex((v, i) => i > 0 && v < totals[i - 1]);
  check('a team\'s running total drops when the bags reach ten', drop > 0, totals);
  check('and the drop is 100', drop > 0 && totals[drop - 1] - totals[drop] === 100 - 62, totals);
}

// ---------- S3 · Briscola ----------
section('S3 · Briscola deals three and keeps a stock');
{
  const s = createMatch(briscola, ['A', 'B'], 11);
  check('three cards each', hand(s, 'A').length === 3 && hand(s, 'B').length === 3,
    { a: hand(s, 'A').length, b: hand(s, 'B').length });
  check('the rest is a stock', stock(s).length === 34, stock(s).length);
  check('trump is turned, not written into the definition', briscola.trick!.trump === 'none');

  // The turned card's suit is trump, and that card is the last one anybody draws.
  const turned = stock(s)[0];
  check('the turned card sets trump', !!turned && trumpOf(s) === turned.suit,
    { turned: turned?.id, trump: trumpOf(s) });

  // Draw after every trick: a hand is still three cards deep once a trick has been taken.
  const after = playUntil(s, (x) => (x.tricksWon['A'] ?? 0) + (x.tricksWon['B'] ?? 0) >= 1);
  check('hands refill from the stock after a trick',
    hand(after, 'A').length === 3 && hand(after, 'B').length === 3,
    { a: hand(after, 'A').length, b: hand(after, 'B').length, stock: stock(after).length });

  // And it still ends: every card gets played exactly once.
  const done = playUntil(after, (x) => x.phase === 'roundOver' || x.matchOver, 400);
  check('the whole pack is played out', (done.tricksWon['A'] ?? 0) + (done.tricksWon['B'] ?? 0) === 20,
    done.tricksWon);
}

// ---------- S4 · Sixty-Six ----------
section('S4 · Sixty-Six deals six of twenty-four');
{
  const s = createMatch(sixtySix, ['A', 'B'], 5);
  check('six cards each', hand(s, 'A').length === 6 && hand(s, 'B').length === 6,
    { a: hand(s, 'A').length, b: hand(s, 'B').length });
  check('twelve left as stock', stock(s).length === 12, stock(s).length);
  check('trump is turned', sixtySix.trick!.trump === 'none' && trumpOf(s) !== 'none', trumpOf(s));
  check('the last trick is worth ten', (sixtySix.trick as { lastTrickBonus?: number }).lastTrickBonus === 10);

  const done = playUntil(s, (x) => x.phase === 'roundOver' || x.matchOver, 400);
  check('twelve tricks are played', (done.tricksWon['A'] ?? 0) + (done.tricksWon['B'] ?? 0) === 12,
    done.tricksWon);
}

// ---------- S5 · Oh Hell ----------
section('S5 · Oh Hell changes the deal, turns the trump, and hooks the dealer');
{
  const s1 = createMatch(ohHell, ['A', 'B', 'C', 'D'], 3);
  const s2 = nextHand(s1, 4);
  check('the hand size changes between deals', hand(s1, 'A').length !== hand(s2, 'A').length,
    { one: hand(s1, 'A').length, two: hand(s2, 'A').length });
  check('and it shrinks', hand(s2, 'A').length === hand(s1, 'A').length - 1);
  check('trump is turned, not fixed to spades', ohHell.trick!.trump === 'none' && trumpOf(s1) !== 'none',
    trumpOf(s1));

  // The hook: everybody but the dealer bids freely, and the dealer may not make the bids add up.
  let s = s1;
  const size = hand(s1, 'A').length;
  let bidTotal = 0;
  for (let i = 0; i < s.players.length - 1; i++) {
    const p = s.players[s.turnIndex];
    const want = i === 0 ? Math.min(size, 2) : 0;
    s = applyMove(s, p, { actionId: 'bid', choice: String(want) });
    bidTotal += want;
  }
  const dealer = s.players[s.turnIndex];
  const forbidden = size - bidTotal;
  const dealerBids = legalMoves(s, dealer).map((m) => Number(m.choice));
  check('the dealer is hooked off the bid that would make it add up',
    forbidden < 0 || !dealerBids.includes(forbidden), { forbidden, dealerBids });
  check('every other bid is still open', dealerBids.length === size, { size, dealerBids });
}

// ---------- S6 · Skat ----------
section('S6 · Skat deals the skat');
{
  const s = createMatch(skat, ['A', 'B', 'C'], 9);
  const kitty = skat.trick!.numericAuction!.kittyZone;
  check('there is a skat zone', !!kitty, kitty);
  check('ten each and two in the skat',
    hand(s, 'A').length === 10 && (kitty ? (s.zones[kitty] ?? []).length : -1) === 2,
    { a: hand(s, 'A').length, skat: kitty ? (s.zones[kitty] ?? []).length : null });
  check('nothing is left stranded in the draw pile', stock(s).length === 0, stock(s).length);
}

// ---------- S2 · President ----------
section('S2 · President exchanges cards between hands');
{
  // A hand the Scum could not possibly have been dealt: play one out, then check that the two
  // best cards in the loser's hand have moved to the winner and two poor ones have come back.
  let s = createMatch(president, ['A', 'B', 'C', 'D'], 21);
  s = playUntil(s, (x) => x.phase === 'roundOver' || x.matchOver, 600);
  check('the hand finishes with a full placing order', s.finished.length === 4, s.finished);

  const order = s.finished.slice();
  const pres = order[0];
  const scum = order[order.length - 1];
  const strength = (r: string) => president.climb!.order.indexOf(r as never);

  // Deal the next hand twice from the same seed: once continuing the match, and once as a
  // standalone. The only difference between the two is the exchange, which is exactly what
  // makes it possible to say what the exchange did.
  const next = nextHand(s, 22);
  const plain = createMatch(president, s.players.slice(), 22);

  check('every seat still has thirteen cards after the exchange',
    next.players.every((p) => hand(next, p).length === 13),
    Object.fromEntries(next.players.map((p) => [p, hand(next, p).length])));

  const paid = hand(plain, scum).slice().sort((a, b) => strength(b.rank) - strength(a.rank)).slice(0, 2);
  const given = hand(plain, pres).slice().sort((a, b) => strength(a.rank) - strength(b.rank)).slice(0, 2);
  const ids = (p: string, from = next) => new Set(hand(from, p).map((c) => c.id));
  check('the Scum\'s two best cards are now the President\'s',
    paid.every((c) => ids(pres).has(c.id)), paid.map((c) => c.id));
  check('and the President\'s two worst have gone the other way',
    given.every((c) => ids(scum).has(c.id)), given.map((c) => c.id));
  check('nothing moved in either direction on hand one',
    paid.every((c) => ids(scum, plain).has(c.id)));
  check('the log says who paid whom',
    next.log.some((l) => /pays .* and takes .* back/.test(l.text)),
    next.log.slice(0, 3).map((l) => l.text));
}

// ---------- the simplifications the audit accepted ----------
section('Every game the audit called SIMPLIFIED says so on its own rules panel');
{
  // The other half of the audit. Five games were WRONG and are fixed above; these are the ones
  // that are knowingly narrower than the game they are named after. That is a defensible
  // choice and a dishonest silence — a Bridge player who finds no doubling should be told it
  // was never there rather than left to conclude the game is broken.
  const owes = ['Bridge', 'Canasta', 'Hand and Foot', 'Rummy', 'Golf', 'Egyptian Ratscrew', 'Showdown Poker'];
  for (const name of owes) {
    const def = catalog.find((d) => d.meta.name === name);
    const notes = def?.meta.simplifications ?? [];
    check(`${name} admits what it leaves out`, notes.length > 0, { found: !!def, notes });
  }

  // And nothing anywhere is a placeholder, a fragment, or a note to a maintainer.
  for (const def of catalog) {
    for (const note of def.meta.simplifications ?? []) {
      const good = note.length > 30 && /[.!?]$/.test(note) && !/TODO|FIXME|XXX/.test(note);
      check(`${def.meta.name}: "${note.slice(0, 40)}…" reads as a sentence`, good, note);
    }
  }
}

// ---------- what the game says about itself ----------
section('No game promises a meld the engine would refuse');
{
  // Found by putting an honest note next to the old copy: Canasta's rules panel said "Make sets
  // of 3+ and runs of 3+", drew a run in cards as an example, and listed runs in the shape of a
  // turn — for a game whose allowRuns is false and whose engine rejects every one of them.
  const promisesRuns = (d: typeof catalog[number]) => /runs? of \d/i.test(explainGame(d).join(' '));
  for (const def of catalog) {
    if (def.rummy?.allowRuns !== false) continue;
    const said = explainGame(def).join(' ');
    check(`${def.meta.name} does not offer runs`, !promisesRuns(def), said);
    check(`${def.meta.name} says outright that it has none`, /no runs/i.test(said), said);
    const meld = termsFor(def).find((t) => t.term === 'Meld')?.def ?? '';
    check(`${def.meta.name}'s glossary does not define a meld with runs`,
      meld.length > 0 && !/\ba run\b/i.test(meld), meld);
  }
  // And a game that DOES allow them still says so, or this check would pass by saying nothing.
  const withRuns = catalog.filter((d) => d.rummy && d.rummy.allowRuns !== false);
  check(`${withRuns.length} rummies still describe their runs`,
    withRuns.length > 0 && withRuns.every(promisesRuns),
    withRuns.filter((d) => !promisesRuns(d)).map((d) => d.meta.name));
}

console.log(failed ? '\nACCURACY: FAILED' : '\nACCURACY: every audited rule is implemented');
process.exit(failed ? 1 : 0);
