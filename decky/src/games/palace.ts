import { GameDefinition } from '../engine/types';

// Palace — a climbing game where running out of cards is only the beginning of the trouble.
//
// You play a card at least as high as the one on the pile, or you pick the whole pile up. That
// is the loop, and on its own it would be trivial. What makes it a game is what the low cards
// do: a two resets the pile to nothing, so it is playable on anything and hands the next player
// a free choice. A ten burns the pile out of the game entirely. Four of a rank does the same.
//
// So the cards that look worthless are the ones you hoard, and the ace you have been saving is
// the card that eventually forces you to swallow twenty cards you did not want. Getting rid of
// your hand is not the hard part — staying rid of it is.
export const palace: GameDefinition = {
  schemaVersion: '1.0',
  meta: {
    id: 'classic-palace',
    name: 'Palace',
    description:
      'Play a card the same rank or higher than the top of the pile. If you cannot, you pick the '
      + 'entire pile up into your hand — which is the only way to lose ground, and it is a long '
      + 'way. A Two can be played on anything and resets the pile to nothing. Four of a rank in '
      + 'a row burns the pile out of the game. So the small cards are the valuable ones and a '
      + 'hand full of aces is a trap. First player out of cards wins.',
    players: { min: 2, max: 6 },
    family: 'climbing',
  },
  deck: {
    base: 'standard54', includeJokers: false,
    rankOrder: ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'],
    tags: {},
  },
  zones: [
    { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
    { id: 'pile', type: 'pile', ordered: true, faceDown: false, visibility: 'all', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    // Six each. Enough to have a plan, few enough that picking the pile up really hurts.
    { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: 6 },
  ],
  turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
  actions: [],
  triggers: [],
  endConditions: [],
  scoring: { mode: 'lowestPoints', winner: 'lowestTotal', cardPoints: {}, target: null },
  climb: {
    // The two sits at the top of the order, which is what makes it playable on anything.
    order: ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'],
    combos: true,
    // Four of a rank clears the pile out of the game, from anyone, at any time.
    bombSize: 4,
  },
};
