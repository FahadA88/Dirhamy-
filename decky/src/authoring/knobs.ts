// The authoring model for the shedding/matching family. A "game" the user builds is a
// set of KNOBS; buildDefinition() compiles those knobs into a full GameDefinition the engine
// can run. This is what the visual editor edits and what the AI co-pilot writes to.

import { GameDefinition, Rank } from '../engine/types';

export interface Knobs {
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  handSize: number;
  direction: 'clockwise' | 'counter-clockwise';
  canAlwaysDraw: boolean;    // true = draw anytime; false = only when you can't play
  wildRanks: Rank[];         // playable anytime → then name a suit
  skipRanks: Rank[];         // playing one skips the next player
  reverseRanks: Rank[];      // playing one reverses direction
  drawRanks: Rank[];         // playing one makes the next player draw N and miss a turn
  drawCount: number;         // how many the next player draws
  includeJokers: boolean;
  reshuffleWhenEmpty: boolean;
  winMode: 'firstOut' | 'lowestTotal';
  pointTarget: number;       // play up to this many points across rounds (advisory metadata)
  points: { joker: number; eight: number; face: number; ace: number }; // card values for scoring
}

export const RANK_CHOICES: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'JOKER'];

export const defaultKnobs: Knobs = {
  name: 'My Card Game',
  description: '',
  minPlayers: 2,
  maxPlayers: 6,
  handSize: 5,
  direction: 'clockwise',
  canAlwaysDraw: false,
  wildRanks: ['8'],
  skipRanks: [],
  reverseRanks: [],
  drawRanks: [],
  drawCount: 2,
  includeJokers: false,
  reshuffleWhenEmpty: true,
  winMode: 'firstOut',
  pointTarget: 100,
  points: { joker: 50, eight: 50, face: 10, ace: 1 },
};

