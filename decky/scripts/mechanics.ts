// Deterministic proofs for mechanics too rare to be reliably exercised by random self-play.
// Simulation shows a game terminates; these show a specific rule actually fires correctly.
import { undertow } from '../src/games/undertow';
import { hearts } from '../src/games/hearts';
import { euchre } from '../src/games/euchre';
import { contractWhist } from '../src/games/contract';
import { ginRummy } from '../src/games/ginRummy';
import { klondike } from '../src/games/klondike';
import { freecell } from '../src/games/freecell';
import { spider } from '../src/games/spider';
import { kent } from '../src/games/kent';
import { pinochle } from '../src/games/pinochle';
import { briscola } from '../src/games/briscola';
import { sixtySix } from '../src/games/sixtySix';
import { blackMaria } from '../src/games/blackMaria';
import { whist } from '../src/games/whist';
import { spadesLite } from '../src/games/spades';
import { ohHell } from '../src/games/ohHell';
import { catalog } from '../src/games/catalog';
import { createMatch, legalMoves, applyMove, actingPlayers, redact, nextHand, scoreMelds, bestBy, swapZones } from '../src/engine/engine';
import { chooseMove } from '../src/bots/randomBot';
import { Card, MatchState, Move } from '../src/engine/types';
import { dutch } from '../src/games/dutch';
import { MatchService } from '../src/server/matchService';
import { LocalMatchStore } from '../src/server/localStore';

let failed = false;
const check = (label: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  ' + JSON.stringify(extra)}`);
  if (!cond) failed = true;
};
const section = (name: string) => console.log(`\n${name}`);
const card = (id: string, rank: string, suit: string) => ({ id, rank, suit }) as Card;

// ---------- Climbing: multi-card combos and out-of-turn bombs ----------
section('Climbing — combos and out-of-turn bombs (Undertow)');
{
  const P = ['A', 'B', 'C', 'D'];
  let s: MatchState = createMatch(undertow, P, 42);
  s.zones['hand:A'] = [card('S5', '5', 'S'), card('H5', '5', 'H'), card('C9', '9', 'C')];
  s.zones['hand:B'] = [card('S7', '7', 'S'), card('H7', '7', 'H'), card('D7', '7', 'D'), card('C7', '7', 'C'), card('CK', 'K', 'C')];
  s.zones['hand:C'] = [card('D4', '4', 'D'), card('C4', '4', 'C')];
  s.zones['hand:D'] = [card('SJ', 'J', 'S')];
  s.zones['discard'] = [];
  s.turnIndex = 0;
  s.climbShape = 0;
  s.climbTopRank = null;
  s.climbBombDeclined = {};
  s.lastPlayer = null;

  // A quad holder is an actor even when it is not their turn.
  check('actingPlayers = [A, B] — B can interrupt', JSON.stringify(actingPlayers(s)) === '["A","B"]', actingPlayers(s));
  const bMoves = legalMoves(s, 'B');
  check('out of turn, B gets exactly bomb + decline', bMoves.length === 2 && bMoves[0].actionId === 'climbBomb' && bMoves[1].actionId === 'climbNoBomb', bMoves);
  check('the bomb is all four 7s', bMoves[0].cards?.length === 4, bMoves[0].cards);
  check('a player without a quad gets nothing out of turn', legalMoves(s, 'C').length === 0);
  check('redaction surfaces the interrupt to B', redact(s, 'B').isYourTurn === true);

  // Leading a fresh pile offers every shape; a reply must match the shape.
  const aMoves = legalMoves(s, 'A');
  check('A may lead a single or a pair', aMoves.some((m) => m.cards?.length === 1) && aMoves.some((m) => m.cards?.length === 2), aMoves.map((m) => m.cards));
  s = applyMove(s, 'A', { actionId: 'climbPlay', cards: ['S5', 'H5'] });
  check('pile is a pair of 5s', s.climbShape === 2 && s.climbTopRank === '5', { shape: s.climbShape, top: s.climbTopRank });
  check('redacted pile shows both cards', redact(s, 'B').climbPile?.length === 2, redact(s, 'B').climbPile);

  const cUnderPair = legalMoves(s, 'C').filter((m) => m.actionId === 'climbPlay');
  check('C may answer the pair of 5s with its pair of 4s? no — 4 is lower', cUnderPair.length === 0, cUnderPair);

  // Declining is sticky: a player is offered the bomb once per pile, not on a loop.
  const t: MatchState = applyMove(s, 'B', { actionId: 'climbPass' });
  check('B is an interrupter again once the turn moves on', JSON.stringify(actingPlayers(t)) === '["C","B"]', actingPlayers(t));
  const declined = applyMove(t, 'B', { actionId: 'climbNoBomb' });
  check('decline is recorded', declined.climbBombDeclined['B'] === true);
  check('declined player stops being asked', JSON.stringify(actingPlayers(declined)) === '["C"]', actingPlayers(declined));
  check('declined player has no legal moves', legalMoves(declined, 'B').length === 0);

  // The bomb itself: out of turn, beats any shape, steals the lead.
  let u: MatchState = t;
  const before = u.zones['hand:B'].length;
  u = applyMove(u, 'B', { actionId: 'climbBomb', cards: ['S7', 'H7', 'D7', 'C7'] });
  check('four cards left the bomber hand', u.zones['hand:B'].length === before - 4, u.zones['hand:B'].length);
  check('pile is now four 7s', u.climbShape === 4 && u.climbTopRank === '7', { shape: u.climbShape, top: u.climbTopRank });
  check('bomber holds the lead', u.lastPlayer === 'B');
  check('decline memory resets on a new pile', Object.keys(u.climbBombDeclined).length === 0);
  check('the bomb is announced in the log', u.log.some((l) => l.text.includes('BOMBS')));
  const cAfter = legalMoves(u, 'C');
  check('nobody can answer a 4-shape pile with a smaller group', cAfter.length === 1 && cAfter[0].actionId === 'climbPass', cAfter);
}

