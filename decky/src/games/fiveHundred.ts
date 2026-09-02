import { GameDefinition } from '../engine/types';

// Five Hundred — Australia's national card game, and the one place a joker earns its keep.
//
// A 43-card pack: the twos and threes come out along with the black fours, leaving a deck that
// divides evenly three ways with three left over for the kitty. The joker stays in, and it is
// not decoration — it is the highest card in the game, above the right bower, above everything.
//
// The auction is a contract: a level and a suit, each bid beating the last, and the winning
// side has promised that many tricks. Bidding at all is the risk, because falling short costs
// you what making it would have paid.
//
// The kitty is not flavour text: whoever wins the auction picks up all three of its cards, sight
// unseen by anyone else until that moment, and buries three of their own back down before a card
// is led — a hand that looked thin can turn out to hold the game, or the other way round.
export const fiveHundred: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-five-hundred',
    name: 'Five Hundred',
    description:
      'Partners with a 43-card deck — twos, threes and the black fours are out, and the joker '
      + 'is in. Ten cards each and three to the kitty. Bid a level and a suit, each bid beating '
      + 'the last, and whoever wins the auction picks up the kitty, buries three cards back '
      + 'down, and has promised that many tricks on top of six. The joker is the highest card '
      + 'in the pack: it always counts as following suit and nothing beats it. Make your '
      + 'contract and score it; fall short and lose what you bid.',
    players: { min: 4, max: 4, step: 2 },
    family: 'trick-taking',
  },
  deck: {
    base: 'standard54',
    includeJokers: true,
    // One joker, not the usual pair. It is a single specific card in this game, not a class.
    jokerCount: 1,
    excludeRanks: ['2', '3'],
    // The black fours come out too, which no rank-level exclusion can say — it is exactly two
    // cards out of the four.
    excludeCards: ['C4', 'S4'],
    rankOrder: ['4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'trick', type: 'trick', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    // The widow before the auction's won; wherever the winner buries their three afterward.
    { id: 'kitty', type: 'pile', ordered: false, faceDown: true, visibility: 'none', shared: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 10 },
    { op: 'move', from: 'draw', to: 'kitty', count: 3 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [
    { id: 'handsEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: 500 },
  trick: {
    trump: 'none',
    mustFollowSuit: true,
    aceHigh: true,
    scoreBy: 'mostTricks',
    partnerships: true,
    numericAuction: {
      minLevel: 6,
      maxLevel: 10,
      strains: ['C', 'D', 'H', 'S', 'NT'],
      book: 0,
      trickValue: 40,
      overtrickValue: 10,
      undertrickValue: 40,
      slamBonus: 250,
      kittyZone: 'kitty',
    },
    bowers: true,
    // The whole reason this game is in the catalogue: a joker that actually wins tricks.
    jokerRank: 'trump',
  },
};
