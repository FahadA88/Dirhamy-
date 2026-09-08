import { GameDefinition } from '../engine/types';

// Spider — two decks, ten columns. You may stack any card on the next rank up, but you can
// only lift a run that is all one suit. Complete a King-to-Ace suit run and it leaves the board.
export const spider: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-spider',
    name: 'Spider',
    description:
      'Two decks across ten columns. Stack any card onto the next rank up regardless of suit — but you can only pick up a run that is all one suit, which is the whole difficulty. Assemble a King down to an Ace in a single suit and it clears itself off the board. When you are stuck, deal another row from the stock, one card to every column. Clear all eight runs to win.',
    players: { min: 1, max: 1 },
    family: 'solitaire',
  },
  deck: {
    base: 'standard54', includeJokers: false, deckCount: 2,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {},
  },
  zones: [],
  setup: [],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [], triggers: [], endConditions: [],
  scoring: { mode: 'lowestPoints', winner: 'lowestTotal', cardPoints: {}, target: null },
  solitaire: {
    decks: 2, columns: 10, deal: 'even', faceUp: 'top',
    build: 'down-any', moveRun: 'same-suit', empty: 'any',
    freeCells: 0, foundations: 8, foundationMode: 'auto-run',
    stock: 'deal-row', stockTurn: 0, redeals: 0,
  },
};
