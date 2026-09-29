import { GameDefinition } from '../engine/types';

// "Switch" — a Crazy-Eights cousin with action cards. Same engine, different DATA.
// This game exists to stress-test the schema: it exercises includeJokers, multiple card
// tags, and the skipNext / reverseOrder / forceDraw effects driven by cardPlayed triggers.
export const switchGame: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-switch',
    name: 'Switch',
    description:
      'Match rank or suit like Crazy Eights, but 2s make the next player draw two and miss a turn, 8s skip, Queens reverse direction, and Jokers are wild. First to empty their hand wins.',
    players: { min: 2, max: 6 },
    family: 'shedding-matching',
  },
  deck: {
    base: 'standard54',
    includeJokers: true,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {
      wild: { ranks: ['JOKER'] },
      skip: { ranks: ['8'] },
      reverse: { ranks: ['Q'] },
      drawTwo: { ranks: ['2'] },
    },
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
          { matches: { cardProp: 'suit', equalsStateOrTopOf: ['activeSuit', 'discard'] } },
          { matches: { cardProp: 'rank', equalsTopOf: 'discard' } },
          { cardHasTag: 'wild' },
        ],
      },
      effects: [
        { op: 'move', card: '$target', to: 'discard' },
        { op: 'setState', var: 'activeSuit', value: '$target.suit' },
        { op: 'if', cond: { cardHasTag: 'wild' }, then: [{ op: 'chooseSuit', setState: 'activeSuit' }] },
      ],
    },
    {
      id: 'drawCard',
      when: { not: { existsLegal: 'playCard' } },
      effects: [{ op: 'move', from: 'draw', to: 'hand', count: 1 }],
    },
  ],
  triggers: [
    { on: 'cardPlayed', cardHasTag: 'skip', do: [{ op: 'skipNext' }] },
    { on: 'cardPlayed', cardHasTag: 'reverse', do: [{ op: 'reverseOrder' }] },
    // Draw-two: the next player draws two AND misses their turn.
    { on: 'cardPlayed', cardHasTag: 'drawTwo', do: [{ op: 'forceDraw', target: 'next', from: 'draw', count: 2 }, { op: 'skipNext' }] },
    { on: 'drawPileEmpty', do: [{ op: 'reshuffleDiscardInto', zone: 'draw', keepTop: true }] },
  ],
  endConditions: [
    { id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: {
    mode: 'firstToEmptyWins',
    cardPoints: { JOKER: 50, '8': 20, K: 10, Q: 10, J: 10, '10': 10, default: 'rankValue', A: 1 },
    target: 100,
    winner: 'firstOut',
  },
};
