import { GameDefinition } from '../engine/types';

// Old Maid — the first game a lot of people are ever taught, and the only one on this site
// where your turn is spent inside somebody else's hand.
//
// Take one queen out of the pack before you deal, and everything else in it pairs up perfectly
// — every other rank has all four copies, or all two, sitting somewhere at the table. On your
// turn you draw one card, sight unseen, from whoever draws next after you: you name where in
// their fan, not what it is, because neither of you knows. Any pair you're holding falls out
// the instant it forms.
//
// Eventually every card in the pack has found its partner except one, and it is always
// somewhere. Whoever is holding it once everybody else's hand is empty is the Old Maid, and
// that is the whole and entire game — there is nothing to have played better.
export const oldMaid: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-old-maid',
    name: 'Old Maid',
    description:
      'Take three queens out of the pack, so one is left with no partner, and deal out '
      + 'everything else. Any pair in your hand falls out of it at once. On your turn, draw one '
      + 'card — sight unseen — from whoever draws next after you: you pick where in their fan, '
      + 'not what it is. Every card in the pack pairs off except the one queen left in it. '
      + 'Whoever is holding it once everyone else is empty-handed is the Old Maid.',
    players: { min: 3, max: 8 },
    family: 'maid',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    // Three of the four queens come out, so the fourth has nothing left to pair with.
    excludeCards: ['SQ', 'HQ', 'DQ'],
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    // Where a pair goes the moment it forms — nobody's, and never looked at again.
    { id: 'void', type: 'pile', ordered: false, faceDown: true, visibility: 'none', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    // 51 cards never split evenly by more than one table size — dealt round-robin, as evenly as
    // it can be, the same way a real deal runs out unevenly and nobody minds.
    { op: 'dealAll', from: 'draw', to: 'hand' },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'dealerLeft', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [],
  scoring: { mode: 'lowestPoints', winner: 'lowestTotal', cardPoints: {}, target: null },
  maid: {
    oddRank: 'Q',
  },
};
