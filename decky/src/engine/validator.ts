// Validator: static checks that a definition is well-formed BEFORE it ever runs.
// Catches the classic authoring mistakes — references to zones/tags that don't exist,
// a win condition that can never be reached, dead ends with no fallback move.
//
// Returns structured issues. `errors` block publishing; `warnings` are advisory.

import { CustomRule, Effect, GameDefinition, Predicate, RuleHook } from './types';
import { buildDeck } from './deck';

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

const HOOKS_ALL: RuleHook[] = [
  'handStart', 'turnStart', 'turnEnd', 'cardPlayed', 'cardDrawn', 'trickWon', 'drawPileEmpty',
  'trickLed', 'handEnd', 'matchEnd', 'meldLaid', 'bidMade', 'playerOut',
];

/**
 * Variables the engine writes itself. An author's counter sharing one of these names does not
 * fail — it quietly fights the engine for the same slot, which is worse.
 */
const ENGINE_VARS = new Set(['activeSuit']);

export function validate(def: GameDefinition): ValidationResult {
  const issues: Issue[] = [];
  const err = (code: string, message: string) => issues.push({ level: 'error', code, message });
  const warn = (code: string, message: string) => issues.push({ level: 'warning', code, message });

  const zoneIds = new Set(def.zones.map((z) => z.id));
  const tagNames = new Set(Object.keys(def.deck.tags));
  const actionIds = new Set(def.actions.map((a) => a.id));
  const isTrick = !!def.trick;
  const isClimb = !!def.climb;
  const isFish = !!def.fish;
  const isRummy = !!def.rummy;
  const isWar = !!def.war;
  const isSolitaire = !!def.solitaire;
  const isBluff = !!def.bluff;
  const isReflex = !!def.reflex;
  const isPoker = !!def.poker;
  const isPit = !!def.pit;
  const isKent = !!def.kent;
  const isSet = !!def.set;
  const isLayout = !!def.layout;
  const isSwap = !!def.swap;
  const isMaid = !!def.maid;
  const isSpecial = isTrick || isClimb || isFish || isRummy || isWar || isSolitaire
    || isBluff || isReflex || isPoker || isPit || isSet || isKent || isLayout || isSwap || isMaid;

  // --- players ---
  // Patience is played alone, and spotting sets on a shared board works just as well solo, so
  // neither is required to seat an opponent. Everything else is.
  if (!isSolitaire && !isSet && def.meta.players.min < 2) err('players.min', 'A game needs at least 2 players.');
  if (def.meta.players.max < def.meta.players.min) {
    err('players.range', 'Max players is below min players.');
  }
  // A game that seats in pairs has to be able to reach its own maximum in pairs.
  const step = def.meta.players.step ?? 1;
  if (step > 1 && (def.meta.players.max - def.meta.players.min) % step !== 0) {
    err('players.step', `Seats go up in ${step}s, so max must be a whole number of steps above min.`);
  }

  // --- zones: engine expectations ---
  // Solitaire's board — columns, foundations, cells, stock — is synthesised from its config, and
  // a set game's board and deck likewise. Swap's per-player grid is the same story: `grid:<id>`
  // zones are created from `swap.slots`, not declared. None of the three should be asked for a
  // hand zone that was never meant to exist.
  if (!isSolitaire && !isSet && !isSwap) {
    const sharedPile = def.zones.find((z) => z.shared && z.type === 'pile');
    if (!sharedPile) err('zones.deck', 'Need a shared pile to hold the deck (e.g. a "draw" pile).');
    const handZone = def.zones.find((z) => z.type === 'hand' && z.perPlayer);
    if (!handZone) err('zones.hand', 'Need a per-player hand zone.');
  }
  if (isTrick && !def.zones.some((z) => z.type === 'trick')) err('zones.trick', 'Trick games need a trick zone.');
  if (isTrick && def.trick!.trump !== 'none' && !['C', 'D', 'H', 'S'].includes(def.trick!.trump)) {
    err('trick.trump', `Trump must be a suit or "none" (got "${def.trick!.trump}").`);
  }
  if (isClimb && !def.zones.some((z) => z.visibility === 'top-public')) {
    err('zones.pile', 'Climbing games need a shared play pile (a top-public discard).');
  }

  const zoneRef = (id: string | undefined, where: string) => {
    if (id && !zoneIds.has(id)) err('zone.missing', `${where} references unknown zone "${id}".`);
  };

  // --- setup ---
  for (const step of def.setup) {
    if (step.op === 'shuffle') zoneRef(step.zone, 'setup.shuffle');
    if (step.op === 'deal') { zoneRef(step.from, 'setup.deal.from'); zoneRef(step.to, 'setup.deal.to'); }
    if (step.op === 'dealAll') { zoneRef(step.from, 'setup.dealAll.from'); zoneRef(step.to, 'setup.dealAll.to'); }
    if (step.op === 'move') { zoneRef(step.from, 'setup.move.from'); zoneRef(step.to, 'setup.move.to'); }
  }

  // --- deck size vs deal ---
  // Counted by building the deck rather than by arithmetic on the knobs. The sum here used to
  // assume four suits, thirteen ranks and exactly two jokers, all of which an author can now
  // change — and a validator that disagrees with the dealer is worse than no validator.
  const deckSize = buildDeck(def).length;
  const dealt = def.setup
    .filter((s) => s.op === 'deal')
    .reduce((n, s: any) => n + (s.countByPlayers?.[def.meta.players.max] ?? s.countPerPlayer) * def.meta.players.max, 0);
  if (dealt > deckSize) {
    err('deck.overdeal', `Dealing ${dealt} cards to ${def.meta.players.max} players exceeds the ${deckSize}-card deck.`);
  } else if (!isSpecial && dealt > deckSize * 0.75) {
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

  // --- layout ---
  if (isLayout) {
    const cfg = def.layout!;
    if (cfg.piles < 1) err('layout.piles', 'A shared layout needs at least one pile to build on.');
    if (!def.deck.rankOrder.includes(cfg.cornerRank)) {
      err('layout.cornerRank',
        `Corners open on a ${cfg.cornerRank}, which is not a rank in this deck.`);
    }
    // Every card the deal puts down has to come from somewhere, and there is only one deck.
    const need = cfg.handSize * def.meta.players.max + cfg.piles;
    if (need > deckSize) {
      err('layout.deal',
        `Dealing ${cfg.handSize} each to ${def.meta.players.max} players plus ${cfg.piles} piles `
        + `needs ${need} cards, and the deck has ${deckSize}.`);
    }
  }

  // --- swap ---
  if (isSwap) {
    const cfg = def.swap!;
    if (cfg.slots < 2) err('swap.slots', 'A memory game needs at least two cards in front of you.');
    if (cfg.peekAtStart > cfg.slots) {
      err('swap.peek', `Looking at ${cfg.peekAtStart} of ${cfg.slots} is looking at more than you have.`);
    }
    // Seeing all of them is not a memory game, it is arithmetic.
    if (cfg.peekAtStart >= cfg.slots) {
      warn('swap.peekall', 'Players see every card they hold at the start, so nothing is hidden.');
    }
    if (cfg.callPenalty <= 0) {
      warn('swap.penalty',
        'Calling costs nothing when you are wrong, so calling on the first turn is always correct.');
    }
    const need = cfg.slots * def.meta.players.max + 1;
    if (need > deckSize) {
      err('swap.deal', `${cfg.slots} each to ${def.meta.players.max} players needs ${need} cards; the deck has ${deckSize}.`);
    }
  }

  // --- end conditions ---
  // Special families end on rules the engine enforces itself (all books claimed, all tricks
  // played, one player left holding cards), so they need no declarative end condition.
  if (!isSpecial && def.endConditions.length === 0 && !def.scoring.target) {
    err('end.none', 'Game has no end condition and no scoring target — it can never finish.');
  }
  for (const ec of def.endConditions) zoneRef(ec.when.zoneCount.zone, `endCondition "${ec.id}"`);

  // --- win reachability (heuristic) ---
  // If a win requires emptying a hand, some action must be able to move cards OUT of the hand.
  const emptiesHand = !isSpecial && def.endConditions.some((ec) => ec.when.zoneCount.zone === 'hand' && ec.when.zoneCount.eq === 0);
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
  if (!isSpecial && !hasFallback) {
    warn('deadend.fallback', 'No fallback action (e.g. draw or pass) — players may get stuck with no legal move.');
  }

  // --- solitaire sanity ---
  if (isSolitaire) {
    const c = def.solitaire!;
    if (c.columns < 1) err('sol.columns', 'A patience needs at least one tableau column.');
    // Most patiences are won by filling foundations, so having none is a mistake — but Golf is
    // won by emptying the tableau onto the waste, and there a foundation is somewhere cards
    // could go that the game says they may not.
    if (c.foundations < 1 && !c.wasteIsTarget) {
      err('sol.foundations', 'A patience needs somewhere for finished cards to go.');
    }
    const size = deckSize;
    const perFoundation = 13 - (def.deck.excludeRanks ?? []).length;
    if (c.foundations * perFoundation > size) {
      err('sol.unwinnable', `${c.foundations} foundations cannot be filled from a ${size}-card deck.`);
    }
    if (c.foundationMode === 'auto-run' && c.moveRun === 'single') {
      warn('sol.runs', 'Runs clear automatically but cards can only move one at a time — runs will be very hard to assemble.');
    }
  }

  // --- author-written rules (the near-programmable layer) ---
  // These come from the builder, so the checks are phrased as things an author can act on.
  const ruleIds = new Set<string>();
  const ruleCalls: { rule: string; target: string }[] = [];
  const warnedVars = new Set<string>();
  function collectRuleCalls(rule: CustomRule, e: Effect): void {
    if (e.op === 'runRule') ruleCalls.push({ rule: rule.name, target: e.rule });
    if (e.op === 'if') { for (const x of [...e.then, ...(e.else ?? [])]) collectRuleCalls(rule, x); }
    // Same pass catches a counter that would fight the engine for its slot.
    const named = (e.op === 'setVarNum' || e.op === 'setState' || e.op === 'appendVar') ? e.var
      : e.op === 'chooseSuit' ? e.setState : null;
    if (named && ENGINE_VARS.has(named) && !warnedVars.has(named)) {
      warnedVars.add(named);
      warn('rule.var.reserved', `"${rule.name}" writes to "${named}", which the engine uses itself — pick another name unless you mean to override it.`);
    }
  }
  for (const rule of def.rules ?? []) {
    if (ruleIds.has(rule.id)) err('rule.duplicate', `Two rules share the id "${rule.id}".`);
    ruleIds.add(rule.id);

    if (rule.then.length === 0) {
      warn('rule.empty', `"${rule.name}" has a condition but does nothing.`);
    }
    if (rule.cardHasTag && !tagNames.has(rule.cardHasTag)) {
      err('rule.tag', `"${rule.name}" reacts to "${rule.cardHasTag}" cards, but no card is tagged that.`);
    }
    if (!HOOKS_ALL.includes(rule.when)) {
      err('rule.hook', `"${rule.name}" fires on "${rule.when}", which is not a thing that happens.`);
    }
    if ((rule.when === 'trickWon' || rule.when === 'trickLed') && !isTrick) {
      warn('rule.hook.unreachable', `"${rule.name}" waits for a trick, but this game has no tricks — it will never fire.`);
    }
    if (rule.when === 'meldLaid' && !isRummy) {
      warn('rule.hook.unreachable', `"${rule.name}" waits for a meld, but nothing melds in this game.`);
    }
    if (rule.when === 'bidMade' && !def.trick?.bidding && !def.trick?.auction && !def.trick?.numericAuction) {
      warn('rule.hook.unreachable', `"${rule.name}" waits for a bid, but this game has no auction.`);
    }
    if (rule.when === 'matchEnd' && def.scoring.target == null) {
      warn('rule.hook.unreachable', `"${rule.name}" waits for the match to be decided, but this game is a single hand — the hand ending IS the match ending.`);
    }
    if ((rule.when === 'cardDrawn' || rule.when === 'drawPileEmpty') && isSolitaire) {
      warn('rule.hook.unreachable', `"${rule.name}" will never fire in a patience game.`);
    }
    // A rule that calls another has to name one that exists. Checked after the whole list is
    // read, since it may legitimately point forwards.
    for (const eff of rule.then) collectRuleCalls(rule, eff);
    if (rule.if) checkPredicate(rule.if, `rule "${rule.name}"`);
    for (const eff of rule.then) checkRuleEffect(rule, eff);

    /*
      The one authoring trap that produces a game nobody can finish.

      A rule that hands cards to a player every time a card is played puts them back faster
      than anyone can shed them, so a shedding game runs forever. It is easy to write by
      accident — "everyone draws two whenever a card is played" sounds like a fun twist — and
      the only symptom is a simulation that never terminates, which reads as a bug in the
      engine rather than a bug in the rule.
    */
    const unconditional = !rule.if || 'always' in rule.if;
    const everyPlay = rule.when === 'cardPlayed' || rule.when === 'turnEnd' || rule.when === 'turnStart';
    const handsOutCards = rule.then.some((e) => e.op === 'drawTo' || e.op === 'forceDraw'
      || e.op === 'drawUntilPlayable' || e.op === 'moveMany');
    if (unconditional && everyPlay && handsOutCards && !isSpecial) {
      warn('rule.neverending', `"${rule.name}" gives out cards on every turn with no condition — players will gain cards faster than they can shed them and the hand may never end. Add an "if" to it.`);
    }
  }
  for (const { rule, target } of ruleCalls) {
    if (!ruleIds.has(target)) {
      err('rule.call', `"${rule}" runs a rule called "${target}", but there is no rule with that id.`);
    }
  }

  function checkRuleEffect(rule: CustomRule, e: Effect): void {
    const zoneOk = (z: string) => zoneIds.has(z) || z === '$hand' || z.startsWith('hand');
    if (e.op === 'moveMany') {
      if (!zoneOk(e.from)) err('rule.zone', `"${rule.name}" moves cards from "${e.from}", which is not a pile in this game.`);
      if (!zoneOk(e.to)) err('rule.zone', `"${rule.name}" moves cards to "${e.to}", which is not a pile in this game.`);
    }
    if (e.op === 'drawTo' && !zoneOk(e.from)) {
      err('rule.zone', `"${rule.name}" draws from "${e.from}", which is not a pile in this game.`);
    }
    if (e.op === 'announce' && e.text.trim() === '') {
      warn('rule.announce', `"${rule.name}" announces an empty message.`);
    }
    if (e.op === 'if') { for (const sub of [...e.then, ...(e.else ?? [])]) checkRuleEffect(rule, sub); }
  }

  // Computed last, so every check above — including the rule checks — counts.
  const hasError = issues.some((i) => i.level === 'error');
  const hasWarn = issues.some((i) => i.level === 'warning');
  return {
    ok: !hasError,
    issues,
    status: hasError ? 'red' : hasWarn ? 'amber' : 'green',
  };
}
