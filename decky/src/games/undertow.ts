import { GameDefinition } from '../engine/types';

// Undertow — a Big Two/Tichu-flavored climbing game exercising combos + bombs. Beat the pile
// with a single card, a pair, or a triple of matching rank — a reply must match the same
// shape. A four-of-a-kind is a bomb: it can be played at ANY time, even out of turn, beating
// whatever's on the pile regardless of shape. First to empty their hand wins.
export const undertow: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-undertow',
    name: 'Undertow',
    description:
      "Beat the pile with a single card, a pair, or a triple — your reply has to match the same shape as what's down. A four-of-a-kind is a bomb: play it any time, even out of turn, and it beats anything. First to empty their hand wins.",
    players: { min: 3, max: 5 },
    family: 'climbing',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    { op: 'dealAll', from: 'draw', to: 'hand' },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [{ id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' }],
  scoring: { mode: 'lowestPoints', winner: 'lowestTotal', cardPoints: {}, target: null },
  climb: { order: ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'], combos: true, bombSize: 4 },
};