export function buildDefinition(knobs: Knobs, id = 'draft'): GameDefinition {
  const tags: GameDefinition['deck']['tags'] = {};
  if (knobs.wildRanks.length) tags.wild = { ranks: knobs.wildRanks };
  if (knobs.skipRanks.length) tags.skip = { ranks: knobs.skipRanks };
  if (knobs.reverseRanks.length) tags.reverse = { ranks: knobs.reverseRanks };
  if (knobs.drawRanks.length) tags.drawTwo = { ranks: knobs.drawRanks };

  const triggers: GameDefinition['triggers'] = [];
  if (knobs.skipRanks.length) triggers.push({ on: 'cardPlayed', cardHasTag: 'skip', do: [{ op: 'skipNext' }] });
  if (knobs.reverseRanks.length) triggers.push({ on: 'cardPlayed', cardHasTag: 'reverse', do: [{ op: 'reverseOrder' }] });
  if (knobs.drawRanks.length) {
    triggers.push({
      on: 'cardPlayed', cardHasTag: 'drawTwo',
      do: [{ op: 'forceDraw', target: 'next', from: 'draw', count: knobs.drawCount }, { op: 'skipNext' }],
    });
  }
  if (knobs.reshuffleWhenEmpty) {
    triggers.push({ on: 'drawPileEmpty', do: [{ op: 'reshuffleDiscardInto', zone: 'draw', keepTop: true }] });
  }

  const whenPlay: GameDefinition['actions'][number]['when'] = {
    any: [
      { matches: { cardProp: 'suit', equalsStateOrTopOf: ['activeSuit', 'discard'] } },
      { matches: { cardProp: 'rank', equalsTopOf: 'discard' } },
      ...(knobs.wildRanks.length ? [{ cardHasTag: 'wild' } as const] : []),
    ],
  };

  const playEffects: GameDefinition['actions'][number]['effects'] = [
    { op: 'move', card: '$target', to: 'discard' },
    { op: 'setState', var: 'activeSuit', value: '$target.suit' },
  ];
  if (knobs.wildRanks.length) {
    playEffects.push({ op: 'if', cond: { cardHasTag: 'wild' }, then: [{ op: 'chooseSuit', setState: 'activeSuit' }] });
  }

  const drawWhen: GameDefinition['actions'][number]['when'] =
    knobs.canAlwaysDraw ? { always: true } : { not: { existsLegal: 'playCard' } };

  return {
    schemaVersion: '1.0',
    meta: {
      id,
      name: knobs.name,
      description: knobs.description || autoDescription(knobs),
      players: { min: clampInt(knobs.minPlayers, 2, 8), max: clampInt(knobs.maxPlayers, knobs.minPlayers, 8) },
      family: 'shedding-matching',
    },
    deck: {
      base: 'standard54',
      includeJokers: knobs.includeJokers,
      rankOrder: ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'],
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
      { id: 'playCard', target: { from: 'hand', select: 'one' }, when: whenPlay, effects: playEffects },
      { id: 'drawCard', when: drawWhen, effects: [{ op: 'move', from: 'draw', to: 'hand', count: 1 }] },
    ],
    triggers,
    endConditions: [
      { id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
    ],
    scoring: {
      mode: knobs.winMode === 'firstOut' ? 'firstToEmptyWins' : 'lowestPoints',
      cardPoints: {
        JOKER: knobs.points.joker, '8': knobs.points.eight,
        K: knobs.points.face, Q: knobs.points.face, J: knobs.points.face, '10': knobs.points.face,
        default: 'rankValue', A: knobs.points.ace,
      },
      target: knobs.pointTarget,
      winner: knobs.winMode === 'firstOut' ? 'firstOut' : 'lowestTotal',
    },
  };
}

// Best-effort: read knobs back out of a definition, so you can REMIX a classic.
export function knobsFromDefinition(def: GameDefinition): Knobs {
  const deal = def.setup.find((s) => s.op === 'deal') as { countPerPlayer: number } | undefined;
  const tagRanks = (t: string) => def.deck.tags[t]?.ranks ?? [];
  const drawTrig = def.triggers.find((t) => t.on === 'cardPlayed' && t.cardHasTag === 'drawTwo');
  const forceDraw = drawTrig?.do.find((e) => e.op === 'forceDraw') as { count: number } | undefined;
  const drawAction = def.actions.find((a) => a.id === 'drawCard');
  const cp = def.scoring.cardPoints || {};
  const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d);
  return {
    name: def.meta.name,
    description: def.meta.description,
    minPlayers: def.meta.players.min,
    maxPlayers: def.meta.players.max,
    handSize: deal?.countPerPlayer ?? 5,
    direction: def.turnFlow.order,
    canAlwaysDraw: !!drawAction && 'always' in (drawAction.when as object),
    wildRanks: tagRanks('wild'),
    skipRanks: tagRanks('skip'),
    reverseRanks: tagRanks('reverse'),
    drawRanks: tagRanks('drawTwo'),
    drawCount: forceDraw?.count ?? 2,
    includeJokers: def.deck.includeJokers,
    reshuffleWhenEmpty: def.triggers.some((t) => t.on === 'drawPileEmpty'),
    winMode: def.scoring.winner === 'firstOut' ? 'firstOut' : 'lowestTotal',
    pointTarget: num(def.scoring.target, 100),
    points: { joker: num(cp.JOKER, 50), eight: num(cp['8'], 50), face: num(cp.K, 10), ace: num(cp.A, 1) },
  };
}

export function rankLabel(r: Rank): string {
  return r === 'JOKER' ? 'Joker' : r;
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function autoDescription(k: Knobs): string {
  const list = (rs: Rank[]) => rs.map(rankLabel).join('/');
  const parts = [`Match the top card by rank or suit. Deal ${k.handSize} cards each.`];
  if (k.wildRanks.length) parts.push(`${list(k.wildRanks)} are wild.`);
  if (k.skipRanks.length) parts.push(`${list(k.skipRanks)} skip the next player.`);
  if (k.reverseRanks.length) parts.push(`${list(k.reverseRanks)} reverse direction.`);
  if (k.drawRanks.length) parts.push(`${list(k.drawRanks)} make the next player draw ${k.drawCount}.`);
  parts.push(k.winMode === 'firstOut' ? 'First to empty their hand wins.' : 'Lowest points wins when someone goes out.');
  return parts.join(' ');
}
