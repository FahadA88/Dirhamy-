import { GameDefinition } from '../engine/types';

// President (a.k.a. Scum) — the first CLIMBING game. Beat the previous single card with a
// strictly higher one, or pass. When everyone passes, the pile clears and the last player to
// play leads again. First to empty their hand is President. Rank order runs 3 (low) … 2 (high).
export const president: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-president',
    name: 'President',
    description:
      'Beat the card on the pile with a strictly higher one, or pass. When everyone passes, the pile clears and the last player to play leads. Ranks run 3 (low) up to 2 (high). First to empty their hand wins.',
    players: { min: 3, max: 6 },
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
  climb: { order: ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'] },
};
