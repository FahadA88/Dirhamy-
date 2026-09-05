import { GameDefinition } from '../engine/types';

// Trio — the one game here that is not played with a pack of cards.
//
// Twenty-seven cards, each a unique combination of three properties: a colour, a shape, and how
// many of it there are. Twelve are face up. A trio is any three cards where each property is
// either the same across all three or different across all three — all red, or one of each
// colour; never two of one and one of another.
//
// It is in the catalogue to prove the engine is not secretly a fifty-two-card engine. There are
// no hands, no turns and no pile: everyone looks at the same board, and whoever calls a trio
// first takes it. Calling wrongly costs a point, which is the only thing stopping somebody
// shouting at every combination.
export const trio: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-trio',
    name: 'Trio',
    description:
      'Not a deck of cards — twenty-seven combinations of colour, shape and count, the same '
      + 'puzzle sold elsewhere as the card game Set. Find three where every property is all the '
      + 'same or all different. No turns: whoever sees it first takes it, and a wrong call costs you.',
    players: { min: 1, max: 6 },
    family: 'set',
  },
  deck: {
    base: 'attributes',
    attributes: [
      { name: 'colour', values: ['red', 'green', 'violet'] },
      { name: 'shape', values: ['oval', 'diamond', 'squiggle'] },
      { name: 'count', values: ['1', '2', '3'] },
    ],
    includeJokers: false,
    rankOrder: [],
    tags: {},
  },
  // The board and the deck behind it are built by the engine, exactly as a solitaire tableau is.
  zones: [],
  setup: [],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: null },
  set: { size: 3, boardSize: 12, score: 1, penalty: 1 },
};
