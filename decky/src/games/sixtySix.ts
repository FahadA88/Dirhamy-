import { GameDefinition } from '../engine/types';

// Sixty-Six — two players, twenty cards, and marriages you are paid for announcing.
//
// It is a trick game with a second economy running underneath it. Holding the king and queen of
// a suit is worth twenty points, or forty in trumps, which you claim before play — so a hand
// can be won by the cards you were dealt as much as by the tricks you take. The two halves pull
// against each other: the king and queen you were paid for are also two of your best cards, and
// spending them on tricks is exactly what you were paid not to have to do.
//
// The pack is the other half. Nine to ace only, and the ten sits between the king and the ace,
// because in this game a card's rank is its value — an ace is 11, a ten is 10, and a nine is
// worth nothing at all.
export const sixtySix: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-sixty-six',
    name: 'Sixty-Six',
    description:
      'Two players, a twenty-card pack from the nine up. Before play you score for marriages — '
      + 'a king and queen of one suit is 20, and in trumps it is 40. Then it is tricks: follow '
      + 'suit, hearts are trump, and the cards carry their value rather than their rank. An Ace '
      + 'is 11, a Ten is 10, a King 4, a Queen 3, a Jack 2, and a Nine nothing. The ten outranks '
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
    // Ten each: the whole twenty-card pack, so nothing is hidden from the count.
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 10 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [
    { id: 'handsEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: 66 },
  trick: {
    trump: 'H',
    mustFollowSuit: true,
    aceHigh: true,
    scoreBy: 'penalty',
    penaltyPoints: { A: 11, '10': 10, K: 4, Q: 3, J: 2, '9': 0 },
    melds: [
      // Trumps first — a royal marriage is worth two ordinary ones.
      { name: 'the royal marriage', cards: ['HK', 'HQ'], points: 40 },
      { name: 'a marriage in spades', cards: ['SK', 'SQ'], points: 20 },
      { name: 'a marriage in diamonds', cards: ['DK', 'DQ'], points: 20 },
      { name: 'a marriage in clubs', cards: ['CK', 'CQ'], points: 20 },
    ],
  },
};
