import { GameDefinition } from '../engine/types';

// Hand and Foot — Canasta for a big table, with four packs on it.
//
// The name is the idea: you are dealt two hands, and you play the first one before you are
// allowed to look at the second. The foot is dealt face down and stays that way — you cannot see
// it, and neither can anyone else — until your hand actually runs out mid-turn, at which point it
// becomes your hand and your turn just keeps going. So going out is not the end of your
// problems, it is the moment your problems start again with eleven cards you have never seen. A
// player about to finish their hand is not close to winning; they are close to picking up the
// foot. Only clearing both ends the round for them — an untouched foot, if the round ends before
// you reach it, counts against you exactly as if it were still your hand.
//
// Four packs and eight jokers means melds get long and everything is available, so the game is
// not about finding cards — it is about timing. Laying down early scores, but it also tells
// everyone what you are collecting and lets them lay off onto you.
export const handAndFoot: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-hand-and-foot',
    name: 'Hand and Foot',
    description:
      'Four packs shuffled together and two elevens dealt to each seat — a hand you play, and a '
      + 'face-down foot you may not look at until the hand runs out. A rummy built for a crowded '
      + 'table. Jokers and Twos are wild. Melds are sets of three or more of a rank, and you may '
      + 'put up to two wilds in each, so a meld can be built out of almost anything. Lay off '
      + 'onto anybody. Empty your hand and you pick up the foot without missing a turn — only '
      + 'clearing both actually goes out. Everyone else counts what they are still holding, foot '
      + 'included if they never reached it — and a joker caught in hand is fifty against you.',
    // Seats up to eight — four packs is enough for them, and eight is who the game is
    // for in the first place.
    players: { min: 4, max: 8 },
    family: 'rummy',
  },
  deck: {
    base: 'standard54',
    includeJokers: true,
    jokerCount: 2,
    // Four packs: 216 cards with the jokers, which is the point of the game.
    deckCount: 4,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: { wild: { ranks: ['JOKER', '2'] } },
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
    { id: 'melds', type: 'pile', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    // Same shape as hand, but visibility: 'none' — hidden even from its own owner. It becomes
    // the hand (see pickUpFoot in the engine) the moment the hand itself runs out.
    { id: 'foot', type: 'hand', ordered: false, faceDown: true, visibility: 'none', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 11 },
    { op: 'deal', from: 'draw', to: 'foot', countPerPlayer: 11 },
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
    cardPoints: { JOKER: 50, '2': 20, A: 20, K: 10, Q: 10, J: 10, '10': 10, '9': 5, '8': 5, '7': 5, '6': 5, '5': 5, '4': 5, '3': 5 },
    // Same reasoning as Canasta's: the printed target counts melds laid down and this scorer
    // counts what is left in hand, so the number has to come down to keep a match a match.
    target: 300,
  },
  rummy: {
    setMin: 3,
    runMin: 3,
    // Hand & Foot is Canasta's family game — melds are rank-groups only, no same-suit runs.
    allowRuns: false,
    layOff: true,
    wilds: true,
    maxWildsPerMeld: 2,
  },
};