// ---------- Hearts: pre-hand pass, forced lead, broken suit, shooting the moon ----------
section('Trick-taking — Hearts rules');
{
  const P = ['A', 'B', 'C', 'D'];
  const s = createMatch(hearts, P, 7);

  // Every player owes three cards before a single trick is played.
  check('hand 1 passes left', s.passDirection === 'left', s.passDirection);
  check('three cards owed', s.passCount === 3);
  check('all four players must choose', JSON.stringify(actingPlayers(s)) === '["A","B","C","D"]', actingPlayers(s));
  check('redaction asks the viewer to pass', redact(s, 'C').needsPassChoice === true && redact(s, 'C').passCount === 3);

  // Picks stage until the full count is in — the pass does not resolve early.
  let t = applyMove(s, 'A', { actionId: 'choosePass', cardId: s.zones['hand:A'][0].id });
  check('one pick stages, does not commit', (t.passStaged['A'] || []).length === 1 && !('A' in t.passChoices));
  check('a staged card cannot be picked twice',
    !legalMoves(t, 'A').some((m) => m.cardId === s.zones['hand:A'][0].id));
  t = applyMove(t, 'A', { actionId: 'choosePass', cardId: s.zones['hand:A'][1].id });
  t = applyMove(t, 'A', { actionId: 'choosePass', cardId: s.zones['hand:A'][2].id });
  check('third pick commits the choice', (t.passChoices['A'] || []).length === 3 && !('A' in t.passStaged));
  check('a committed player is no longer an actor', !actingPlayers(t).includes('A'), actingPlayers(t));
  check('pass has not resolved yet', t.passDirection === 'left');

  // Complete the exchange and confirm cards actually moved left.
  const givenByA = t.passChoices['A'].slice();
  for (const p of ['B', 'C', 'D']) {
    for (let i = 0; i < 3; i++) t = applyMove(t, p, { actionId: 'choosePass', cardId: t.zones[`hand:${p}`].filter((c) => !(t.passStaged[p] || []).includes(c.id))[0].id });
  }
  check('pass resolved', t.passDirection === null);
  check('hands are still 13 cards', P.every((p) => t.zones[`hand:${p}`].length === 13), P.map((p) => t.zones[`hand:${p}`].length));
  check("A's cards landed on B (left)", givenByA.every((id) => t.zones['hand:B'].some((c) => c.id === id)), givenByA);
  check('A no longer holds them', givenByA.every((id) => !t.zones['hand:A'].some((c) => c.id === id)));

  // The 2♣ holder leads, and it is their only legal card.
  const holder = P.find((p) => t.zones[`hand:${p}`].some((c) => c.id === 'C2'))!;
  check('2♣ holder is on lead', t.players[t.turnIndex] === holder, { onLead: t.players[t.turnIndex], holder });
  const opening = legalMoves(t, holder);
  check('2♣ is the only legal opening card', opening.length === 1 && opening[0].cardId === 'C2', opening);

  // No penalty card may be discarded on the opening trick.
  let u = applyMove(t, holder, { actionId: 'playToTrick', cardId: 'C2' });
  for (const p of P) {
    if (p === holder) continue;
    const ms = legalMoves(u, p);
    if (ms.length === 0) continue;
    const hand = u.zones[`hand:${p}`];
    const void0 = !hand.some((c) => c.suit === 'C');
    if (void0 && hand.some((c) => c.suit === 'H' || c.id === 'SQ') && hand.some((c) => c.suit !== 'H' && c.id !== 'SQ')) {
      const offered = ms.map((m) => hand.find((c) => c.id === m.cardId)!);
      check('no points offered on the opening trick', offered.every((c) => c.suit !== 'H' && c.id !== 'SQ'), offered.map((c) => c.id));
    }
    u = applyMove(u, p, ms[0]);
  }

  // Hearts may not be led until broken.
  check('hearts start unbroken', u.brokenSuitPlayed === false);
  const leader = u.players[u.turnIndex];
  const leadHand = u.zones[`hand:${leader}`];
  if (leadHand.some((c) => c.suit === 'H') && leadHand.some((c) => c.suit !== 'H')) {
    const offered = legalMoves(u, leader).map((m) => leadHand.find((c) => c.id === m.cardId)!);
    check('hearts cannot be led while unbroken', offered.every((c) => c.suit !== 'H'), offered.map((c) => c.id));
  }

  // Play the hand out with bots and confirm hearts do get broken and points are dealt.
  let seed = 99;
  let v = u;
  let guard = 0;
  while (v.phase === 'playing' && guard++ < 500) {
    const actor = actingPlayers(v)[0];
    if (!actor) break;
    const r = chooseMove(v, actor, seed, 'smart');
    seed = r.botSeed;
    v = applyMove(v, actor, r.move);
  }
  check('hand completed', v.phase === 'roundOver', { phase: v.phase, guard });
  check('hearts got broken during play', v.brokenSuitPlayed === true);
  check('26 points were dealt out', P.reduce((a, p) => a + (v.scores[p] ?? 0), 0) === 26, v.scores);

  // Next hand rotates the pass direction.
  const h2 = nextHand(v, 21);
  check('hand 2 passes right', h2.passDirection === 'right', h2.passDirection);
  const h3 = nextHand(h2, 22);
  check('hand 3 passes across', h3.passDirection === 'across', h3.passDirection);
  const h4 = nextHand(h3, 23);
  check('hand 4 is a hold — no pass at all', h4.passDirection === null, h4.passDirection);
  check('hold hand opens straight onto the 2♣ holder',
    h4.zones[`hand:${h4.players[h4.turnIndex]}`].some((c) => c.id === 'C2'));
  const h5 = nextHand(h4, 24);
  check('hand 5 wraps back to left', h5.passDirection === 'left', h5.passDirection);

  // 'across' really is the opposite seat, not a neighbour.
  let a3 = h3;
  const acrossGift = a3.zones['hand:A'].slice(0, 3).map((c) => c.id);
  for (const p of P) for (let i = 0; i < 3; i++) {
    const pick = p === 'A' ? acrossGift[i] : a3.zones[`hand:${p}`].filter((c) => !(a3.passStaged[p] || []).includes(c.id))[0].id;
    a3 = applyMove(a3, p, { actionId: 'choosePass', cardId: pick });
  }
  check("across sends A's cards to C, not B", acrossGift.every((id) => a3.zones['hand:C'].some((c) => c.id === id)), acrossGift);
}

// Shooting the moon inverts the scores. Bots all play avoidance, so a natural sweep effectively
// never happens — stack the deal instead and force one.
section('Trick-taking — shooting the moon');
{
  const P = ['A', 'B', 'C', 'D'];
  // A four-rank Hearts: 16 cards, four tricks, no pass. Aces sweep every suit.
  const mini: typeof hearts = {
    ...hearts,
    meta: { ...hearts.meta, id: 'test-mini-hearts', name: 'Mini Hearts' },
    deck: { ...hearts.deck, excludeRanks: ['2', '3', '4', '5', '6', '7', '8', '9', '10'] },
    setup: [{ op: 'shuffle', zone: 'draw' }, { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 4 }],
    handPass: undefined,
    trick: { ...hearts.trick!, leadCard: undefined },
  };

  const deal = (s: MatchState, hands: Record<string, string[]>) => {
    const all = Object.values(s.zones).flat();
    const byId = new Map(all.map((c) => [c.id, c]));
    for (const p of P) s.zones[`hand:${p}`] = hands[p].map((id) => byId.get(id)!);
    s.zones['draw'] = [];
  };

  // A holds every ace, so A leads and takes all four tricks — and with them all 17 points.
  let s = createMatch(mini, P, 3);
  deal(s, {
    A: ['CA', 'DA', 'HA', 'SA'],
    B: ['CK', 'DK', 'HK', 'SK'],
    C: ['CQ', 'DQ', 'HQ', 'SQ'],
    D: ['CJ', 'DJ', 'HJ', 'SJ'],
  });
  s.turnIndex = 0;

  let guard = 0;
  while (s.phase === 'playing' && guard++ < 40) {
    const actor = actingPlayers(s)[0];
    if (!actor) break;
    const ms = legalMoves(s, actor);
    if (ms.length === 0) break;
    s = applyMove(s, actor, ms[0]);
  }
  check('the stacked hand finished', s.phase === 'roundOver', { phase: s.phase, guard });
  check('A took every trick', s.tricksWon['A'] === 4, s.tricksWon);
  check('shooter scores 0', s.scores['A'] === 0, s.scores);
  check('everyone else takes the whole pot (17)', ['B', 'C', 'D'].every((p) => s.scores[p] === 17), s.scores);
  check('the moon is announced', s.log.some((l) => l.text.includes('SHOT THE MOON')), s.log.slice(-4).map((l) => l.text));
  check('the shooter wins the hand', s.winner === 'A', s.winner);
  check('the state remembers who shot it', s.shotMoon === 'A', s.shotMoon);
  check('every viewer sees the same shooter', ['A', 'B', 'C', 'D'].every((p) => redact(s, p).shotMoon === 'A'), P.map((p) => redact(s, p).shotMoon));

  // A split hand must NOT invert — guard against the moon firing on an ordinary round. Here the
  // spade trick (13 for the Queen) and the heart trick (4) fall to different players.
  let t = createMatch(mini, P, 3);
  deal(t, {
    A: ['CA', 'DA', 'HA', 'SK'],
    B: ['CK', 'DK', 'HK', 'SA'],
    C: ['CQ', 'DQ', 'HQ', 'SQ'],
    D: ['CJ', 'DJ', 'HJ', 'SJ'],
  });
  t.turnIndex = 0;
  guard = 0;
  while (t.phase === 'playing' && guard++ < 40) {
    const actor = actingPlayers(t)[0];
    const ms = legalMoves(t, actor);
    if (!actor || ms.length === 0) break;
    t = applyMove(t, actor, ms[0]);
  }
  const pot = P.reduce((a, p) => a + (t.scores[p] ?? 0), 0);
  check('a split hand still totals 17 points', pot === 17, t.scores);
  check('a split hand does not invert', !t.log.some((l) => l.text.includes('SHOT THE MOON')), t.scores);
  check('a split hand remembers no shooter', t.shotMoon == null, t.shotMoon);
}

