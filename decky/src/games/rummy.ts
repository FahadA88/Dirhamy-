import { GameDefinition } from '../engine/types';

// Rummy — the first MELDING game. Each turn: draw one card (from the stock or the discard),
// optionally lay down sets (3+ of a rank) and runs (3+ consecutive same suit), then discard.
// First to shed their whole hand goes out and wins.
export const rummy: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-rummy',
    name: 'Rummy',
    description:
      'Draw a card from the stock or the discard, lay down sets (three or more of a rank) and runs (three or more in sequence of one suit), then discard. Cards that fit a meld already on the table can be laid off onto it, whoever put it down. First to get rid of every card wins.',
    players: { min: 2, max: 4 },
    family: 'rummy',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
    { id: 'melds', type: 'pile', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    // Heads-up deals 10 each; three or four deals 7 — the real rule, not one fixed count.
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 7, countByPlayers: { 2: 10 } },
    { op: 'move', from: 'draw', to: 'discard', count: 1 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [{ id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' }],
  scoring: { mode: 'lowestPoints', winner: 'lowestTotal', cardPoints: {}, target: null },
  rummy: { setMin: 3, runMin: 3, layOff: true },
};
