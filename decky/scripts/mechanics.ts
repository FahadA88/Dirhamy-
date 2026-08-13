// Deterministic proofs for mechanics too rare to be reliably exercised by random self-play.
// Simulation shows a game terminates; these show a specific rule actually fires correctly.
import { undertow } from '../src/games/undertow';
import { createMatch, legalMoves, applyMove, actingPlayers, redact } from '../src/engine/engine';
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

console.log(failed ? '\nMECHANICS: FAILED' : '\nMECHANICS: all checks passed');
process.exit(failed ? 1 : 0);
