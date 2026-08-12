// The deterministic interpreter. Reads a GameDefinition and runs any game expressible in it.
// Pure: no I/O, no clock, no network. All randomness flows through state.rngState (seeded).
//
// Public surface:
//   createMatch(def, players, seed) -> MatchState
//   legalMoves(state, playerId)     -> Move[]
//   applyMove(state, playerId, move)-> MatchState   (returns a new state; never mutates input)
//   isTerminal(state)               -> boolean
//   redact(state, playerId)         -> RedactedState

import {
  ActionDef, Card, Effect, GameDefinition, MatchState, Move, Predicate,
  RedactedState, RedactedZone, ScoringDef, ZoneDef,
} from './types';
import { buildDeck, cardColor, cardTags } from './deck';
import { seededShuffle } from './rng';

// ---------- zone helpers ----------

function zoneDef(def: GameDefinition, id: string): ZoneDef {
  const z = def.zones.find((zz) => zz.id === id);
  if (!z) throw new Error(`Unknown zone: ${id}`);
  return z;
}

function zoneKey(def: GameDefinition, id: string, playerId: string): string {
  return zoneDef(def, id).perPlayer ? `${id}:${playerId}` : id;
}

function topCard(cards: Card[]): Card | undefined {
  return cards.length ? cards[cards.length - 1] : undefined;
}

function propOf(card: Card, prop: 'suit' | 'rank' | 'color'): string {
  if (prop === 'suit') return card.suit;
  if (prop === 'rank') return card.rank;
  return cardColor(card);
}

// ---------- match creation ----------

export function createMatch(def: GameDefinition, players: string[], seed: number): MatchState {
  const state: MatchState = {
    definition: def,
    seed,
    rngState: seed >>> 0,
    players: players.slice(),
    zones: {},
    turnIndex: 0,
    direction: def.turnFlow.order === 'clockwise' ? 1 : -1,
    skipCount: 0,
    repeatTurn: false,
    stallCount: 0,
    lead: null,
    trickPlays: [],
    tricksWon: Object.fromEntries(players.map((p) => [p, 0])),
    passStreak: 0,
    lastPlayer: null,
    finished: [],
    vars: {},
    scores: Object.fromEntries(players.map((p) => [p, 0])),
    phase: 'playing',
    winner: null,
    pendingChoice: null,
    log: [],
  };

  // Initialize zones.
  for (const z of def.zones) {
    if (z.perPlayer) {
      for (const p of players) state.zones[`${z.id}:${p}`] = [];
    } else {
      state.zones[z.id] = [];
    }
  }

  // Load the full deck into the first shared pile (the "draw" source of setup).
  const deck = buildDeck(def);
  const drawZone = def.zones.find((z) => z.shared && z.type === 'pile');
  if (!drawZone) throw new Error('Definition needs a shared pile to hold the deck.');
  state.zones[drawZone.id] = deck;

  // Run setup steps deterministically.
  for (const step of def.setup) {
    if (step.op === 'shuffle') {
      const key = step.zone;
      const { result, rngState } = seededShuffle(state.zones[key], state.rngState);
      state.zones[key] = result;
      state.rngState = rngState;
    } else if (step.op === 'deal') {
      for (let i = 0; i < step.countPerPlayer; i++) {
        for (const p of players) {
          const card = state.zones[step.from].pop();
          if (card) state.zones[zoneKey(def, step.to, p)].push(card);
        }
      }
    } else if (step.op === 'dealAll') {
      let seat = 0;
      while (state.zones[step.from].length) {
        const card = state.zones[step.from].pop()!;
        state.zones[zoneKey(def, step.to, players[seat % players.length])].push(card);
        seat++;
      }
    } else if (step.op === 'move') {
      for (let i = 0; i < step.count; i++) {
        const card = state.zones[step.from].pop();
        if (card) state.zones[step.to].push(card);
      }
    }
  }

  // Seed activeSuit from the starter card if there is a discard top.
  const discard = def.zones.find((z) => z.visibility === 'top-public');
  if (discard) {
    const top = topCard(state.zones[discard.id]);
    if (top) state.vars.activeSuit = top.suit;
  }

  log(state, null, `${def.meta.name} started with ${players.length} players.`);
  return state;
}

// ---------- predicate evaluation ----------

interface Ctx {
  playerId: string;
  targetCard?: Card;
}

