import { GameDefinition } from '../engine/types';

// Black Maria — Hearts with sharper teeth.
//
// The English version, where the queen of spades is not the only card worth dreading: her two
// neighbours are penalties as well, the king at ten and the ace at seven. That turns the whole
// spade suit into a minefield rather than one card everybody watches for, and it means a hand
// full of high spades is a problem you have to solve rather than a card you have to duck.
export const blackMaria: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-black-maria',
    name: 'Black Maria',
    description:
      'Hearts, played the English way. Every heart is a point against you, but the top three '
      + 'spades are the real danger: the queen costs 13, the king 10 and the ace 7. Pass three '
      + 'cards before each hand, follow suit if you can, and hearts may not be led until they '
      + 'have been broken. Take every penalty card in the pack and you score nothing while '
      + 'everyone else takes the lot. Lowest score when somebody passes 100.',
    players: { min: 3, max: 4 },
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
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 13, countByPlayers: { 3: 17, 4: 13 } },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [
    { id: 'handsEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: { mode: 'lowestPoints', winner: 'lowestTotal', cardPoints: {}, target: 100 },
  trick: {
    trump: 'none',
    mustFollowSuit: true,
    aceHigh: true,
    scoreBy: 'penalty',
    // Three individual cards priced separately, on top of a whole suit. The scorer has always
    // read suit keys and suit+rank keys; this is a game that needs both at once.
    penaltyPoints: { H: 1, SQ: 13, SK: 10, SA: 7 },
    shootTheMoon: true,
    brokenSuit: 'H',
  },
  handPass: { count: 3, rotation: ['left', 'right', 'across', 'hold'] },
};
