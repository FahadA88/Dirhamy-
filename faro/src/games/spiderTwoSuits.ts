import { GameDefinition } from '../engine/types';

// Spider in two suits — the middle setting, and the one most Spider players actually live at.
//
// One suit is a puzzle you can nearly always solve; four is one you nearly always cannot. Two
// gives you the thing that makes Spider Spider — a run you built and now cannot lift — without
// making it the whole game. Half your stacks come apart and half do not, so which suit you put
// a card on is a decision rather than an accident.
//
// Four copies of the black cards: 104, the same pack size as always.
export const spiderTwoSuits: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-spider-2',
    name: 'Spider (Two Suits)',
    description:
      'Spider with spades and clubs only. Stack any card onto the next rank up, but you can '
      + 'still only lift a run that is all one suit — so half the stacks you build will come '
      + 'apart on you and half will not. Assemble a King down to an Ace in one suit and it '
      + 'clears itself. Deal a row when stuck. Clear all eight runs to win.',
    players: { min: 1, max: 1 },
    family: 'solitaire',
  },
  deck: {
    base: 'standard54', includeJokers: false, deckCount: 4,
    excludeSuits: ['D', 'H'],
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {},
  },
  zones: [],
  setup: [],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [], triggers: [], endConditions: [],
  scoring: { mode: 'lowestPoints', winner: 'lowestTotal', cardPoints: {}, target: null },
  solitaire: {
    decks: 4, columns: 10, deal: 'even', faceUp: 'top',
    build: 'down-any', moveRun: 'same-suit', empty: 'any',
    freeCells: 0, foundations: 8, foundationMode: 'auto-run',
    stock: 'deal-row', stockTurn: 0, redeals: 0,
  },
};
