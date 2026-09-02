import { GameDefinition } from '../engine/types';

// Contract Rummy — the deal you're dealt keeps changing what you're allowed to lay down.
//
// Ordinary rummy always wants the same thing from a meld: three of a rank, or a run. This asks
// for a different COMBINATION every hand — two sets, then a set and a run, then two runs, then
// three sets, and on up — and nothing may hit the table at all until that hand's whole
// combination is down. Everyone plays the same contract at once, so a hand that hands you
// nothing but a hoard of pairs while the table wants two runs is a hand spent purely drawing and
// discarding, watching everyone else lay theirs down first.
//
// The real game holds a player's contract back and lays every piece of it down at once, in a
// single move — this engine has no move shape for "several melds simultaneously" yet, so here
// each piece goes down on its own turn, same as ordinary melding, except which SHAPE a meld may
// take is gated to whatever the contract is still short of. Once the whole thing is down, the
// rest of the hand plays like ordinary rummy: meld freely, lay off on anyone. The real sitting
// is a fixed seven hands, win or lose; this one is scored to a target instead, tuned to run
// about that long rather than counted hand for hand. See RummyConfig.contract's own doc comment.
export const contractRummy: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-contract-rummy',
    name: 'Contract Rummy',
    description:
      'Two packs and four jokers wild. Every hand asks for a different combination of sets and '
      + 'runs — two sets, then a set and a run, then two runs, escalating on up — and nothing may '
      + 'go down at all until that hand\'s whole combination is on the table. Once it is, meld '
      + 'freely and lay off on anyone for the rest of the hand. Lowest total once someone passes '
      + 'the target wins the match.',
    players: { min: 2, max: 6 },
    family: 'rummy',
  },
  deck: {
    base: 'standard54',
    includeJokers: true,
    jokerCount: 2,
    deckCount: 2,
    rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
    tags: { wild: { ranks: ['JOKER'] } },
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
    { id: 'melds', type: 'pile', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 13, countByPlayers: { 5: 11, 6: 10 } },
    { op: 'move', from: 'draw', to: 'discard', count: 1 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'dealerLeft', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [
    { id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
  ],
  scoring: {
    mode: 'lowestPoints',
    winner: 'lowestTotal',
    cardPoints: { JOKER: 25, A: 15, K: 10, Q: 10, J: 10, '10': 10, '9': 5, '8': 5, '7': 5, '6': 5, '5': 5, '4': 5, '3': 5, '2': 5 },
    // Tuned to run roughly the length of the contract list below, the same way Continental's
    // and Canasta's targets were tuned against Decky's hand-count scoring rather than the
    // printed one.
    target: 150,
  },
  rummy: {
    setMin: 3,
    runMin: 3,
    layOff: true,
    wilds: true,
    maxWildsPerMeld: 2,
    contract: [
      { sets: 2, runs: 0 },
      { sets: 1, runs: 1 },
      { sets: 0, runs: 2 },
      { sets: 3, runs: 0 },
      { sets: 2, runs: 1 },
      { sets: 1, runs: 2 },
      { sets: 0, runs: 3 },
    ],
  },
};