function evalPredicate(state: MatchState, p: Predicate, ctx: Ctx): boolean {
  const def = state.definition;
  if ('always' in p) return true;
  if ('any' in p) return p.any.some((sub) => evalPredicate(state, sub, ctx));
  if ('all' in p) return p.all.every((sub) => evalPredicate(state, sub, ctx));
  if ('not' in p) return !evalPredicate(state, p.not, ctx);
  if ('cardHasTag' in p) {
    return !!ctx.targetCard && cardTags(def, ctx.targetCard).includes(p.cardHasTag);
  }
  if ('existsLegal' in p) {
    // Is the referenced action currently legal for this player? Guard against self-reference.
    return actionHasLegalMove(state, ctx.playerId, p.existsLegal, true);
  }
  if ('matches' in p) {
    const m = p.matches;
    if (!ctx.targetCard) return false;
    const val = propOf(ctx.targetCard, m.cardProp);
    if (m.equalsTopOf) {
      const top = topCard(state.zones[m.equalsTopOf]);
      if (!top) return false;
      return propOf(top, m.cardProp) === val;
    }
    if (m.equalsStateOrTopOf) {
      const [stateVar, zoneId] = m.equalsStateOrTopOf;
      const sv = state.vars[stateVar];
      if (sv !== undefined) return sv === val;
      const top = topCard(state.zones[zoneId]);
      if (!top) return false;
      return propOf(top, m.cardProp) === val;
    }
    return false;
  }
  return false;
}

// ---------- legal move enumeration ----------

function findAction(def: GameDefinition, id: string): ActionDef | undefined {
  return def.actions.find((a) => a.id === id);
}

// Does <actionId> yield at least one legal move for player? `guard` blocks existsLegal recursion.
function actionHasLegalMove(
  state: MatchState, playerId: string, actionId: string, guard: boolean,
): boolean {
  const def = state.definition;
  const action = findAction(def, actionId);
  if (!action) return false;
  const ctxBase: Ctx = { playerId };

  if (action.target) {
    const handKey = zoneKey(def, action.target.from, playerId);
    const cards = state.zones[handKey] || [];
    return cards.some((c) =>
      safeEval(state, action.when, { ...ctxBase, targetCard: c }, guard));
  }
  return safeEval(state, action.when, ctxBase, guard);
}

// Evaluate a predicate; if guard is set, treat any nested existsLegal as false (prevents cycles).
function safeEval(state: MatchState, p: Predicate, ctx: Ctx, guard: boolean): boolean {
  if (!guard) return evalPredicate(state, p, ctx);
  return evalPredicate(state, stripExistsLegal(p), ctx);
}

function stripExistsLegal(p: Predicate): Predicate {
  if ('existsLegal' in p) return { not: { always: true } } as unknown as Predicate;
  if ('any' in p) return { any: p.any.map(stripExistsLegal) };
  if ('all' in p) return { all: p.all.map(stripExistsLegal) };
  if ('not' in p) return { not: stripExistsLegal(p.not) };
  return p;
}

export function legalMoves(state: MatchState, playerId: string): Move[] {
  if (state.phase !== 'playing') return [];
  if (state.definition.trick) return trickLegalMoves(state, playerId);
  if (state.definition.climb) return climbLegalMoves(state, playerId);

  // Resolve a pending choice first (e.g. pick a suit after a wild).
  if (state.pendingChoice) {
    if (state.pendingChoice.player !== playerId) return [];
    return (['C', 'D', 'H', 'S'] as const).map((suit) => ({
      actionId: 'resolveChoice', choice: suit,
    }));
  }

  if (state.players[state.turnIndex] !== playerId) return [];

  const def = state.definition;
  const moves: Move[] = [];
  for (const action of def.actions) {
    if (action.target) {
      const handKey = zoneKey(def, action.target.from, playerId);
      const cards = state.zones[handKey] || [];
      for (const c of cards) {
        if (evalPredicate(state, action.when, { playerId, targetCard: c })) {
          moves.push({ actionId: action.id, cardId: c.id });
        }
      }
    } else if (evalPredicate(state, action.when, { playerId })) {
      moves.push({ actionId: action.id });
    }
  }
  return moves;
}

// ---------- effect execution ----------

