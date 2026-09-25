import { GameDefinition } from '../engine/types';

// Kent — the first PARTNERSHIP SIGNALLING game. Also played as Kemps, Canes or Signal.
//
// Four cards each, four more face up in the middle, and no turn order whatever: anyone may
// swap one of theirs for one of the table's at any moment, and anyone may throw the middle in
// and turn four fresh cards when nobody wants what is there.
//
// Collect four of a kind and you have it — but saying so is the one thing you must not do.
// You signal, and your PARTNER has to be the one who calls it. An opponent who spots the
// signal first calls it off, and the letter goes to you instead. Four letters spells KENT and
// that pair is out.
//
// Partners sit opposite, so the pairs are the odd seats against the even ones. Four or six
// seats: an odd number cannot be paired, and eight is more hands than a fifty-two card deck
// can keep a live pool in front of.
export const kent: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-kent',
    name: 'Kent',
    description:
      'Four cards each and four face up in the middle. No turns — swap with the table whenever you like. Get four of a kind and a tell goes up at your seat for the whole table to see — no words needed, just a race to notice it; if they call it first your pair wins the round, and if an opponent spots it first you take the letter. Four letters spells KENT and you are out.',
    players: { min: 4, max: 6, step: 2 },
    family: 'kent',
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
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 4 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [],
  scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: null },
  kent: { handSize: 4, poolSize: 4, tellPlies: 3, letters: 'KENT' },
};
