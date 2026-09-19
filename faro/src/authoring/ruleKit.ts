import { CustomRule, Effect, PlayRestriction, Predicate, Rank, RuleHook, RuleValue, Suit } from '../engine/types';

// The palette the rule builder puts in front of an author.
//
// Near-programmable, but not a programming language: every ingredient here compiles to the
// Predicate/Effect data the engine already interprets, so a rule someone assembles by clicking
// is the same kind of object as a rule hand-written in a classic. Nothing is ever eval'd.
//
// Each ingredient declares its own parameters, which is what lets the UI stay generic — one
// renderer draws every condition and every effect, and adding a new one here makes it appear in
// the builder with no UI change at all.

export type ParamValue = string | number;

export type ParamSpec =
  | { key: string; kind: 'number'; label: string; min?: number; max?: number; step?: number; def: number }
  | { key: string; kind: 'select'; label: string; options: { value: string; label: string }[]; def: string }
  | { key: string; kind: 'text'; label: string; placeholder?: string; def: string }
  // One card out of the pack, held as the suit+rank key the engine uses everywhere else ("SQ").
  | { key: string; kind: 'card'; label: string; def: string };

export interface ConditionSpec {
  id: string;
  label: string;
  hint?: string;
  advanced?: boolean;
  params: ParamSpec[];
  build: (p: Record<string, ParamValue>) => Predicate;
}

export interface EffectSpec {
  id: string;
  label: string;
  hint?: string;
  advanced?: boolean;
  params: ParamSpec[];
  build: (p: Record<string, ParamValue>) => Effect;
}

// ---------- shared option lists ----------

const SUITS: { value: string; label: string }[] = [
  { value: 'C', label: '♣ Clubs' }, { value: 'D', label: '♦ Diamonds' },
  { value: 'H', label: '♥ Hearts' }, { value: 'S', label: '♠ Spades' },
  // A joker's suit is its own class, and a deck can now hold as many as an author wants.
  // Leaving it off this list meant a game could deal jokers that no twist could ever mention.
  { value: 'JOKER', label: '★ Joker' },
];

