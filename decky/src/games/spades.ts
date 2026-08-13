import { GameDefinition } from '../engine/types';

// Spades (lite) — the first TRICK-TAKING game. Same engine, a different family: instead of
// shedding onto a discard, players play one card into a trick, must follow the led suit, and
// the highest card (spades trump everything) takes the trick and leads the next.
// (Bidding and 2v2 partnerships are a planned follow-up; this scores by most tricks taken.)
export const spadesLite: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-spades',
    name: 'Spades',
    description:
      'Partners (seats 1&3 vs 2&4) bid how many tricks they will take, then play. Follow the led suit if you can; spades are trump. Make your combined bid to score 10 per trick bid (+1 per overtrick "bag"), or lose it. A nil bid (0) scores ±100. Highest team score wins.',
    players: { min: 4, max: 4 },
    family: 'trick-taking',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'trick', type: 'trick', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 13 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [
    { id: 'handsEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: null },
  trick: { trump: 'S', mustFollowSuit: true, aceHigh: true, scoreBy: 'mostTricks', bidding: true, partnerships: true },
};
