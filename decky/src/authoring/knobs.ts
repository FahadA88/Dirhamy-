// The authoring model for the shedding/matching family. A "game" the user builds is a
// small set of KNOBS; buildDefinition() compiles those knobs into a full GameDefinition
// the engine can run. This is what the visual editor edits and what the AI co-pilot writes to.
// Users never touch raw schema — they turn these knobs.

import { GameDefinition, Rank } from '../engine/types';

export interface Knobs {
  name: string;
  description: string;
  handSize: number;
  wildRanks: Rank[];         // ranks that are wild (play anytime, then name a suit)
  skipRank: Rank | null;     // playing this skips the next player
  reverseRank: Rank | null;  // playing this reverses direction
  drawTwoRank: Rank | null;  // playing this makes the next player draw two and miss a turn
  includeJokers: boolean;
  reshuffleWhenEmpty: boolean; // draw pile empty → reshuffle discard (true) or end the round (false)
}

export const RANK_CHOICES: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'JOKER'];

export const defaultKnobs: Knobs = {
  name: 'My Card Game',
  description: '',
  handSize: 5,
  wildRanks: ['8'],
  skipRank: null,
  reverseRank: null,
  drawTwoRank: null,
  includeJokers: false,
  reshuffleWhenEmpty: true,
};

export function buildDefinition(knobs: Knobs, id = 'draft'): GameDefinition {
  const tags: GameDefinition['deck']['tags'] = {};
  if (knobs.wildRanks.length) tags.wild = { ranks: knobs.wildRanks };
  if (knobs.skipRank) tags.skip = { ranks: [knobs.skipRank] };
  if (knobs.reverseRank) tags.reverse = { ranks: [knobs.reverseRank] };
  if (knobs.drawTwoRank) tags.drawTwo = { ranks: [knobs.drawTwoRank] };

  const triggers: GameDefinition['triggers'] = [];
  if (knobs.skipRank) triggers.push({ on: 'cardPlayed', cardHasTag: 'skip', do: [{ op: 'skipNext' }] });
  if (knobs.reverseRank) triggers.push({ on: 'cardPlayed', cardHasTag: 'reverse', do: [{ op: 'reverseOrder' }] });
  if (knobs.drawTwoRank) {
    triggers.push({
      on: 'cardPlayed', cardHasTag: 'drawTwo',
      do: [{ op: 'forceDraw', target: 'next', from: 'draw', count: 2 }, { op: 'skipNext' }],
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

  return {
    schemaVersion: '1.0',
    meta: {
      id,
      name: knobs.name,
      description: knobs.description || autoDescription(knobs),
      players: { min: 2, max: 6 },
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
    turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
    actions: [
      { id: 'playCard', target: { from: 'hand', select: 'one' }, when: whenPlay, effects: playEffects },
      { id: 'drawCard', when: { not: { existsLegal: 'playCard' } }, effects: [{ op: 'move', from: 'draw', to: 'hand', count: 1 }] },
    ],
    triggers,
    endConditions: [
      { id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
    ],
    scoring: {
      mode: 'firstToEmptyWins',
      cardPoints: { JOKER: 50, '8': 50, K: 10, Q: 10, J: 10, '10': 10, default: 'rankValue', A: 1 },
      target: 100,
      winner: 'firstOut',
    },
  };
}

// Best-effort: read knobs back out of an existing definition, so you can REMIX a classic.
export function knobsFromDefinition(def: GameDefinition): Knobs {
  const deal = def.setup.find((s) => s.op === 'deal') as { countPerPlayer: number } | undefined;
  const tagRanks = (t: string) => def.deck.tags[t]?.ranks ?? [];
  return {
    name: def.meta.name,
    description: def.meta.description,
    handSize: deal?.countPerPlayer ?? 5,
    wildRanks: tagRanks('wild'),
    skipRank: tagRanks('skip')[0] ?? null,
    reverseRank: tagRanks('reverse')[0] ?? null,
    drawTwoRank: tagRanks('drawTwo')[0] ?? null,
    includeJokers: def.deck.includeJokers,
    reshuffleWhenEmpty: def.triggers.some((t) => t.on === 'drawPileEmpty'),
  };
}

export function rankLabel(r: Rank): string {
  return r === 'JOKER' ? 'Joker' : r;
}

function autoDescription(k: Knobs): string {
  const parts = [`Match the top card by rank or suit. Deal ${k.handSize} cards each.`];
  if (k.wildRanks.length) parts.push(`${k.wildRanks.map(rankLabel).join('/')} are wild.`);
  if (k.skipRank) parts.push(`${rankLabel(k.skipRank)}s skip the next player.`);
  if (k.reverseRank) parts.push(`${rankLabel(k.reverseRank)}s reverse direction.`);
  if (k.drawTwoRank) parts.push(`${rankLabel(k.drawTwoRank)}s make the next player draw two.`);
  parts.push('First to empty their hand wins.');
  return parts.join(' ');
}
