// The authoring model for the shedding/matching family. A "game" the user builds is a
// set of KNOBS; buildDefinition() compiles those knobs into a full GameDefinition the engine
// can run. This is what the visual editor edits and what the AI co-pilot writes to.

import { Effect, GameDefinition, Predicate, Rank, Suit } from '../engine/types';

export const RANKS_13: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export interface Knobs {
  family: 'shedding' | 'trick';
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  // trick-taking
  trump: Suit | 'none';
  mustFollowSuit: boolean;
  aceHigh: boolean;
  trickScoreBy: 'mostTricks' | 'fewestTricks';
  // deck
  handSize: number;
  deckCount: number;
  excludeRanks: Rank[];
  includeJokers: boolean;
  // matching
  matchSuit: boolean;
  matchRank: boolean;
  matchColor: boolean;
  // drawing
  canAlwaysDraw: boolean;
  drawUntilCanPlay: boolean;
  // special cards
  wildRanks: Rank[];
  skipRanks: Rank[];
  reverseRanks: Rank[];
  drawRanks: Rank[];
  drawCount: number;
  extraTurnRanks: Rank[];
  wildDrawRanks: Rank[];
  wildDrawCount: number;
  // flow & endgame
  direction: 'clockwise' | 'counter-clockwise';
  reshuffleWhenEmpty: boolean;
  winMode: 'firstOut' | 'lowestTotal' | 'highestTotal';
  pointTarget: number;
  // scoring
  perRankPoints: Record<string, number>;
  jokerPoints: number;
}

export const RANK_CHOICES: Rank[] = [...RANKS_13, 'JOKER'];

const defaultPoints: Record<string, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 10, Q: 10, K: 10,
};

export const defaultKnobs: Knobs = {
  family: 'shedding',
  name: 'My Card Game',
  description: '',
  minPlayers: 2,
  maxPlayers: 6,
  trump: 'S',
  mustFollowSuit: true,
  aceHigh: true,
  trickScoreBy: 'mostTricks',
  handSize: 5,
  deckCount: 1,
  excludeRanks: [],
  includeJokers: false,
  matchSuit: true,
  matchRank: true,
  matchColor: false,
  canAlwaysDraw: false,
  drawUntilCanPlay: false,
  wildRanks: ['8'],
  skipRanks: [],
  reverseRanks: [],
  drawRanks: [],
  drawCount: 2,
  extraTurnRanks: [],
  wildDrawRanks: [],
  wildDrawCount: 4,
  direction: 'clockwise',
  reshuffleWhenEmpty: true,
  winMode: 'firstOut',
  pointTarget: 100,
  perRankPoints: { ...defaultPoints },
  jokerPoints: 50,
};

export function buildDefinition(knobs: Knobs, id = 'draft'): GameDefinition {
  return knobs.family === 'trick' ? buildTrickDefinition(knobs, id) : buildSheddingDefinition(knobs, id);
}

