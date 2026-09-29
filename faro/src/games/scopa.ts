import { GameDefinition } from '../engine/types';

// Scopa — capture by sum.
//
// Four cards start face up on the table. On your turn you play one card from your hand: if any
// table cards share its value, you take them; short of that, if the table's cards all add up to
// it at once, you take the whole table in one go — a "scopa," worth a bonus because it leaves
// the next player with nothing sitting there to claim. Missing both, your card just joins the
// table for somebody to claim later. A card's value is where its rank sits in the deck's own
// order (ace low at 1, ten at 10) — the same reckoning every other rule in this engine already
// uses, not a table invented for this game alone.
//
// A real table lets you choose WHICH combination to take when more than one adds up — three
// cards, or two, or the lot. That choice needs a shape the interpreter does not have yet, so
// this cuts it down to one case: a sum-claim is always the whole table, never a chosen slice of
// it. It is still a real claim gated on a real sum, which is the mechanic actually being proven
// here — it is just never an ambiguous one. The deck drops face cards for the same reason a
// value needs a number: ace through ten, forty cards, no picture card ever without one.
export const scopa: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-scopa',
    name: 'Scopa',
    description:
      'Four cards face up to start. Play a card and take every table card worth the same, or — '
      + 'short of that — the whole table at once if it all adds up to your card. Clear the table '
      + 'in one claim and it is a scopa, worth extra. No claim and your card just joins the table '
      + 'for later. Ace through ten, no picture cards. Most cards claimed by the time somebody '
      + 'reaches the target wins the match.',
    players: { min: 2, max: 4 },
    family: 'capture',
  },
  deck: {
    base: 'standard54',
    includeJokers: false,
    excludeRanks: ['J', 'Q', 'K'],
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'table', type: 'pile', ordered: false, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    { id: 'captured', type: 'pile', ordered: false, faceDown: false, visibility: 'all', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    { op: 'move', from: 'draw', to: 'table', count: 4 },
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 3 },
  ],
  // Whoever leads draws first and reaches the table's cards first — over a multi-hand match to
  // a target that compounds exactly the way it did for rummy (see turnFlow's dealerLeft note in
  // the engine). The deal rotates instead.
  turnFlow: {
    order: 'clockwise',
    startPlayer: 'dealerLeft',
    actionsPerTurn: { min: 1, max: 1 },
  },
  actions: [],
  triggers: [],
  endConditions: [],
  scoring: {
    mode: 'lowestPoints',
    winner: 'highestTotal',
    cardPoints: {},
    target: 40,
  },
  capture: {
    tableStart: 4,
    handSize: 3,
    sweepBonus: 5,
    lastClaimerTakesRest: true,
  },
};
