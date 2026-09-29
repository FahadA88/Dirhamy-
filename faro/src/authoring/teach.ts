// Teach mode (item 39): "the game plays itself and says why, one move at a time. Cheaper than
// a tutorial and it works for all forty-nine." Reuses the same bots that already fill every
// practice-mode seat and every solitaire hint (see chooseMove and chooseSolitaireMove) — teach
// mode is just that self-play, stepped through instead of run to the end, with a line of plain
// English narrating each move as it happens.
//
// The "why" here is deliberately modest: a fact the RULES themselves can prove (follows the
// suit led, is the only legal move, is void and forced to throw off) rather than a claim about
// what the bot was privately thinking. Where no such structural fact applies, the line says so
// honestly instead of inventing a strategy the bot never actually reasoned through.

import { GameDefinition, MatchState, Move } from '../engine/types';
import { applyMove, legalMoves } from '../engine/engine';
import { chooseMove } from '../bots/randomBot';
import { chooseSolitaireMove } from '../bots/solitaireBot';

export interface TeachExplanation {
  what: string;
  why: string;
}

const SUIT_SYMBOLS: Record<string, string> = { C: '♣', D: '♦', H: '♥', S: '♠' };
const suitOf = (s?: string) => (s ? SUIT_SYMBOLS[s] ?? s : '');

function cardOf(state: MatchState, playerId: string, cardId?: string) {
  return (state.zones[`hand:${playerId}`] || []).find((c) => c.id === cardId);
}

function cardLabel(state: MatchState, playerId: string, cardId?: string): string {
  const c = cardOf(state, playerId, cardId);
  return c ? `${c.rank}${suitOf(c.suit)}` : '';
}

// Solitaire's own cards never sit in a `hand:*` zone — they're on the tableau, in a free cell,
// on the waste — so a card's label there has to be found by searching every zone this move
// could name, not assumed to be in one player's hand the way every other family's cards are.
function cardById(state: MatchState, cardId?: string) {
  if (!cardId) return undefined;
  for (const zone of Object.values(state.zones)) {
    const c = zone.find((x) => x.id === cardId);
    if (c) return c;
  }
  return undefined;
}

function genericWhat(m: Move): string {
  switch (m.actionId) {
    case 'bid': return `Bids ${m.choice ?? ''}`.trim();
    case 'contractBid': return `Bids ${m.level ?? ''} ${m.strain ?? ''}`.trim();
    case 'passBid': return 'Passes';
    case 'orderUp': return 'Orders it up';
    case 'nameTrump': return `Names ${m.choice ?? 'trump'} as trump`;
    case 'drawStock': case 'fishDraw': return 'Draws';
    case 'drawDiscard': return 'Takes the discard';
    case 'drawCard': return 'Draws a card';
    case 'knock': return 'Knocks';
    case 'ask': return `Asks for ${m.rank ?? 'a rank'}s`;
    case 'climbPass': return 'Passes';
    case 'climbBomb': return 'Drops a bomb';
    case 'bluffChallenge': return 'Calls it a lie';
    case 'reflexFlip': case 'warFlip': return 'Flips';
    case 'reflexSlap': return 'Slaps';
    case 'pokerCheck': return 'Checks';
    case 'pokerCall': return 'Calls';
    case 'pokerFold': return 'Folds';
    case 'pokerRaise': return 'Raises';
    case 'pokerBet': return 'Bets';
    case 'callSet': return 'Calls that set';
    case 'setPass': return 'Passes';
    case 'solDraw': case 'solDeal': return 'Turns the stock';
    case 'solRedeal': return 'Goes through the stock again';
    default: return 'Plays';
  }
}

/**
 * One move, glossed in plain English: what it is, and — grounded in the rules, not the bot's
 * head — why it was legal or forced. `seat` is whoever's move this is; the explanation is
 * always from their hand's point of view.
 */
