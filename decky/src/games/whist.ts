import { GameDefinition } from '../engine/types';

// Whist — the game every other trick game is a variation on.
//
// There is nothing to it. Thirteen cards each, follow suit if you can, highest card of the led
// suit takes the trick unless somebody trumps, and the partnership that takes more than six
// tricks scores the difference. No bidding, no contract, no passing, no penalty cards.
//
// That is the point of having it. Everything Bridge and Spades and Hearts add, they add to
// this, and the shape underneath is much easier to learn without them. It is also still a real
// game: with no bid to aim at, every trick is worth the same and the whole skill is in signals
// and in remembering what has gone.
export const whist: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-whist',
    name: 'Whist',
    description:
      'Four players in two partnerships, thirteen cards each, the whole pack dealt out. Follow '
      + 'suit if you can. Highest card of the suit led takes the trick, or the highest heart if '
      + 'anyone is void and plays one. Six tricks are the book and cost nothing; every trick '
      + 'above six scores your side a point. First to five wins. No bidding — every trick counts '
      + 'the same, and the game is in what you remember.',
    players: { min: 4, max: 4, step: 2 },
    family: 'trick-taking',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
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
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: 5 },
  trick: {
    trump: 'H',
    mustFollowSuit: true,
    aceHigh: true,
    scoreBy: 'mostTricks',
    partnerships: true,
  },
};
