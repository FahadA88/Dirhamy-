import { GameDefinition } from '../engine/types';

// Scorpion — Spider's rules with Yukon's move, which turns out to be a different game from
// either of them.
//
// You build down in suit, and you can pick up any face-up card along with everything stacked on
// top of it no matter what order that is in. So a card buried under six wrong ones is not lost
// — it is a lever. Moving it drags the mess somewhere else, and the whole game is choosing
// where the mess should go.
//
// There is no stock to bail you out except three cards held back at the deal, and they are dealt
// into the first three columns whenever you ask for them, once. That is your entire margin. It
// is a game you lose to a decision rather than to the shuffle, which is the nicest thing you
// can say about a patience.
export const scorpion: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-scorpion',
    name: 'Scorpion',
    description:
      'Seven columns, the whole pack on the table, and three cards held back. Build down in '
      + 'suit. The move that makes it: pick up any face-up card together with everything sitting '
      + 'on top of it, however jumbled, and drop the whole stack where the bottom card fits — so '
      + 'a buried card is a lever rather than a loss. Assemble all four suits from King to Ace '
      + 'to win. One deal from the reserve, and no second chances.',
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
    decks: 1, columns: 7, deal: 'even', faceUp: 'top',
    // Four face up per column. The first three columns are half buried, which is where the
    // difficulty lives.
    faceUpCount: 4,
    // Same suit descending, not alternating colour: this is the Spider half.
    build: 'same-suit',
    // And this is the Yukon half.
    moveRun: 'any',
    empty: 'king',
    freeCells: 0, foundations: 4, foundationMode: 'auto-run',
    // The three held back, dealt out in one go when you ask.
    stock: 'deal-row', stockTurn: 0, redeals: 0,
    dealCount: 7,
  },
};
