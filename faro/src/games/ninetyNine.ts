import { GameDefinition } from '../engine/types';

// Ninety-Nine — one shared number, and everybody adds to it.
//
// No pile to match, no suit to follow: play any card from your hand and its rank joins a running
// total the whole table shares (ace low at 1, up to a king at 13). Play it and draw straight back
// up to three cards. The only rule is the total itself — you may never play a card that would push
// it past 99. Run out of a card that fits and you're stuck: one penalty point, and the hand's over.
// Fewest penalty points when somebody reaches the target wins the match.
//
// This is the plainest version of the real game — the classic deals a few ranks special jobs
// (a 4 reverses order, a 10 subtracts, a 9 is either), and none of that is here. What's here is
// the one mechanic every variant shares: a number everybody adds to, and a play forbidden by
// nothing but where that number already stands — proof that a running total gate needs no engine
// feature beyond ordinary arithmetic already on offer to every author.
export const ninetyNine: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-ninety-nine',
    name: 'Ninety-Nine',
    description:
      'Play any card — its rank joins a running total the whole table shares, ace low at 1 up '
      + 'to a king at 13. Draw back up to three after every play. You may never play a card that '
      + 'would push the total past 99. No card that fits and you\'re stuck: take a penalty point '
      + 'and the hand ends there. Fewest points when someone hits the target wins the match.',
    players: { min: 2, max: 6 },
    family: 'running-total',
  },
  deck: {
    base: 'standard54',
    includeJokers: false,
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
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 3 },
  ],
  turnFlow: {
    order: 'clockwise',
    startPlayer: 'first',
    actionsPerTurn: { min: 1, max: 1 },
  },
  actions: [
    {
      id: 'playCard',
      target: { from: 'hand', select: 'one' },
      // The gate lives here, not in playRestrictions — a restriction that would leave nobody
      // playable quietly waives itself, which is the opposite of what a stuck hand needs to do.
      when: {
        cmp: {
          left: { add: [{ stateVar: 'total' }, { cardProp: 'value' }] },
          op: '<=',
          right: { lit: 99 },
        },
      },
      effects: [
        { op: 'move', card: '$target', to: 'discard' },
        { op: 'setVarNum', var: 'total', value: { add: [{ stateVar: 'total' }, { cardProp: 'value' }] } },
        { op: 'move', from: 'draw', to: 'hand', count: 1 },
      ],
    },
  ],
  triggers: [
    { on: 'drawPileEmpty', do: [{ op: 'reshuffleDiscardInto', zone: 'draw', keepTop: true }] },
  ],
  endConditions: [],
  scoring: {
    mode: 'lowestPoints',
    winner: 'lowestTotal',
    cardPoints: {},
    target: 5,
  },
  rules: [
    {
      id: 'stuckPenalty',
      name: 'Stuck player takes a penalty',
      when: 'roundStuck',
      then: [{ op: 'addScore', player: '$me', amount: { lit: 1 } }],
      note: 'Whoever has no card left that keeps the total at 99 or under takes one penalty '
        + 'point and the hand ends there.',
    },
  ],
};