function cloneState(state: MatchState): MatchState {
  return {
    ...state,
    players: state.players.slice(),
    zones: Object.fromEntries(Object.entries(state.zones).map(([k, v]) => [k, v.slice()])),
    vars: { ...state.vars },
    scores: { ...state.scores },
    tricksWon: { ...state.tricksWon },
    trickPlays: state.trickPlays.map((t) => ({ ...t })),
    finished: state.finished.slice(),
    pendingChoice: state.pendingChoice ? { ...state.pendingChoice } : null,
    log: state.log.slice(),
  };
}

function nextSeat(state: MatchState): string {
  const n = state.players.length;
  const idx = ((state.turnIndex + state.direction) % n + n) % n;
  return state.players[idx];
}

function runEffects(state: MatchState, effects: Effect[], ctx: Ctx & { playedCard?: Card }): void {
  const def = state.definition;
  for (const e of effects) {
    switch (e.op) {
      case 'move': {
        if (e.card === '$target' && ctx.targetCard) {
          // remove target from its owner's source zone, push to `to`
          removeCardFromAnyZone(state, ctx.targetCard.id);
          state.zones[e.to].push(ctx.targetCard);
          ctx.playedCard = ctx.targetCard;
        } else if (e.from) {
          const count = e.count ?? 1;
          let moved = 0;
          for (let i = 0; i < count; i++) {
            const card = state.zones[e.from].pop();
            if (!card) break;
            state.zones[zoneKey(def, e.to, ctx.playerId)].push(card);
            moved++;
          }
          if (e.from !== e.to && moved === 0) state.stallCount++;
          else state.stallCount = 0;
        }
        break;
      }
      case 'setState': {
        state.vars[e.var] = resolveValue(e.value, ctx);
        break;
      }
      case 'if': {
        if (evalPredicate(state, e.cond, ctx)) runEffects(state, e.then, ctx);
        else if (e.else) runEffects(state, e.else, ctx);
        break;
      }
      case 'chooseSuit': {
        state.pendingChoice = { type: 'suit', player: ctx.playerId, setState: e.setState };
        break;
      }
      case 'reverseOrder': {
        state.direction = (state.direction * -1) as 1 | -1;
        break;
      }
      case 'skipNext': {
        state.skipCount += 1;
        break;
      }
      case 'forceDraw': {
        const target = nextSeat(state);
        for (let i = 0; i < e.count; i++) {
          const card = state.zones[e.from].pop();
          if (card) state.zones[zoneKey(def, 'hand', target)].push(card);
        }
        break;
      }
      case 'reshuffleDiscardInto': {
        reshuffleDiscardInto(state, e.zone, e.keepTop);
        break;
      }
      case 'extraTurn': {
        state.repeatTurn = true;
        break;
      }
      case 'drawUntilPlayable': {
        const handKey = zoneKey(def, 'hand', ctx.playerId);
        let guard = 0;
        while (guard++ < 30) {
          if (actionHasLegalMove(state, ctx.playerId, 'playCard', true)) break;
          let card = state.zones[e.from].pop();
          if (!card) { fireDrawPileTriggers(state); card = state.zones[e.from].pop(); }
          if (!card) break;
          state.zones[handKey].push(card);
        }
        break;
      }
    }
  }
}

function removeCardFromAnyZone(state: MatchState, cardId: string): void {
  for (const key of Object.keys(state.zones)) {
    const idx = state.zones[key].findIndex((c) => c.id === cardId);
    if (idx >= 0) {
      state.zones[key].splice(idx, 1);
      return;
    }
  }
}

function resolveValue(value: string, ctx: Ctx): string {
  if (value === '$target.suit') return ctx.targetCard?.suit ?? '';
  if (value === '$target.rank') return ctx.targetCard?.rank ?? '';
  return value;
}

function reshuffleDiscardInto(state: MatchState, drawZoneId: string, keepTop: boolean): void {
  const discardZone = state.definition.zones.find((z) => z.visibility === 'top-public');
  if (!discardZone) return;
  const discard = state.zones[discardZone.id];
  if (discard.length <= (keepTop ? 1 : 0)) return;
  const keep = keepTop ? [discard[discard.length - 1]] : [];
  const toShuffle = keepTop ? discard.slice(0, -1) : discard.slice();
  const { result, rngState } = seededShuffle(toShuffle, state.rngState);
  state.rngState = rngState;
  state.zones[drawZoneId] = [...state.zones[drawZoneId], ...result];
  state.zones[discardZone.id] = keep;
  log(state, null, 'Draw pile reshuffled from the discard.');
}

