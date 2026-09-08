import { GameDefinition } from '../engine/types';

// War — the first COMPARISON game. The deck is split between two players into face-down piles.
// Each flip, both reveal their top card; the higher rank takes both. Ties trigger a "war"
// (three cards down, then flip again). Take all the cards to win. No decisions — just flip.
export const war: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-war',
    name: 'War',
    description:
      'The deck is split between two players. Each flip, both reveal their top card — the higher card takes both. A tie means war: three cards face-down, then flip again. Win by taking every card — or, if it runs long enough to hit the round cap, by holding more of them when it does.',
    players: { min: 2, max: 2 },
    family: 'comparison',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'battle', type: 'pile', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: true, faceDown: true, visibility: 'none', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    { op: 'dealAll', from: 'draw', to: 'hand' },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [{ id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' }],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: null },
  war: { aceHigh: true, roundCap: 800 },
};
