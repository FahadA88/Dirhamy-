import { GameDefinition } from '../engine/types';

// Klondike — the solitaire. Seven columns dealt in a staircase with only the bottom card
// face up, four foundations built up by suit from the ace, and a stock you turn three at a
// time for as many passes as you like.
export const klondike: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-klondike',
    name: 'Solitaire',
    description:
      'Seven columns, each hiding all but its last card. Build the columns downward in alternating colours, and the four foundations upward by suit starting with the aces. Only a King may move into an empty column. Turn the stock three at a time, as many times round as you like. Clear all fifty-two to win.',
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
    decks: 1, columns: 7, deal: 'triangle', faceUp: 'top',
    build: 'alt-color', moveRun: 'built', empty: 'king',
    freeCells: 0, foundations: 4, foundationMode: 'place',
    stock: 'waste', stockTurn: 3, redeals: -1,
  },
};
