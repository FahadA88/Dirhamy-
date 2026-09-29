import { GameDefinition } from '../engine/types';

// Euchre — the game where trump is not decided until the hand starts. A 24-card deck, four
// cards left over as the kitty with its top card turned up, an auction to name trump, jacks
// that change suit and outrank aces, and the option to cut your own partner out of the hand.
export const euchre: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-euchre',
    name: 'Euchre',
    description:
      "Partners (seats 1&3 vs 2&4) with a 24-card deck. Five cards each; the next is turned up. Going round from the dealer's left, order that suit up as trump or pass — if everyone passes, it turns down and you may name any other suit. Trump's jack is the right bower, the other jack of the same colour becomes trump too and sits just under it. Make three tricks for a point, all five for two — or go alone, cut your partner out, and take all five for four. Get set and the other team takes 2. First to 10.",
    players: { min: 4, max: 4 },
    family: 'trick-taking',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    excludeRanks: ['2', '3', '4', '5', '6', '7', '8'],
    rankOrder: ['9', '10', 'J', 'Q', 'K', 'A'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'kitty', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
    { id: 'trick', type: 'trick', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 5 },
    { op: 'move', from: 'draw', to: 'kitty', count: 4 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [
    { id: 'handsEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: 10 },
  trick: {
    trump: 'none',
    mustFollowSuit: true,
    aceHigh: true,
    scoreBy: 'mostTricks',
    partnerships: true,
    auction: { upcardZone: 'kitty', dealerDiscards: true, rounds: 2 },
    bowers: true,
    goAlone: true,
    euchreScoring: true,
  },
};