// ---------- apply a move ----------

export function applyMove(state: MatchState, playerId: string, move: Move): MatchState {
  const s = cloneState(state);
  const def = s.definition;

  if (def.trick) return applyTrickMove(s, playerId, move);
  if (def.climb) return applyClimbMove(s, playerId, move);

  // Resolve a pending suit choice.
  if (move.actionId === 'resolveChoice') {
    if (!s.pendingChoice || s.pendingChoice.player !== playerId) return s;
    s.vars[s.pendingChoice.setState] = move.choice!;
    log(s, playerId, `${short(playerId)} chose ${suitWord(move.choice!)}.`);
    s.pendingChoice = null;
    advanceAndCheck(s);
    return s;
  }

  // Validate the move is currently legal.
  const legal = legalMoves(s, playerId);
  const chosen = legal.find((m) => m.actionId === move.actionId && m.cardId === move.cardId);
  if (!chosen) return s; // illegal move → no-op (server rejects; caller can inspect)

  const action = findAction(def, move.actionId)!;
  const targetCard = move.cardId
    ? (s.zones[zoneKey(def, action.target!.from, playerId)] || []).find((c) => c.id === move.cardId)
    : undefined;

  const ctx: Ctx & { playedCard?: Card } = { playerId, targetCard };
  runEffects(s, action.effects, ctx);

  if (ctx.playedCard) {
    log(s, playerId, `${short(playerId)} played ${cardLabel(ctx.playedCard)}.`);
    fireTriggers(s, 'cardPlayed', ctx.playedCard, ctx);
  } else if (move.actionId === 'drawCard') {
    log(s, playerId, `${short(playerId)} drew a card.`);
  }

  // Draw-pile-empty triggers (e.g. reshuffle).
  fireDrawPileTriggers(s);

  // If a choice is pending (e.g. wild suit), pause here — turn does not advance.
  if (s.pendingChoice) return s;

  advanceAndCheck(s);
  return s;
}

function advanceAndCheck(s: MatchState): void {
  if (checkEnd(s)) return;
  // Extra-turn cards: the same player goes again (unless they've stalled out).
  if (s.repeatTurn) {
    s.repeatTurn = false;
    if (legalMoves(s, s.players[s.turnIndex]).length > 0) return;
  }
  advanceTurn(s);
  // Deadlock guard: if the whole table has stalled with no productive move, end the round.
  if (s.stallCount >= s.players.length) {
    endRound(s, 'stalemate');
    return;
  }
  // If the new current player has no legal move at all, end by lowest hand.
  if (legalMoves(s, s.players[s.turnIndex]).length === 0) {
    endRound(s, 'stuck');
  }
}

function advanceTurn(s: MatchState): void {
  const n = s.players.length;
  const steps = 1 + s.skipCount;
  s.skipCount = 0;
  s.turnIndex = ((s.turnIndex + s.direction * steps) % n + n) % n;
}

// ---------- triggers ----------

function fireTriggers(state: MatchState, on: 'cardPlayed', card: Card, ctx: Ctx): void {
  const def = state.definition;
  for (const trig of def.triggers) {
    if (trig.on !== on) continue;
    if (trig.cardHasTag && !cardTags(def, card).includes(trig.cardHasTag)) continue;
    runEffects(state, trig.do, ctx);
  }
}

function fireDrawPileTriggers(state: MatchState): void {
  const def = state.definition;
  const drawZone = def.zones.find((z) => z.shared && z.type === 'pile' && z.visibility === 'none');
  if (!drawZone) return;
  if (state.zones[drawZone.id].length > 0) return;
  for (const trig of def.triggers) {
    if (trig.on === 'drawPileEmpty') runEffects(state, trig.do, { playerId: state.players[state.turnIndex] });
  }
}

// ---------- end conditions & scoring ----------

function checkEnd(state: MatchState): boolean {
  const def = state.definition;
  for (const ec of def.endConditions) {
    const { zone, eq } = ec.when.zoneCount;
    for (const p of state.players) {
      const key = zoneDef(def, zone).perPlayer ? `${zone}:${p}` : zone;
      if ((state.zones[key]?.length ?? 0) === eq) {
        endRound(state, 'won', p);
        return true;
      }
    }
  }
  return false;
}

