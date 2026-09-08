import { GameDefinition } from '../engine/types';

// Continental Rummy — Rummy with the brakes off.
//
// Two packs, four jokers, and every deuce wild, which is the same wild-rich deck Canasta uses
// but pointed at a different game: there is no partnership and no canasta to build, just runs
// of four or more and the race to get rid of everything.
//
// The longer run length is what the extra cards buy. With 108 cards and a dozen wilds, a run of
// three would be trivial to assemble, so the bar goes up and the game becomes about holding
// out for the long ones rather than dumping the first three that fit.
export const continental: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-continental',
    name: 'Continental Rummy',
    description:
      'Two packs, four jokers, every deuce wild. Draw, lay down sets of three and runs of four '
      + 'or more, and discard. Wild cards fill whatever a meld is short of, up to two per meld, '
      + 'and a meld always needs real cards in it. Lay spare cards onto melds already down. '
      + 'First to shed a whole hand ends it; lowest total when someone passes the target wins.',
    // Seats up to eight. The printed rules go to twelve; the pack here goes to eight.
    players: { min: 2, max: 8 },
    family: 'rummy',
  },
  deck: {
    base: 'standard54',
    includeJokers: true,
    jokerCount: 2,
    deckCount: 2,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: { wild: { ranks: ['JOKER', '2'] } },
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
    { id: 'melds', type: 'pile', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    // Fewer cards at a crowded table, or a 108-card deck still runs out of stock.
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 10, countByPlayers: { 5: 9, 6: 8 } },
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
    cardPoints: { JOKER: 25, '2': 15, A: 15, K: 10, Q: 10, J: 10, '10': 10, '9': 5, '8': 5, '7': 5, '6': 5, '5': 5, '4': 5, '3': 5 },
    // Tuned the same way Rummy's and Canasta's were: a session here should be about ten hands,
    // not the thirty a printed target measures out to against Decky's hand-count scoring.
    target: 200,
  },
  rummy: {
    setMin: 3,
    // The point of the game. Four with this many wilds is roughly as hard as three with none.
    runMin: 4,
    layOff: true,
    wilds: true,
    maxWildsPerMeld: 2,
  },
};