function buildTrickDefinition(knobs: Knobs, id: string): GameDefinition {
  return {
    schemaVersion: '1.0',
    meta: {
      id, name: knobs.name, description: knobs.description || autoTrickDescription(knobs),
      players: { min: clampInt(knobs.minPlayers, 2, 8), max: clampInt(knobs.maxPlayers, knobs.minPlayers, 8) },
      family: 'trick-taking',
    },
    deck: { base: 'standard54', includeJokers: knobs.includeJokers, deckCount: 1, excludeRanks: knobs.excludeRanks, rankOrder: RANKS_13, tags: {} },
    zones: [
      { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
      { id: 'trick', type: 'trick', ordered: true, faceDown: false, visibility: 'all', shared: true },
      { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    ],
    setup: [
      { op: 'shuffle', zone: 'draw' },
      { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: knobs.handSize },
    ],
    turnFlow: { order: knobs.direction, startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
    actions: [],
    triggers: [],
    endConditions: [{ id: 'handsEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' }],
    scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: null },
    trick: { trump: knobs.trump, mustFollowSuit: knobs.mustFollowSuit, aceHigh: knobs.aceHigh, scoreBy: knobs.trickScoreBy },
  };
}

function buildSheddingDefinition(knobs: Knobs, id: string): GameDefinition {
  const wildAll = dedup([...knobs.wildRanks, ...knobs.wildDrawRanks]);

  const tags: GameDefinition['deck']['tags'] = {};
  if (wildAll.length) tags.wild = { ranks: wildAll };
  if (knobs.skipRanks.length) tags.skip = { ranks: knobs.skipRanks };
  if (knobs.reverseRanks.length) tags.reverse = { ranks: knobs.reverseRanks };
  if (knobs.drawRanks.length) tags.drawTwo = { ranks: knobs.drawRanks };
  if (knobs.extraTurnRanks.length) tags.again = { ranks: knobs.extraTurnRanks };
  if (knobs.wildDrawRanks.length) tags.wildDraw = { ranks: knobs.wildDrawRanks };

  const triggers: GameDefinition['triggers'] = [];
  if (knobs.skipRanks.length) triggers.push({ on: 'cardPlayed', cardHasTag: 'skip', do: [{ op: 'skipNext' }] });
  if (knobs.reverseRanks.length) triggers.push({ on: 'cardPlayed', cardHasTag: 'reverse', do: [{ op: 'reverseOrder' }] });
  if (knobs.drawRanks.length) {
    triggers.push({ on: 'cardPlayed', cardHasTag: 'drawTwo', do: [{ op: 'forceDraw', target: 'next', from: 'draw', count: knobs.drawCount }, { op: 'skipNext' }] });
  }
  if (knobs.extraTurnRanks.length) triggers.push({ on: 'cardPlayed', cardHasTag: 'again', do: [{ op: 'extraTurn' }] });
  if (knobs.wildDrawRanks.length) {
    triggers.push({ on: 'cardPlayed', cardHasTag: 'wildDraw', do: [{ op: 'forceDraw', target: 'next', from: 'draw', count: knobs.wildDrawCount }, { op: 'skipNext' }] });
  }
  if (knobs.reshuffleWhenEmpty) triggers.push({ on: 'drawPileEmpty', do: [{ op: 'reshuffleDiscardInto', zone: 'draw', keepTop: true }] });

  const matchClauses: Predicate[] = [];
  if (knobs.matchSuit) matchClauses.push({ matches: { cardProp: 'suit', equalsStateOrTopOf: ['activeSuit', 'discard'] } });
  if (knobs.matchRank) matchClauses.push({ matches: { cardProp: 'rank', equalsTopOf: 'discard' } });
  if (knobs.matchColor) matchClauses.push({ matches: { cardProp: 'color', equalsTopOf: 'discard' } });
  if (wildAll.length) matchClauses.push({ cardHasTag: 'wild' });
  // Never leave the play with zero ways to match (that would be unplayable): fall back to rank.
  if (matchClauses.length === 0) matchClauses.push({ matches: { cardProp: 'rank', equalsTopOf: 'discard' } });

  const playEffects: Effect[] = [
    { op: 'move', card: '$target', to: 'discard' },
    { op: 'setState', var: 'activeSuit', value: '$target.suit' },
  ];
  if (wildAll.length) playEffects.push({ op: 'if', cond: { cardHasTag: 'wild' }, then: [{ op: 'chooseSuit', setState: 'activeSuit' }] });

  const drawEffects: Effect[] = knobs.drawUntilCanPlay && !knobs.canAlwaysDraw
    ? [{ op: 'drawUntilPlayable', from: 'draw' }]
    : [{ op: 'move', from: 'draw', to: 'hand', count: 1 }];
  const drawWhen: Predicate = knobs.canAlwaysDraw ? { always: true } : { not: { existsLegal: 'playCard' } };

  const cardPoints: Record<string, number | 'rankValue'> = { JOKER: knobs.jokerPoints };
  for (const r of RANKS_13) cardPoints[r] = knobs.perRankPoints[r] ?? 0;

  return {
    schemaVersion: '1.0',
    meta: {
      id, name: knobs.name, description: knobs.description || autoDescription(knobs),
      players: { min: clampInt(knobs.minPlayers, 2, 8), max: clampInt(knobs.maxPlayers, knobs.minPlayers, 8) },
      family: 'shedding-matching',
    },
    deck: {
      base: 'standard54',
      includeJokers: knobs.includeJokers,
      deckCount: clampInt(knobs.deckCount, 1, 3),
      excludeRanks: knobs.excludeRanks,
      rankOrder: RANKS_13,
      tags,
    },
    zones: [
      { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
      { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
      { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    ],
    setup: [
      { op: 'shuffle', zone: 'draw' },
      { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: knobs.handSize },
      { op: 'move', from: 'draw', to: 'discard', count: 1 },
    ],
    turnFlow: { order: knobs.direction, startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
    actions: [
      { id: 'playCard', target: { from: 'hand', select: 'one' }, when: { any: matchClauses }, effects: playEffects },
      { id: 'drawCard', when: drawWhen, effects: drawEffects },
    ],
    triggers,
    endConditions: [
      { id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
    ],
    scoring: {
      mode: knobs.winMode === 'firstOut' ? 'firstToEmptyWins' : 'lowestPoints',
      cardPoints,
      target: knobs.pointTarget,
      winner: knobs.winMode,
    },
  };
}

// Best-effort: read knobs back out of a definition, so you can REMIX a classic.
export function knobsFromDefinition(def: GameDefinition): Knobs {
  const deal = def.setup.find((s) => s.op === 'deal') as { countPerPlayer: number } | undefined;
  const tagRanks = (t: string) => def.deck.tags[t]?.ranks ?? [];
  const play = def.actions.find((a) => a.id === 'playCard');
  const clauses = play && 'any' in play.when ? play.when.any : [];
  const hasMatch = (prop: string) => clauses.some((c) => 'matches' in c && c.matches.cardProp === prop);
  const drawTrig = def.triggers.find((t) => t.on === 'cardPlayed' && t.cardHasTag === 'drawTwo');
  const wildDrawTrig = def.triggers.find((t) => t.on === 'cardPlayed' && t.cardHasTag === 'wildDraw');
  const countOf = (trig: typeof drawTrig, d: number) => {
    const fd = trig?.do.find((e) => e.op === 'forceDraw') as { count: number } | undefined;
    return fd?.count ?? d;
  };
  const drawAction = def.actions.find((a) => a.id === 'drawCard');
  const cp = def.scoring.cardPoints || {};
  const perRank: Record<string, number> = {};
  for (const r of RANKS_13) perRank[r] = typeof cp[r] === 'number' ? (cp[r] as number) : (defaultPoints[r] ?? 0);
  const wildDrawRanks = tagRanks('wildDraw');
  const wildRanks = tagRanks('wild').filter((r) => !wildDrawRanks.includes(r));

  return {
    family: def.trick ? 'trick' : 'shedding',
    trump: def.trick?.trump ?? 'S',
    mustFollowSuit: def.trick?.mustFollowSuit ?? true,
    aceHigh: def.trick?.aceHigh ?? true,
    trickScoreBy: def.trick?.scoreBy === 'fewestTricks' ? 'fewestTricks' : 'mostTricks',
    name: def.meta.name,
    description: def.meta.description,
    minPlayers: def.meta.players.min,
    maxPlayers: def.meta.players.max,
    handSize: deal?.countPerPlayer ?? 5,
    deckCount: def.deck.deckCount ?? 1,
    excludeRanks: def.deck.excludeRanks ?? [],
    includeJokers: def.deck.includeJokers,
    matchSuit: hasMatch('suit'),
    matchRank: hasMatch('rank'),
    matchColor: hasMatch('color'),
    canAlwaysDraw: !!drawAction && 'always' in (drawAction.when as object),
    drawUntilCanPlay: !!drawAction?.effects.some((e) => e.op === 'drawUntilPlayable'),
    wildRanks,
    skipRanks: tagRanks('skip'),
    reverseRanks: tagRanks('reverse'),
    drawRanks: tagRanks('drawTwo'),
    drawCount: countOf(drawTrig, 2),
    extraTurnRanks: tagRanks('again'),
    wildDrawRanks,
    wildDrawCount: countOf(wildDrawTrig, 4),
    direction: def.turnFlow.order,
    reshuffleWhenEmpty: def.triggers.some((t) => t.on === 'drawPileEmpty'),
    winMode: def.scoring.winner,
    pointTarget: typeof def.scoring.target === 'number' ? def.scoring.target : 100,
    perRankPoints: perRank,
    jokerPoints: typeof cp.JOKER === 'number' ? (cp.JOKER as number) : 50,
  };
}

export function rankLabel(r: Rank): string { return r === 'JOKER' ? 'Joker' : r; }

const SUIT_WORD: Record<string, string> = { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades', none: 'no suit' };
function autoTrickDescription(k: Knobs): string {
  const parts = [`A trick-taking game. Deal ${k.handSize} cards each.`];
  parts.push(k.mustFollowSuit ? 'You must follow the led suit if you can.' : 'You may play any card.');
  if (k.trump !== 'none') parts.push(`${SUIT_WORD[k.trump]} are trump and beat every other suit.`);
  parts.push('The highest card wins the trick and leads the next.');
  parts.push(k.trickScoreBy === 'mostTricks' ? 'Take the most tricks to win.' : 'Take the fewest tricks to win.');
  return parts.join(' ');
}

function dedup(rs: Rank[]): Rank[] { return Array.from(new Set(rs)); }
function clampInt(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, Math.round(n))); }

function autoDescription(k: Knobs): string {
  const list = (rs: Rank[]) => rs.map(rankLabel).join('/');
  const crit: string[] = [];
  if (k.matchSuit) crit.push('suit');
  if (k.matchRank) crit.push('rank');
  if (k.matchColor) crit.push('color');
  const parts = [`Match the top card by ${crit.join(' or ') || 'rank'}. Deal ${k.handSize} cards each${k.deckCount > 1 ? ` from ${k.deckCount} decks` : ''}.`];
  if (k.excludeRanks.length) parts.push(`${list(k.excludeRanks)} are removed from the deck.`);
  if (k.wildRanks.length) parts.push(`${list(k.wildRanks)} are wild.`);
  if (k.wildDrawRanks.length) parts.push(`${list(k.wildDrawRanks)} are wild and make the next player draw ${k.wildDrawCount}.`);
  if (k.skipRanks.length) parts.push(`${list(k.skipRanks)} skip the next player.`);
  if (k.reverseRanks.length) parts.push(`${list(k.reverseRanks)} reverse direction.`);
  if (k.drawRanks.length) parts.push(`${list(k.drawRanks)} make the next player draw ${k.drawCount}.`);
  if (k.extraTurnRanks.length) parts.push(`${list(k.extraTurnRanks)} let you play again.`);
  if (k.drawUntilCanPlay) parts.push('If you cannot play, keep drawing until you can.');
  parts.push(k.winMode === 'firstOut' ? 'First to empty their hand wins.'
    : k.winMode === 'highestTotal' ? 'Highest points wins.' : 'Lowest points wins.');
  return parts.join(' ');
}