function endRound(state: MatchState, reason: 'won' | 'stalemate' | 'stuck', winnerHint?: string): void {
  state.phase = 'roundOver';
  const winner = computeWinner(state, winnerHint);
  state.winner = winner;
  if (reason === 'won') log(state, null, `${short(winner!)} wins — hand emptied!`);
  else log(state, null, `Round over (${reason}). Winner by fewest points: ${short(winner!)}.`);
}

function computeWinner(state: MatchState, winnerHint?: string): string {
  const def = state.definition;
  const s: ScoringDef = def.scoring;
  if (s.winner === 'firstOut' && winnerHint) return winnerHint;
  // Sum remaining hand points; lowest or highest wins per scoring.winner.
  const highest = s.winner === 'highestTotal';
  let best: string = state.players[0];
  let bestPts = highest ? -Infinity : Infinity;
  for (const p of state.players) {
    const hand = state.zones[`hand:${p}`] || [];
    const pts = hand.reduce((sum, c) => sum + cardPoints(s, c), 0);
    state.scores[p] = pts;
    if (highest ? pts > bestPts : pts < bestPts) { bestPts = pts; best = p; }
  }
  return best;
}

function cardPoints(s: ScoringDef, card: Card): number {
  const cp = s.cardPoints || {};
  const byRank = cp[card.rank];
  if (byRank === 'rankValue') return rankValue(card.rank);
  if (typeof byRank === 'number') return byRank;
  if (cp.default === 'rankValue') return rankValue(card.rank);
  if (typeof cp.default === 'number') return cp.default;
  return 0;
}

function rankValue(rank: string): number {
  if (rank === 'A') return 1;
  if (rank === 'J' || rank === 'Q' || rank === 'K') return 10;
  if (rank === 'JOKER') return 50;
  const n = parseInt(rank, 10);
  return Number.isNaN(n) ? 0 : n;
}

export function isTerminal(state: MatchState): boolean {
  return state.phase === 'roundOver';
}

// ---------- trick-taking family ----------

function trickLegalMoves(state: MatchState, playerId: string): Move[] {
  if (state.players[state.turnIndex] !== playerId) return [];
  const def = state.definition;
  const hand = state.zones[`hand:${playerId}`] || [];
  let playable = hand;
  // Must follow the led suit if you hold one.
  if (def.trick!.mustFollowSuit && state.lead) {
    const following = hand.filter((c) => c.suit === state.lead);
    if (following.length) playable = following;
  }
  return playable.map((c) => ({ actionId: 'playToTrick', cardId: c.id }));
}

function applyTrickMove(s: MatchState, playerId: string, move: Move): MatchState {
  const legal = trickLegalMoves(s, playerId);
  const chosen = legal.find((m) => m.cardId === move.cardId);
  if (!chosen) return s;

  const hand = s.zones[`hand:${playerId}`];
  const idx = hand.findIndex((c) => c.id === move.cardId);
  const card = hand[idx];
  hand.splice(idx, 1);
  const trickZone = s.definition.zones.find((z) => z.type === 'trick')!;
  s.zones[trickZone.id].push(card);
  if (s.trickPlays.length === 0) s.lead = card.suit;
  s.trickPlays.push({ player: playerId, card });
  log(s, playerId, `${short(playerId)} played ${cardLabel(card)}.`);

  if (s.trickPlays.length < s.players.length) {
    s.turnIndex = nextIndex(s);
    return s;
  }
  resolveTrick(s, trickZone.id);
  return s;
}

function nextIndex(s: MatchState): number {
  const n = s.players.length;
  return ((s.turnIndex + s.direction) % n + n) % n;
}

