import { GameDefinition } from '../engine/types';

// Trade Winds — a shedding game exercising the passCards effect. Match the top discard by
// suit or rank; whenever a Jack lands, a "trade wind" sweeps the table and every player,
// simultaneously, passes one card of their choosing to their left. First to empty their hand wins.
export const tradeWinds: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-trade-winds',
    name: 'Trade Winds',
    description:
      "Shed your hand by matching the top discard's rank or suit. Whenever a Jack is played, a trade wind sweeps the table — everyone passes one card to their left, all at once. First to empty their hand wins.",
    players: { min: 3, max: 6 },
    family: 'shedding-matching',
  },
  deck: {
    base: 'standard54',
    includeJokers: false,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: { wind: { ranks: ['J'] } },
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 7 },
    { op: 'move', from: 'draw', to: 'discard', count: 1 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [
    {
      id: 'playCard',
      target: { from: 'hand', select: 'one' },
      when: {
        any: [
          { matches: { cardProp: 'suit', equalsTopOf: 'discard' } },
          { matches: { cardProp: 'rank', equalsTopOf: 'discard' } },
        ],
      },
      effects: [{ op: 'move', card: '$target', to: 'discard' }],
    },
    {
      id: 'drawCard',
      when: { not: { existsLegal: 'playCard' } },
      effects: [{ op: 'move', from: 'draw', to: 'hand', count: 1 }],
    },
  ],
  triggers: [
    { on: 'cardPlayed', cardHasTag: 'wind', do: [{ op: 'passCards', direction: 'left' }] },
    { on: 'drawPileEmpty', do: [{ op: 'reshuffleDiscardInto', zone: 'draw', keepTop: true }] },
  ],
  endConditions: [
    { id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: {
    mode: 'firstToEmptyWins',
    cardPoints: { K: 10, Q: 10, J: 10, '10': 10, default: 'rankValue', A: 1 },
    target: 100,
    winner: 'firstOut',
  },
};
