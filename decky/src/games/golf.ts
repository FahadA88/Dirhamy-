import { GameDefinition } from '../engine/types';

// Golf — the patience with no foundations at all.
//
// Everything goes to one waste pile, and the only rule is that a card must be one rank above or
// below whatever is showing. No suits, no colours, no building up in order — just a chain, and
// the question of whether you can keep it going long enough to clear seven columns before the
// stock runs out.
export const golf: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-golf',
    name: 'Golf',
    description:
      'Seven columns, all face up, and one waste pile that takes everything. Play any exposed '
      + 'card that is one rank above or below the card showing on the waste — suits do not '
      + 'matter at all. When you are stuck, turn a card from the stock. Clear every column to '
      + 'win, and the fewer cards you leave behind, the better the round.',
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
    decks: 1, columns: 7, deal: 'even', faceUp: 'all',
    // Rank-only building, one card at a time, and nothing may be put into an empty column —
    // which together is exactly the shape of Golf.
    build: 'up-or-down', moveRun: 'single', empty: 'none',
    // The waste is where cards GO in this game, and clearing the columns is the win. Both are
    // the opposite of every other patience here.
    wasteIsTarget: true,
    freeCells: 0, foundations: 1, foundationMode: 'place',
    stock: 'waste', stockTurn: 1, redeals: 0,
    dealCount: 5,
  },
};
