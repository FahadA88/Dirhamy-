import { GameDefinition } from '../engine/types';

// Canasta — the melding game built around cards that can be anything.
//
// Two packs and four jokers, and the deuces are wild alongside them. A meld here is not a set
// of three real cards, it is a set of three CARDS, some of which may be standing in for the
// ones you do not have — which changes what a hand is worth, because a lone deuce is not a two,
// it is whatever you need next.
//
// Kept honest by the rule every Canasta player knows: a meld needs real cards in it. Two wilds
// is the ceiling, and never all of them.
export const canasta: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-canasta',
    name: 'Canasta',
    description:
      'Two packs, four jokers, and every deuce wild. Draw, lay down sets of three or more, and '
      + 'discard. A wild card stands in for whatever a meld is short of — but a meld always '
      + 'needs real cards in it, and never more than two wilds. Lay off spare cards onto melds '
      + 'already on the table. First to shed every card ends the hand; lowest total wins.',
    players: { min: 2, max: 4 },
    family: 'rummy',
  },
  deck: {
    base: 'standard54',
    includeJokers: true,
    // Two jokers per pack, two packs — the four the game is played with.
    jokerCount: 2,
    deckCount: 2,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    // Both the jokers and every deuce, which is a rank-level statement and a joker-level one at
    // the same time.
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
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 11 },
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
    // Jokers and deuces are the expensive cards to be caught holding, which is the counterweight
    // to how useful they are in a meld.
    cardPoints: { JOKER: 50, '2': 20, A: 20, K: 10, Q: 10, J: 10, '10': 10, '9': 5, '8': 5, '7': 5, '6': 5, '5': 5, '4': 5, '3': 5 },
    /*
      Canasta is played to 5000 at a real table, but that counts melds laid down, and Decky's
      rummy scorer counts what is left in your hand instead. Copying the printed target
      verbatim measures out at ~17 hands a match against Rummy's ~9 (self-play, four seats).
      300 puts a session back in the same range, the same way Rummy's own target had to come
      down from Gin's 100 to 30 for exactly this reason.
    */
    target: 300,
  },
  rummy: {
    setMin: 3,
    runMin: 3,
    // Real Canasta melds are rank-groups only — seven of a kind is the canasta itself, and a
    // same-suit run scores and plays nothing like that. Off, or the engine would silently offer
    // and score runs a real table would never allow.
    allowRuns: false,
    layOff: true,
    wilds: true,
    maxWildsPerMeld: 2,
  },
};
