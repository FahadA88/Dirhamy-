import { GameDefinition } from '../engine/types';

// Sixty-Six — two players, twenty-four cards, and marriages you are paid for announcing.
//
// It is a trick game with a second economy running underneath it. Holding the king and queen of
// a suit is worth twenty points, or forty in trumps, which you claim before play — so a hand
// can be won by the cards you were dealt as much as by the tricks you take. The two halves pull
// against each other: the king and queen you were paid for are also two of your best cards, and
// spending them on tricks is exactly what you were paid not to have to do.
//
// The pack is the other half. Nine to ace only — twenty-four cards, of which twelve are dealt
// and twelve sit in a stock with the turned trump under them. Six in hand at a time, drawn back
// up after every trick, so the hand you are holding is never the hand you will finish with.
//
// The ten sits between the king and the ace,
// because in this game a card's rank is its value — an ace is 11, a ten is 10, and a nine is
// worth nothing at all.
export const sixtySix: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-sixty-six',
    name: 'Sixty-Six',
    description:
      'Two players, a twenty-four-card pack from the nine up. Before play you score for marriages — '
      + 'a king and queen of one suit is 20, and in trumps it is 40. Then it is tricks: follow '
      + 'suit and the cards carry their value rather than their rank. Six cards each, dealt in '
      + 'threes; the next card is turned for trump and sits under the stock, and you draw back '
      + 'up to six after every trick, and the last trick is worth ten on its own. An Ace is 11, '
      + 'a Ten is 10, a King 4, a Queen 3, a Jack 2, and a Nine nothing. The ten outranks '
      + 'the king, which is why it is the card that decides most tricks. Sixty-six points wins.',
    players: { min: 2, max: 2 },
    family: 'trick-taking',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    excludeRanks: ['2', '3', '4', '5', '6', '7', '8'],
    // The ten above the king: what it is worth, not what it is printed as.
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
    // Six each. The other twelve are the stock — and the pack is twenty-four, not twenty: nine
    // through ace in four suits. The old comment here was wrong twice over.
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 6 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [
    { id: 'handsEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: 66 },
  trick: {
    // Turned off the stock, not fixed. See turnedTrump.
    trump: 'none',
    turnedTrump: true,
    turnedTrumpFrom: 'stock',
    stockDraw: true,
    // Ten to whoever takes the last one — a real scoring rule, not a flourish.
    lastTrickBonus: 10,
    mustFollowSuit: true,
    aceHigh: true,
    scoreBy: 'penalty',
    penaltyPoints: { A: 11, '10': 10, K: 4, Q: 3, J: 2, '9': 0 },
    // One pattern rather than four literal entries — a king and queen of any one suit, worth
    // double when that suit is trump.
    meldPatterns: [
      { name: 'marriage', ranks: ['K', 'Q'], points: 20, doubleInTrump: true },
    ],
  },
};
