import { GameDefinition } from '../engine/types';

// Spades — the first TRICK-TAKING game, and a real MATCH: teams bid, play repeated hands, and
// race to 500 — unless a team's running score drops to -200 first, which ends the match as an
// immediate loss for them (the classic Spades "bust" rule).
export const spadesLite: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-spades',
    name: 'Spades',
    description:
      'Partners (seats 1&3 vs 2&4) bid how many tricks they will take, then play. Follow the led suit if you can; spades are trump. Make your combined bid to score 10 per trick bid (+1 per overtrick "bag"), or lose it. A nil bid (0) scores ±100. First team to 500 wins the match — unless a team drops to -200 first, which loses it instantly.',
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
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: 500, bust: -200 },
  trick: { trump: 'S', mustFollowSuit: true, aceHigh: true, scoreBy: 'mostTricks', bidding: true, partnerships: true },
};