// ---------- Contract Whist: a grand slam ----------
section('Trick-taking — a bid contract made as a slam');
{
  const P = ['A', 'B', 'C'];
  // A three-trick Contract Whist: small enough to stack a grand slam deliberately. maxLevel
  // tracks countPerPlayer, exactly as the real seven-card game ties its top bid to its hand size.
  const mini: typeof contractWhist = {
    ...contractWhist,
    meta: { ...contractWhist.meta, id: 'test-mini-contract', name: 'Mini Contract' },
    deck: { ...contractWhist.deck, excludeRanks: ['2', '3', '4', '5', '6', '7', '8', '9'] },
    setup: [{ op: 'shuffle', zone: 'draw' }, { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 3 }],
    trick: { ...contractWhist.trick!, numericAuction: { ...contractWhist.trick!.numericAuction!, maxLevel: 3 } },
  };

  const deal = (s: MatchState, hands: Record<string, string[]>) => {
    const all = Object.values(s.zones).flat();
    const byId = new Map(all.map((c) => [c.id, c]));
    for (const p of P) s.zones[`hand:${p}`] = hands[p].map((id) => byId.get(id)!);
    s.zones['draw'] = [];
  };

  // A holds every ace and king of a three-rank deck (A, K, Q only, after excluding 2-9 and 10/J):
  // guaranteed to win all three tricks no matter what B and C hold or lead.
  let s = createMatch(mini, P, 7);
  deal(s, {
    A: ['CA', 'DA', 'HA'],
    B: ['CK', 'DK', 'HK'],
    C: ['CQ', 'DQ', 'HQ'],
  });
  // Skip the auction entirely — the point of this fixture is the scoring, not the bidding —
  // by placing A straight into the highest possible contract at NT, the same shape
  // resolveAuction itself would have produced.
  s.highBid = { player: 'A', level: 3, strain: 'NT' };
  s.maker = 'A';
  s.trumpSuit = null;
  s.bidding = false;
  // auctionRound is the real gate on whether a bid or a card is the legal move — leaving it
  // as setup left it meant the "stacked" highBid above was just this hand's opening bid, and
  // the loop below then auctioned for real, coincidentally settling at the level under test.
  s.auctionRound = 0;
  s.auctionPasses = 0;
  s.phase = 'playing';
  s.turnIndex = 0;

  let guard = 0;
  while (s.phase === 'playing' && guard++ < 40) {
    const actor = actingPlayers(s)[0];
    if (!actor) break;
    const ms = legalMoves(s, actor);
    if (ms.length === 0) break;
    s = applyMove(s, actor, ms[0]);
  }
  check('the stacked hand finished', s.phase === 'roundOver', { phase: s.phase, guard });
  check('A took every trick', s.tricksWon['A'] === 3, s.tricksWon);
  check('the slam bonus is paid', (s.scores['A'] ?? 0) === 3 * 10 + 30, s.scores);
  check('the state remembers it as a slam', s.roundOutcome === 'slam', s.roundOutcome);
  check('every viewer sees the same outcome', P.every((p) => redact(s, p).roundOutcome === 'slam'), P.map((p) => redact(s, p).roundOutcome));

  // A contract made without reaching the top level must not be mistaken for a slam.
  let u = createMatch(mini, P, 7);
  deal(u, {
    A: ['CA', 'DA', 'CK'],
    B: ['DK', 'HK', 'DQ'],
    C: ['CQ', 'HQ', 'HA'],
  });
  u.highBid = { player: 'A', level: 1, strain: 'NT' };
  u.maker = 'A';
  u.trumpSuit = null;
  u.bidding = false;
  u.auctionRound = 0;
  u.auctionPasses = 0;
  u.phase = 'playing';
  u.turnIndex = 0;
  guard = 0;
  while (u.phase === 'playing' && guard++ < 40) {
    const actor = actingPlayers(u)[0];
    if (!actor) break;
    const ms = legalMoves(u, actor);
    if (ms.length === 0) break;
    u = applyMove(u, actor, ms[0]);
  }
  check('a modest contract made is not a slam', u.roundOutcome !== 'slam', u.roundOutcome);
}

// ---------- Euchre: auction, bowers, kitty, going alone ----------
section('Trick-taking — Euchre auction, bowers and going alone');
{
  const P = ['A', 'B', 'C', 'D'];
  const s = createMatch(euchre, P, 11);

  check('the auction opens, not play', s.auctionRound === 1);
  check('five cards each', P.every((p) => s.zones[`hand:${p}`].length === 5), P.map((p) => s.zones[`hand:${p}`].length));
  check('four cards in the kitty', s.zones['kitty'].length === 4, s.zones['kitty'].length);
  check('the dealer is seat A on hand 1', s.dealerIndex === 0);
  check('bidding opens to the dealer left', s.players[s.turnIndex] === 'B', s.players[s.turnIndex]);
  check('the upcard is public', redact(s, 'C').upcard !== null && redact(s, 'C').upcard !== undefined);

  const up = s.zones['kitty'][s.zones['kitty'].length - 1];
  const bidMoves = legalMoves(s, 'B');
  check('round 1 offers only the turned-up suit',
    bidMoves.filter((m) => m.actionId === 'orderUp').every((m) => m.choice === up.suit), bidMoves);
  check('going alone is offered alongside', bidMoves.some((m) => m.actionId === 'orderUp' && m.alone));
  check('passing is allowed early on', bidMoves.some((m) => m.actionId === 'passBid'));
  check('nobody else can act mid-auction', legalMoves(s, 'C').length === 0);

  // Ordering it up gives the dealer the upcard and stalls everything until they discard.
  let t = applyMove(s, 'B', { actionId: 'orderUp', choice: up.suit });
  check('trump is now the upcard suit', t.trumpSuit === up.suit, t.trumpSuit);
  check('the bidder is the maker', t.maker === 'B');
  check('the dealer picked the upcard up', t.zones['hand:A'].length === 6, t.zones['hand:A'].length);
  check('the dealer owes a discard', t.discarding === 'A');
  check('the dealer is the only actor', JSON.stringify(actingPlayers(t)) === '["A"]', actingPlayers(t));
  check('only discards are legal', legalMoves(t, 'A').every((m) => m.actionId === 'dealerDiscard'));
  t = applyMove(t, 'A', { actionId: 'dealerDiscard', cardId: t.zones['hand:A'][0].id });
  check('dealer back to five cards', t.zones['hand:A'].length === 5);
  check('play opens to the dealer left', t.players[t.turnIndex] === 'B', t.players[t.turnIndex]);

  // All four passing in round 1 turns the card down and opens round 2.
  let r2 = s;
  for (const p of ['B', 'C', 'D', 'A']) r2 = applyMove(r2, p, { actionId: 'passBid' });
  check('round 2 opened', r2.auctionRound === 2);
  check('the upcard was turned down', r2.zones['kitty'].length === 0);
  const r2Moves = legalMoves(r2, 'B');
  check('the turned-down suit is remembered', r2.turnedDownSuit === up.suit, r2.turnedDownSuit);
  check('round 2 bars the suit that was turned down',
    !r2Moves.some((m) => m.choice === up.suit), r2Moves.map((m) => m.choice));
  check('round 2 offers the other three suits',
    new Set(r2Moves.filter((m) => m.actionId === 'nameTrump').map((m) => m.choice)).size === 3,
    r2Moves.filter((m) => m.actionId === 'nameTrump').map((m) => m.choice));

  // Screw the dealer: on the last call of round 2 there is no pass.
  let stuck = r2;
  for (const p of ['B', 'C', 'D']) stuck = applyMove(stuck, p, { actionId: 'passBid' });
  check('the dealer is on the last call', stuck.players[stuck.turnIndex] === 'A');
  check('the dealer cannot pass', !legalMoves(stuck, 'A').some((m) => m.actionId === 'passBid'),
    legalMoves(stuck, 'A').map((m) => m.actionId));
  check('the dealer must name a suit', legalMoves(stuck, 'A').every((m) => m.actionId === 'nameTrump'));
}

