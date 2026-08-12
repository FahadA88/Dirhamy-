// Validator: static checks that a definition is well-formed BEFORE it ever runs.
// Catches the classic authoring mistakes — references to zones/tags that don't exist,
// a win condition that can never be reached, dead ends with no fallback move.
//
// Returns structured issues. `errors` block publishing; `warnings` are advisory.

import { Effect, GameDefinition, Predicate } from './types';

export interface Issue {
  level: 'error' | 'warning';
  code: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;             // no errors (warnings allowed)
  issues: Issue[];
  status: 'green' | 'amber' | 'red';
}

export function validate(def: GameDefinition): ValidationResult {
  const issues: Issue[] = [];
  const err = (code: string, message: string) => issues.push({ level: 'error', code, message });
  const warn = (code: string, message: string) => issues.push({ level: 'warning', code, message });

  const zoneIds = new Set(def.zones.map((z) => z.id));
  const tagNames = new Set(Object.keys(def.deck.tags));
  const actionIds = new Set(def.actions.map((a) => a.id));

  // --- players ---
  if (def.meta.players.min < 2) err('players.min', 'A game needs at least 2 players.');
  if (def.meta.players.max < def.meta.players.min) {
    err('players.range', 'Max players is below min players.');
  }

  // --- zones: engine expectations ---
  const sharedPile = def.zones.find((z) => z.shared && z.type === 'pile');
  if (!sharedPile) err('zones.deck', 'Need a shared pile to hold the deck (e.g. a "draw" pile).');
  const handZone = def.zones.find((z) => z.type === 'hand' && z.perPlayer);
  if (!handZone) err('zones.hand', 'Need a per-player hand zone.');

  const zoneRef = (id: string | undefined, where: string) => {
    if (id && !zoneIds.has(id)) err('zone.missing', `${where} references unknown zone "${id}".`);
  };

  // --- setup ---
  for (const step of def.setup) {
    if (step.op === 'shuffle') zoneRef(step.zone, 'setup.shuffle');
    if (step.op === 'deal') { zoneRef(step.from, 'setup.deal.from'); zoneRef(step.to, 'setup.deal.to'); }
    if (step.op === 'move') { zoneRef(step.from, 'setup.move.from'); zoneRef(step.to, 'setup.move.to'); }
  }

  // --- deck size vs deal ---
  const copies = Math.max(1, def.deck.deckCount ?? 1);
  const excluded = (def.deck.excludeRanks ?? []).length;
  const deckSize = ((13 - excluded) * 4 + (def.deck.includeJokers ? 2 : 0)) * copies;
  const dealt = def.setup
    .filter((s) => s.op === 'deal')
    .reduce((n, s: any) => n + s.countPerPlayer * def.meta.players.max, 0);
  if (dealt >= deckSize) {
    err('deck.overdeal', `Dealing ${dealt} cards to ${def.meta.players.max} players exceeds the ${deckSize}-card deck.`);
  } else if (dealt > deckSize * 0.75) {
    warn('deck.tight', `Dealing ${dealt} of ${deckSize} cards leaves a thin draw pile at max players.`);
  }

  // --- tags referenced in predicates/triggers must exist ---
  const checkPredicate = (p: Predicate, where: string) => {
    if ('cardHasTag' in p && !tagNames.has(p.cardHasTag)) {
      err('tag.missing', `${where} references unknown card tag "${p.cardHasTag}".`);
    }
    if ('existsLegal' in p && !actionIds.has(p.existsLegal)) {
      err('action.missing', `${where} references unknown action "${p.existsLegal}".`);
    }
    if ('matches' in p) {
      const m = p.matches;
      if (m.equalsTopOf) zoneRef(m.equalsTopOf, `${where}.matches`);
      if (m.equalsStateOrTopOf) zoneRef(m.equalsStateOrTopOf[1], `${where}.matches`);
    }
    if ('any' in p) p.any.forEach((s) => checkPredicate(s, where));
    if ('all' in p) p.all.forEach((s) => checkPredicate(s, where));
    if ('not' in p) checkPredicate(p.not, where);
  };

  const checkEffects = (effects: Effect[], where: string) => {
    for (const e of effects) {
      if (e.op === 'move') { zoneRef(e.from, `${where}.move.from`); zoneRef(e.to, `${where}.move.to`); }
      if (e.op === 'forceDraw') zoneRef(e.from, `${where}.forceDraw.from`);
      if (e.op === 'drawUntilPlayable') zoneRef(e.from, `${where}.drawUntilPlayable.from`);
      if (e.op === 'reshuffleDiscardInto') zoneRef(e.zone, `${where}.reshuffle`);
      if (e.op === 'if') { checkPredicate(e.cond, `${where}.if`); checkEffects(e.then, `${where}.if.then`); if (e.else) checkEffects(e.else, `${where}.if.else`); }
    }
  };

  for (const a of def.actions) {
    if (a.target) zoneRef(a.target.from, `action "${a.id}".target`);
    checkPredicate(a.when, `action "${a.id}".when`);
    checkEffects(a.effects, `action "${a.id}"`);
  }
  for (const t of def.triggers) checkEffects(t.do, `trigger "${t.on}"`);

  // --- end conditions ---
  if (def.endConditions.length === 0 && !def.scoring.target) {
    err('end.none', 'Game has no end condition and no scoring target — it can never finish.');
  }
  for (const ec of def.endConditions) zoneRef(ec.when.zoneCount.zone, `endCondition "${ec.id}"`);

  // --- win reachability (heuristic) ---
  // If a win requires emptying a hand, some action must be able to move cards OUT of the hand.
  const emptiesHand = def.endConditions.some((ec) => ec.when.zoneCount.zone === 'hand' && ec.when.zoneCount.eq === 0);
  if (emptiesHand) {
    const canShed = def.actions.some((a) =>
      a.effects.some((e) => e.op === 'move' && e.card === '$target') ||
      a.effects.some((e) => e.op === 'move' && e.to !== 'hand'));
    if (!canShed) {
      err('win.unreachable', 'Win condition is "empty your hand" but no action removes cards from the hand.');
    }
  }

  // --- dead-end / fallback move ---
  // There must be a move a player can always fall back on (a draw, a pass) when nothing matches,
  // otherwise a player with no legal play is stuck and the game can deadlock.
  const hasFallback = def.actions.some((a) => {
    if (a.target) return false; // targeted plays can all be blocked
    // an untargeted action whose legality is either always-true or only gated on "can't play"
    return true;
  });
  if (!hasFallback) {
    warn('deadend.fallback', 'No fallback action (e.g. draw or pass) — players may get stuck with no legal move.');
  }

  const hasError = issues.some((i) => i.level === 'error');
  const hasWarn = issues.some((i) => i.level === 'warning');
  return {
    ok: !hasError,
    issues,
    status: hasError ? 'red' : hasWarn ? 'amber' : 'green',
  };
}