export function explainMove(state: MatchState, seat: string, move: Move): TeachExplanation {
  const legal = legalMoves(state, seat);
  const onlyChoice = legal.length <= 1;

  if (move.actionId === 'playToTrick') {
    const card = cardLabel(state, seat, move.cardId);
    if (!state.lead) return { what: card, why: 'opens the trick' };
    const hand = state.zones[`hand:${seat}`] || [];
    const played = cardOf(state, seat, move.cardId);
    if (played?.suit === state.lead) return { what: card, why: `follows the ${suitOf(state.lead)} led` };
    const hasLeadSuit = hand.some((c) => c.suit === state.lead);
    return {
      what: card,
      why: hasLeadSuit ? 'plays off-suit rather than follow — a trump, or spent deliberately' : `has no more ${suitOf(state.lead)} — forced to play something else`,
    };
  }

  if (move.actionId === 'rummyDiscard') {
    return { what: cardLabel(state, seat, move.cardId), why: onlyChoice ? 'the only card left to throw' : 'the card least useful to keep' };
  }
  if (move.actionId === 'meld') return { what: 'Lays down a meld', why: 'a complete set or run, out of the hand for good' };
  if (move.actionId === 'layOff') return { what: 'Lays off a card', why: 'adds onto a meld already down on the table' };
  if (move.actionId === 'knock') return { what: 'Knocks', why: 'deadwood is low enough to end the hand now' };
  if (move.actionId === 'drawDiscard') return { what: 'Takes the discard', why: 'it improves the hand more than drawing blind would' };
  if (move.actionId === 'climbPlay') {
    return { what: 'Plays', why: onlyChoice ? 'the only group that beats the pile' : 'the smallest group that still beats the pile' };
  }
  if (move.actionId === 'climbPass') return { what: 'Passes', why: 'nothing in hand beats what is down' };
  if (move.actionId === 'passBid') return { what: 'Passes', why: 'the hand is not strong enough to open the bidding' };
  if (move.actionId === 'bid' || move.actionId === 'contractBid' || move.actionId === 'orderUp' || move.actionId === 'nameTrump') {
    return { what: genericWhat(move), why: 'reading the hand as strong enough to back this' };
  }
  if (move.actionId === 'dealerDiscard' || move.actionId === 'buryDiscard') {
    return { what: cardLabel(state, seat, move.cardId) || genericWhat(move), why: 'the weakest card, spared from the hand that has to keep the rest' };
  }
  if (move.actionId === 'playCard') {
    const card = cardLabel(state, seat, move.cardId);
    return { what: card, why: onlyChoice ? 'the only legal play' : 'clears a card the hand has no better use for' };
  }
  if (move.actionId === 'choosePass') {
    const card = cardLabel(state, seat, move.cardId);
    return { what: `Passes ${card}`, why: 'the most dangerous card left to hold onto' };
  }
  if (move.actionId === 'solMove') {
    const card = cardById(state, move.cardId);
    const label = card ? `${card.rank}${suitOf(card.suit)}` : 'a card';
    const to = move.to ?? '';
    if (to.startsWith('found')) return { what: `${label} → foundation`, why: 'a card the foundations can finally take' };
    if (to.startsWith('free')) return { what: `${label} → free cell`, why: 'parked aside to free up a play underneath it' };
    if (to === 'waste') return { what: `${label} → waste`, why: 'nowhere on the tableau will take it yet' };
    return { what: `${label} → tableau`, why: 'sits legally on the card already there, and may uncover one below it' };
  }

  return { what: genericWhat(move), why: onlyChoice ? 'the only legal move on offer' : 'the move the built-in player judged best' };
}

/** Picks the next move, the same way any bot-held seat would — solitaire's own dedicated bot
 *  for a solitaire game, the general one otherwise. `seen` only matters for solitaire's loop
 *  detection; pass the same Set across an entire watched game. */
export function pickTeachMove(
  def: GameDefinition,
  state: MatchState,
  seat: string,
  botSeed: number,
  seen: Set<string>,
): { move: Move | null; botSeed: number } {
  if (def.solitaire) {
    const move = chooseSolitaireMove(state, seen, (st, m) => applyMove(st, seat, m));
    return { move, botSeed };
  }
  return chooseMove(state, seat, botSeed);
}
