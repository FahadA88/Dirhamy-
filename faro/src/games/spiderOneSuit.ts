import { GameDefinition } from '../engine/types';

// Spider in one suit — the same game with the accident taken out of it.
//
// Four-suit Spider is famously brutal, and most of the brutality is not strategy: you stack a
// nine on a ten because it is the only nine you can reach, and then discover you cannot lift it
// again because it is the wrong suit. One suit removes that entirely. Every card of a rank is
// interchangeable, so every run you build is a run you can move, and what is left is the real
// problem — the order the columns are in and how few empty ones you can afford.
//
// Eight copies of the spades, 104 cards, exactly as many as the four-suit game.
export const spiderOneSuit: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-spider-1',
    name: 'Spider (One Suit)',
    description:
      'Spider with a pack of nothing but spades. Stack any card onto the next rank up and — '
      + 'because there is only one suit — you can always pick the run up again. Assemble a King '
      + 'down to an Ace and it clears itself off the board. When you are stuck, deal another row, '
      + 'one card to every column. Clear all eight runs to win. The place to learn Spider.',
    players: { min: 1, max: 1 },
    family: 'solitaire',
  },
  deck: {
    base: 'standard54', includeJokers: false, deckCount: 8,
    // Eight packs, spades only.
    excludeSuits: ['C', 'D', 'H'],
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {},
  },
  zones: [],
  setup: [],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [], triggers: [], endConditions: [],
  scoring: { mode: 'lowestPoints', winner: 'lowestTotal', cardPoints: {}, target: null },
  solitaire: {
    decks: 8, columns: 10, deal: 'even', faceUp: 'top',
    build: 'down-any', moveRun: 'same-suit', empty: 'any',
    freeCells: 0, foundations: 8, foundationMode: 'auto-run',
    stock: 'deal-row', stockTurn: 0, redeals: 0,
  },
};
