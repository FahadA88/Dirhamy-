import { GameDefinition } from '../engine/types';

// Bluff ("I Doubt It" / Cheat) — the first CLAIM/CHALLENGE game. The deck is dealt out whole;
// on your turn you play 1-4 cards of your own choosing face down, claiming they are all some
// rank you name (which may or may not be true). Anyone else may call it a lie at any point
// before the next claim supersedes it. Whoever turns out to be wrong takes the whole pile.
// First to empty their hand — and stay unclaimed — wins.
export const bluff: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-bluff',
    name: 'Bluff',
    description:
      'The deck is dealt out whole. On your turn, play 1-4 cards face down and claim a rank — true or not. Anyone else may call your bluff, but only until your next claim — after that this one stands unchallenged for good. Whoever is wrong takes the whole pile. First to empty their hand, unclaimed, wins.',
    players: { min: 2, max: 6 },
    family: 'bluff',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {},
  },
  zones: [
    { id: 'center', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'center' },
    { op: 'dealAll', from: 'center', to: 'hand' },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: null },
  bluff: {},
};