function resolveTrick(s: MatchState, trickZoneId: string): void {
  const cfg = s.definition.trick!;
  const rankStrength = (rank: string) => {
    const base = s.definition.deck.rankOrder.indexOf(rank as never);
    return cfg.aceHigh && rank === 'A' ? 1000 : base;
  };
  const category = (suit: string) => (cfg.trump !== 'none' && suit === cfg.trump ? 2 : suit === s.lead ? 1 : 0);

  let winner = s.trickPlays[0];
  for (const play of s.trickPlays) {
    const a = category(play.card.suit) * 1000 + rankStrength(play.card.rank);
    const b = category(winner.card.suit) * 1000 + rankStrength(winner.card.rank);
    if (a > b) winner = play;
  }
  s.tricksWon[winner.player] = (s.tricksWon[winner.player] ?? 0) + 1;

  // Hearts-style penalty points travel to the trick winner.
  if (cfg.scoreBy === 'penalty' && cfg.penaltyPoints) {
    let pts = 0;
    for (const { card } of s.trickPlays) {
      pts += cfg.penaltyPoints[card.rank] ?? 0;
      pts += cfg.penaltyPoints[card.suit] ?? 0;
    }
    s.scores[winner.player] = (s.scores[winner.player] ?? 0) + pts;
  }

  s.zones[trickZoneId] = [];
  s.trickPlays = [];
  s.lead = null;
  s.turnIndex = s.players.indexOf(winner.player); // winner leads the next trick
  log(s, null, `${short(winner.player)} takes the trick (${s.tricksWon[winner.player]}).`);

  // Round ends when every hand is empty.
  if (s.players.every((p) => (s.zones[`hand:${p}`] || []).length === 0)) endTrickRound(s);
}

function endTrickRound(s: MatchState): void {
  const cfg = s.definition.trick!;
  s.phase = 'roundOver';
  let winner = s.players[0];
  if (cfg.scoreBy === 'penalty') {
    // Fewest penalty points wins; scores already accumulated.
    let best = Infinity;
    for (const p of s.players) { const v = s.scores[p] ?? 0; if (v < best) { best = v; winner = p; } }
  } else {
    const most = cfg.scoreBy === 'mostTricks';
    let best = most ? -Infinity : Infinity;
    for (const p of s.players) {
      const v = s.tricksWon[p] ?? 0;
      s.scores[p] = v;
      if (most ? v > best : v < best) { best = v; winner = p; }
    }
  }
  s.winner = winner;
  log(s, null, `Round over — ${short(winner)} wins.`);
}

// ---------- climbing family (President / Big Two) ----------

function climbRank(def: MatchState['definition'], rank: string): number {
  const i = def.climb!.order.indexOf(rank as never);
  return i < 0 ? -1 : i;
}

function climbLegalMoves(state: MatchState, playerId: string): Move[] {
  if (state.players[state.turnIndex] !== playerId) return [];
  if (state.finished.includes(playerId)) return [];
  const def = state.definition;
  const hand = state.zones[`hand:${playerId}`] || [];
  const discardZone = def.zones.find((z) => z.visibility === 'top-public');
  const top = discardZone ? topCard(state.zones[discardZone.id]) : undefined;

  if (!top) {
    // Leading (fresh pile): play any card, no passing.
    return hand.map((c) => ({ actionId: 'climbPlay', cardId: c.id }));
  }
  const beat = hand.filter((c) => climbRank(def, c.rank) > climbRank(def, top.rank));
  const moves: Move[] = beat.map((c) => ({ actionId: 'climbPlay', cardId: c.id }));
  moves.push({ actionId: 'climbPass' });
  return moves;
}

function activeCount(s: MatchState): number {
  return s.players.filter((p) => !s.finished.includes(p)).length;
}

function nextActiveIndex(s: MatchState): number {
  const n = s.players.length;
  let i = s.turnIndex;
  for (let step = 0; step < n; step++) {
    i = ((i + s.direction) % n + n) % n;
    if (!s.finished.includes(s.players[i])) return i;
  }
  return s.turnIndex;
}

function applyClimbMove(s: MatchState, playerId: string, move: Move): MatchState {
  const legal = climbLegalMoves(s, playerId);
  const chosen = legal.find((m) => m.actionId === move.actionId && m.cardId === move.cardId);
  if (!chosen) return s;
  const def = s.definition;
  const discardZone = def.zones.find((z) => z.visibility === 'top-public')!;

  if (move.actionId === 'climbPass') {
    s.passStreak += 1;
    log(s, playerId, `${short(playerId)} passes.`);
    // Everyone still in except the last player has passed → the pile clears.
    if (s.passStreak >= activeCount(s) - 1 && s.lastPlayer) {
      s.zones[discardZone.id] = [];
      s.passStreak = 0;
      log(s, null, `Pile cleared — ${short(s.lastPlayer)} leads.`);
      const li = s.players.indexOf(s.lastPlayer);
      s.turnIndex = s.finished.includes(s.lastPlayer) ? nextFromIndex(s, li) : li;
      return s;
    }
    s.turnIndex = nextActiveIndex(s);
    return s;
  }

  // climbPlay
  const hand = s.zones[`hand:${playerId}`];
  const idx = hand.findIndex((c) => c.id === move.cardId);
  const card = hand[idx];
  hand.splice(idx, 1);
  s.zones[discardZone.id].push(card);
  s.lastPlayer = playerId;
  s.passStreak = 0;
  log(s, playerId, `${short(playerId)} played ${cardLabel(card)}.`);

  if (hand.length === 0 && !s.finished.includes(playerId)) {
    s.finished.push(playerId);
    log(s, null, `${short(playerId)} is out (#${s.finished.length}).`);
  }
  if (activeCount(s) <= 1) { endClimbRound(s); return s; }
  s.turnIndex = nextActiveIndex(s);
  return s;
}

