import { GameDefinition } from '../engine/types';

// Kings Corner — a patience laid out in the middle that everybody plays into at once.
//
// Four piles in a cross, and four corners that are shut. You build down the piles in alternating
// colours, the way you would in Klondike, except the piles are not yours — the space you open
// is open to whoever sits next, and the card you cannot place is a card you are keeping.
//
// The corners are the game. They are four extra places to unload and none of them can be used
// until somebody puts a king there, so a king in hand is worth far more for the door it opens
// than for the card it is. Open one early and you have made room for yourself; open one late
// and you have made room for everybody else.
//
// The other move worth knowing is picking a whole pile up and dropping it on another whose top
// card it continues. That frees a pile — and deciding whether the person it frees it for is
// going to be you is most of the thinking in the game.
export const kingsCorner: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-kings-corner',
    name: "Kings Corner",
    description:
      'Four piles in a cross and four empty corners. Draw one card, then place as many as you '
      + 'like: build down in alternating colours, red on black, black on red. Only a King may '
      + 'open a corner, which is why a King is the best card in the game. You can also lift a '
      + 'whole pile and drop it on another it continues, freeing a space — for you if you are '
      + 'quick, for the next player if you are not. First to empty their hand wins.',
    players: { min: 2, max: 4 },
    family: 'layout',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'dealerLeft', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [],
  scoring: { mode: 'lowestPoints', winner: 'firstOut', cardPoints: {}, target: null },
  layout: {
    // The cross.
    piles: 4,
    // And the four that are shut.
    cornerPiles: 4,
    cornerRank: 'K',
    build: 'alt-color',
    handSize: 7,
    movePiles: true,
  },
};
