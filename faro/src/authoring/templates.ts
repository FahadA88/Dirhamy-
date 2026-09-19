import { Knobs, defaultKnobs } from './knobs';
import { RuleDraft } from './ruleKit';

// Starting points, not finished games.
//
// A blank builder is the worst screen in any creation tool, so nobody sees one. Each template is
// a working, playable game the moment it is picked — deliberately plain, with one or two obvious
// dials left interesting so the first edit an author makes is a real decision rather than
// filling in a blank.

export interface Template {
  id: string;
  name: string;
  tagline: string;
  /** The shape of the thing, in one line, for the picker card. */
  shape: string;
  players: string;
  knobs: Knobs;
}

function rule(
  id: string, name: string, when: RuleDraft['when'],
  condId: string, condParams: Record<string, string | number>,
  effects: RuleDraft['effects'],
  note?: string,
): RuleDraft {
  return { id, name, when, condId, condParams, effects, enabled: true, note };
}

/*
  Templates deliberately carry NO description.

  Each used to hold a one-line blurb, which then followed the knobs around: switch a shedding
  template to the trick family and the game went on telling players to "match the top card by
  suit or rank". The auto-generated description is written from the knobs, so it is always
  about the game you actually have — and the card in the picker shows the tagline below, not
  this, so nothing on screen lost a word.
*/
export const TEMPLATES: Template[] = [
  {
    id: 'blank-shedding',
    name: 'Matching game',
    tagline: 'Play a card that matches the pile. First to empty their hand wins.',
    shape: 'Shedding · draw pile · discard pile',
    players: '2–6',
    knobs: {
      ...defaultKnobs,
      family: 'shedding',
      name: 'My Matching Game',
      customRules: [],
    },
  },
  {
    id: 'skeleton-trick',
    name: 'Trick-taking skeleton',
    tagline: 'Follow suit, high card takes the trick, most tricks wins.',
    shape: 'Tricks · fixed trump · no bidding',
    players: '3–5',
    knobs: {
      ...defaultKnobs,
      family: 'trick',
      name: 'My Trick Game',
      trump: 'S',
      mustFollowSuit: true,
      aceHigh: true,
      trickScoreBy: 'mostTricks',
      trickBidding: false,
      customRules: [
        rule('t1', 'Sweep bonus', 'trickWon', 'tricks', { who: '$me', op: '>=', value: 5 },
          [{ specId: 'announce', params: { text: 'Five tricks and counting!' } }],
          'A nudge so you can see a rule firing before you write your own.'),
      ],
    },
  },
  {
    id: 'skeleton-rummy',
    name: 'Rummy skeleton',
    tagline: 'Draw, meld sets and runs, discard. First to go out wins.',
    shape: 'Melds · stock · discard',
    players: '2–4',
    knobs: {
      ...defaultKnobs,
      family: 'rummy',
      name: 'My Rummy Game',
      rummySetMin: 3,
      rummyRunMin: 3,
      rummyKnock: false,
      rummyLayOff: true,
      customRules: [],
    },
  },
  {
    id: 'skeleton-poker',
    name: 'Poker-style showdown',
    tagline: 'Deal five, everyone reveals, best hand scores. No betting, no money.',
    shape: 'Fixed deal · showdown scoring',
    players: '2–5',
    knobs: {
      ...defaultKnobs,
      family: 'trick',
      name: 'My Showdown Game',
      trump: 'none',
      mustFollowSuit: false,
      aceHigh: true,
      trickScoreBy: 'mostTricks',
      handSize: 5,
      customRules: [
        rule('p1', 'Aces pay', 'cardPlayed', 'rankIs', { rank: 'A' },
          [{ specId: 'addScore', params: { who: '$me', amount: 4 } }],
          'Showdown scoring, built from rules rather than baked in — edit the payouts freely.'),
        rule('p2', 'Face cards pay', 'cardPlayed', 'rankIs', { rank: 'K' },
          [{ specId: 'addScore', params: { who: '$me', amount: 2 } }]),
      ],
    },
  },
  {
    id: 'skeleton-climb',
    name: 'Climbing game',
    tagline: 'Beat the last play or pass. Shed everything to win.',
    shape: 'Climbing · combos · bombs',
    players: '3–6',
    knobs: {
      ...defaultKnobs,
      family: 'climb',
      name: 'My Climbing Game',
      climbCombos: true,
      climbBombSize: 4,
      climbTwosHigh: true,
      customRules: [],
    },
  },
  {
    id: 'skeleton-solitaire',
    name: 'Patience',
    tagline: 'One player, one deck, one board to clear.',
    shape: 'Tableau · foundations · stock',
    players: '1',
    knobs: {
      ...defaultKnobs,
      family: 'solitaire',
      name: 'My Patience',
      solColumns: 7,
      solDeal: 'triangle',
      solBuild: 'alt-color',
      solFoundations: 4,
      solStock: 'waste',
      customRules: [],
    },
  },
  {
    id: 'chaos',
    name: 'Chaos deck',
    tagline: 'A matching game where half the deck does something unpleasant.',
    shape: 'Shedding · six author-written rules',
    players: '3–5',
    knobs: {
      ...defaultKnobs,
      family: 'shedding',
      name: 'Chaos',
      customRules: [
        rule('c1', 'Queens swap', 'cardPlayed', 'rankIs', { rank: 'Q' },
          [{ specId: 'swap', params: { with: 'next' } }, { specId: 'announce', params: { text: 'Queen — hands swap!' } }]),
        rule('c2', 'Aces punish', 'cardPlayed', 'rankIs', { rank: 'A' },
          [{ specId: 'draw', params: { who: '$next', count: 3 } }]),
        rule('c3', 'Nearly out', 'turnEnd', 'handSize', { op: '<=', value: 1 },
          [{ specId: 'announce', params: { text: 'Last card!' } }]),
        rule('c4', 'Red tax', 'cardPlayed', 'colorIs', { color: 'red' },
          [{ specId: 'addScore', params: { who: '$me', amount: 1 } }]),
        rule('c5', 'Hoarding', 'turnEnd', 'handSize', { op: '>=', value: 10 },
          [{ specId: 'addScore', params: { who: '$me', amount: 3 } }, { specId: 'announce', params: { text: 'Too many cards!' } }]),
        rule('c6', 'Endgame reveal', 'drawPileEmpty', 'always', {},
          [{ specId: 'reveal', params: { who: '$all' } }]),
      ],
    },
  },
];
