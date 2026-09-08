import { GameDefinition } from '../engine/types';

// Oh Hell — the trick game where taking MORE than you promised is as bad as taking fewer.
//
// Everywhere else, an extra trick is a small win you did not need. Here it is a loss. You look
// at your hand, say a number out loud, and then have to hit it exactly — which turns the whole
// game inside out, because half the skill is in throwing tricks away on purpose.
//
// The deal shrinks as the match goes on, so a bid of one means something quite different in a
// seven-card hand than in a two-card one.
export const ohHell: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-oh-hell',
    name: 'Oh Hell',
    description:
      'Every player bids exactly how many tricks they will take, and has to hit that number on '
      + 'the nose — one over is as bad as one under. Follow suit if you can; spades are trump. '
      + 'The hand size shrinks with the table, so at six players you get eight cards and at '
      + 'three you get seventeen. Score your bid plus a bonus for making it exactly, nothing at '
      + 'all if you miss. First to 100.',
    players: { min: 3, max: 6 },
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
    // The deal has to change with the table, or a full pack either will not go round or leaves
    // a pointless stub. Every one of these divides 52 as evenly as it can.
    {
      op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 10,
      countByPlayers: { 3: 17, 4: 13, 5: 10, 6: 8 },
    },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [
    { id: 'handsEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: 100 },
  trick: {
    trump: 'S',
    mustFollowSuit: true,
    aceHigh: true,
    scoreBy: 'mostTricks',
    bidding: true,
  },
};