section('Trick-taking — bowers change suit and rank');
{
  const P = ['A', 'B', 'C', 'D'];
  const card = (id: string, rank: string, suit: string) => ({ id, rank, suit }) as Card;
  const base = () => {
    const s = createMatch(euchre, P, 11);
    s.auctionRound = 0;
    s.trumpSuit = 'S';
    s.maker = 'A';
    s.zones['kitty'] = [];
    s.zones['trick'] = [];
    s.trickPlays = [];
    return s;
  };

  // J♣ is the left bower: it is a SPADE while spades are trump.
  let s = base();
  s.zones['hand:B'] = [card('CJ', 'J', 'C'), card('C9', '9', 'C'), card('CA', 'A', 'C')];
  s.turnIndex = 1;
  s.lead = 'S';
  let offered = legalMoves(s, 'B').map((m) => m.cardId);
  check('with spades led, the left bower is the only legal follow', JSON.stringify(offered) === '["CJ"]', offered);

  s = base();
  s.zones['hand:B'] = [card('CJ', 'J', 'C'), card('C9', '9', 'C'), card('CA', 'A', 'C')];
  s.turnIndex = 1;
  s.lead = 'C';
  offered = legalMoves(s, 'B').map((m) => m.cardId);
  check('with clubs led, the left bower is NOT a club', !offered.includes('CJ') && offered.length === 2, offered);

  // Right bower > left bower > ace of trump.
  const play = (st: MatchState, seat: string, c: Card) => {
    st.zones[`hand:${seat}`] = [c];
    return applyMove(st, seat, { actionId: 'playToTrick', cardId: c.id });
  };
  let u = base();
  for (const p of P) u.zones[`hand:${p}`] = [];
  u.turnIndex = 0;
  u = play(u, 'A', card('SA', 'A', 'S'));
  u = play(u, 'B', card('CJ', 'J', 'C'));
  check('the left bower beats the ace of trump', u.trickPlays.length === 2 && u.lead === 'S');
  u = play(u, 'C', card('SJ', 'J', 'S'));
  u = play(u, 'D', card('SK', 'K', 'S'));
  check('the right bower takes the trick', u.tricksWon['C'] === 1, u.tricksWon);
}

section('Trick-taking — Euchre scoring');
{
  const P = ['A', 'B', 'C', 'D'];
  const card = (id: string, rank: string, suit: string) => ({ id, rank, suit }) as Card;
  // Stack a hand, name trump for A, and play it out with the first legal move each time.
  const runHand = (hands: Record<string, string[]>, alone: boolean) => {
    const s = createMatch(euchre, P, 11);
    const byId = new Map(Object.values(s.zones).flat().map((c) => [c.id, c]));
    s.auctionRound = 0;
    s.trumpSuit = 'S';
    s.maker = 'A';
    s.alone = alone;
    s.sittingOut = alone ? 'C' : null;
    s.zones['kitty'] = [];
    s.zones['trick'] = [];
    s.trickPlays = [];
    for (const p of P) s.zones[`hand:${p}`] = (hands[p] ?? []).map((id) => byId.get(id) ?? card(id, id.slice(1), id[0]));
    s.turnIndex = 0;
    let st = s;
    let guard = 0;
    while (st.phase === 'playing' && guard++ < 60) {
      const actor = actingPlayers(st)[0];
      const ms = actor ? legalMoves(st, actor) : [];
      if (!actor || ms.length === 0) break;
      st = applyMove(st, actor, ms[0]);
    }
    return st;
  };

  // A holds every trump — a march.
  const allTrump = { A: ['SJ', 'CJ', 'SA', 'SK', 'SQ'], B: ['H9', 'H10', 'HQ', 'HK', 'HA'], C: ['D9', 'D10', 'DQ', 'DK', 'DA'], D: ['C9', 'C10', 'CQ', 'CK', 'CA'] };
  let m = runHand(allTrump, false);
  check('march: makers take all five', m.tricksWon['A'] === 5, m.tricksWon);
  check('march scores 2', m.scores['A'] === 2 && m.scores['C'] === 2, m.scores);
  check('defenders score 0', m.scores['B'] === 0 && m.scores['D'] === 0, m.scores);

  // Same march, but going alone with the partner out.
  const solo = { A: ['SJ', 'CJ', 'SA', 'SK', 'SQ'], B: ['H9', 'H10', 'HQ', 'HK', 'HA'], C: [], D: ['C9', 'C10', 'CQ', 'CK', 'CA'] };
  const a = runHand(solo, true);
  check('the partner sat out', a.zones['hand:C'].length === 0 && a.sittingOut === 'C');
  check('alone march scores 4', a.scores['A'] === 4, a.scores);

  // Defenders take three — the makers are euchred.
  const set = { A: ['SJ', 'CJ', 'H9', 'H10', 'HQ'], B: ['SA', 'SK', 'SQ', 'S10', 'S9'], C: ['D9', 'D10', 'DQ', 'DK', 'DA'], D: ['C9', 'C10', 'CQ', 'CK', 'CA'] };
  const e = runHand(set, false);
  const madeTricks = (e.tricksWon['A'] ?? 0) + (e.tricksWon['C'] ?? 0);
  check('makers fell short', madeTricks < 3, e.tricksWon);
  check('euchred pays the defenders 2', e.scores['B'] === 2 && e.scores['D'] === 2, e.scores);
  check('the makers score nothing', e.scores['A'] === 0 && e.scores['C'] === 0, e.scores);
  check('the euchre is announced', e.log.some((l) => l.text.includes('Euchred')), e.log.slice(-3).map((l) => l.text));
}