function nextFromIndex(s: MatchState, from: number): number {
  const n = s.players.length;
  let i = from;
  for (let step = 0; step < n; step++) {
    i = ((i + s.direction) % n + n) % n;
    if (!s.finished.includes(s.players[i])) return i;
  }
  return from;
}

function endClimbRound(s: MatchState): void {
  s.phase = 'roundOver';
  // Whoever still holds cards finishes last.
  for (const p of s.players) if (!s.finished.includes(p)) s.finished.push(p);
  s.players.forEach((p, i) => { s.scores[p] = s.finished.indexOf(p) + 1; void i; }); // 1 = President
  s.winner = s.finished[0] ?? s.players[0];
  log(s, null, `Round over — ${short(s.winner)} is President.`);
}

// ---------- redaction (hidden information) ----------

export function redact(state: MatchState, viewer: string): RedactedState {
  const def = state.definition;
  const zones: Record<string, RedactedZone> = {};

  for (const z of def.zones) {
    if (z.perPlayer) {
      // Represent the viewer's own per-player zone under its base id.
      const key = `${z.id}:${viewer}`;
      const cards = state.zones[key] || [];
      zones[z.id] = {
        id: z.id,
        visibility: z.visibility,
        cards: z.visibility === 'owner' || z.visibility === 'all' ? cards.slice() : [],
        count: cards.length,
        faceDown: z.faceDown,
      };
    } else {
      const cards = state.zones[z.id] || [];
      let visible: Card[] = [];
      if (z.visibility === 'all') visible = cards.slice();
      else if (z.visibility === 'top-public') visible = cards.length ? [cards[cards.length - 1]] : [];
      zones[z.id] = {
        id: z.id,
        visibility: z.visibility,
        cards: visible,
        count: cards.length,
        faceDown: z.faceDown,
      };
    }
  }

  return {
    gameName: def.meta.name,
    you: viewer,
    players: state.players.map((p, i) => ({
      id: p,
      handCount: (state.zones[`hand:${p}`] || []).length,
      isTurn: i === state.turnIndex && state.phase === 'playing',
    })),
    zones,
    hand: (state.zones[`hand:${viewer}`] || []).slice(),
    vars: { ...state.vars },
    phase: state.phase,
    winner: state.winner,
    isYourTurn:
      state.phase === 'playing' &&
      (state.pendingChoice
        ? state.pendingChoice.player === viewer
        : state.players[state.turnIndex] === viewer),
    pendingChoice: state.pendingChoice,
    scores: { ...state.scores },
    log: state.log.slice(-40),
    mode: state.definition.trick ? 'trick' : state.definition.climb ? 'climb' : 'shedding',
    trick: state.definition.trick ? state.trickPlays.map((t) => ({ ...t })) : undefined,
    lead: state.definition.trick ? state.lead : undefined,
    tricksWon: state.definition.trick ? { ...state.tricksWon } : undefined,
    finished: state.definition.climb ? state.finished.slice() : undefined,
  };
}

// ---------- logging / labels ----------

function log(state: MatchState, player: string | null, text: string): void {
  state.log.push({ t: state.log.length, player, text });
}

function short(id: string): string {
  return id;
}

function suitWord(s: string): string {
  return { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' }[s] || s;
}

function cardLabel(c: Card): string {
  const sym = { C: '♣', D: '♦', H: '♥', S: '♠', JOKER: '★' }[c.suit] || '';
  return c.rank === 'JOKER' ? 'Joker' : `${c.rank}${sym}`;
}
