import { GameDefinition } from '../engine/types';

// Snap — the first card game most people ever learn, and the only one here where knowing the
// rules is no help at all.
//
// There is nothing to decide. The pack is dealt out face down, everyone flips their top card in
// turn, and the instant two cards in a row show the same rank the first player to say so takes
// the pile. That is the whole game.
//
// It earns its place by scaling. Most card games get worse past six players — the pack runs
// thin, the turns get long, the waiting kills it. Snap gets better: more people watching the
// same pile means more people who might beat you to it, and nobody is ever waiting, because
// everybody is looking at the same card at the same moment.
export const snap: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-snap',
    name: 'Snap',
    description:
      'The pack is dealt out face down and nobody looks at it. Each player in turn flips their '
      + 'top card onto the pile. The moment the card that lands matches the rank of the one '
      + 'underneath it, the first player to call snap takes the whole pile. Run out of cards and '
      + 'you are out; last player holding cards wins. No strategy whatsoever, and it plays just '
      + 'as well with eight people as with two.',
    players: { min: 2, max: 8 },
    family: 'reflex',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    // Two packs, so a big table still gets a real stack each.
    deckCount: 2,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'pile', type: 'pile', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: true, faceDown: true, visibility: 'none', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    { op: 'dealAll', from: 'draw', to: 'hand' },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: null },
  reflex: {
    // Nothing is snappable on its own — only a card landing on its own rank.
    slapRanks: [],
    slapMatch: true,
    // Two packs going round is a long game; whoever holds most at the cap has won it on cards.
    flipCap: 600,
  },
};
