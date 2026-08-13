// Deterministic proofs for mechanics too rare to be reliably exercised by random self-play.
// Simulation shows a game terminates; these show a specific rule actually fires correctly.
import { undertow } from '../src/games/undertow';
import { hearts } from '../src/games/hearts';
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

console.log(failed ? '\nMECHANICS: FAILED' : '\nMECHANICS: all checks passed');
process.exit(failed ? 1 : 0);
