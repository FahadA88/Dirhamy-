import { GameDefinition } from '../engine/types';

// Napoleon — bid to play the hand alone, then try to survive everybody else.
//
// The auction is short and brutal: you are not bidding for a contract you share with a partner,
// you are bidding to be outnumbered. Whoever bids highest names trumps and plays the hand as a
// side of one against the whole table, and needs the number of tricks they promised out of five.
//
// Because the declarer is alone, the defenders are automatically a team — they do not have to
// agree on anything, they only have to take three tricks between them. That asymmetry is the
// game: bidding three is nearly free, bidding five is a declaration that you cannot be stopped,
// and the interesting bids are the ones in between.
export const napoleon: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-napoleon',
    name: 'Napoleon',
    description:
      'Five cards each and one short auction. Bid the number of tricks you will take — three, '
      + 'four or five — and name the trump suit, and if you win the auction you play the hand '
      + 'alone against everyone else at the table. Follow suit if you can. Make your bid and you '
      + 'score it; fall short and it costs you double while the defenders collect. Everyone else '
      + 'wins together, so all they need is one trick more than you can spare.',
    // Seats up to seven: five cards each means the pack has room to spare, and the
    // declarer being outnumbered six to one is more of the same joke, not less.
    players: { min: 4, max: 7 },
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
    // Five each, whatever the table size — the rest of the pack stays out of play.
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 5 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [
    { id: 'handsEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: 20 },
  trick: {
    trump: 'none',
    mustFollowSuit: true,
    aceHigh: true,
    scoreBy: 'mostTricks',
    // One against the table.
    soloDeclarer: true,
    numericAuction: {
      // Three of five is the smallest bid worth making; two would be less than half.
      minLevel: 3,
      maxLevel: 5,
      strains: ['C', 'D', 'H', 'S'],
      book: 0,
      trickValue: 2,
      overtrickValue: 1,
      // Going down costs what the bid was worth, twice over.
      undertrickValue: 4,
    },
  },
};
