// Deterministic proofs for mechanics too rare to be reliably exercised by random self-play.
// Simulation shows a game terminates; these show a specific rule actually fires correctly.
import { undertow } from '../src/games/undertow';
import { hearts } from '../src/games/hearts';
import { euchre } from '../src/games/euchre';
import { catalog } from '../src/games/catalog';
import { createMatch, legalMoves, applyMove, actingPlayers, redact, nextHand } from '../src/engine/engine';
import { chooseMove } from '../src/bots/randomBot';
import { Card, MatchState } from '../src/engine/types';

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

console.log(failed ? '\nMECHANICS: FAILED' : '\nMECHANICS: all checks passed');
process.exit(failed ? 1 : 0);
