import { GameDefinition } from '../engine/types';

// Skat — three players, thirty-two cards, and one of them against the other two.
//
// The rule that makes it itself: every jack is a trump. Not the trump jack and its colour-mate
// the way Euchre does it — all four, taken out of their printed suits entirely and ranked
// clubs, spades, hearts, diamonds above every other trump. A jack of diamonds does not follow
// diamonds; holding one does not stop you being void in it.
//
// And it is not won by taking tricks. There are 120 points in the pack — aces are 11, tens are
// 10, kings 4, queens 3, jacks 2 — and the declarer needs 61 of them. Four fat tricks can beat
// eight thin ones, which is why a hand is played for the cards in it rather than the count.
//
// Deliberately not the whole game: the bid and the declaration happen in one step rather than
// bidding a value and naming the game afterwards, there is no skat to pick up and bury, and no
// grand or null contracts. What is here is the shape — bid, play alone, and make 61.
export const skat: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-skat',
    name: 'Skat',
    description:
      'Three players, a 32-card deck, and the auction winner plays alone against the other two. '
      + 'Every jack is a trump — clubs, spades, hearts, diamonds, above everything else — and a '
      + 'jack never follows its printed suit. There are 120 card points in the pack and the '
      + 'declarer needs 61 of them: aces 11, tens 10, kings 4, queens 3, jacks 2. Make it and '
      + 'you score your bid; miss and it costs you double.',
    players: { min: 3, max: 3 },
    family: 'trick-taking',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    // The German pack: nothing below the seven.
    excludeRanks: ['2', '3', '4', '5', '6'],
    // The ten sits between the king and the ace, because of what it is worth rather than what
    // it is printed as.
    rankOrder: ['7', '8', '9', 'J', 'Q', 'K', '10', 'A'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'trick', type: 'trick', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    // Ten each; the last two are the skat, left face down and out of play here.
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 10 },
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
    // The card points travel to whoever takes the trick, which is what the contract is settled
    // against. Every one of these is a real Skat value.
    scoreBy: 'penalty',
    penaltyPoints: { A: 11, '10': 10, K: 4, Q: 3, J: 2 },
    jacksAreTrumps: true,
    soloDeclarer: true,
    numericAuction: {
      // The bid is what the hand is worth if it comes off. Bidding higher pays more and costs
      // more, which is the entire negotiation.
      minLevel: 18,
      maxLevel: 36,
      strains: ['D', 'H', 'S', 'C'],
      book: 0,
      trickValue: 1,
      overtrickValue: 0,
      undertrickValue: 0,
      // 61 of the 120 in the pack.
      makeOnCardPoints: 61,
    },
  },
};