const RANKS: { value: string; label: string }[] =
  ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'JOKER']
    .map((r) => ({ value: r, label: { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King', JOKER: 'Joker' }[r] ?? r }));

const WHO: { value: string; label: string }[] = [
  { value: '$me', label: 'the player' },
  { value: '$next', label: 'the next player' },
  { value: '$prev', label: 'the previous player' },
  { value: '$others', label: 'everyone else' },
  { value: '$all', label: 'everyone' },
];

const OPS: { value: string; label: string }[] = [
  { value: '>=', label: 'is at least' }, { value: '<=', label: 'is at most' },
  { value: '==', label: 'is exactly' }, { value: '!=', label: 'is not' },
  { value: '>', label: 'is more than' }, { value: '<', label: 'is less than' },
];

const SCOPE: { value: string; label: string }[] = [
  { value: 'table', label: 'the whole table' },
  { value: '$me', label: 'this player alone' },
  { value: '$next', label: 'the next player' },
  { value: '$prev', label: 'the previous player' },
];

const LASTS: { value: string; label: string }[] = [
  { value: 'hand', label: 'this hand' },
  { value: 'match', label: 'the whole match' },
];

/** A scope choice, as the `per` field the engine reads (absent means the shared bag). */
function scopeOf(v: ParamValue): { per?: '$me' | '$next' | '$prev' } {
  const s = String(v);
  return s === 'table' ? {} : { per: s as '$me' | '$next' | '$prev' };
}

const asWho = (v: ParamValue) => String(v) as '$me' | '$next' | '$prev' | '$all' | '$others';
const asOp = (v: ParamValue) => String(v) as '==' | '!=' | '>' | '>=' | '<' | '<=';
const n = (v: ParamValue) => Number(v) || 0;
/**
 * A text parameter with a fallback, for params added after drafts were already saved.
 *
 * `String(undefined)` is the five-letter string "undefined", which is truthy — so the obvious
 * `String(p.x) || 'draw'` silently compiled a pile name of "undefined" for every draft written
 * before the parameter existed. Caught by the Chaos deck template, whose draw rule predates
 * the `from` field.
 */
const str = (v: ParamValue | undefined, fallback: string) => {
  const out = v === undefined || v === null ? '' : String(v).trim();
  return out && out !== 'undefined' ? out : fallback;
};

// ---------- when ----------

export const HOOKS: { value: RuleHook; label: string; hint: string }[] = [
  { value: 'cardPlayed', label: 'A card is played', hint: 'The most common trigger — reacts to whatever just hit the pile.' },
  { value: 'turnStart', label: 'A turn begins', hint: 'Before the player chooses anything.' },
  { value: 'turnEnd', label: 'A turn ends', hint: 'After their move has resolved.' },
  { value: 'handStart', label: 'A hand is dealt', hint: 'Once, at the very start.' },
  { value: 'cardDrawn', label: 'A player draws', hint: 'Fires on a draw rather than a play.' },
  { value: 'trickWon', label: 'A trick is won', hint: 'Trick-taking games only.' },
  { value: 'drawPileEmpty', label: 'The draw pile empties', hint: 'Good for endgame rules.' },
  { value: 'trickLed', label: 'A trick is led', hint: 'The FIRST card of a trick, rather than every card in it.' },
  { value: 'playerOut', label: 'A player goes out', hint: 'Their last card has left their hand.' },
  { value: 'handEnd', label: 'The hand ends', hint: 'After the scores are in, before the next deal.' },
  { value: 'matchEnd', label: 'The match is decided', hint: 'Once, at the very end of everything.' },
  { value: 'meldLaid', label: 'A meld goes down', hint: 'Rummy games only.' },
  { value: 'bidMade', label: 'A player bids', hint: 'Any game with an auction.' },
  { value: 'roundStuck', label: 'A player has no legal move', hint: 'Fires on whoever is stuck, right before the hand ends for it.' },
];

// ---------- conditions ----------

export const CONDITIONS: ConditionSpec[] = [
  {
    id: 'always', label: 'Always', hint: 'No condition — the rule fires every time.',
    params: [], build: () => ({ always: true }),
  },
  {
    id: 'suitIs', label: "The card's suit is…", params: [
      { key: 'suit', kind: 'select', label: 'Suit', options: SUITS, def: 'H' },
    ],
    build: (p) => ({ suitIn: [String(p.suit) as Suit] }),
  },
  {
    id: 'rankIs', label: "The card's rank is…", params: [
      { key: 'rank', kind: 'select', label: 'Rank', options: RANKS, def: 'A' },
    ],
    build: (p) => ({ rankIn: [String(p.rank) as Rank] }),
  },
  {
    id: 'colorIs', label: "The card's colour is…", params: [
      { key: 'color', kind: 'select', label: 'Colour', options: [{ value: 'red', label: 'Red' }, { value: 'black', label: 'Black' }], def: 'red' },
    ],
    build: (p) => ({ colorIs: String(p.color) as 'red' | 'black' }),
  },
  {
    id: 'handSize', label: 'Their hand size…', params: [
      { key: 'op', kind: 'select', label: 'Comparison', options: OPS, def: '<=' },
      { key: 'value', kind: 'number', label: 'Cards', min: 0, max: 30, def: 1 },
    ],
    build: (p) => ({ cmp: { left: { count: '$hand' }, op: asOp(p.op), right: { lit: n(p.value) } } }),
  },
  {
    id: 'holds', label: 'They are holding…', hint: 'Checks the hand rather than the card in play.',
    params: [
      { key: 'count', kind: 'number', label: 'At least', min: 1, max: 13, def: 2 },
      {
        key: 'what', kind: 'select', label: 'Of', def: 'suit:H',
        options: [
          ...SUITS.map((s) => ({ value: `suit:${s.value}`, label: s.label })),
          ...RANKS.map((r) => ({ value: `rank:${r.value}`, label: `${r.label}s` })),
          { value: 'color:red', label: 'Red cards' }, { value: 'color:black', label: 'Black cards' },
        ],
      },
    ],
    build: (p) => {
      const [kind, val] = String(p.what).split(':');
      const q: Record<string, unknown> = { minCount: n(p.count) };
      q[kind] = val;
      return { handHas: q as never };
    },
  },
  {
    id: 'points', label: 'Their points this hand…', params: [
      { key: 'who', kind: 'select', label: 'Whose', options: WHO.slice(0, 3), def: '$me' },
      { key: 'op', kind: 'select', label: 'Comparison', options: OPS, def: '>=' },
      { key: 'value', kind: 'number', label: 'Points', min: -200, max: 200, def: 10 },
    ],
    build: (p) => ({ cmp: { left: { score: asWho(p.who) }, op: asOp(p.op), right: { lit: n(p.value) } } }),
  },
  {
    id: 'firstTurn', label: 'It is the first play of the hand', params: [],
    build: () => ({ isFirstTurn: true }),
  },
  {
    id: 'handNumber', label: 'The hand number…', advanced: true, params: [
      { key: 'op', kind: 'select', label: 'Comparison', options: OPS, def: '==' },
      { key: 'value', kind: 'number', label: 'Hand', min: 1, max: 50, def: 1 },
    ],
    build: (p) => ({ cmp: { left: { handNumber: true }, op: asOp(p.op), right: { lit: n(p.value) } } }),
  },
  {
    id: 'tricks', label: 'Their tricks won…', advanced: true, params: [
      { key: 'who', kind: 'select', label: 'Whose', options: WHO.slice(0, 3), def: '$me' },
      { key: 'op', kind: 'select', label: 'Comparison', options: OPS, def: '>=' },
      { key: 'value', kind: 'number', label: 'Tricks', min: 0, max: 13, def: 1 },
    ],
    build: (p) => ({ cmp: { left: { tricksWon: asWho(p.who) }, op: asOp(p.op), right: { lit: n(p.value) } } }),
  },
  {
    id: 'zoneCount', label: 'A pile has…', advanced: true,
    hint: 'Reads any pile by name — draw, discard, or one you named yourself.',
    params: [
      { key: 'zone', kind: 'text', label: 'Pile', placeholder: 'draw', def: 'draw' },
      { key: 'op', kind: 'select', label: 'Comparison', options: OPS, def: '<=' },
      { key: 'value', kind: 'number', label: 'Cards', min: 0, max: 108, def: 0 },
    ],
    build: (p) => ({ cmp: { left: { count: str(p.zone, 'draw') }, op: asOp(p.op), right: { lit: n(p.value) } } }),
  },
  {
    id: 'varIs', label: 'A game variable is…', advanced: true,
    hint: 'Pairs with the "remember a number" effect to build counters and state machines.',
    params: [
      { key: 'var', kind: 'text', label: 'Variable', placeholder: 'streak', def: 'streak' },
      { key: 'op', kind: 'select', label: 'Comparison', options: OPS, def: '>=' },
      { key: 'value', kind: 'text', label: 'Value', placeholder: '3', def: '3' },
      // Without this the condition always read the shared bag, so a rule that counted
      // something per player and a rule that tested it were looking at different variables —
      // the test silently never fired.
      { key: 'scope', kind: 'select', label: 'Whose', options: SCOPE, def: 'table' },
    ],
    build: (p) => ({
      cmp: {
        left: { stateVar: str(p.var, 'counter'), ...scopeOf(p.scope) },
        op: asOp(p.op), right: { lit: String(p.value) },
      },
    }),
  },
  {
    id: 'listHas', label: 'A remembered list contains…', advanced: true,
    hint: 'Pairs with "remember a card in a list".',
    params: [
      { key: 'var', kind: 'text', label: 'List', placeholder: 'seen', def: 'seen' },
      { key: 'value', kind: 'text', label: 'Contains', placeholder: 'H', def: 'H' },
      { key: 'scope', kind: 'select', label: 'Whose list', options: SCOPE, def: 'table' },
    ],
    build: (p) => ({ listHas: { var: str(p.var, 'seen'), value: { lit: str(p.value, '') }, ...scopeOf(p.scope) } }),
  },
  {
    id: 'exactCard', label: 'The card is exactly…',
    hint: 'One card out of the whole pack — the queen of spades, not every queen.',
    params: [{ key: 'card', kind: 'card', label: 'Card', def: 'SQ' }],
    build: (p) => {
      const key = String(p.card);
      const suit = key.slice(0, 1) as Suit;
      const rank = key.slice(1) as Rank;
      // Two clauses rather than one, because "this card" is a suit AND a rank — the engine has
      // always been able to say that, and the builder never could.
      return { all: [{ suitIn: [suit] }, { rankIn: [rank] }] };
    },
  },
  {
    id: 'cardIsTagged', label: 'The card is tagged…',
    hint: 'Wild, skip, reverse — whichever named sets this game defines.',
    params: [{ key: 'tag', kind: 'text', label: 'Tag', placeholder: 'wild', def: 'wild' }],
    build: (p) => ({ cardHasTag: str(p.tag, 'wild') }),
  },
  {
    id: 'cardValue', label: "The card's rank value…",
    hint: 'Its position in the rank order, so "at least 11" catches jacks and up.',
    params: [
      { key: 'op', kind: 'select', label: 'Comparison', options: OPS, def: '>=' },
      { key: 'value', kind: 'number', label: 'Value', min: 0, max: 14, def: 11 },
    ],
    build: (p) => ({ cmp: { left: { cardProp: 'value' }, op: asOp(p.op), right: { lit: n(p.value) } } }),
  },
  {
    id: 'matchScore', label: 'Their match score…', advanced: true,
    hint: 'The running total across hands, not this hand alone.',
    params: [
      { key: 'who', kind: 'select', label: 'Whose', options: WHO.slice(0, 3), def: '$me' },
      { key: 'op', kind: 'select', label: 'Comparison', options: OPS, def: '>=' },
      { key: 'value', kind: 'number', label: 'Points', min: -500, max: 500, def: 50 },
    ],
    build: (p) => ({ cmp: { left: { matchScore: asWho(p.who) }, op: asOp(p.op), right: { lit: n(p.value) } } }),
  },
  {
    id: 'playerCount', label: 'The number of players…', advanced: true,
    hint: 'Lets one game behave differently at three seats than at six.',
    params: [
      { key: 'op', kind: 'select', label: 'Comparison', options: OPS, def: '>=' },
      { key: 'value', kind: 'number', label: 'Players', min: 1, max: 8, def: 4 },
    ],
    build: (p) => ({ cmp: { left: { playerCount: true }, op: asOp(p.op), right: { lit: n(p.value) } } }),
  },
  {
    id: 'canDo', label: 'They have a legal…', advanced: true,
    hint: 'Names an action id — "playCard", "drawCard". True when that move is available to them.',
    params: [{ key: 'action', kind: 'text', label: 'Action', placeholder: 'playCard', def: 'playCard' }],
    build: (p) => ({ existsLegal: str(p.action, 'playCard') }),
  },
];

// ---------- effects ----------

export const EFFECTS: EffectSpec[] = [
  {
    id: 'addScore', label: 'Give points', params: [
      { key: 'who', kind: 'select', label: 'To', options: WHO, def: '$me' },
      { key: 'amount', kind: 'number', label: 'Points', min: -100, max: 100, def: 5 },
      {
        key: 'times', kind: 'select', label: 'Multiplied by', def: 'flat',
        options: [
          { value: 'flat', label: 'nothing — a flat amount' },
          { value: 'cardValue', label: "the card's rank value" },
          { value: 'tricks', label: 'their tricks won' },
          { value: 'handSize', label: 'the cards in their hand' },
          { value: 'handNumber', label: 'the hand number' },
        ],
      },
    ],
    // The engine has always taken a full RuleValue here; the builder only ever wrote a literal,
    // so "score the card's own value" or "score two per trick" needed hand-edited JSON.
    build: (p) => {
      const flat = { lit: n(p.amount) };
      const per: Record<string, RuleValue> = {
        cardValue: { cardProp: 'value' },
        tricks: { tricksWon: asWho(p.who) },
        handSize: { count: '$hand' },
        handNumber: { handNumber: true },
      };
      const mult = per[String(p.times)];
      return { op: 'addScore', player: asWho(p.who), amount: mult ? { mul: [flat, mult] } : flat };
    },
  },
  {
    id: 'announce', label: 'Say something', hint: 'Writes a line into the game log.',
    params: [{ key: 'text', kind: 'text', label: 'Message', placeholder: 'Bonus!', def: 'Bonus!' }],
    build: (p) => ({ op: 'announce', text: str(p.text, '') }),
  },
  { id: 'extraTurn', label: 'Play again', params: [], build: () => ({ op: 'extraTurn' }) },
  { id: 'skipNext', label: 'Skip the next player', params: [], build: () => ({ op: 'skipNext' }) },
  { id: 'reverse', label: 'Reverse the direction of play', params: [], build: () => ({ op: 'reverseOrder' }) },
  {
    id: 'draw', label: 'Make someone draw', params: [
      { key: 'who', kind: 'select', label: 'Who', options: WHO, def: '$next' },
      { key: 'count', kind: 'number', label: 'Cards', min: 1, max: 10, def: 2 },
      // Hard-coded to 'draw' before this, which silently did nothing in any game whose stock
      // is named something else — Gin's is 'stock', Go Fish's is 'ocean'.
      { key: 'from', kind: 'text', label: 'From pile', placeholder: 'draw', def: 'draw' },
    ],
    build: (p) => ({ op: 'drawTo', player: asWho(p.who), from: str(p.from, 'draw'), count: { lit: n(p.count) } }),
  },
  {
    id: 'swap', label: 'Swap hands', hint: 'A classic chaos card.', params: [
      { key: 'with', kind: 'select', label: 'With', options: [{ value: 'next', label: 'the next player' }, { value: 'prev', label: 'the previous player' }], def: 'next' },
    ],
    build: (p) => ({ op: 'swapHands', withPlayer: String(p.with) as 'next' | 'prev' }),
  },
  {
    id: 'reveal', label: 'Reveal a hand', advanced: true, params: [
      { key: 'who', kind: 'select', label: 'Whose', options: WHO, def: '$next' },
    ],
    build: (p) => ({ op: 'revealHand', player: asWho(p.who) }),
  },
  {
    id: 'endHand', label: 'End the hand now', advanced: true, params: [
      {
        key: 'winner', kind: 'select', label: 'Winner', def: '$me',
        options: [...WHO.slice(0, 3), { value: 'highestScore', label: 'highest score' }, { value: 'lowestScore', label: 'lowest score' }],
      },
    ],
    build: (p) => ({ op: 'endHand', winner: String(p.winner) as never }),
  },
  {
    id: 'remember', label: 'Remember a number', advanced: true,
    hint: 'Stores a value you can test later with "a game variable is…".',
    params: [
      { key: 'var', kind: 'text', label: 'Variable', placeholder: 'streak', def: 'streak' },
      { key: 'value', kind: 'number', label: 'Set to', min: -99, max: 99, def: 1 },
      { key: 'scope', kind: 'select', label: 'Belongs to', options: SCOPE, def: 'table' },
      { key: 'keep', kind: 'select', label: 'Lasts', options: LASTS, def: 'hand' },
    ],
    build: (p) => ({
      op: 'setVarNum', var: str(p.var, 'counter'), value: { lit: n(p.value) },
      ...scopeOf(p.scope), ...(p.keep === 'match' ? { keep: true } : {}),
    }),
  },
  {
    id: 'bump', label: 'Add to a remembered number', advanced: true,
    params: [
      { key: 'var', kind: 'text', label: 'Variable', placeholder: 'streak', def: 'streak' },
      { key: 'by', kind: 'number', label: 'Add', min: -20, max: 20, def: 1 },
      { key: 'scope', kind: 'select', label: 'Belongs to', options: SCOPE, def: 'table' },
      { key: 'keep', kind: 'select', label: 'Lasts', options: LASTS, def: 'hand' },
    ],
    build: (p) => {
      const sc = scopeOf(p.scope);
      return {
        op: 'setVarNum', var: str(p.var, 'counter'),
        value: { add: [{ stateVar: str(p.var, 'counter'), ...sc }, { lit: n(p.by) }] },
        ...sc, ...(p.keep === 'match' ? { keep: true } : {}),
      };
    },
  },
  {
    id: 'rememberCard', label: 'Remember a card in a list', advanced: true,
    hint: 'Builds up a list you can test with "a list contains…" — which suits have been led, which ranks have gone.',
    params: [
      { key: 'var', kind: 'text', label: 'List', placeholder: 'seen', def: 'seen' },
      {
        key: 'what', kind: 'select', label: 'Remember its', def: 'rank',
        options: [{ value: 'rank', label: 'rank' }, { value: 'suit', label: 'suit' }, { value: 'color', label: 'colour' }],
      },
      { key: 'scope', kind: 'select', label: 'Belongs to', options: SCOPE, def: 'table' },
      { key: 'keep', kind: 'select', label: 'Lasts', options: LASTS, def: 'hand' },
    ],
    build: (p) => ({
      op: 'appendVar', var: str(p.var, 'seen'), unique: true,
      value: { cardProp: String(p.what) as 'rank' | 'suit' | 'color' },
      ...scopeOf(p.scope), ...(p.keep === 'match' ? { keep: true } : {}),
    }),
  },
  {
    id: 'runRule', label: 'Run another rule', advanced: true,
    hint: "Names a rule by its id — the payout rule, the penalty rule — so several twists can share one piece of logic.",
    params: [{ key: 'rule', kind: 'text', label: 'Rule id', placeholder: 'rule2', def: 'rule2' }],
    build: (p) => ({ op: 'runRule', rule: str(p.rule, '') }),
  },
  {
    id: 'stopRules', label: 'Stop here — skip the rules below', advanced: true,
    hint: 'Everything after this rule sits out this event. How you write "this case is handled".',
    params: [], build: () => ({ op: 'stopRules' }),
  },
  {
    id: 'moveMany', label: 'Move cards between piles', advanced: true, params: [
      { key: 'from', kind: 'text', label: 'From', placeholder: 'discard', def: 'discard' },
      { key: 'to', kind: 'text', label: 'To', placeholder: 'draw', def: 'draw' },
      { key: 'count', kind: 'number', label: 'How many', min: 1, max: 52, def: 1 },
    ],
    build: (p) => ({ op: 'moveMany', from: str(p.from, 'discard'), to: str(p.to, 'draw'), count: { lit: n(p.count) } }),
  },
  // The rest of what the engine can already do. Every one of these ops has been in runEffects
  // since it was written; none of them had a way in from the builder.
  {
    id: 'chooseSuit', label: 'Ask them to name a suit',
    hint: 'What a wild card does — the player picks, and the pile follows their choice.',
    params: [{ key: 'var', kind: 'text', label: 'Remember it as', placeholder: 'activeSuit', def: 'activeSuit' }],
    build: (p) => ({ op: 'chooseSuit', setState: str(p.var, 'activeSuit') }),
  },
  {
    id: 'passCards', label: 'Everyone passes a card at once', params: [
      { key: 'direction', kind: 'select', label: 'Direction', def: 'left', options: [{ value: 'left', label: 'to the left' }, { value: 'right', label: 'to the right' }] },
    ],
    build: (p) => ({ op: 'passCards', direction: String(p.direction) as 'left' | 'right' }),
  },
  {
    id: 'forceDraw', label: 'Force a draw they cannot refuse', advanced: true,
    hint: 'Unlike "make someone draw", this cannot be dodged by a counter-play.',
    params: [
      { key: 'target', kind: 'select', label: 'Who', def: 'next', options: [{ value: 'next', label: 'the next player' }, { value: 'all', label: 'everyone' }, { value: 'others', label: 'everyone else' }] },
      { key: 'from', kind: 'text', label: 'From pile', placeholder: 'draw', def: 'draw' },
      { key: 'count', kind: 'number', label: 'Cards', min: 1, max: 10, def: 2 },
    ],
    build: (p) => ({ op: 'forceDraw', target: String(p.target) as never, from: str(p.from, 'draw'), count: n(p.count) }),
  },
  {
    id: 'drawUntilPlayable', label: 'Draw until they can play', advanced: true,
    params: [{ key: 'from', kind: 'text', label: 'From pile', placeholder: 'draw', def: 'draw' }],
    build: (p) => ({ op: 'drawUntilPlayable', from: str(p.from, 'draw') }),
  },
  {
    id: 'reshuffle', label: 'Reshuffle the discards back in', advanced: true, params: [
      { key: 'zone', kind: 'text', label: 'Into pile', placeholder: 'draw', def: 'draw' },
    ],
    build: (p) => ({ op: 'reshuffleDiscardInto', zone: str(p.zone, 'draw'), keepTop: true }),
  },
  {
    id: 'skipTo', label: 'Hand the turn straight to…', advanced: true,
    hint: 'Sets whose turn it is rather than stepping one seat along.',
    params: [{
      key: 'who', kind: 'select', label: 'Whose turn', def: 'next',
      options: [{ value: 'next', label: 'the next player' }, { value: 'prev', label: 'the previous player' }],
    }],
    build: (p) => ({ op: 'skipTo', player: String(p.who) as 'next' | 'prev' }),
  },
  {
    id: 'moveCard', label: 'Move the played card somewhere else', advanced: true,
    hint: 'Sends it to a pile other than the one it would normally go to.',
    params: [{ key: 'to', kind: 'text', label: 'To pile', placeholder: 'discard', def: 'discard' }],
    build: (p) => ({ op: 'move', card: '$target', to: str(p.to, 'discard') }),
  },
  {
    id: 'setFlag', label: 'Remember some text', advanced: true,
    hint: 'Like "remember a number", but for a word — a phase name, a suit, a player.',
    params: [
      { key: 'var', kind: 'text', label: 'Variable', placeholder: 'phase', def: 'phase' },
      { key: 'value', kind: 'text', label: 'Set to', placeholder: 'endgame', def: 'endgame' },
    ],
    build: (p) => ({ op: 'setState', var: str(p.var, 'flag'), value: str(p.value, '') }),
  },
];

// ---------- the draft an author edits ----------

/** One clause of a rule's condition. Several of them combine with all/any. */
export interface CondNode {
  condId: string;
  params: Record<string, ParamValue>;
  /** Inverts this clause alone — "the card is NOT a heart". */
  negate?: boolean;
}

export interface RuleDraft {
  id: string;
  name: string;
  when: RuleHook;
  /**
   * The condition, as one or more clauses joined by `condJoin`.
   *
   * A draft used to hold exactly one condition, which is why "the card is a queen AND a spade"
   * was unexpressible in the builder even though the engine's `all` predicate has always
   * understood it. `condId`/`condParams` are the old single-clause shape and are still read
   * when `conds` is missing, so drafts saved before this keep working.
   */
  conds?: CondNode[];
  condJoin?: 'all' | 'any';
  condId: string;
  condParams: Record<string, ParamValue>;
  /**
   * What the rule does. `onlyIf` gates one action on its own condition, compiling to the
   * engine's `if` op — which has existed in runEffects the whole time with no way to reach it,
   * so a rule could not branch: it did all of its actions or none of them.
   */
  effects: { specId: string; params: Record<string, ParamValue>; onlyIf?: CondNode }[];
  enabled: boolean;
  note?: string;
}

/** A draft's clauses, whichever shape it was saved in. */
export function condNodesOf(draft: RuleDraft): CondNode[] {
  if (draft.conds && draft.conds.length > 0) return draft.conds;
  return [{ condId: draft.condId, params: draft.condParams }];
}

export function defaultsFor(params: ParamSpec[]): Record<string, ParamValue> {
  const out: Record<string, ParamValue> = {};
  for (const p of params) out[p.key] = p.def;
  return out;
}

export function findCondition(id: string): ConditionSpec {
  return CONDITIONS.find((c) => c.id === id) ?? CONDITIONS[0];
}
export function findEffect(id: string): EffectSpec | undefined {
  return EFFECTS.find((e) => e.id === id);
}

export function newRuleDraft(seq: number): RuleDraft {
  const cond = CONDITIONS[1];
  const eff = EFFECTS[0];
  return {
    id: `rule${seq}`,
    name: `Rule ${seq}`,
    when: 'cardPlayed',
    condId: cond.id,
    condParams: defaultsFor(cond.params),
    effects: [{ specId: eff.id, params: defaultsFor(eff.params) }],
    enabled: true,
  };
}

/** One clause, built and inverted if it says so. */
function buildNode(node: CondNode): Predicate {
  const built = findCondition(node.condId).build(node.params);
  return node.negate ? { not: built } : built;
}

/** Every clause of a draft, folded into the one Predicate the engine evaluates. */
export function compileCondition(draft: RuleDraft): Predicate {
  const parts = condNodesOf(draft).map(buildNode);
  if (parts.length === 0) return { always: true };
  if (parts.length === 1) return parts[0];
  return draft.condJoin === 'any' ? { any: parts } : { all: parts };
}

/** Compile an author's draft into the data the engine runs. */
export function compileRule(draft: RuleDraft): CustomRule {
  const then = draft.effects
    .map((e): Effect | undefined => {
      const built = findEffect(e.specId)?.build(e.params);
      if (!built || !e.onlyIf) return built;
      return { op: 'if', cond: buildNode(e.onlyIf), then: [built] };
    })
    .filter((e): e is Effect => !!e);
  return {
    id: draft.id,
    name: draft.name,
    when: draft.when,
    if: compileCondition(draft),
    then,
    note: draft.note,
    enabled: draft.enabled,
    // Kept so the builder can re-open what it wrote. Ignored by the engine entirely.
    draft,
  };
}

export function compileRules(drafts: RuleDraft[]): CustomRule[] {
  return drafts.filter((d) => d.effects.length > 0).map(compileRule);
}

// ---------- patterns worth starting from ----------

/**
 * Two or three rules that only mean something together.
 *
 * The linking machinery — a counter one rule writes and another reads, a rule that calls
 * another, a rule that stops the ones below it — all works, and all of it is invisible until
 * somebody has seen it done once. These are that once: each drops in a set of real, editable
 * rules that already reference each other correctly.
 */
export interface RulePattern {
  id: string;
  name: string;
  blurb: string;
  build: (seq: number) => RuleDraft[];
}

const draft = (o: Partial<RuleDraft> & { id: string; name: string }): RuleDraft => ({
  when: 'cardPlayed', condId: 'always', condParams: {},
  conds: [{ condId: 'always', params: {} }], effects: [], enabled: true, ...o,
});

export const PATTERNS: RulePattern[] = [
  {
    id: 'streak',
    name: 'A streak that pays off',
    blurb: 'Counts each player\'s hearts, and pays out the moment somebody reaches three.',
    build: (n) => [
      draft({
        id: `p${n}count`, name: 'Count hearts',
        conds: [{ condId: 'suitIs', params: { suit: 'H' } }],
        effects: [{ specId: 'bump', params: { var: 'hearts', by: 1, scope: '$me', keep: 'hand' } }],
        note: 'Each player has their own count, because the counter belongs to them and not the table.',
      }),
      draft({
        id: `p${n}pay`, name: 'Three hearts pays',
        conds: [{ condId: 'varIs', params: { var: 'hearts', op: '>=', value: '3', scope: '$me' } }],
        effects: [
          { specId: 'addScore', params: { who: '$me', amount: 5, times: 'flat' } },
          { specId: 'remember', params: { var: 'hearts', value: 0, scope: '$me', keep: 'hand' } },
        ],
        note: 'Resets the count so the same three do not pay twice.',
      }),
    ],
  },
  {
    id: 'special-case',
    name: 'A special case, then the general rule',
    blurb: 'Handles one card differently and stops, so the rule below it never sees that card.',
    build: (n) => [
      draft({
        id: `p${n}special`, name: 'The queen of spades is different',
        conds: [{ condId: 'exactCard', params: { card: 'SQ' } }],
        effects: [
          { specId: 'addScore', params: { who: '$me', amount: 13, times: 'flat' } },
          { specId: 'stopRules', params: {} },
        ],
        note: 'Stopping here is what keeps the general rule below from firing as well.',
      }),
      draft({
        id: `p${n}general`, name: 'Every other spade',
        conds: [{ condId: 'suitIs', params: { suit: 'S' } }],
        effects: [{ specId: 'addScore', params: { who: '$me', amount: 1, times: 'flat' } }],
      }),
    ],
  },
  {
    id: 'shared-payout',
    name: 'Two rules sharing one payout',
    blurb: 'Two different triggers both call the same scoring rule, so the payout is written once.',
    build: (n) => [
      draft({
        id: `p${n}a`, name: 'An ace triggers it',
        conds: [{ condId: 'rankIs', params: { rank: 'A' } }],
        effects: [{ specId: 'runRule', params: { rule: `p${n}payout` } }],
      }),
      draft({
        id: `p${n}b`, name: 'So does going nearly out',
        when: 'turnEnd',
        conds: [{ condId: 'handSize', params: { op: '<=', value: 1 } }],
        effects: [{ specId: 'runRule', params: { rule: `p${n}payout` } }],
      }),
      draft({
        id: `p${n}payout`, name: 'The payout itself',
        conds: [{ condId: 'always', params: {} }],
        effects: [
          { specId: 'addScore', params: { who: '$me', amount: 3, times: 'flat' } },
          { specId: 'announce', params: { text: 'Bonus!' } },
        ],
        note: 'Change the payout here and both triggers above follow.',
      }),
    ],
  },
  {
    id: 'memory',
    name: 'Remembering what has been played',
    blurb: 'Builds a list of the suits seen this hand, and reacts once every one of them has shown up.',
    build: (n) => [
      draft({
        id: `p${n}see`, name: 'Note the suit',
        effects: [{ specId: 'rememberCard', params: { var: 'suitsSeen', what: 'suit', scope: 'table', keep: 'hand' } }],
      }),
      draft({
        id: `p${n}all`, name: 'All four have appeared',
        condJoin: 'all',
        conds: [
          { condId: 'listHas', params: { var: 'suitsSeen', value: 'C', scope: 'table' } },
          { condId: 'listHas', params: { var: 'suitsSeen', value: 'D', scope: 'table' } },
          { condId: 'listHas', params: { var: 'suitsSeen', value: 'H', scope: 'table' } },
          { condId: 'listHas', params: { var: 'suitsSeen', value: 'S', scope: 'table' } },
        ],
        effects: [{ specId: 'announce', params: { text: 'Every suit has been played.' } }],
      }),
    ],
  },
];

// ---------- plays a game forbids ----------

/**
 * A restriction is a rule with no `then`: it says which cards may not be played and nothing
 * else. Same clause composer, same conditions, so an author who can write "when a heart is
 * played, score a point" can write "a heart may not be led" with the parts they already know.
 */
export interface RestrictionDraft {
  id: string;
  name: string;
  conds: CondNode[];
  condJoin?: 'all' | 'any';
  note?: string;
  enabled: boolean;
}

export function newRestrictionDraft(seq: number): RestrictionDraft {
  const cond = CONDITIONS[1];
  return {
    id: `no${seq}`,
    name: `Restriction ${seq}`,
    conds: [{ condId: cond.id, params: defaultsFor(cond.params) }],
    enabled: true,
  };
}

export function compileRestriction(draft: RestrictionDraft): PlayRestriction {
  const parts = draft.conds.map(buildNode);
  const cond: Predicate = parts.length === 0 ? { not: { always: true } }
    : parts.length === 1 ? parts[0]
    : draft.condJoin === 'any' ? { any: parts } : { all: parts };
  return { id: draft.id, name: draft.name, if: cond, note: draft.note, enabled: draft.enabled, draft };
}

export function compileRestrictions(drafts: RestrictionDraft[]): PlayRestriction[] {
  return drafts.filter((d) => d.conds.length > 0).map(compileRestriction);
}
