// The vocabulary, written out for a model to read.
//
// This is generated from CONDITIONS, EFFECTS, HOOKS and the knob defaults rather than typed out
// by hand, which matters more than it sounds: a hand-written prompt drifts the moment somebody
// adds an ingredient, and a model told about an effect that no longer exists writes a game that
// silently loses a rule. Adding an ingredient to ruleKit.ts changes this text automatically.

import { CONDITIONS, EFFECTS, HOOKS, ParamSpec } from './ruleKit';
import { defaultKnobs, Knobs } from './knobs';

function param(p: ParamSpec): string {
  if (p.kind === 'number') {
    const range = [p.min != null ? `min ${p.min}` : '', p.max != null ? `max ${p.max}` : '']
      .filter(Boolean).join(', ');
    return `${p.key}: number${range ? ` (${range})` : ''}, default ${p.def}`;
  }
  if (p.kind === 'select') {
    return `${p.key}: one of ${p.options.map((o) => JSON.stringify(o.value)).join(' | ')}, default ${JSON.stringify(p.def)}`;
  }
  return `${p.key}: string, default ${JSON.stringify(p.def)}`;
}

function ingredient(x: { id: string; label: string; hint?: string; params: ParamSpec[] }): string {
  const ps = x.params.length ? x.params.map((p) => `      - ${param(p)}`).join('\n') : '      (no parameters)';
  return `  - "${x.id}" — ${x.label}${x.hint ? `. ${x.hint}` : ''}\n${ps}`;
}

/** Which knobs matter for a family. Offering all ninety to the model invites nonsense. */
const BY_FAMILY: Record<Knobs['family'], (keyof Knobs)[]> = {
  shedding: ['handSize', 'matchSuit', 'matchRank', 'matchColor', 'canAlwaysDraw', 'drawUntilCanPlay',
    'wildRanks', 'skipRanks', 'reverseRanks', 'drawRanks', 'drawCount', 'extraTurnRanks',
    'wildDrawRanks', 'wildDrawCount', 'passRanks', 'passDirectionKnob', 'direction',
    'reshuffleWhenEmpty', 'winMode', 'perRankPoints', 'jokerPoints'],
  trick: ['handSize', 'trump', 'mustFollowSuit', 'aceHigh', 'trickScoreBy', 'trickBidding',
    'trickPartnerships', 'bustEnabled', 'bustScore', 'heartsValue', 'queenSpadesValue',
    'trumpAuction', 'bowers', 'goAlone', 'shootTheMoon', 'brokenSuitLead', 'forceOpeningLead',
    'handPassCount'],
  climb: ['handSize', 'climbTwosHigh', 'climbCombos', 'climbBombSize', 'direction'],
  fish: ['handSize', 'bookSize'],
  rummy: ['handSize', 'rummySetMin', 'rummyRunMin', 'rummyKnock', 'rummyKnockAt', 'rummyLayOff',
    'perRankPoints'],
  war: ['warRoundCap'],
  bluff: [],
  reflex: ['reflexSlapRanks', 'reflexSlapMatch'],
  poker: ['pokerHandSize', 'pokerStartingChips', 'pokerAnte', 'pokerSmallBlind', 'pokerBigBlind', 'pokerMinRaise'],
  pit: ['pitCornerSize'],
  solitaire: ['solColumns', 'solDeal', 'solFaceUp', 'solBuild', 'solMoveRun', 'solEmpty',
    'solFreeCells', 'solFoundations', 'solAutoRuns', 'solStock', 'solStockTurn', 'solRedeals',
    'solDecks'],
};

const ALWAYS: (keyof Knobs)[] = ['name', 'description', 'minPlayers', 'maxPlayers',
  'deckCount', 'excludeRanks', 'includeJokers', 'matchPlay', 'pointTarget'];

function knobLine(k: keyof Knobs): string {
  const v = defaultKnobs[k];
  return `  - ${k}: ${JSON.stringify(v)}`;
}

