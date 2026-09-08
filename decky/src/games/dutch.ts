import { GameDefinition } from '../engine/types';

// Dutch — four cards you are not allowed to look at.
//
// Also met as Cabo, Pablo, Cambio and Golf, depending on who taught you. You get one look at
// two of your four at the start and then they go face down for good. From there it is memory
// against arithmetic: you are trying to hold the lowest total on the table, out of cards you
// cannot see, half of which you swapped in blind.
//
// The turn is small — take the top of the pile or the top of the stock, then either put it into
// your row and throw out whatever was there, or throw it away. Throwing is not a wasted turn,
// because the small cards do things: a seven or an eight buys you a look at one of your own, a
// nine or a ten a look at somebody else's, and a jack or a queen lets you trade one of yours
// for one of theirs with neither of you looking. That last one is the source of most of the
// laughter and all of the misery.
//
// And at any point instead of drawing you may call it. Everyone else gets one more turn, the
// cards come over, and the lowest total takes the round — unless you called and were not
// lowest, which costs you ten and serves you right.
export const dutch: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-dutch',
    name: 'Dutch',
    description:
      'Four cards each, face down, and you may look at two of them once. Then take a card from '
      + 'the stock or the pile and either slide it into your row — throwing out whatever was '
      + 'there — or throw it away. Sevens and eights buy you a look at one of your own, nines '
      + 'and tens a look at somebody else’s, and jacks and queens trade one of yours for one '
      + 'of theirs with neither of you looking. Call "Dutch" when you think you are lowest. '
      + 'Everyone gets one more turn, then the cards come over. Be wrong and it costs you ten.',
    players: { min: 2, max: 6 },
    family: 'swap',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'dealerLeft', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [],
  scoring: {
    mode: 'lowestPoints',
    winner: 'lowestTotal',
    // Face value, aces low. A king is the worst card you can be holding and an ace the best,
    // which is the exact opposite of everywhere else on this site.
    cardPoints: {
      A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
      '8': 8, '9': 9, '10': 10, J: 11, Q: 12, K: 13,
    },
    // Rounds are short; the match is the thing. First past a hundred loses it.
    target: 100,
  },
  swap: {
    slots: 4,
    peekAtStart: 2,
    peekSelfRanks: ['7', '8'],
    peekOtherRanks: ['9', '10'],
    blindSwapRanks: ['J', 'Q'],
    callName: 'Dutch',
    // A safety valve, not a rules interaction — see SwapConfig.turnCap. Real Dutch has no such
    // limit; self-play does, because a bot table with the wrong heuristics can otherwise spin.
    turnCap: 40,
    callPenalty: 10,
  },
};
