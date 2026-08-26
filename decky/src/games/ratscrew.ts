import { GameDefinition } from '../engine/types';

// Egyptian Ratscrew — Slapjack with more ways to be wrong.
//
// Where Slapjack has one trigger, this has two: a jack as before, and a pair — the top card
// matching the one under it. That second trigger is the whole difference, because it means the
// pile can become slappable on a card that looks like nothing, and you have to be watching what
// went down before rather than only what is going down now.
export const ratscrew: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-ratscrew',
    name: 'Egyptian Ratscrew',
    description:
      'Flip your top card onto the shared pile on your turn. Slap it when a Jack lands — or '
      + 'when the top two cards match, which is the one you will miss. First hand down takes '
      + 'the whole pile into the bottom of theirs. The slap only appears when it is genuinely '
      + 'valid, so there is nothing to lose by trying. Last player still holding cards wins.',
    players: { min: 2, max: 6 },
    family: 'reflex',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'pile', type: 'pile', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: true, faceDown: true, visibility: 'none', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    { op: 'dealAll', from: 'draw', to: 'hand' },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: null },
  reflex: { slapRanks: ['J'], slapMatch: true },
};