/** The full briefing. Stable text, so it caches well between requests. */
export function authorSpec(): string {
  return `You are writing a card game for the Decky engine.

You do not write code. You return a JSON object describing the game, which the engine compiles
and runs. Anything you cannot express here does not exist — do not invent fields, ingredient ids
or values that are not listed below.

# What you return

{
  "name": string,
  "description": string,          // two or three sentences, how it plays
  "knobs": { ... },               // any subset of the knobs below
  "rules": [ ... ],               // zero or more custom rules
  "notes": [ string ]             // anything you had to assume or could not express
}

Return ONLY that JSON object. No prose around it, no markdown fence.

# Families

Every game is one of eleven families. The family decides the shape of a turn, so pick it first.

  - "shedding"  — play a card that matches the pile; first to empty their hand wins.
                  (Crazy Eights, Switch, Uno-likes)
  - "trick"     — everyone plays one card, highest takes the trick.
                  (Hearts, Spades, Euchre, Whist)
  - "climb"     — each play must beat the last or you pass; first out wins.
                  (President, Big Two)
  - "fish"      — ask another player for a rank, collect sets.
                  (Go Fish, Authors)
  - "rummy"     — draw and discard, build sets and runs.
                  (Rummy, Gin)
  - "war"       — everyone flips, highest card takes the pile. No decisions.
  - "solitaire" — one player, a tableau, foundations.
  - "bluff"      — play cards face down while claiming a rank; anyone may call it a lie.
                  Whoever is wrong takes the pile. First to empty their hand wins.
                  (Cheat, "I Doubt It") Every claim is a group of 1-4 cards that actually
                  share their real rank in your hand — the LIE is only in what you call that
                  rank, not in mixing unrelated cards together.
  - "reflex"     — flip a card each turn onto a shared pile; whenever the top card (or, with
                  reflexSlapMatch, the top two) matches, ANY player may slap to take the whole
                  pile, not just whoever's turn it is. Last player holding cards wins.
                  (Slapjack, Snap)
  - "poker"      — a fixed deal, real chips, one round of betting (check/bet/call/raise/fold),
                  then a showdown. No streets, no draw phase, no side pots — say so in "notes"
                  if the description wants those; they are not available.
  - "pit"        — no turn order at all. Any player may post an open offer to trade N cards of
                  one suit for N of another; any OTHER player holding the wanted suit may
                  accept it instantly. First to hold cornerSize cards of one suit wins.
                  (Pit, commodities trading) Suits stand in for commodities — there is no way
                  to define custom commodities beyond the four suits.

# Knobs

Always available:
${ALWAYS.map(knobLine).join('\n')}

Per family (only set the ones for the family you chose):

${(Object.keys(BY_FAMILY) as Knobs['family'][])
  .map((f) => `${f}:\n${BY_FAMILY[f].map(knobLine).join('\n')}`)
  .join('\n\n')}

Ranks are "A" "2".."10" "J" "Q" "K" and "JOKER". Suits are "C" "D" "H" "S".
perRankPoints is a map of rank to number, e.g. {"K": 10, "A": 1}.

# Custom rules

A rule is when / if / then. Shape:

{
  "id": "rule1",
  "name": "short name",
  "when": one of ${HOOKS.map((h) => JSON.stringify(h.value)).join(' | ')},
  "condId": one of the condition ids below,
  "condParams": { ... },
  "effects": [ { "specId": one of the effect ids below, "params": { ... } } ],
  "enabled": true,
  "note": "one line on why"
}

## when
${HOOKS.map((h) => `  - "${h.value}" — ${h.label}. ${h.hint}`).join('\n')}

## condId
${CONDITIONS.map(ingredient).join('\n')}

## effects
${EFFECTS.map(ingredient).join('\n')}

# Rules of thumb

- Use knobs first. Only write a custom rule for something no knob covers.
- A game must be able to END. If nothing forces progress, players stall forever and the
  simulator will reject it.
- Do not set knobs from a family you did not choose; they are ignored.
- If the description asks for something the vocabulary cannot express, get as close as you can
  and say exactly what is missing in "notes". Do not pretend it worked.
`;
}
