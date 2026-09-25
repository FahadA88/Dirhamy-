import { GameDefinition } from '../engine/types';

// Slapjack — the first REFLEX game. The deck is dealt out whole, face down, one pile per
// player. On your turn you flip your top card face up onto the shared pile. Whenever a Jack
// lands on top, anyone — not just whoever's turn it is — may slap the pile first and take it
// all into the bottom of their hand. Last player still holding cards wins.
export const slapjack: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-slapjack',
    name: 'Slapjack',
    description:
      'Flip your top card onto the shared pile on your turn. The instant a Jack lands on top — even on top of another Jack — slap first and the whole pile is yours; the slap button only ever appears when it is genuinely valid, so there is no risk in trying. Last player holding cards wins.',
    // Seats up to eight: a reflex game gets sharper with more people watching the same
    // pile, not duller.
    players: { min: 2, max: 8 },
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
  reflex: { slapRanks: ['J'] },
};
