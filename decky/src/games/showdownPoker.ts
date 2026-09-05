import { GameDefinition } from '../engine/types';

// Showdown Poker — the first BETTING game with actual stakes. Five cards each, blinds posted,
// one round of betting (check, bet, call, raise, fold), then a showdown between whoever
// hasn't folded. Deliberately not the full game: one betting round, no draw, no side pots — a
// player who cannot cover the current bet may only fold. Real chips move and are won and lost.
//
// A sitting is eight hands, not one. Chips carry across them, so a hand you fold cheaply is
// worth something and a hand you win matters later; the biggest stack at the end takes the
// table, and running out of chips ends it there and then.
export const showdownPoker: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-showdown-poker',
    name: 'Showdown Poker',
    description:
      'Five cards each, blinds posted, one round of betting — check, bet, call, raise or fold — then a showdown. No side pots: if you cannot cover the current bet, folding is your only option. Eight hands, chips carried across all of them, biggest stack at the end takes the table.',
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
  poker: { handSize: 5, startingChips: 200, ante: 0, smallBlind: 5, bigBlind: 10, minRaise: 10, hands: 8 },
};
