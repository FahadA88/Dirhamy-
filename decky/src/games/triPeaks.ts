import { GameDefinition } from '../engine/types';

// Tri Peaks — Golf, but the whole point is the chain.
//
// Same core move: take any exposed card one rank above or below the one on the waste, and it
// goes onto the waste and becomes the new target. What changes is the shape. The board is wide
// and shallow rather than deep, so at any moment you have a lot of choices and most of them are
// dead ends — and because the sequence wraps, a king takes an ace and keeps going.
//
// That is where the game is. Taking the seven that is in front of you usually ends the run;
// taking the other seven, three columns over, keeps it alive for another nine cards. The stock
// is small and every card you draw from it is a run you failed to keep going.
export const triPeaks: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-tri-peaks',
    name: 'Tri Peaks',
    description:
      'A wide, shallow board and one card face up. Take any exposed card that is one rank above '
      + 'or below it and play it onto the pile, where it becomes the new target — then keep '
      + 'going. The sequence wraps, so a King takes an Ace and an Ace takes a King, and a good '
      + 'chain can run half the board. Stuck? Turn a card from the stock, but every one you turn '
      + 'is a chain you let die. Clear the board to win.',
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
    // Wide and shallow: ten columns of three, against Golf's seven of five. More live cards at
    // once, which is what gives the chain somewhere to go.
    decks: 1, columns: 10, deal: 'even', faceUp: 'all',
    dealCount: 3,
    build: 'up-or-down', moveRun: 'single', empty: 'none',
    wrap: true,
    wasteIsTarget: true,
    freeCells: 0, foundations: 0, foundationMode: 'place',
    stock: 'waste', stockTurn: 1, redeals: 0,
  },
};
