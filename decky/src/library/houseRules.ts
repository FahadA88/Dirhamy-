import { GameDefinition } from '../engine/types';

// House rules on a game you didn't write (items 19-20): "Hearts with jokers", "Spades to 300"
// — a short panel on the game's own setup screen, not a trip through the builder. Deliberately a
// small, fixed set of overrides that make sense on almost any shipped game, rather than a
// per-game catalog of named twists ("sevens skip" for Crazy Eights, say) — that would mean a
// bespoke mapping for every classic in the shelf, a much bigger and more speculative build than
// two knobs every family already understands: the match's own scoring.target, and whether the
// deck carries jokers.

export interface HouseRules {
  target?: number;
  jokers?: boolean;
}

export function hasNoHouseRules(rules: HouseRules): boolean {
  return rules.target === undefined && rules.jokers === undefined;
}

/** Whether this game's target is something a house rule could sensibly move at all — a family
 *  with no race-to-N concept (Old Maid, Kent, Poker's own hand count) has nothing to adjust. */
export function targetHouseRuleApplies(def: GameDefinition): boolean {
  return def.scoring.target != null && !def.kent && !def.poker;
}

/** Whether this game's deck has a jokers concept to toggle at all. */
export function jokersHouseRuleApplies(def: GameDefinition): boolean {
  return def.deck.base === 'standard54';
}

export function applyHouseRules(def: GameDefinition, rules: HouseRules): GameDefinition {
  if (hasNoHouseRules(rules)) return def;
  return {
    ...def,
    scoring: rules.target != null && targetHouseRuleApplies(def) ? { ...def.scoring, target: rules.target } : def.scoring,
    deck: rules.jokers !== undefined && jokersHouseRuleApplies(def) ? { ...def.deck, includeJokers: rules.jokers } : def.deck,
  };
}

/** A short, url-safe code for "this game, with these house rules" — shared as a link. */
export function encodeHouseRules(gameId: string, rules: HouseRules): string {
  return btoa(JSON.stringify({ id: gameId, ...rules }));
}

export function decodeHouseRules(code: string): ({ gameId: string } & HouseRules) | null {
  try {
    const parsed = JSON.parse(atob(code)) as { id?: unknown; target?: unknown; jokers?: unknown };
    if (typeof parsed.id !== 'string' || !parsed.id) return null;
    const out: { gameId: string } & HouseRules = { gameId: parsed.id };
    if (typeof parsed.target === 'number' && Number.isFinite(parsed.target) && parsed.target > 0) out.target = parsed.target;
    if (typeof parsed.jokers === 'boolean') out.jokers = parsed.jokers;
    return out;
  } catch { return null; }
}