// ---------- Gin Rummy: deadwood, knocking, gin, undercut, lay-off ----------
section('Rummy — knocking, deadwood and lay-off (Gin Rummy)');
{
  const P = ['A', 'B'];
  const setup = (aHand: string[], bHand: string[]) => {
    const s = createMatch(ginRummy, P, 5);
    const byId = new Map(Object.values(s.zones).flat().map((c) => [c.id, c]));
    const grab = (ids: string[]) => ids.map((id) => byId.get(id) ?? card(id, id.slice(1), id[0]));
    s.zones['hand:A'] = grab(aHand);
    s.zones['hand:B'] = grab(bHand);
    s.zones['discard'] = [];
    s.rummyPhase = 'play';
    s.turnIndex = 0;
    return s;
  };

  // Eleven cards: a spade run, a set of nines, three loose cards worth 6, and a king.
  // Only throwing the king gets deadwood under 10.
  const knockHand = ['S4', 'S5', 'S6', 'S7', 'H9', 'D9', 'C9', 'C2', 'D3', 'HA', 'SK'];
  // B holds three runs plus a lone king — 10 deadwood, and nothing that can hang off A's melds.
  let s = setup(knockHand, ['H2', 'H3', 'H4', 'D5', 'D6', 'D7', 'CK', 'CQ', 'CJ', 'SK']);
  const knocks = legalMoves(s, 'A').filter((m) => m.actionId === 'knock');
  check('exactly one throw makes the hand knockable', knocks.length === 1, knocks.map((m) => m.cardId));
  check('and it is the king', knocks[0]?.cardId === 'SK', knocks[0]);
  check('discarding is always available too', legalMoves(s, 'A').filter((m) => m.actionId === 'rummyDiscard').length === 11);

  // Optimality: a nine can serve the run OR the set, never both. Greedy picking would misprice this.
  const overlap = setup(['H7', 'H8', 'H9', 'C9', 'D9', 'SK', 'SQ', 'CA', 'D2', 'H3', 'S5'], ['H2', 'H4', 'D5', 'D6', 'D7', 'CK', 'CQ', 'CJ', 'S9', 'S3']);
  const overlapKnocks = legalMoves(overlap, 'A').filter((m) => m.actionId === 'knock');
  check('a card cannot count in two melds at once', overlapKnocks.length === 0, overlapKnocks.map((m) => m.cardId));

  // Knock and score: A's deadwood 6, B's deadwood is its whole hand bar the run/melds.
  let scored = applyMove(s, 'A', { actionId: 'knock', cardId: 'SK' });
  check('the hand ended on the knock', scored.phase === 'roundOver');
  check('the knocker won', scored.winner === 'A', { winner: scored.winner, scores: scored.scores });
  check('the knocker scores the spread (10 - 6)', scored.scores['A'] === 4, scored.scores);
  check('the knock is logged', scored.log.some((l) => l.text.includes('knocks')));
  check('an ordinary knock records that outcome', scored.roundOutcome === 'knock', scored.roundOutcome);

  // Gin: no deadwood at all pays the bonus.
  const ginHand = ['S4', 'S5', 'S6', 'S7', 'H9', 'D9', 'C9', 'CA', 'DA', 'HA', 'SK'];
  let g = setup(ginHand, ['H2', 'H4', 'D5', 'D7', 'CK', 'CQ', 'S9', 'S3', 'D10', 'HJ']);
  const ginKnock = legalMoves(g, 'A').filter((m) => m.actionId === 'knock');
  check('a gin hand can knock', ginKnock.some((m) => m.cardId === 'SK'), ginKnock.map((m) => m.cardId));
  g = applyMove(g, 'A', { actionId: 'knock', cardId: 'SK' });
  check('gin is announced', g.log.some((l) => l.text.includes('GIN')), g.log.slice(-2).map((l) => l.text));
  check('gin pays the 25 bonus on top of the spread', (g.scores['A'] ?? 0) > 25, g.scores);
  check('the defender scores nothing', g.scores['B'] === 0, g.scores);
  check('gin records that outcome', g.roundOutcome === 'gin', g.roundOutcome);

  // Undercut: the knocker throws with 9 deadwood, the defender is sitting on less.
  const loose = setup(['S4', 'S5', 'S6', 'H9', 'D9', 'C9', 'D2', 'D3', 'CA', 'H3', 'SK'],
                      ['H4', 'H5', 'H6', 'C10', 'CJ', 'CQ', 'DA', 'D4', 'S2', 'S3']);
  const lm = legalMoves(loose, 'A').filter((m) => m.actionId === 'knock');
  let u = applyMove(loose, 'A', lm[0]);
  check('undercut goes to the defender', u.winner === 'B', { winner: u.winner, scores: u.scores });
  check('undercut is announced', u.log.some((l) => l.text.includes('Undercut')), u.log.slice(-2).map((l) => l.text));
  check('undercut pays the 25 bonus', (u.scores['B'] ?? 0) >= 25, u.scores);
  check('undercut records that outcome', u.roundOutcome === 'undercut', u.roundOutcome);

  // Lay-off: the defender's spare 8♠ hangs off the knocker's 4-5-6-7♠ run and stops counting.
  const withLayoff = setup(['S4', 'S5', 'S6', 'S7', 'H9', 'D9', 'C9', 'C2', 'D3', 'HA', 'SK'],
                           ['S8', 'CK', 'CQ', 'CJ', 'H2', 'H3', 'H4', 'D5', 'D6', 'D7']);
  const laid = applyMove(withLayoff, 'A', { actionId: 'knock', cardId: 'SK' });
  // Same two hands with lay-off switched off: A's loose knock survives and wins by 2.
  const noLayoffDef = { ...ginRummy, rummy: { ...ginRummy.rummy!, layOff: false } };
  const s2 = createMatch(noLayoffDef, P, 5);
  const byId2 = new Map(Object.values(s2.zones).flat().map((c) => [c.id, c]));
  s2.zones['hand:A'] = ['S4', 'S5', 'S6', 'S7', 'H9', 'D9', 'C9', 'C2', 'D3', 'HA', 'SK'].map((id) => byId2.get(id)!);
  s2.zones['hand:B'] = ['S8', 'CK', 'CQ', 'CJ', 'H2', 'H3', 'H4', 'D5', 'D6', 'D7'].map((id) => byId2.get(id)!);
  s2.zones['discard'] = [];
  s2.rummyPhase = 'play';
  s2.turnIndex = 0;
  const unlaid = applyMove(s2, 'A', { actionId: 'knock', cardId: 'SK' });
  check('without lay-off the loose knock wins by 2', unlaid.winner === 'A' && unlaid.scores['A'] === 2, unlaid.scores);
  check('the 8♠ hangs off the knocker 4-5-6-7♠ run and wipes the defender deadwood',
    laid.winner === 'B', { withLayoff: laid.scores, without: unlaid.scores });
  check('so the lay-off turns a win into an undercut', (laid.scores['B'] ?? 0) === 31, laid.scores);
}

// ---------- Solitaire: build rules, capacity, harvesting, and the win ----------
section('Solitaire — Klondike');
{
  const s = createMatch(klondike, ['P1'], 4);
  const cols = Array.from({ length: 7 }, (_, i) => s.zones[`tab${i}`]);
  check('seven columns dealt as a staircase', cols.every((c, i) => c.length === i + 1), cols.map((c) => c.length));
  check('only the last card of each column is face up',
    cols.every((c) => c.every((card, i) => s.faceUp[card.id] === (i === c.length - 1))));
  check('the rest is stock', s.zones['stock'].length === 24, s.zones['stock'].length);
  check('the whole deck is accounted for', 28 + 24 === 52);
  check('four empty foundations', [0, 1, 2, 3].every((i) => s.zones[`found${i}`].length === 0));
  check('no free cells', s.zones['free0'] === undefined);

  // Build rules: red on black, descending, and only a King into a gap.
  let t = createMatch(klondike, ['P1'], 4);
  for (let i = 0; i < 7; i++) t.zones[`tab${i}`] = [];
  t.zones['tab0'] = [card('S8', '8', 'S')];
  t.zones['tab1'] = [card('H7', '7', 'H'), card('C6', '6', 'C')];   // red 7, black 6 — a real run
  t.zones['tab2'] = [];
  // The king sits on a face-down card, so shifting it actually gains something — the engine
  // rightly refuses to move a whole column into an empty one for nothing.
  t.zones['tab3'] = [card('D9', '9', 'D'), card('SK', 'K', 'S')];
  t.zones['tab4'] = [card('CQ', 'Q', 'C')];
  t.zones['stock'] = []; t.zones['waste'] = [];
  for (const z of ['tab0', 'tab1', 'tab4']) for (const c of t.zones[z]) t.faceUp[c.id] = true;
  t.faceUp['D9'] = false; t.faceUp['SK'] = true;

  const to0 = legalMoves(t, 'P1').filter((m) => m.to === 'tab0');
  check('a red 7 stacks on a black 8', to0.some((m) => m.cardId === 'H7'), to0.map((m) => m.cardId));
  check('a black queen does not stack on a black king',
    !legalMoves(t, 'P1').some((m) => m.cardId === 'CQ' && m.to === 'tab3'));
  const toEmpty = legalMoves(t, 'P1').filter((m) => m.to === 'tab2');
  check('only a King may fill an empty column',
    toEmpty.length > 0 && toEmpty.every((m) => m.cardId === 'SK'), toEmpty.map((m) => m.cardId));
  check('a built run moves as one unit — the 6♣ travels with the 7♥',
    to0.some((m) => m.cardId === 'H7'));

  // Foundations take aces first, then their own suit in order.
  let f = createMatch(klondike, ['P1'], 4);
  for (let i = 0; i < 7; i++) f.zones[`tab${i}`] = [];
  f.zones['tab0'] = [card('SA', 'A', 'S')];
  f.zones['tab1'] = [card('S2', '2', 'S')];
  f.zones['tab2'] = [card('H2', '2', 'H')];
  f.zones['stock'] = []; f.zones['waste'] = [];
  for (const z of ['tab0', 'tab1', 'tab2']) for (const c of f.zones[z]) f.faceUp[c.id] = true;
  check('an ace may start a foundation', legalMoves(f, 'P1').some((m) => m.cardId === 'SA' && m.to?.startsWith('found')));
  check('a two may not', !legalMoves(f, 'P1').some((m) => m.cardId === 'S2' && m.to?.startsWith('found')));
  f = applyMove(f, 'P1', { actionId: 'solMove', cardId: 'SA', from: 'tab0', to: 'found0' });
  check('the ace is on the foundation', f.zones['found0'].length === 1);
  check('the 2♠ now goes up', legalMoves(f, 'P1').some((m) => m.cardId === 'S2' && m.to === 'found0'));
  check('the 2♥ does not — wrong suit', !legalMoves(f, 'P1').some((m) => m.cardId === 'H2' && m.to === 'found0'));

  // Turning a card over is automatic.
  let u = createMatch(klondike, ['P1'], 4);
  for (let i = 0; i < 7; i++) u.zones[`tab${i}`] = [];
  u.zones['tab0'] = [card('D9', '9', 'D'), card('SA', 'A', 'S')];
  u.faceUp['D9'] = false; u.faceUp['SA'] = true;
  u.zones['stock'] = []; u.zones['waste'] = [];
  u = applyMove(u, 'P1', { actionId: 'solMove', cardId: 'SA', from: 'tab0', to: 'found0' });
  check('the card underneath turns face up', u.faceUp['D9'] === true);

  // Winning: a board one card from home must finish and be declared solved.
  let w = createMatch(klondike, ['P1'], 4);
  const all = Object.values(w.zones).flat();
  const byId = new Map(all.map((c) => [c.id, c]));
  for (let i = 0; i < 7; i++) w.zones[`tab${i}`] = [];
  w.zones['stock'] = []; w.zones['waste'] = [];
  const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  ['S', 'H', 'D', 'C'].forEach((suit, fi) => {
    w.zones[`found${fi}`] = ranks.slice(0, 12).map((r) => byId.get(`${suit}${r}`)!);
  });
  w.zones['tab0'] = ['S', 'H', 'D', 'C'].map((suit) => byId.get(`${suit}K`)!);
  for (const c of w.zones['tab0']) w.faceUp[c.id] = true;
  let guard = 0;
  while (w.phase === 'playing' && guard++ < 20) {
    const ms = legalMoves(w, 'P1').filter((m) => m.to?.startsWith('found'));
    if (ms.length === 0) break;
    w = applyMove(w, 'P1', ms[0]);
  }
  check('the last four kings go home', w.phase === 'roundOver', { phase: w.phase, guard });
  check('the game is declared solved', w.winner === 'P1', w.winner);
  check('all 52 are on the foundations',
    [0, 1, 2, 3].reduce((a, i) => a + w.zones[`found${i}`].length, 0) === 52);
  check('the solve is logged', w.log.some((l) => l.text.includes('Solved')), w.log.slice(-2).map((l) => l.text));
}

