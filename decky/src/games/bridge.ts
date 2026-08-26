import { GameDefinition } from '../engine/types';

// Bridge — the full deal, the full auction, the real book.
//
// Contract Whist is already in the catalogue as the small version: seven cards, no partner, no
// book to clear. This is the game it was a sketch of. Thirteen cards each, partners sitting
// opposite, and a level that sits on top of six — so a bid of one promises seven tricks and a
// bid of seven promises all thirteen, which is what makes the auction a negotiation about the
// last few rather than a guess about the first.
//
// Honestly not the whole of Bridge, and the same omissions Contract Whist documents: no doubles
// or redoubles, no vulnerability, no rubber, and no dummy — declarer plays their own cards
// rather than exposing partner's. What is here is the part that makes Bridge Bridge: bidding a
// contract you then have to make.
export const bridge: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-bridge',
    name: 'Bridge',
    description:
      'Partners sitting opposite, thirteen cards each, and an auction before a card is played. '
      + 'Bid a level and a strain — clubs, diamonds, hearts, spades or no-trump — each bid '
      + 'beating the last on level first and strain second. The level sits on top of a book of '
      + 'six, so a bid of three promises nine tricks. Three passes settle it, the winning side '
      + 'becomes declarer, and the hand is scored on whether they were right. No doubles, no '
      + 'vulnerability and no dummy — declarer plays their own hand.',
    players: { min: 4, max: 4, step: 2 },
    family: 'trick-taking',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'trick', type: 'trick', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 13 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [
    { id: 'handsEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: 100 },
  trick: {
    trump: 'none',
    mustFollowSuit: true,
    aceHigh: true,
    scoreBy: 'mostTricks',
    partnerships: true,
    numericAuction: {
      minLevel: 1,
      maxLevel: 7,
      strains: ['C', 'D', 'H', 'S', 'NT'],
      // The six-trick book, which is the one thing Contract Whist could not afford on a
      // seven-card deal and the thing that makes a Bridge auction mean what it means.
      book: 6,
      trickValue: 30,
      overtrickValue: 10,
      undertrickValue: 50,
      slamBonus: 500,
    },
  },
};
