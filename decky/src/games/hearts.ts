import { GameDefinition } from '../engine/types';

// Hearts — the avoidance trick-taker, and the game that pulled four separate mechanics into the
// engine: a pre-hand exchange whose direction rotates left/right/across/hold, a suit you may not
// lead until it has been broken, a forced opening lead (2♣), and shooting the moon.
export const hearts: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-hearts',
    name: 'Hearts',
    description:
      'Take as few points as possible. Every heart costs 1 and the Queen of Spades costs 13. Before each hand you pass three cards — left, then right, then across, then a hold hand with no pass. Whoever holds the 2♣ leads it, no points may be discarded on the opening trick, and hearts cannot be led until one has been broken. Take all 26 and you shoot the moon: you score nothing and everyone else takes the lot. First to 100 ends the match — lowest score wins.',
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
  scoring: { mode: 'lowestPoints', winner: 'lowestTotal', cardPoints: {}, target: 100 },
  handPass: { count: 3, rotation: ['left', 'right', 'across', 'hold'] },
  trick: {
    trump: 'none',
    mustFollowSuit: true,
    aceHigh: true,
    scoreBy: 'penalty',
    penaltyPoints: { H: 1, SQ: 13 },
    brokenSuit: 'H',
    leadCard: 'C2',
    noPenaltyFirstTrick: true,
    shootTheMoon: true,
  },
};