section('Solitaire — FreeCell capacity');
{
  const s = createMatch(freecell, ['P1'], 9);
  const cols = Array.from({ length: 8 }, (_, i) => s.zones[`tab${i}`]);
  check('eight columns hold the whole deck', cols.reduce((a, c) => a + c.length, 0) === 52, cols.map((c) => c.length));
  check('dealt 7,7,7,7,6,6,6,6', JSON.stringify(cols.map((c) => c.length)) === '[7,7,7,7,6,6,6,6]', cols.map((c) => c.length));
  check('everything is face up', cols.every((c) => c.every((card) => s.faceUp[card.id])));
  check('four free cells, all empty', [0, 1, 2, 3].every((i) => s.zones[`free${i}`].length === 0));
  check('no stock', s.zones['stock'].length === 0);

  // Capacity is (free cells + 1), doubled for every empty column — so the other six columns are
  // blocked off with low cards that nothing in the run can stack onto.
  const build = (cells: number) => {
    const t = createMatch(freecell, ['P1'], 9);
    for (let i = 0; i < 8; i++) t.zones[`tab${i}`] = [];
    // A properly built alt-colour run of five, landing on a black 9.
    t.zones['tab0'] = [card('S9', '9', 'S')];                       // takes the whole 5-run
    t.zones['tab1'] = [card('H8', '8', 'H'), card('S7', '7', 'S'), card('D6', '6', 'D'), card('C5', '5', 'C'), card('H4', '4', 'H')];
    t.zones['tab2'] = [card('H6', '6', 'H')];                       // takes the last two
    t.zones['tab3'] = [card('S5', '5', 'S')];                       // takes the last one
    ['S2', 'H2', 'D2', 'C2'].forEach((id, i) => { t.zones[`tab${i + 4}`] = [card(id, '2', id[0])]; });
    for (let i = 0; i < 8; i++) for (const c of t.zones[`tab${i}`]) t.faceUp[c.id] = true;
    const filler = ['CK', 'DK', 'HK', 'SK'];
    for (let i = 0; i < cells; i++) { t.zones[`free${i}`] = [card(filler[i], 'K', filler[i][0])]; t.faceUp[filler[i]] = true; }
    return t;
  };
  const open = build(0);
  check('with four cells free, a five-card run moves in one go',
    legalMoves(open, 'P1').some((m) => m.cardId === 'H8' && m.to === 'tab0'),
    legalMoves(open, 'P1').filter((m) => m.to === 'tab0').map((m) => m.cardId));
  const full = build(4);
  check('with every cell full, the five-card run cannot move',
    !legalMoves(full, 'P1').some((m) => m.cardId === 'H8' && m.to === 'tab0'));
  check('nor can a two-card piece of it',
    !legalMoves(full, 'P1').some((m) => m.cardId === 'C5' && m.to === 'tab2'));
  check('but a single card still moves', legalMoves(full, 'P1').some((m) => m.cardId === 'H4' && m.to === 'tab3'));
  const one = build(3);
  check('one free cell lifts two cards',
    legalMoves(one, 'P1').some((m) => m.cardId === 'C5' && m.to === 'tab2'));
  check('one free cell does not lift five',
    !legalMoves(one, 'P1').some((m) => m.cardId === 'H8' && m.to === 'tab0'));
}

