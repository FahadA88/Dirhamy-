import { GameDefinition } from '../engine/types';

// Big Two — the climbing game where the SHAPE of a play matters as much as its rank.
//
// Lead a single and the reply must be a higher single. Lead a pair and only a higher pair will
// do. That one rule is what separates it from President: a hand is not a list of cards ranked
// best to worst, it is a set of shapes you have to find somewhere to put, and a lone high card
// you cannot pair is often worth less than two middling ones you can.
//
// Four of a kind is a bomb: it beats anything, at any moment, whoever holds it.
export const bigTwo: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-big-two',
    name: 'Big Two',
    description:
      'Beat the pile with the same shape and a higher rank — a single beats a single, a pair '
      + 'beats a pair, a triple beats a triple — or pass. When everyone passes the pile clears '
      + 'and whoever played last leads. Ranks run 3 low up to 2 high, which is where the game '
      + 'gets its name. Four of a kind is a bomb and beats anything, even out of turn. First to '
      + 'empty their hand wins.',
    players: { min: 3, max: 4 },
    family: 'climbing',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    { op: 'dealAll', from: 'draw', to: 'hand' },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [{ id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' }],
  scoring: { mode: 'lowestPoints', winner: 'lowestTotal', cardPoints: {}, target: null },
  climb: {
    order: ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'],
    combos: true,
    bombSize: 4,
  },
};
