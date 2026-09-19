import { GameDefinition } from '../engine/types';

// Forty Thieves — two decks, ten columns of four, and almost nothing allowed.
//
// It is the strict one. You build down in suit, not in colour, so a black nine takes exactly one
// card in the whole pack rather than two. You move one card at a time, never a run. The stock
// turns one card at a time and there is no redeal, so every card you pass is a card you have
// passed for good.
//
// Which makes it a game about the empty column. That is the only place a stack can be broken
// down into, the only slack in the entire layout, and getting one — and then not wasting it —
// is what the whole hour is about. It is won maybe one time in ten, and that is with careful
// play.
export const fortyThieves: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-forty-thieves',
    name: 'Forty Thieves',
    description:
      'Two packs, ten columns of four cards, all of them face up — you can see almost everything '
      + 'and still lose. Build down in suit only, and move one card at a time, never a run. Any '
      + 'card may go into an empty column, which is the only slack you get. Turn the stock one '
      + 'card at a time with no second pass, so a card you skip is gone. Build all eight '
      + 'foundations from Ace to King. Hard, and honestly so.',
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
    decks: 2, columns: 10, deal: 'even', faceUp: 'all',
    // Forty on the table, sixty-four in the stock.
    dealCount: 4,
    build: 'same-suit',
    // One at a time. The restriction the game is built on.
    moveRun: 'single',
    empty: 'any',
    freeCells: 0, foundations: 8, foundationMode: 'place',
    stock: 'waste', stockTurn: 1, redeals: 0,
  },
};
