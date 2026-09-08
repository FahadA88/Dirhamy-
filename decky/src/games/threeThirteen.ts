import { GameDefinition } from '../engine/types';

// Three Thirteen — rummy where the wild card is a different rank every hand.
//
// The first hand is dealt three cards and threes are wild. The next is four cards and fours are
// wild, and so on up to thirteen cards and kings, eleven hands in all. Nothing else about the
// rules changes, and that is enough to make every hand feel different: an early hand is over in
// two turns and the wild is nearly useless because three cards is already a meld; a late hand is
// a twelve-card puzzle where four of your cards are whatever you need them to be.
//
// It is the friendliest rummy on the site for the same reason — the wilds mean you are almost
// never dealt a hopeless hand, so nobody spends eight minutes drawing and discarding nothing.
//
// The match itself is exactly those eleven hands, not a race to a score — `handsCap` stops it
// there whether or not anyone has reached `target`, the same way a poker sitting ends on its own
// hand count rather than a score. Lowest total across all eleven still wins.
export const threeThirteen: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-three-thirteen',
    name: 'Three Thirteen',
    description:
      'Rummy with a wild rank that climbs one hand at a time — threes are wild in a three-card '
      + 'hand, fours in a four-card hand, on up to kings in a thirteen-card hand, eleven hands '
      + 'in all. Draw one, discard one, and lay your cards down as sets of three of a rank or '
      + 'runs of three in a suit. Go out and everyone else counts what they are still holding '
      + 'against them. Lowest total across all eleven hands wins.',
    players: { min: 2, max: 4 },
    family: 'rummy',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    // The rank the game is named for.
    tags: { wild: { ranks: ['3'] } },
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
    { id: 'melds', type: 'pile', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    // Three on hand one, growing by one every hand up to thirteen on hand eleven.
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 3, growPerHand: 1 },
    { op: 'move', from: 'draw', to: 'discard', count: 1 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'dealerLeft', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [
    { id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: {
    mode: 'lowestPoints',
    winner: 'lowestTotal',
    // Face value, with the picture cards at ten and the ace low — being caught with a wild
    // three costs the least, which is the reward for a card that was doing the most work.
    cardPoints: { A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 10, Q: 10, K: 10 },
    target: 100,
    // Eleven hands — three through king — and the match is over regardless of score.
    handsCap: 11,
  },
  rummy: {
    setMin: 3,
    runMin: 3,
    layOff: true,
    wilds: true,
    // One per meld: enough to rescue a hand, not enough to build one out of nothing.
    maxWildsPerMeld: 1,
    // deck.tags.wild names hand one's wild (three); each later hand's wild is one rank further
    // up rankOrder — four, five, ... king by hand eleven.
    wildRotatesByHand: true,
  },
};
