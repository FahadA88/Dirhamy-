import { GameDefinition } from '../engine/types';

// Briscola — the trick game that does not make you follow suit.
//
// That one omission changes everything. In every other game here, being void is a piece of luck
// you wait for; in Briscola you are void whenever you like, so a trick is never forced out of
// your hand. You can throw a worthless card at somebody else's ace all day, and the question
// stops being "what must I play" and becomes "is this trick worth anything to me".
//
// It usually is not. Only twelve of the forty cards carry points at all — the aces and threes
// hold two-thirds of the total between them — so most tricks are worth nothing and the game is
// about the handful that are. A three is the second-strongest card in its suit and worth ten,
// which makes it the most dangerous thing in your hand and the thing everybody is hunting for.
export const briscola: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-briscola',
    name: 'Briscola',
    description:
      'A forty-card pack — nothing from eight to ten. You never have to follow suit: play '
      + 'anything you like on any trick. Diamonds are the briscola and beat everything else. '
      + 'Only twelve cards score: an Ace is 11, a Three is 10, a King 4, a Queen 3, a Jack 2, '
      + 'and everything else nothing at all. The three sits just under the ace in strength, so '
      + 'it is both the card you most want to take and the one you least want to lead. Sixty of '
      + 'the 120 points wins.',
    players: { min: 2, max: 6 },
    family: 'trick-taking',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    // The Italian forty: ace down to two, with the 8, 9 and 10 taken out.
    excludeRanks: ['8', '9', '10'],
    // Strength, not value: the three sits second, above the king, which is why it is worth
    // taking risks over.
    rankOrder: ['2', '4', '5', '6', '7', 'J', 'Q', 'K', '3', 'A'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'trick', type: 'trick', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    // Forty cards, dealt out as evenly as the table allows.
    {
      op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 8,
      countByPlayers: { 2: 20, 3: 13, 4: 10, 5: 8, 6: 6 },
    },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [
    { id: 'handsEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: 60 },
  trick: {
    trump: 'D',
    // The rule that makes it itself.
    mustFollowSuit: false,
    aceHigh: true,
    scoreBy: 'penalty',
    penaltyPoints: { A: 11, '3': 10, K: 4, Q: 3, J: 2 },
  },
};
