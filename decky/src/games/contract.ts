import { GameDefinition } from '../engine/types';

// Contract Whist — a Bridge-style auction on a game small enough to finish.
//
// The point of this one is the auction. Everything else is plain trick-taking: follow suit if
// you can, highest card of the led suit takes it, trump beats everything. What is new is that
// before a card is played the table negotiates, and the winner of that negotiation has made a
// promise — a number of tricks — which the hand is then scored against.
//
// Honestly not Bridge: no doubles, no vulnerability, no rubber, and no dummy. The declarer
// plays their own cards rather than their partner's. Seven cards each keeps a hand to a few
// minutes, so the auction is the interesting part rather than a preamble to a long defence.
export const contractWhist: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-contract-whist',
    name: 'Contract Whist',
    description:
      'Bid a number and a suit, each bid beating the last. Win the auction and you have promised '
      + 'that many tricks — make it and you score, fall short and the other side does.',
    // Seats up to seven: the hand shrinks as the table grows, so the pack still deals.
    players: { min: 3, max: 7 },
    family: 'trick',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    { id: 'trick', type: 'trick', ordered: true, faceDown: false, visibility: 'all', shared: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 7 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: 50 },
  trick: {
    mustFollowSuit: true,
    aceHigh: true,
    // The auction names it. 'none' is the starting state, not the answer.
    trump: 'none',
    scoreBy: 'mostTricks',
    numericAuction: {
      minLevel: 1,
      maxLevel: 7,
      // Weakest to strongest, exactly as they rank in the real game.
      strains: ['C', 'D', 'H', 'S', 'NT'],
      // A seven-card hand has no six-trick book to clear — the level IS the promise here, which
      // is what makes a small deal work at all.
      book: 0,
      trickValue: 10,
      overtrickValue: 3,
      undertrickValue: 12,
      slamBonus: 30,
    },
  },
};
