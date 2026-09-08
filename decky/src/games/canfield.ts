import { GameDefinition } from '../engine/types';

// Canfield — the patience that does not start from aces.
//
// One card is turned up at the deal and its rank becomes the base for all four foundations, so
// a game might run 7,8,9…K and then wrap round through A,2 to finish on the six. That single
// change makes the whole game different: you are not waiting for aces, you are waiting for one
// particular rank, and the sequence is a circle rather than a line — a king goes on an ace in
// the tableau too.
//
// The other half is the reserve: thirteen cards face up in a stack, of which you can only ever
// reach the top one. You can see exactly what is coming and mostly cannot get at it, which is
// the reason the game is hard and the reason it is named after a casino owner who sold it as a
// bet.
//
// Not the full parlour rules: an empty column here takes any card rather than refilling itself
// from the reserve automatically.
export const canfield: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-canfield',
    name: 'Canfield',
    description:
      'One card is turned up at the start and every foundation builds from that rank, wrapping '
      + 'round the top back to the ace. Four columns, and a reserve of thirteen face-up cards '
      + 'you can see but only take from the top. Build the columns down in alternating colours '
      + '— the sequence wraps here too, so a king sits on an ace. Turn the stock three at a '
      + 'time, as many passes as you like.',
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
    decks: 1,
    columns: 4,
    deal: 'even',
    // One card per column. The other thirty-four go to the stock, which is the point — the
    // tableau is tiny and almost everything you need is still buried.
    dealCount: 1,
    faceUp: 'top',
    build: 'alt-color',
    moveRun: 'built',
    empty: 'any',
    freeCells: 0,
    foundations: 4,
    foundationMode: 'place',
    stock: 'waste',
    stockTurn: 3,
    redeals: -1,
    // The two rules that make it Canfield rather than a small Klondike.
    foundationStart: 'dealt',
    reserve: 13,
  },
};
