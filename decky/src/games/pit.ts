import { GameDefinition } from '../engine/types';

// Pit — the first TRADING game. There is no turn order at all: the whole deck is dealt out,
// and from the moment play starts, any player may post an open offer (give N cards of one
// suit, want N of another) or accept anyone else's. Suits stand in for commodities. First to
// hold a cornerSize of one suit "corners the market" and wins.
export const pit: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-pit',
    name: 'Pit',
    description:
      'No turns. Offer to trade cards of one suit for another, or accept anyone else\'s open offer, whenever you like. First to corner seven of a single suit wins.',
    players: { min: 3, max: 8 },
    family: 'pit',
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
    { op: 'dealAll', from: 'draw', to: 'hand' },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: null },
  pit: { cornerSize: 7 },
};
