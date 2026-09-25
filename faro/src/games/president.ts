import { GameDefinition } from '../engine/types';

// President (a.k.a. Scum) — the first CLIMBING game. Beat the previous single card with a
// strictly higher one, or pass. When everyone passes, the pile clears and the last player to
// play leads again. First to empty their hand is President, last is Scum — and from the second
// hand on, the Scum pays the President two of their best cards and takes two rubbish ones back.
// That tax is the whole game: it makes winning compound and losing a hole to climb out of.
// Rank order runs 3 (low) … 2 (high).
export const president: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-president',
    name: 'President',
    description:
      'Beat the card on the pile with a strictly higher one, or pass. When everyone passes, the pile clears and the last player to play leads. Ranks run 3 (low) up to 2 (high). First out is President, last out is Scum — and before every hand after the first, the Scum hands the President their two best cards and gets the President\'s two worst back. Five hands; finish highest on average to win.',
    players: { min: 3, max: 6 },
    family: 'climbing',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
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
  // Five hands, and your score is where you finished each one — so the lowest total wins.
  // A single hand would make the titles meaningless: being President only matters if there is
  // another hand in which to be paid for it.
  scoring: { mode: 'lowestPoints', winner: 'lowestTotal', cardPoints: {}, target: null, handsCap: 5 },
  climb: {
    order: ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'],
    // The rule the game is named for. Scum pays the President two of their best and takes two
    // of the President's worst back; the Vice pair swap one.
    exchange: { top: 2, second: 1 },
  },
};