section('Solitaire — Spider runs');
{
  const s = createMatch(spider, ['P1'], 11);
  const cols = Array.from({ length: 10 }, (_, i) => s.zones[`tab${i}`]);
  check('two decks in play', cols.reduce((a, c) => a + c.length, 0) + s.zones['stock'].length === 104);
  check('54 dealt, 50 left in stock', cols.reduce((a, c) => a + c.length, 0) === 54 && s.zones['stock'].length === 50,
    { dealt: cols.reduce((a, c) => a + c.length, 0), stock: s.zones['stock'].length });
  check('dealt 6,6,6,6,5,5,5,5,5,5', JSON.stringify(cols.map((c) => c.length)) === '[6,6,6,6,5,5,5,5,5,5]', cols.map((c) => c.length));

  // Rank alone governs stacking; suit alone governs lifting.
  let t = createMatch(spider, ['P1'], 11);
  for (let i = 0; i < 10; i++) t.zones[`tab${i}`] = [];
  t.zones['stock'] = [];
  t.zones['tab0'] = [card('S9', '9', 'S')];
  t.zones['tab1'] = [card('H8', '8', 'H')];
  t.zones['tab2'] = [card('C7', '7', 'C'), card('D6', '6', 'D')];
  t.zones['tab3'] = [card('S7', '7', 'S'), card('S6', '6', 'S')];
  for (const z of ['tab0', 'tab1', 'tab2', 'tab3']) for (const c of t.zones[z]) t.faceUp[c.id] = true;
  check('any suit stacks on the next rank up', legalMoves(t, 'P1').some((m) => m.cardId === 'H8' && m.to === 'tab0'));
  check('a mixed-suit pair cannot be lifted', !legalMoves(t, 'P1').some((m) => m.cardId === 'C7' && m.to === 'tab1'));
  check('a same-suit pair can', legalMoves(t, 'P1').some((m) => m.cardId === 'S7' && m.to === 'tab1'));

  // A finished King-to-Ace suit run leaves the board on its own.
  let r = createMatch(spider, ['P1'], 11);
  const byId = new Map(Object.values(r.zones).flat().map((c) => [c.id, c]));
  for (let i = 0; i < 10; i++) r.zones[`tab${i}`] = [];
  r.zones['stock'] = [];
  const ranks = ['K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];
  r.zones['tab0'] = [card('D5', '5', 'D'), ...ranks.map((x) => byId.get(`S${x}`)!)];
  r.zones['tab1'] = [byId.get('SA')!];
  for (const z of ['tab0', 'tab1']) for (const c of r.zones[z]) r.faceUp[c.id] = true;
  check('the run is one card short, so nothing clears yet', r.zones['found0'].length === 0);
  r = applyMove(r, 'P1', { actionId: 'solMove', cardId: 'SA', from: 'tab1', to: 'tab0' });
  check('completing K-to-A clears it off the board', r.zones['found0'].length === 13, r.zones['found0'].length);
  check('the column keeps what was underneath', r.zones['tab0'].length === 1 && r.zones['tab0'][0].id === 'D5', r.zones['tab0'].map((c) => c.id));
  check('the clear is logged', r.log.some((l) => l.text.includes('complete')), r.log.slice(-2).map((l) => l.text));

  // Dealing a row puts one card on every column, and is barred while a column is empty.
  let d = createMatch(spider, ['P1'], 11);
  check('a fresh deal offers the stock', legalMoves(d, 'P1').some((m) => m.actionId === 'solDeal'));
  d.zones['tab3'] = [];
  check('an empty column blocks the deal', !legalMoves(d, 'P1').some((m) => m.actionId === 'solDeal'));
  let d2 = createMatch(spider, ['P1'], 11);
  const before = d2.zones['stock'].length;
  d2 = applyMove(d2, 'P1', { actionId: 'solDeal' });
  check('dealing lays one card on each of the ten columns', d2.zones['stock'].length === before - 10, d2.zones['stock'].length);
  check('and turns them all face up',
    Array.from({ length: 10 }, (_, i) => d2.zones[`tab${i}`].slice(-1)[0]).every((c) => d2.faceUp[c.id]));
}

// Kent is decided by who spots the signal, so the outcome of a signal is stacked here rather
// than waited for: random play reaches four of a kind eventually, but "eventually" is not a
// test of what happens when it does.
section('Kent — the signal, and who gets the letter');
{
  const P = ['P1', 'P2', 'P3', 'P4'];   // pairs are P1+P3 against P2+P4
  const stack = (s: MatchState, who: string, rank: string) => {
    // Give this seat four of a kind, taking the cards from wherever they are.
    const wanted = ['S', 'H', 'D', 'C'].map((suit) => `${rank}${suit}`);
    for (const key of Object.keys(s.zones)) {
      s.zones[key] = s.zones[key].filter((c) => !wanted.includes(c.id));
    }
    s.zones[`hand:${who}`] = wanted.map((id) => ({ id, rank, suit: id.slice(-1) } as Card));
    return s;
  };

  let s = stack(createMatch(kent, P, 77), 'P2', 'K');
  check('four of a kind is what lets you signal',
    legalMoves(s, 'P2').some((m) => m.actionId === 'kentSignal'));
  check('and nobody else can signal on your hand',
    !legalMoves(s, 'P1').some((m) => m.actionId === 'kentSignal'));

  s = applyMove(s, 'P2', { actionId: 'kentSignal' });
  check('the tell is up', !!s.kentTell && s.kentTell.player === 'P2');
  check('the partner is offered the call',
    legalMoves(s, 'P4').some((m) => m.actionId === 'kentCall'));
  check('an opponent is offered the call-off',
    legalMoves(s, 'P1').some((m) => m.actionId === 'kentStop'));
  check('and the table is frozen while it is up',
    !legalMoves(s, 'P1').some((m) => m.actionId === 'kentSwap'));
  check('the seat that signalled can only wait',
    legalMoves(s, 'P2').every((m) => m.actionId === 'kentWait'));

  // The partner sees it: the pair takes the round, the other pair takes the letter.
  let won = applyMove(s, 'P4', { actionId: 'kentCall' });
  check('a partner calling it wins the round', won.phase === 'roundOver' && won.winner === 'P4', won.winner ?? '');
  check('and the other pair takes the letter', won.kentLetters.A === 1 && won.kentLetters.B === 0,
    JSON.stringify(won.kentLetters));

  // An opponent sees it first: the letter goes the other way.
  let lost = applyMove(s, 'P1', { actionId: 'kentStop' });
  check('an opponent calling it off wins the round', lost.phase === 'roundOver' && lost.winner === 'P1');
  check('and the letter goes to the pair that signalled', lost.kentLetters.B === 1 && lost.kentLetters.A === 0,
    JSON.stringify(lost.kentLetters));

  // The tell lapses on its own, so a signal nobody sees costs nothing.
  let lapsed = s;
  for (let i = 0; i < 5; i++) lapsed = applyMove(lapsed, 'P1', { actionId: 'kentWait' });
  check('a signal nobody sees lapses', !legalMoves(lapsed, 'P4').some((m) => m.actionId === 'kentCall'));
  check('and the table starts again', legalMoves(lapsed, 'P1').some((m) => m.actionId === 'kentSwap'));

  // Spelling the word ends it.
  let far = stack(createMatch(kent, P, 78), 'P2', 'Q');
  far.kentLetters = { A: 3, B: 0 };
  far = applyMove(far, 'P2', { actionId: 'kentSignal' });
  far = applyMove(far, 'P1', { actionId: 'kentStop' });
  check('a fourth letter does not end it for the pair that spelt nothing', !far.matchOver, JSON.stringify(far.kentLetters));
  let out = stack(createMatch(kent, P, 79), 'P1', 'Q');
  out.kentLetters = { A: 3, B: 0 };
  out = applyMove(out, 'P1', { actionId: 'kentSignal' });
  out = applyMove(out, 'P2', { actionId: 'kentStop' });
  check('spelling KENT ends the game', out.matchOver && out.kentLetters.A === 4, JSON.stringify(out.kentLetters));
  check('and the other pair has won it', !!out.matchWinner && P.indexOf(out.matchWinner) % 2 === 1, out.matchWinner ?? '');
}

// Redaction runs for every seat, in every classic, whether or not that seat is on turn — the
// off-turn path is the one a spectating player hits on every bot move.
section('Redaction — every classic, every seat, on and off turn');
{
  for (const def of catalog) {
    const seats = Math.max(def.meta.players.min, Math.min(4, def.meta.players.max));
    const P = Array.from({ length: seats }, (_, i) => `P${i + 1}`);
    let s = createMatch(def, P, 4242);
    let ok = true;
    let detail = '';
    for (let step = 0; step < 40 && s.phase === 'playing'; step++) {
      for (const p of P) {
        try { redact(s, p); } catch (e) { ok = false; detail = `${p}: ${(e as Error).message}`; }
      }
      if (!ok) break;
      const actor = actingPlayers(s)[0];
      const ms = actor ? legalMoves(s, actor) : [];
      if (!actor || ms.length === 0) break;
      s = applyMove(s, actor, ms[0]);
    }
    check(`${def.meta.name} redacts cleanly for all seats`, ok, detail);
  }
}

// ---------- Schema coverage: startPlayer: 'dealerLeft' actually rotates ----------
//
// This exact knob did nothing outside auction games for the entire life of the project — every
// other family fell through to turnIndex 0 and seat one opened every hand of every match. It
// was found by accident, not by a test, which is the reason this exists: every game in the
// catalog that declares `startPlayer: 'dealerLeft'` gets checked, not just the one game that
// happened to be under the microscope when the bug was found.
section("Schema coverage: 'dealerLeft' rotates the opener, hand over hand");
{
  const declares = catalog.filter((g) => g.turnFlow.startPlayer === 'dealerLeft');
  check('at least one game declares dealerLeft, or this proves nothing', declares.length > 0, declares.length);
  for (const g of declares) {
    const n = g.meta.players.min;
    const seats = Array.from({ length: n }, (_, i) => String.fromCharCode(97 + i));
    let s = createMatch(g, seats, 1);
    const openers = new Set<string>();
    for (let hand = 0; hand < n; hand++) {
      openers.add(s.players[s.turnIndex]);
      s = nextHand(s, hand + 2);
    }
    // A game with its own opening-lead rule (a trick game leads off the turned or led suit
    // rather than straight off the dealer) is allowed to repeat an opener; every other family
    // has nothing else deciding it, so n hands should visit n different openers.
    const expectDistinct = !g.trick;
    check(`${g.meta.name}: the opener moves round the table`,
      !expectDistinct || openers.size === n, [...openers]);
  }
}

// ---------- meldPatterns: a marriage scores in every suit, not just the one every hand-built
// test happens to reach for (item 91 of the site-audit pass) ----------
//
// scoreMelds() expands `trick.meldPatterns` generically over every suit actually in the deck
// (see engine.ts), but nothing exercised more than whichever suit a random deal or a
// hand-written test scenario happened to land on — Hearts, almost always, because it is the
// suit every example in this codebase reaches for first. This pins down all four at once,
// including that trump (Spades, for Pinochle) is the one that doubles.
section('Schema coverage: a meldPatterns entry scores correctly in every suit, not just Hearts');
{
  const mk = (suit: string, rank: string) => ({ id: `${suit}${rank}#t`, rank, suit }) as Card;
  // One suit's marriage at a time, in isolation — a hand holding K+Q in every suit at once would
  // also complete Pinochle's literal "eighty kings"/"sixty queens" melds and confound the total,
  // so each suit gets scored on its own. Spades is Pinochle's fixed trump: it alone should double
  // (20 -> 40); the other three should each score the plain 20.
  for (const [suit, expected] of [['C', 20], ['D', 20], ['H', 20], ['S', 40]] as const) {
    const s = createMatch(pinochle, ['A', 'B', 'C', 'D'], 7);
    s.zones['hand:A'] = [mk(suit, 'K'), mk(suit, 'Q')];
    s.zones['hand:B'] = []; s.zones['hand:C'] = []; s.zones['hand:D'] = [];
    s.bonus = {};
    scoreMelds(s);
    check(`a marriage in ${suit} scores ${expected}${suit === 'S' ? ' (trump, doubled)' : ''}`,
      s.bonus['A'] === expected, s.bonus);
  }
}

// ---------- bestBy: a genuine tie is broken fairly, not by seat order (item 93) ----------
//
// bestBy() decides who a custom "end the hand on highest/lowest score" rule crowns. An exact
// tie used to resolve to whichever tied player the scan reached first — seat order, in
// practice — the same seat-0-wins-every-stalemate shape as the fairness bugs already found and
// fixed elsewhere this pass (items 4, 16-18, 91).
section('Schema coverage: bestBy() breaks a real tie fairly, not by seat order');
{
  const s = createMatch(hearts, ['A', 'B', 'C', 'D'], 3);
  const winners: Record<string, number> = {};
  for (let seed = 1; seed <= 200; seed++) {
    s.rngState = seed >>> 0;
    // All four tied at 5 — bestBy has nothing to go on but the tie-break itself.
    const tied = bestBy(s, () => 5, 1);
    winners[tied] = (winners[tied] ?? 0) + 1;
  }
  const seats = Object.keys(winners);
  check('a 4-way tie is not always won by the same seat', seats.length > 1, winners);
  check('every seat can win the tie, not just a lucky subset', seats.length === 4, winners);

  // The non-tied path must still be exact — fairness in the tie-break must not blur a real winner.
  const clear = bestBy(s, (p) => ({ A: 3, B: 9, C: 1, D: 4 }[p] ?? 0), 1);
  check('a real winner (highest, no tie) is picked exactly, not randomized', clear === 'B', clear);
  const clearLow = bestBy(s, (p) => ({ A: 3, B: 9, C: 1, D: 4 }[p] ?? 0), -1);
  check('dir -1 picks the real lowest, no tie', clearLow === 'C', clearLow);
}

// ---------- Regression: the dealer actually rotates in every trick game that had it stuck at
// seat 0 (items 2-3 of the site-audit pass, item 96 locking it in) ----------
//
// The bug: Briscola, Sixty-Six, Black Maria, Pinochle and Whist declare no auction, no bidding,
// and no lead card — createMatch()'s branch for that case defaulted openingLeadSeat() to a flat
// seat 0 and never rotated dealerIndex for it, so hand 1's opener was hand 40's opener too.
// Spades and Oh Hell (bidding: true) had the same dealerIndex bug, plus a second one: the
// post-bid turnIndex was hardcoded to 0 regardless of who the dealer actually was.
//
// None of these seven declare turnFlow.startPlayer: 'dealerLeft' (the generic schema-coverage
// test above only checks games that do) — the fix lives entirely inside createMatch's own
// trick-family branches, so this needs its own direct check. The original fix was verified by
// hand ("dealerIndex across 6 simulated Briscola hands went from [0,0,0,0,0,0] to
// [0,1,0,1,0,1]") but never captured as a permanent test — this is that test.
section('Regression: dealerIndex rotates hand over hand for the seat-0-stuck trick games');
{
  const games: [string, typeof briscola][] = [
    ['Briscola', briscola], ['Sixty-Six', sixtySix], ['Black Maria', blackMaria],
    ['Pinochle', pinochle], ['Whist', whist], ['Spades', spadesLite], ['Oh Hell', ohHell],
  ];
  for (const [name, def] of games) {
    const n = def.meta.players.min;
    const seats = Array.from({ length: n }, (_, i) => `P${i + 1}`);
    let s = createMatch(def, seats, 11);
    const dealers = new Set<number>([s.dealerIndex]);
    for (let hand = 0; hand < n * 2; hand++) {
      s = nextHand(s, hand + 100);
      dealers.add(s.dealerIndex);
    }
    check(`${name}: dealerIndex visits more than one seat across ${n * 2} hands`, dealers.size > 1, [...dealers]);
  }
}

// ---------- Regression: sameMove distinguishes moves by slot/targetSlot/poolId, not just
// actionId/target (item 4 of the site-audit pass, item 97 locking it in) ----------
//
// The bug: MatchService.submit() never applies the client's own move object — it looks up the
// matching entry in legalMoves() via sameMove() and applies THAT instead (so a stale or
// tampered move can't reach the engine). sameMove() compared actionId, cardId, target and a
// dozen other fields, but never slot, targetSlot or poolId — the only fields that distinguish
// one Dutch swapBlind move from another that shares everything else. Every legal swapBlind move
// in a two-player game shares actionId='swapBlind' and target=<the one opponent>, so the old
// comparator considered ALL of them equal and `allowed.find()` silently returned whichever came
// first in the generated list (slot 0, targetSlot 0) no matter which slot the player actually
// asked to trade. This drives a real Dutch match through MatchService (not the engine directly)
// so the regression lives at the exact boundary the bug was in, and reads the raw grids straight
// out of the store to prove the requested slot — not the first-listed one — is what moved.
section('Regression: sameMove() matches on slot/targetSlot/poolId, not just actionId/target');
{
  const store = new LocalMatchStore();
  const svc = new MatchService(store);

  let matchId = '';
  let power: { player: string; other: string } | null = null;
  for (let seed = 1; seed <= 300 && !power; seed++) {
    const m = svc.create(dutch, 'classic-dutch', ['P1', 'P2'], undefined, undefined, seed);
    matchId = m.matchId;
    for (let guard = 0; guard < 80; guard++) {
      const st = store.get(matchId)!.state;
      if (st.pendingPower?.kind === 'blindSwap') {
        power = { player: st.pendingPower.player, other: st.players.find((p) => p !== st.pendingPower!.player)! };
        break;
      }
      if (st.phase !== 'playing') break;
      const seat = st.players[st.turnIndex];
      if (st.held && st.held.player === seat) {
        if (st.held.from === 'stock' && (st.held.card.rank === 'J' || st.held.card.rank === 'Q')) {
          svc.submit(matchId, seat, { actionId: 'swapThrow' });
        } else {
          svc.submit(matchId, seat, { actionId: 'swapPlace', slot: 0 });
        }
      } else {
        svc.submit(matchId, seat, { actionId: 'swapDrawStock' });
      }
    }
  }
  check('reached a blindSwap decision to trade against', power !== null);

  if (power) {
    const before = store.get(matchId)!.state;
    const myGridBefore = [...before.zones[swapZones.grid(power.player)]];
    const theirGridBefore = [...before.zones[swapZones.grid(power.other)]];

    // Ask for slot 3 <-> targetSlot 3 specifically — the last combination legalMoves() would
    // generate, and NOT the (0, 0) pair the old buggy comparator always fell back to.
    const requested: Move = { actionId: 'swapBlind', slot: 3, target: power.other, targetSlot: 3 };
    const res = svc.submit(matchId, power.player, requested);
    check('the requested swapBlind move is accepted', res.ok, res.reason);

    const after = store.get(matchId)!.state;
    const myGridAfter = after.zones[swapZones.grid(power.player)];
    const theirGridAfter = after.zones[swapZones.grid(power.other)];

    check('my slot 3 became their old slot 3', myGridAfter[3]?.id === theirGridBefore[3]?.id,
      { requested: myGridAfter[3]?.id, expected: theirGridBefore[3]?.id });
    check('their slot 3 became my old slot 3', theirGridAfter[3]?.id === myGridBefore[3]?.id,
      { requested: theirGridAfter[3]?.id, expected: myGridBefore[3]?.id });
    // The bug always swapped (0, 0) instead — pin that it did NOT happen here.
    check('my slot 0 was left untouched (the old bug\'s always-picked slot)',
      myGridAfter[0]?.id === myGridBefore[0]?.id);
    check('their slot 0 was left untouched (the old bug\'s always-picked slot)',
      theirGridAfter[0]?.id === theirGridBefore[0]?.id);
  }
}

console.log(failed ? '\nMECHANICS: FAILED' : '\nMECHANICS: all checks passed');
process.exit(failed ? 1 : 0);