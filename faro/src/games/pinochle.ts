import { GameDefinition } from '../engine/types';

// Pinochle — two games at once, played with the same twelve cards.
//
// Before a card is played you are paid for what you were dealt: a queen of spades with a jack
// of diamonds is a pinochle and worth forty, four aces are worth a hundred, and the king and
// queen of a suit are a marriage. Only then does the trick game start, and the cards you were
// paid for are the same ones you now have to decide whether to spend.
//
// The deck is the other half of what makes it: 9 through ace, twice over, so every card in the
// pack has an identical twin. Holding one of a pair is ordinary; holding both is worth
// something, which is why the melds double when you have them.
//
// Not the whole game: no bidding for the widow and no passing, so the melds and the tricks are
// the two halves rather than three.
export const pinochle: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-pinochle',
    name: 'Pinochle',
    description:
      'A 48-card deck — 9, 10, jack, queen, king, ace, twice each. Twelve cards apiece. Before '
      + 'play you score for the combinations you were dealt: a marriage is a king and queen of '
      + 'one suit, a pinochle is the queen of spades with the jack of diamonds, and a run in '
      + 'trumps is worth more than either. Then it is trick-taking — follow suit, spades are '
      + 'trump, highest card takes it. First to the target wins.',
    players: { min: 4, max: 4, step: 2 },
    family: 'trick-taking',
  },
  deck: {
    base: 'standard54',
    includeJokers: false,
    // The pinochle pack: everything below the nine comes out, and what is left is doubled.
    excludeRanks: ['2', '3', '4', '5', '6', '7', '8'],
    deckCount: 2,
    // 10 sits above the king in this game, which is the one ranking oddity worth knowing.
    rankOrder: ['9', 'J', 'Q', 'K', '10', 'A'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'trick', type: 'trick', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 12 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [
    { id: 'handsEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: 150 },
  trick: {
    trump: 'S',
    mustFollowSuit: true,
    aceHigh: true,
    scoreBy: 'mostTricks',
    partnerships: true,
    melds: [
      // The one the game is named after.
      { name: 'a pinochle', cards: ['SQ', 'DJ'], points: 40 },
      // One of each, across the suits.
      { name: 'a hundred aces', cards: ['CA', 'DA', 'HA', 'SA'], points: 100 },
      { name: 'eighty kings', cards: ['CK', 'DK', 'HK', 'SK'], points: 80 },
      { name: 'sixty queens', cards: ['CQ', 'DQ', 'HQ', 'SQ'], points: 60 },
      { name: 'forty jacks', cards: ['CJ', 'DJ', 'HJ', 'SJ'], points: 40 },
      // The run in trumps, which subsumes the royal marriage sitting inside it.
      { name: 'a run in trumps', cards: ['SA', 'S10', 'SK', 'SQ', 'SJ'], points: 150 },
    ],
    // A marriage in each suit — one pattern instead of the four separate entries this used to
    // be, and trump's still comes out double the way it always has.
    meldPatterns: [
      { name: 'marriage', ranks: ['K', 'Q'], points: 20, doubleInTrump: true },
    ],
  },
};
