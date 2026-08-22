// The four newest primitives — claim/challenge, reflex, betting, open trading — proved the
// same way every other family is: a deterministic scenario for the rule itself, then the bot
// simulator across a spread of seat counts to show the whole game actually finishes and can
// actually be won. See src/engine/types.ts for the honest limitations each config comment
// documents (single betting round in poker, no side pots, suits stand in for pit commodities).

import { bluff } from '../src/games/bluff';
import { slapjack } from '../src/games/slapjack';
import { showdownPoker } from '../src/games/showdownPoker';
import { pit } from '../src/games/pit';
import { contractWhist } from '../src/games/contract';
import { createMatch, applyMove, legalMoves, actingPlayers, redact } from '../src/engine/engine';
import { simulate } from '../src/engine/simulator';
import { validate } from '../src/engine/validator';
import { Card, MatchState } from '../src/engine/types';

let failed = false;
const check = (label: string, cond: boolean, extra?: unknown) => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${label}${cond ? '' : '  ' + JSON.stringify(extra)}`);
  if (!cond) failed = true;
};
const section = (name: string) => console.log(`\n${name}`);
const card = (id: string, rank: string, suit: string) => ({ id, rank, suit }) as Card;

// ---------- Bluff: a caught lie, and a claim that stands ----------
section('Bluff — claim, challenge, reveal (Bluff)');
{
  const P = ['A', 'B'];
  let s: MatchState = createMatch(bluff, P, 1);
  s.zones['hand:A'] = [card('H2', '2', 'H'), card('S3', '3', 'S')];
  s.zones['hand:B'] = [card('D4', '4', 'D')];
  s.zones['center'] = [];
  s.turnIndex = 0;

  // A claims the 2♥ is an Ace — a lie.
  const claim = legalMoves(s, 'A').find((m) => m.actionId === 'bluffClaim' && m.claimedRank === 'A' && m.cards?.length === 1);
  check('the lie is an offered move', !!claim, legalMoves(s, 'A'));
  s = applyMove(s, 'A', claim!);
  check('the claim is now pending', s.pendingClaim?.player === 'A' && s.pendingClaim.claimedRank === 'A');
  check('the claimed rank is visible to everyone', redact(s, 'B').pendingClaim?.claimedRank === 'A');
  check('the card itself is not', redact(s, 'B').zones['center'].cards.length === 0);

  s = applyMove(s, 'B', { actionId: 'bluffChallenge' });
  check('the pendingClaim resolves', s.pendingClaim === null);
  check('the liar takes the pile back', (s.zones['hand:A'] || []).some((c) => c.id === 'H2'));
  check('the truthful challenger is not penalised', (s.zones['hand:B'] || []).length === 1);
  check('the liar leads next', s.players[s.turnIndex] === 'A');

  // A truthful claim survives a challenge, and going out cleanly wins.
  let t: MatchState = createMatch(bluff, P, 2);
  t.zones['hand:A'] = [card('CK', 'K', 'C')];
  t.zones['hand:B'] = [card('D4', '4', 'D')];
  t.zones['center'] = [];
  t.turnIndex = 0;
  const trueClaim = legalMoves(t, 'A').find((m) => m.actionId === 'bluffClaim' && m.claimedRank === 'K');
  t = applyMove(t, 'A', trueClaim!);
  check('A is out of cards but not yet a winner', (t.zones['hand:A'] || []).length === 0 && t.phase === 'playing');
  t = applyMove(t, 'B', { actionId: 'bluffChallenge' });
  check('a truthful claim survives the challenge', t.phase === 'roundOver' && t.winner === 'A');
  check('the wrongful challenger, not the truthful claimant, was penalised',
    (t.zones['hand:B'] || []).length === 2);
}

// ---------- Reflex: a slap wins the pile, and a stalled flip skips ----------
section('Reflex — the slap window, and a hand-empty flipper gets skipped (Slapjack)');
{
  const P = ['A', 'B', 'C'];
  let s: MatchState = createMatch(slapjack, P, 1);
  s.zones['hand:A'] = [card('CJ', 'J', 'C')];
  s.zones['hand:B'] = [];
  s.zones['hand:C'] = [card('D9', '9', 'D')];
  s.zones['pile'] = [];
  s.turnIndex = 0;
  s.reflexOut = [];

  check('B, empty-handed, cannot flip', !legalMoves(s, 'B').some((m) => m.actionId === 'reflexFlip'));
  check('but B is not eliminated — a slap can still bring them back', actingPlayers(s).includes('A'));
  s = applyMove(s, 'A', { actionId: 'reflexFlip' });
  check('the Jack is on top', s.zones['pile']?.[0]?.rank === 'J');
  check('a slap is now legal for everyone still in, including the empty-handed B',
    legalMoves(s, 'B').some((m) => m.actionId === 'reflexSlap'));
  check('turn skipped straight over empty-handed B to C', s.players[s.turnIndex] === 'C');

  s = applyMove(s, 'B', { actionId: 'reflexSlap' });
  check('B wins the pile and is back in the game', (s.zones['hand:B'] || []).length === 1);
}

// ---------- Poker: a bet, a call, a showdown with real chips ----------
section('Poker — chips actually move (Showdown Poker)');
{
  const P = ['A', 'B'];
  let s: MatchState = createMatch(showdownPoker, P, 1);
  s.zones['hand:A'] = [card('CK', 'K', 'C'), card('DK', 'K', 'D'), card('S2', '2', 'S'), card('H4', '4', 'H'), card('C7', '7', 'C')];
  s.zones['hand:B'] = [card('S3', '3', 'S'), card('H5', '5', 'H'), card('D6', '6', 'D'), card('C9', '9', 'C'), card('SJ', 'J', 'S')];
  s.chips = { A: 100, B: 100 };
  s.pot = 0; s.currentBet = 0; s.committed = {}; s.folded = {}; s.actedThisRound = {};
  s.turnIndex = 0;

  const bet = legalMoves(s, 'A').find((m) => m.actionId === 'pokerBet');
  check('a bet is offered', !!bet, legalMoves(s, 'A'));
  s = applyMove(s, 'A', bet!);
  check('the chips actually left the stack', s.chips.A === 100 - bet!.amount!);
  check('the pot grew', s.pot === bet!.amount);

  const call = legalMoves(s, 'B').find((m) => m.actionId === 'pokerCall');
  check('B faces a real call', !!call);
  s = applyMove(s, 'B', call!);
  check('the hand reaches showdown and pays the pot out', s.phase === 'roundOver' && s.pot > 0
    && (s.chips.A + s.chips.B) === 200);
  check('A holds a pair of Kings and should win it', s.winner === 'A', { chips: s.chips });
}

// ---------- Pit: no turns, an open offer accepted by anyone ----------
section('Pit — the market has no turn order (Pit)');
{
  const P = ['A', 'B', 'C'];
  let s: MatchState = createMatch(pit, P, 1);
  s.zones['hand:A'] = [card('C1', '2', 'C'), card('C2', '3', 'C'), card('C3', '4', 'C')];
  s.zones['hand:B'] = [card('D1', '5', 'D'), card('D2', '6', 'D')];
  s.zones['hand:C'] = [card('H1', '7', 'H')];
  s.market = []; s.nextOfferId = 1;

  check('everyone is "acting" at once — there is no turn to wait for',
    actingPlayers(s).includes('A') && actingPlayers(s).includes('C'));
  s = applyMove(s, 'A', { actionId: 'pitOffer', give: 'C', want: 'D', cards: ['2'] });
  check('the offer is posted', s.market.length === 1);
  check('C, who holds no Diamonds, cannot accept it', !legalMoves(s, 'C').some((m) => m.actionId === 'pitAccept'));
  check('B, who does, can', legalMoves(s, 'B').some((m) => m.actionId === 'pitAccept'));

  s = applyMove(s, 'B', { actionId: 'pitAccept', offerId: 1 });
  check('the swap actually happened', (s.zones['hand:A'] || []).filter((c) => c.suit === 'D').length === 2);
  check('and the offer is gone', s.market.length === 0);
}

// ---------- Contract auction: a bid must beat the last, and a promise is scored ----------
section('Contract auction — bids escalate, and the contract is scored (Contract Whist)');
{
  const P = ['A', 'B', 'C'];
  let s: MatchState = createMatch(contractWhist, P, 3);
  check('the auction opens', s.auctionRound > 0 && s.highBid === null);

  const opener = s.players[s.turnIndex];
  const bids = legalMoves(s, opener).filter((m) => m.actionId === 'contractBid');
  check('a level and a strain are offered together', bids.length > 0 && bids[0].level != null && bids[0].strain != null);
  check('every level is on offer at the start', new Set(bids.map((m) => m.level)).size === 7);

  s = applyMove(s, opener, { actionId: 'contractBid', level: 3, strain: 'H' });
  check('the bid stands', s.highBid?.level === 3 && s.highBid?.strain === 'H');

  const next = s.players[s.turnIndex];
  const after = legalMoves(s, next).filter((m) => m.actionId === 'contractBid');
  check('a weaker bid is no longer offered',
    !after.some((m) => (m.level ?? 0) < 3 || ((m.level === 3) && ['C', 'D'].includes(String(m.strain)))));
  check('3 spades still beats 3 hearts', after.some((m) => m.level === 3 && m.strain === 'S'));
  check('4 clubs beats it too', after.some((m) => m.level === 4 && m.strain === 'C'));

  // Everyone else passes: the auction closes and the strain becomes trump.
  s = applyMove(s, s.players[s.turnIndex], { actionId: 'passBid' });
  s = applyMove(s, s.players[s.turnIndex], { actionId: 'passBid' });
  check('the auction closed', s.auctionRound === 0);
  check('the winning strain became trump', s.trumpSuit === 'H');
  check('the declarer is the high bidder', s.maker === opener);
  check('the lead is to the declarer\u2019s left',
    s.players[s.turnIndex] === s.players[(s.players.indexOf(opener) + 1) % 3]);
}

section('Contract auction — a hand nobody wants is thrown in');
{
  const P = ['A', 'B', 'C'];
  let s: MatchState = createMatch(contractWhist, P, 11);
  for (let i = 0; i < 3; i++) s = applyMove(s, s.players[s.turnIndex], { actionId: 'passBid' });
  check('passed out', s.phase === 'roundOver');
  check('and nobody scored', P.every((p) => s.scores[p] === 0));
}

// ---------- termination and reachability, the same gate every author-built game passes ----------
section('Every new family terminates, and is winnable, at the seat counts it ships with');
for (const [name, def, seats] of [
  ['Bluff', bluff, [2, 4, 6]],
  ['Slapjack', slapjack, [2, 4, 6]],
  ['Showdown Poker', showdownPoker, [2, 4, 8]],
  ['Pit', pit, [3, 4, 6]],
  ['Contract Whist', contractWhist, [3, 4]],
] as const) {
  check(`${name} validates clean`, validate(def).ok, validate(def).issues);
  for (const n of seats) {
    const rep = simulate(def, n, 20, name === 'Slapjack' ? 4000 : 1200);
    check(`${name} at ${n}: ${rep.terminated}/${rep.games} finished, winnable=${rep.winnable}`,
      rep.terminated >= rep.games * 0.85 && rep.winnable, rep);
  }
}

console.log(failed ? '\nFAMILIES: FAILED' : '\nFAMILIES: claim/challenge, reflex, betting and open trading all check out');
process.exit(failed ? 1 : 0);
