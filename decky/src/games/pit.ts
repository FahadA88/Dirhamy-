import { GameDefinition } from '../engine/types';

// Pit — the first TRADING game. There is no turn order at all: the whole deck is dealt out,
// and from the moment play starts, any player may post an open offer (give N cards of one
// suit, want N of another) or accept anyone else's. Suits stand in for commodities. First to
// hold `cornerSize` cards of one suit "corners the market" and wins. The deck is dealt out
// entire, so the engine caps that target below the size of a hand — at eight seats a hand is
// six cards and ten of a suit is not something anyone could ever hold.
//
// Four seats up, not three. With a fifty-two card deck three players hold seventeen cards each,
// which is nothing like Pit: somebody is always one trade from a corner and the game is over in
// half a dozen moves. From four seats the hands are the right size and it plays as a market.
export const pit: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-pit',
    name: 'Pit',
    description:
      'No turns. Offer to trade cards of one suit for another, or accept anyone else\'s open offer, whenever you like. First to corner ten of one suit wins — fewer at a crowded table, where a hand is smaller; the table always says how many.',
    players: { min: 4, max: 8 },
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
  pit: { cornerSize: 10 },
};
