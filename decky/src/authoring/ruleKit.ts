import { CustomRule, Effect, Predicate, Rank, RuleHook, Suit } from '../engine/types';

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
  | { key: string; kind: 'text'; label: string; placeholder?: string; def: string };

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
];

const RANKS: { value: string; label: string }[] =
  ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
    .map((r) => ({ value: r, label: { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' }[r] ?? r }));

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

const asWho = (v: ParamValue) => String(v) as '$me' | '$next' | '$prev' | '$all' | '$others';
const asOp = (v: ParamValue) => String(v) as '==' | '!=' | '>' | '>=' | '<' | '<=';
const n = (v: ParamValue) => Number(v) || 0;

// ---------- when ----------

export const HOOKS: { value: RuleHook; label: string; hint: string }[] = [
  { value: 'cardPlayed', label: 'A card is played', hint: 'The most common trigger — reacts to whatever just hit the pile.' },
  { value: 'turnStart', label: 'A turn begins', hint: 'Before the player chooses anything.' },
  { value: 'turnEnd', label: 'A turn ends', hint: 'After their move has resolved.' },
  { value: 'handStart', label: 'A hand is dealt', hint: 'Once, at the very start.' },
  { value: 'cardDrawn', label: 'A player draws', hint: 'Fires on a draw rather than a play.' },
  { value: 'trickWon', label: 'A trick is won', hint: 'Trick-taking games only.' },
  { value: 'drawPileEmpty', label: 'The draw pile empties', hint: 'Good for endgame rules.' },
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
    build: (p) => ({ cmp: { left: { count: String(p.zone) }, op: asOp(p.op), right: { lit: n(p.value) } } }),
  },
  {
    id: 'varIs', label: 'A game variable is…', advanced: true,
    hint: 'Pairs with the "remember a number" effect to build counters and state machines.',
    params: [
      { key: 'var', kind: 'text', label: 'Variable', placeholder: 'streak', def: 'streak' },
      { key: 'op', kind: 'select', label: 'Comparison', options: OPS, def: '>=' },
      { key: 'value', kind: 'text', label: 'Value', placeholder: '3', def: '3' },
    ],
    build: (p) => ({ cmp: { left: { stateVar: String(p.var) }, op: asOp(p.op), right: { lit: String(p.value) } } }),
  },
];

// ---------- effects ----------

export const EFFECTS: EffectSpec[] = [
  {
    id: 'addScore', label: 'Give points', params: [
      { key: 'who', kind: 'select', label: 'To', options: WHO, def: '$me' },
      { key: 'amount', kind: 'number', label: 'Points', min: -100, max: 100, def: 5 },
    ],
    build: (p) => ({ op: 'addScore', player: asWho(p.who), amount: { lit: n(p.amount) } }),
  },
  {
    id: 'announce', label: 'Say something', hint: 'Writes a line into the game log.',
    params: [{ key: 'text', kind: 'text', label: 'Message', placeholder: 'Bonus!', def: 'Bonus!' }],
    build: (p) => ({ op: 'announce', text: String(p.text) }),
  },
  { id: 'extraTurn', label: 'Play again', params: [], build: () => ({ op: 'extraTurn' }) },
  { id: 'skipNext', label: 'Skip the next player', params: [], build: () => ({ op: 'skipNext' }) },
  { id: 'reverse', label: 'Reverse the direction of play', params: [], build: () => ({ op: 'reverseOrder' }) },
  {
    id: 'draw', label: 'Make someone draw', params: [
      { key: 'who', kind: 'select', label: 'Who', options: WHO, def: '$next' },
      { key: 'count', kind: 'number', label: 'Cards', min: 1, max: 10, def: 2 },
    ],
    build: (p) => ({ op: 'drawTo', player: asWho(p.who), from: 'draw', count: { lit: n(p.count) } }),
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
    ],
    build: (p) => ({ op: 'setVarNum', var: String(p.var), value: { lit: n(p.value) } }),
  },
  {
    id: 'bump', label: 'Add to a remembered number', advanced: true,
    params: [
      { key: 'var', kind: 'text', label: 'Variable', placeholder: 'streak', def: 'streak' },
      { key: 'by', kind: 'number', label: 'Add', min: -20, max: 20, def: 1 },
    ],
    build: (p) => ({ op: 'setVarNum', var: String(p.var), value: { add: [{ stateVar: String(p.var) }, { lit: n(p.by) }] } }),
  },
  {
    id: 'moveMany', label: 'Move cards between piles', advanced: true, params: [
      { key: 'from', kind: 'text', label: 'From', placeholder: 'discard', def: 'discard' },
      { key: 'to', kind: 'text', label: 'To', placeholder: 'draw', def: 'draw' },
      { key: 'count', kind: 'number', label: 'How many', min: 1, max: 52, def: 1 },
    ],
    build: (p) => ({ op: 'moveMany', from: String(p.from), to: String(p.to), count: { lit: n(p.count) } }),
  },
];

// ---------- the draft an author edits ----------

export interface RuleDraft {
  id: string;
  name: string;
  when: RuleHook;
  condId: string;
  condParams: Record<string, ParamValue>;
  effects: { specId: string; params: Record<string, ParamValue> }[];
  enabled: boolean;
  note?: string;
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

/** Compile an author's draft into the data the engine runs. */
export function compileRule(draft: RuleDraft): CustomRule {
  const cond = findCondition(draft.condId);
  const then = draft.effects
    .map((e) => findEffect(e.specId)?.build(e.params))
    .filter((e): e is Effect => !!e);
  return {
    id: draft.id,
    name: draft.name,
    when: draft.when,
    if: cond.build(draft.condParams),
    then,
    note: draft.note,
    enabled: draft.enabled,
  };
}

export function compileRules(drafts: RuleDraft[]): CustomRule[] {
  return drafts.filter((d) => d.effects.length > 0).map(compileRule);
}
