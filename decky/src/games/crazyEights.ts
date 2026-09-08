import { GameDefinition } from '../engine/types';

// Crazy Eights as pure data. The engine runs this — there is no Crazy-Eights code.
export const crazyEights: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-crazy-eights',
    name: 'Crazy Eights',
    description:
      "Shed your hand by matching the top discard's rank or suit. Eights are wild — play one and name any suit. First to empty their hand wins.",
    players: { min: 2, max: 6 },
    family: 'shedding-matching',
  },
  deck: {
    base: 'standard54',
    includeJokers: false,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: { wild: { ranks: ['8'] } },
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    // Heads-up deals 7 each; three or more deals 5 — the real rule, not one fixed count.
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 5, countByPlayers: { 2: 7 } },
    { op: 'move', from: 'draw', to: 'discard', count: 1 },
  ],
  turnFlow: {
    order: 'clockwise',
    startPlayer: 'first',
    actionsPerTurn: { min: 1, max: 1 },
  },
  actions: [
    {
      id: 'playCard',
      target: { from: 'hand', select: 'one' },
      when: {
        any: [
          { matches: { cardProp: 'suit', equalsStateOrTopOf: ['activeSuit', 'discard'] } },
          { matches: { cardProp: 'rank', equalsTopOf: 'discard' } },
          { cardHasTag: 'wild' },
        ],
      },
      effects: [
        { op: 'move', card: '$target', to: 'discard' },
        { op: 'setState', var: 'activeSuit', value: '$target.suit' },
        {
          op: 'if',
          cond: { cardHasTag: 'wild' },
          then: [{ op: 'chooseSuit', setState: 'activeSuit' }],
        },
      ],
    },
    {
      id: 'drawCard',
      when: { not: { existsLegal: 'playCard' } },
      effects: [{ op: 'move', from: 'draw', to: 'hand', count: 1 }],
    },
  ],
  triggers: [
    { on: 'drawPileEmpty', do: [{ op: 'reshuffleDiscardInto', zone: 'draw', keepTop: true }] },
  ],
  endConditions: [
    { id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: {
    mode: 'firstToEmptyWins',
    cardPoints: { '8': 50, K: 10, Q: 10, J: 10, '10': 10, default: 'rankValue', A: 1 },
    target: 100,
    winner: 'firstOut',
  },
};
