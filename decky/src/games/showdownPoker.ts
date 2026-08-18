import { GameDefinition } from '../engine/types';

// Showdown Poker — the first BETTING game with actual stakes. Five cards each, blinds posted,
// one round of betting (check, bet, call, raise, fold), then a showdown between whoever
// hasn't folded. Deliberately not the full game: one betting round, no draw, no side pots — a
// player who cannot cover the current bet may only fold. Real chips move and are won and lost.
export const showdownPoker: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-showdown-poker',
    name: 'Showdown Poker',
    description:
      'Five cards each, blinds posted, one round of betting — check, bet, call, raise or fold — then a showdown. No streets, no draw, no side pots: real chips, one clean round.',
    players: { min: 2, max: 8 },
    family: 'poker',
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
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 5 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: null },
  poker: { handSize: 5, startingChips: 200, ante: 0, smallBlind: 5, bigBlind: 10, minRaise: 10 },
};
