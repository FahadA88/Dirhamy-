import { GameDefinition } from '../engine/types';

// Go Fish — the first FISHING game. On your turn, ask another player for a rank you hold. If
// they have it, you take all of it and go again; if not, "Go Fish" (draw from the ocean).
// Collect all four of a rank to complete a book. Most books wins.
export const goFish: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-go-fish',
    name: 'Go Fish',
    description:
      'Ask another player for a rank you hold. If they have it you take all of it and ask again; if not, Go Fish and draw from the ocean. Collect all four of a rank to make a book. Most books wins.',
    players: { min: 2, max: 5 },
    family: 'fishing',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {},
  },
  zones: [
    { id: 'ocean', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'ocean' },
    { op: 'deal', from: 'ocean', to: 'hand', countPerPlayer: 7 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: 13 },
  fish: { bookSize: 4 },
};
