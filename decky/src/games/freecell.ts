import { GameDefinition } from '../engine/types';

// FreeCell — every card face up from the start, so it is pure planning. Four cells hold one
// card each; how many you can shift at once is set by how many cells and columns are free.
export const freecell: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-freecell',
    name: 'FreeCell',
    description:
      'The whole deck is dealt face up across eight columns — nothing is hidden, so every game is a puzzle rather than a gamble. Build columns down in alternating colours and the foundations up by suit. Four free cells each hold a single card, and the number still empty sets how long a run you can shift in one go. Almost every deal is winnable.',
    players: { min: 1, max: 1 },
    family: 'solitaire',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {},
  },
  zones: [],
  setup: [],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [], triggers: [], endConditions: [],
  scoring: { mode: 'lowestPoints', winner: 'lowestTotal', cardPoints: {}, target: null },
  solitaire: {
    decks: 1, columns: 8, deal: 'even', faceUp: 'all',
    build: 'alt-color', moveRun: 'built', empty: 'any',
    freeCells: 4, foundations: 4, foundationMode: 'place',
    stock: 'none', stockTurn: 0, redeals: 0,
  },
};
