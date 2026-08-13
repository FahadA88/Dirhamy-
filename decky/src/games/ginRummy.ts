import { GameDefinition } from '../engine/types';

// Gin Rummy — the melding game where nothing is ever laid down. You hold your sets and runs
// concealed and end the hand by knocking, scoring the gap between the two players' unmatched
// cards. Knock badly and your opponent lays their spare cards onto your melds and beats you
// with your own hand.
export const ginRummy: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-gin-rummy',
    name: 'Gin Rummy',
    description:
      'Two players, ten cards each. Draw from the stock or take the discard, then throw one away. Sets of three-plus and runs of three-plus in a suit stay hidden in your hand. Once your unmatched cards total 10 or less you may knock: both hands are revealed and you score the difference. No unmatched cards at all is gin, worth 25 more. Knock loose and your opponent can hang their spares off your melds — match or beat you and they take 25 plus the difference instead. First to 100.',
    players: { min: 2, max: 2 },
    family: 'rummy',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {},
  },
  zones: [
    { id: 'stock', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'stock' },
    { op: 'deal', from: 'stock', to: 'hand', countPerPlayer: 10 },
    { op: 'move', from: 'stock', to: 'discard', count: 1 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [{ id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' }],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: 100 },
  rummy: { setMin: 3, runMin: 3, knock: 10, ginBonus: 25, undercutBonus: 25, layOff: true },
};
