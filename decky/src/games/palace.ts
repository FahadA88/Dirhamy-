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
    // 'top-public' is how the engine recognises the pile you play onto: only the top card is
    // in play, and everything under it is history. A climbing game without one has nowhere to
    // put a card.
    { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
    { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
  ],
  setup: [
    { op: 'shuffle', zone: 'draw' },
    /*
      The whole pack, dealt out. Not six each.

      Six each measured out at a 75/25 split between two players, which is not a game — with a
      short hand whoever leads sheds first and there is not enough left afterwards for the deal
      to even out. Dealing everything gives the pile something to do: it grows, somebody has to
      swallow it, and the advantage of going first is spent within a few turns.
    */
    { op: 'dealAll', from: 'draw', to: 'hand' },
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
