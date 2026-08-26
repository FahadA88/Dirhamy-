import { GameDefinition } from '../engine/types';

// Yukon — Klondike with no stock and one strange freedom.
//
// There is nowhere to draw from: every card is on the table from the first move, and you win or
// lose with what you were given. In exchange you may pick up ANY face-up card along with
// everything sitting on it, however badly ordered that stack happens to be — which is the whole
// game, because it turns a buried card from a dead end into a thing you can dig out.
export const yukon: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-yukon',
    name: 'Yukon',
    description:
      'Klondike with no stock at all — every card is dealt to the table and you play with what '
      + 'you can see. Build columns down in alternating colours and the foundations up by suit. '
      + 'The trick is that you may lift any face-up card together with everything on top of it, '
      + 'in whatever order, and drop the lot onto a card it fits. Only a King fills an empty '
      + 'column.',
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
    build: 'alt-color',
    // The move the game is named for: lift any face-up card with the whole pile on top of it,
    // however badly ordered, and drop the lot where the bottom card fits.
    moveRun: 'any', empty: 'king',
    freeCells: 0, foundations: 4, foundationMode: 'place',
    stock: 'none', stockTurn: 0, redeals: 0,
  },
};
