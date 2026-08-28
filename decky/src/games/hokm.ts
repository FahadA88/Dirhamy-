import { GameDefinition } from '../engine/types';

// Hokm — a custom four-player partnership game. Not a reproduction of the traditional 52-card,
// no-bid, first-to-seven-hands Hokm; this is its own variant, built to a specific brief: trump
// is not fixed by the dealer, it is won in a bid, and both of the two jokers actually matter.
//
// The deck is short on purpose. Every 2, 3, 4 and 5 comes out, and so does the 6 of diamonds and
// the 6 of clubs specifically — not the 6 of hearts or spades, which is exactly the kind of
// exclusion a rank-only rule can't say, so it is spelled out as two literal cards. 52 - 16 - 2 +
// 2 jokers = 36, which splits into four hands of nine with nothing left over.
//
// The auction is a number, not a level-and-strain pair with a book added on: a bid of 6 promises
// six tricks, not six-plus-some-fixed-extra. Whoever wins the auction names trump. If everybody
// passes, the deal is not thrown in — the dealer's side is stuck with a mandatory bid of five and
// the dealer names trump, so a hand is never wasted for want of anyone willing to commit.
//
// Both jokers beat everything, dealt with by the same `jokerRank: 'trump'` Five Hundred already
// proved. What makes them a pair rather than one card twice is timing: the colored joker (the
// first one built per deck, see src/ui/Card.tsx) cannot be played before the fourth trick — play
// it early and it is just a wasted top card — and the plain joker cannot be HELD past the third:
// whoever has it is forced to spend it there, no matter how the trick is running. Because the
// two windows never overlap, the two jokers can never actually be compared against each other in
// the same trick, which is what "the colored one beats the plain one" would mean.
export const hokm: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-hokm',
    name: 'Hokm',
    description:
      'Partners, a 36-card deck (no 2s through 5s, and the 6 of diamonds and clubs are out too), '
      + 'and trump chosen by bid rather than fixed by the dealer. Nine cards each. Bid a number of '
      + 'tricks from 6 to 9 — each bid must beat the last — and whoever wins names trump. Pass it '
      + 'around and nobody bids? The dealer’s side is stuck with 5 and the dealer names trump, '
      + 'so a hand is never wasted. Play out all nine tricks: whichever side ends up with more of '
      + 'them — the bidders if they reached their number, the defence if they didn’t — '
      + 'scores one point per trick THAT side actually took. Both jokers beat every other card. '
      + 'The colored joker cannot be played before the fourth trick; the plain joker cannot be '
      + 'held past the third — whoever has it must play it there.',
    players: { min: 4, max: 4, step: 2 },
    family: 'trick-taking',
  },
  deck: {
    base: 'standard54',
    includeJokers: true,
    jokerCount: 2,
    excludeRanks: ['2', '3', '4', '5'],
    // The two specific sixes no excludeRanks/excludeSuits pair can say on its own.
    excludeCards: ['D6', 'C6'],
    rankOrder: ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
    tags: {
      // Two otherwise-identical cards (same rank, same suit: 'JOKER') — the only thing that can
      // still tell them apart is which physical copy each one is.
      coloredJoker: { ranks: [], cards: ['JOKER1'] },
      plainJoker: { ranks: [], cards: ['JOKER2'] },
    },
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'trick', type: 'trick', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 9 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [
    { id: 'handsEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: 25 },
  trick: {
    trump: 'none',
    mustFollowSuit: true,
    aceHigh: true,
    scoreBy: 'mostTricks',  // unused — numericAuction settles the hand through scoreContract
    partnerships: true,
    numericAuction: {
      minLevel: 6,
      maxLevel: 9,
      strains: ['C', 'D', 'H', 'S'],
      book: 0,
      // trickValue/overtrickValue both 1 with book 0: a made contract scores exactly the tricks
      // the bidding side actually took, not the bid plus a separate per-trick bonus.
      trickValue: 1,
      overtrickValue: 1,
      undertrickValue: 1,  // unused — defendersScoreOwnTricks overrides the undertrick branch
      // Stick the dealer: an all-pass auction is not thrown in here, it hands the dealer's side
      // a mandatory 5.
      dealerMustBid: 5,
      // A failed contract is not priced by how far short it fell — the defence simply takes the
      // hand and scores the tricks they actually hold, same as a made contract does for the bidders.
      defendersScoreOwnTricks: true,
    },
    // Both jokers rank above every trump — this is the exact mechanism Five Hundred uses for its
    // one joker; Hokm's timing restrictions below are what turn a single top card into a pair.
    jokerRank: 'trump',
  },
  rules: [
    {
      id: 'init-joker-clock',
      name: 'Start the joker-timing clock at zero each hand',
      when: 'handStart',
      then: [{ op: 'setVarNum', var: 'tricksPlayed', value: { lit: 0 } }],
    },
    {
      id: 'advance-joker-clock',
      name: 'Advance the joker-timing clock as tricks complete',
      when: 'trickWon',
      then: [{ op: 'setVarNum', var: 'tricksPlayed', value: { add: [{ stateVar: 'tricksPlayed' }, { lit: 1 }] } }],
    },
  ],
  playRestrictions: [
    {
      id: 'colored-joker-waits',
      name: 'The colored joker cannot be played before the fourth trick',
      if: {
        all: [
          { cardHasTag: 'coloredJoker' },
          { cmp: { left: { stateVar: 'tricksPlayed' }, op: '<', right: { lit: 3 } } },
        ],
      },
      note: 'Playing it early would just burn the game’s one guaranteed late winner for nothing.',
    },
    {
      id: 'plain-joker-forced',
      name: 'The plain joker must be played by the third trick',
      if: {
        all: [
          { not: { cardHasTag: 'plainJoker' } },
          { cmp: { left: { stateVar: 'tricksPlayed' }, op: '==', right: { lit: 2 } } },
          { handHas: { tag: 'plainJoker', minCount: 1 } },
        ],
      },
      note: 'Whoever is holding it has to spend it on the third trick, win or lose that trick.',
    },
  ],
};
