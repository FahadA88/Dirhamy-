import { GameDefinition, Move, RedactedState } from '../engine/types';
import { createMatch, applyMove, legalMoves, redact, isTerminal, isMatchOver, nextHand, actingPlayers } from '../engine/engine';
import { MatchState } from '../engine/types';
import { pinDefinition, definitionFingerprint, migrate } from '../engine/migrate';
import {
  FairCommit, FairReveal, commitTo, deriveSeed, newClientSeed, newServerSeed,
} from '../engine/fairness';
import { chooseMove } from '../bots/randomBot';
import { chooseSolitaireMove, positionKey } from '../bots/solitaireBot';

// ---------------------------------------------------------------------------
// THE AUTHORITY BOUNDARY
//
// Everything above this line is the rules engine. This module is the only thing allowed to
// hold an unredacted MatchState. Callers get a RedactedState and nothing else — there is no
// method that returns hidden cards, and no method that accepts a state.
//
// It is deliberately transport-free. Today the app calls it in-process; putting it behind
// HTTP or a WebSocket means wrapping these four methods, not rewriting them, and the server
// then runs the identical engine the client renders from — which is what stops rule drift.
//
// What this buys you *today*, honestly: the client no longer holds opponents' hands in React
// state, moves are validated in one place, and the shuffle is committed before play. What it
// does NOT buy you until the service actually runs remotely: protection from a determined
// attacker, who still controls the whole browser process. The boundary is real; the trust
// guarantee arrives with the network hop.
// ---------------------------------------------------------------------------

/**
 * Who is sitting where.
 *
 * A seat is not a person — it is a place at the table with a kind. That distinction is what lets
 * one match be pass-and-play, single-player-versus-bots, an async game with three people in
 * three time zones, or any mixture, without the engine or the rules knowing the difference.
 */
export interface Seat {
  id: string;                 // the player id the engine knows, e.g. 'P1'
  name: string;               // what people see
  kind: 'local' | 'remote' | 'bot';
  difficulty?: 'smart' | 'random';   // bots only
  connected?: boolean;        // remote seats: are they here right now
  lastSeen?: number;
}

/** One resolved move, kept for the history panel and for takebacks. */
export interface MoveRecord {
  n: number;
  seat: string;
  move: Move;
  at: number;
  text: string;               // the log line this move produced, for a readable history
}

export interface MatchSummary {
  matchId: string;
  gameId: string;
  fingerprint: string;
  players: string[];
  seats: Seat[];
  handNumber: number;
  phase: MatchState['phase'];
  matchOver: boolean;
  fair: FairCommit;
  /** Seats that owe a move right now — the basis of every "your turn" indicator. */
  waitingOn: string[];
  inviteCode: string;
}

export interface MoveResult {
  ok: boolean;
  reason?: string;          // why an attempted move was refused — surfaced to the player
  view: RedactedState;
}

export interface MatchRecord {
  matchId: string;
  gameId: string;
  definition: GameDefinition;   // pinned at creation; never re-read from the catalog
  fingerprint: string;
  state: MatchState;
  serverSeed: string;
  commit: string;
  clientSeed: string;
  nonce: number;
  handSeeds: number[];
  botSeed: number;
  createdAt: number;
  seats: Seat[];
  inviteCode: string;
  moves: MoveRecord[];
  takeback: TakebackRequest | null;
  // Prior states, for undo. Only kept where taking a move back can't reveal anything an
  // opponent has since acted on — patience, and a takeback everyone has agreed to.
  history: MatchState[];
}

/**
 * A takeback in a game with opponents is a rules event, not a UI affordance: it rewinds
 * information other people have already seen. So it is asked for, and everyone else has to say
 * yes. One outstanding request at a time.
 */
export interface TakebackRequest {
  by: string;
  needed: string[];
  agreed: string[];
  at: number;
}

const UNDO_LIMIT = 400;

export interface MatchStore {
  get(id: string): MatchRecord | undefined;
  set(id: string, rec: MatchRecord): void;
  delete(id: string): void;
}

/** Default store. Swapping this for Postgres is the only change a hosted deployment needs. */
class MemoryStore implements MatchStore {
  private map = new Map<string, MatchRecord>();
  get(id: string) { return this.map.get(id); }
  set(id: string, rec: MatchRecord) { this.map.set(id, rec); }
  delete(id: string) { this.map.delete(id); }
}

let idCounter = 0;
function newId(): string {
  idCounter += 1;
  return `m${Date.now().toString(36)}${idCounter.toString(36)}`;
}

export class MatchService {
  constructor(private store: MatchStore = new MemoryStore()) {}

  /**
   * Start a match. The definition is migrated to the current schema and then PINNED — a later
   * edit to the same game cannot reach a match already running.
   */
  create(
    rawDefinition: unknown,
    gameId: string,
    // Either bare player ids (one local human at P1, bots elsewhere) or a full seating plan.
    players: string[] | Seat[],
    clientSeed?: string,
    // A host with its own CSPRNG (or a test that needs determinism) may supply the secret.
    injectedServerSeed?: string,
  ): MatchSummary {
    const { definition } = migrate(rawDefinition);
    const pinned = pinDefinition(definition);
    const seats = normaliseSeats(players);
    const ids = seats.map((s) => s.id);

    const serverSeed = injectedServerSeed ?? newServerSeed();
    const seed0 = clientSeed ?? newClientSeed();
    const nonce = 1;
    const handSeed = deriveSeed(serverSeed, seed0, nonce);

    const rec: MatchRecord = {
      matchId: newId(),
      gameId,
      definition: pinned,
      fingerprint: definitionFingerprint(pinned),
      state: createMatch(pinned, ids, handSeed),
      serverSeed,
      commit: commitTo(serverSeed),
      clientSeed: seed0,
      nonce,
      handSeeds: [handSeed],
      botSeed: (handSeed ^ 0x9e3779b9) >>> 0,
      createdAt: Date.now(),
      seats,
      inviteCode: newInviteCode(),
      moves: [],
      takeback: null,
      history: [],
    };
    this.store.set(rec.matchId, rec);
    return this.summary(rec);
  }

  /** The board as one player is allowed to see it. The only way state leaves this module. */
  view(matchId: string, playerId: string): RedactedState {
    const rec = this.require(matchId);
    this.requireSeat(rec, playerId);
    return redact(rec.state, playerId);
  }

  /** What this player may legally do right now — computed here, not trusted from the client. */
  legal(matchId: string, playerId: string): Move[] {
    const rec = this.require(matchId);
    this.requireSeat(rec, playerId);
    return legalMoves(rec.state, playerId);
  }

  /**
   * Submit an intended move. The service decides whether it is legal; an illegal one changes
   * nothing and comes back with a reason.
   */
  submit(matchId: string, playerId: string, move: Move): MoveResult {
    const rec = this.require(matchId);
    this.requireSeat(rec, playerId);

    if (rec.state.phase !== 'playing') {
      return { ok: false, reason: 'This hand is already over.', view: redact(rec.state, playerId) };
    }
    if (!actingPlayers(rec.state).includes(playerId)) {
      return { ok: false, reason: 'It is not your turn.', view: redact(rec.state, playerId) };
    }

    const allowed = legalMoves(rec.state, playerId);
    const match = allowed.find((m) => sameMove(m, move));
    if (!match) {
      return { ok: false, reason: explainIllegal(rec.state, playerId, move, allowed), view: redact(rec.state, playerId) };
    }

    this.remember(rec);
    const before = rec.state.log.length;
    rec.state = applyMove(rec.state, playerId, match);
    this.recordMove(rec, playerId, match, before);
    this.store.set(matchId, rec);
    return { ok: true, view: redact(rec.state, playerId) };
  }

  /** The move history, as sentences. Safe to show anyone — it is the public record of the hand. */
  history(matchId: string, limit = 100): MoveRecord[] {
    const rec = this.require(matchId);
    return rec.moves.slice(-limit);
  }

  /** The seating plan. Names and kinds only; never a hand. */
  seats(matchId: string): Seat[] {
    return this.require(matchId).seats.map((s) => ({ ...s }));
  }

  /** Mark a remote seat present. Async play needs to know who is actually here. */
  touch(matchId: string, playerId: string, connected = true): void {
    const rec = this.require(matchId);
    const seat = rec.seats.find((s) => s.id === playerId);
    if (!seat) return;
    seat.connected = connected;
    seat.lastSeen = Date.now();
    this.store.set(matchId, rec);
  }

  /** Rename a seat, or hand it to a bot when somebody drops out. */
  setSeat(matchId: string, playerId: string, patch: Partial<Omit<Seat, 'id'>>): Seat[] {
    const rec = this.require(matchId);
    const seat = rec.seats.find((s) => s.id === playerId);
    if (seat) Object.assign(seat, patch);
    this.store.set(matchId, rec);
    return this.seats(matchId);
  }

  // ----- takeback, by consent -----

  /**
   * Ask to take a move back. Everyone else at the table who is a person has to agree, because
   * an undo rewinds information they have already acted on.
   */
  requestTakeback(matchId: string, playerId: string): TakebackRequest | null {
    const rec = this.require(matchId);
    this.requireSeat(rec, playerId);
    if (rec.history.length === 0) return null;
    const others = rec.seats.filter((s) => s.kind !== 'bot' && s.id !== playerId).map((s) => s.id);
    rec.takeback = { by: playerId, needed: others, agreed: [], at: Date.now() };
    this.store.set(matchId, rec);
    // A table of one human and bots needs nobody's permission; resolve it straight away.
    if (others.length === 0) { this.applyTakeback(rec); return null; }
    return { ...rec.takeback };
  }

  agreeTakeback(matchId: string, playerId: string): { pending: TakebackRequest | null; applied: boolean } {
    const rec = this.require(matchId);
    const req = rec.takeback;
    if (!req || !req.needed.includes(playerId) || req.agreed.includes(playerId)) {
      return { pending: req ? { ...req } : null, applied: false };
    }
    req.agreed.push(playerId);
    if (req.agreed.length < req.needed.length) {
      this.store.set(matchId, rec);
      return { pending: { ...req }, applied: false };
    }
    this.applyTakeback(rec);
    this.store.set(matchId, rec);
    return { pending: null, applied: true };
  }

  declineTakeback(matchId: string): void {
    const rec = this.require(matchId);
    rec.takeback = null;
    this.store.set(matchId, rec);
  }

  pendingTakeback(matchId: string): TakebackRequest | null {
    const t = this.require(matchId).takeback;
    return t ? { ...t } : null;
  }

  private applyTakeback(rec: MatchRecord): void {
    const prev = rec.history.pop();
    if (prev) {
      rec.state = prev;
      rec.moves.pop();
      log(rec, 'The table agreed to take that move back.');
    }
    rec.takeback = null;
  }

  /**
   * The table as somebody who is NOT playing may see it: no hands at all, just the public board.
   * Spectating has to be a different call, not a view with a flag, so there is no way to leak a
   * hand by passing the wrong id.
   */
  spectate(matchId: string): RedactedState {
    const rec = this.require(matchId);
    // Redacting for a name nobody holds gives exactly the public position.
    return redact(rec.state, '__spectator__');
  }

  /**
   * Take back the last move. Offered only for patience: with opponents at the table an undo is
   * a rewind of other people's information, which is a rules question (and a cheat vector), not
   * a UI affordance. `canUndo` lets the client grey the button out rather than guess.
   */
  canUndo(matchId: string): boolean {
    const rec = this.require(matchId);
    return !!rec.definition.solitaire && rec.history.length > 0;
  }

  undo(matchId: string, playerId: string): MoveResult {
    const rec = this.require(matchId);
    this.requireSeat(rec, playerId);
    const prev = rec.history.pop();
    if (!prev) return { ok: false, reason: 'Nothing to take back.', view: redact(rec.state, playerId) };
    rec.state = prev;
    this.store.set(matchId, rec);
    return { ok: true, view: redact(rec.state, playerId) };
  }

  /**
   * A suggested move. Computed inside the boundary because the hint reads the position — but
   * note it reads the same legal-move set the player can see, so it advises, it does not peek
   * under face-down cards.
   */
  hint(matchId: string, playerId: string): Move | null {
    const rec = this.require(matchId);
    this.requireSeat(rec, playerId);
    if (rec.state.phase !== 'playing') return null;
    if (rec.definition.solitaire) {
      const seen = new Set([positionKey(rec.state)]);
      return chooseSolitaireMove(rec.state, seen, (st, mv) => applyMove(st, playerId, mv));
    }
    const allowed = legalMoves(rec.state, playerId);
    if (allowed.length === 0) return null;
    return chooseMove(rec.state, playerId, rec.botSeed, 'smart').move;
  }

  /** Deal the next hand of a match, drawing a fresh seed from the committed chain. */
  nextHand(matchId: string): MatchSummary {
    const rec = this.require(matchId);
    if (!isTerminal(rec.state)) throw new Error('The current hand is still in play.');
    rec.nonce += 1;
    const handSeed = deriveSeed(rec.serverSeed, rec.clientSeed, rec.nonce);
    rec.handSeeds.push(handSeed);
    rec.state = nextHand(rec.state, handSeed);
    rec.history = [];
    rec.moves = [];
    rec.takeback = null;
    this.store.set(matchId, rec);
    return this.summary(rec);
  }

  /** Publish the secret so the player can check every deal was fixed before they acted. */
  reveal(matchId: string): FairReveal & { handSeeds: number[] } {
    const rec = this.require(matchId);
    if (!isMatchOver(rec.state) && !isTerminal(rec.state)) {
      throw new Error('The seed is revealed when the match ends, not before.');
    }
    return {
      commit: rec.commit,
      clientSeed: rec.clientSeed,
      nonce: rec.handSeeds.length > 0 ? 1 : rec.nonce,
      serverSeed: rec.serverSeed,
      handSeeds: rec.handSeeds.slice(),
    };
  }

  /**
   * Advance one bot seat. Bots are non-player characters owned by the service, so they see the
   * table from inside the boundary — the client never receives a bot's hand in order to move it,
   * which is the other half of not leaking hidden information.
   */
  botStep(matchId: string, humanSeats?: string[], difficulty: 'smart' | 'random' = 'smart'):
    { moved: boolean; seat?: string; view: RedactedState } {
    const rec = this.require(matchId);
    // The seat table is the authority on who is a bot; the humanSeats argument stays supported
    // for callers that predate seats.
    const humans = humanSeats ?? rec.seats.filter((s) => s.kind !== 'bot').map((s) => s.id);
    const viewer = humans[0] ?? rec.state.players[0];
    if (rec.state.phase !== 'playing') return { moved: false, view: redact(rec.state, viewer) };

    const seat = actingPlayers(rec.state).find((p) => !humans.includes(p));
    if (!seat) return { moved: false, view: redact(rec.state, viewer) };

    const seatDiff = rec.seats.find((s) => s.id === seat)?.difficulty ?? difficulty;
    const r = chooseMove(rec.state, seat, rec.botSeed, seatDiff);
    rec.botSeed = r.botSeed;
    // A bot goes through exactly the same validation as a person.
    const allowed = legalMoves(rec.state, seat);
    const picked = allowed.find((m) => sameMove(m, r.move)) ?? allowed[0];
    if (!picked) return { moved: false, view: redact(rec.state, viewer) };

    this.remember(rec);
    const before = rec.state.log.length;
    rec.state = applyMove(rec.state, seat, picked);
    this.recordMove(rec, seat, picked, before);
    this.store.set(matchId, rec);
    return { moved: true, seat, view: redact(rec.state, viewer) };
  }

  /** Whether anyone is still owed a move — lets the client know to keep ticking bots. */
  pending(matchId: string): string[] {
    const rec = this.require(matchId);
    return rec.state.phase === 'playing' ? actingPlayers(rec.state) : [];
  }

  summaryOf(matchId: string): MatchSummary { return this.summary(this.require(matchId)); }

  /** The pinned rules this match is running, for a rules panel that is guaranteed accurate. */
  definitionOf(matchId: string): GameDefinition { return this.require(matchId).definition; }

  end(matchId: string): void { this.store.delete(matchId); }

  // ----- internals -----

  private summary(rec: MatchRecord): MatchSummary {
    return {
      matchId: rec.matchId,
      gameId: rec.gameId,
      fingerprint: rec.fingerprint,
      players: rec.state.players.slice(),
      seats: rec.seats.map((s) => ({ ...s })),
      handNumber: rec.state.handNumber,
      phase: rec.state.phase,
      matchOver: rec.state.matchOver,
      fair: { commit: rec.commit, clientSeed: rec.clientSeed, nonce: rec.nonce },
      waitingOn: rec.state.phase === 'playing' ? actingPlayers(rec.state) : [],
      inviteCode: rec.inviteCode,
    };
  }

  /**
   * Snapshot the position before a move. Patience keeps a deep stack for free undo; a table with
   * opponents keeps a shallow one, because the only thing it can serve is a takeback the whole
   * table agreed to, and that is always the most recent move.
   */
  private remember(rec: MatchRecord): void {
    const limit = rec.definition.solitaire ? UNDO_LIMIT : 1;
    rec.history.push(rec.state);
    while (rec.history.length > limit) rec.history.shift();
  }

  private recordMove(rec: MatchRecord, seat: string, move: Move, logLenBefore: number): void {
    const added = rec.state.log.slice(logLenBefore);
    rec.moves.push({
      n: rec.moves.length + 1,
      seat,
      move,
      at: Date.now(),
      text: added.length > 0 ? added.map((l) => l.text).join(' ') : describeMove(move),
    });
    if (rec.moves.length > 500) rec.moves.shift();
  }

  private require(matchId: string): MatchRecord {
    const rec = this.store.get(matchId);
    if (!rec) throw new Error(`No such match: ${matchId}`);
    return rec;
  }

  private requireSeat(rec: MatchRecord, playerId: string): void {
    if (!rec.state.players.includes(playerId)) {
      throw new Error(`${playerId} is not seated at this match.`);
    }
  }
}

/** Accept either bare ids or a full seating plan, so old callers keep working. */
function normaliseSeats(players: string[] | Seat[]): Seat[] {
  if (players.length === 0) throw new Error('A match needs at least one seat.');
  if (typeof players[0] === 'string') {
    return (players as string[]).map((id, i) => ({
      id,
      name: i === 0 ? 'You' : `Bot ${i + 1}`,
      kind: i === 0 ? 'local' : 'bot',
      difficulty: 'smart' as const,
    }));
  }
  return (players as Seat[]).map((s) => ({ ...s }));
}

/** Short, unambiguous, easy to read down a phone line. No 0/O or 1/I. */
function newInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function log(rec: MatchRecord, text: string): void {
  rec.state.log.push({ t: rec.state.log.length, player: null, text });
}

function describeMove(move: Move): string {
  return move.cardId ? `${move.actionId} ${move.cardId}` : move.actionId;
}

function sameMove(a: Move, b: Move): boolean {
  if (a.actionId !== b.actionId) return false;
  if (a.cardId !== b.cardId) return false;
  if (a.choice !== b.choice) return false;
  if (a.target !== b.target) return false;
  if (a.rank !== b.rank) return false;
  if (a.from !== b.from || a.to !== b.to) return false;
  if (!!a.alone !== !!b.alone) return false;
  const ac = a.cards ?? [], bc = b.cards ?? [];
  if (ac.length !== bc.length) return false;
  return ac.every((x, i) => x === bc[i]);
}

// Players deserve to know why, not just that the tap did nothing. This reads the legal set and
// says what was actually wrong.
function explainIllegal(state: MatchState, playerId: string, move: Move, allowed: Move[]): string {
  const def = state.definition;
  const hand = state.zones[`hand:${playerId}`] || [];
  const card = move.cardId ? hand.find((c) => c.id === move.cardId) : undefined;

  if (allowed.length === 0) return 'You have no legal moves right now.';
  if (move.cardId && !card && !move.from) return 'That card is not in your hand.';

  if (def.trick && move.actionId === 'playToTrick' && card) {
    if (state.lead && card.suit !== state.lead && hand.some((c) => c.suit === state.lead)) {
      return `You must follow ${suitWord(state.lead)} — you still hold one.`;
    }
    if (def.trick.leadCard && allowed.length === 1 && allowed[0].cardId) {
      return 'The opening lead is forced.';
    }
    if (def.trick.brokenSuit && !state.brokenSuitPlayed && card.suit === def.trick.brokenSuit) {
      return `${suitWord(def.trick.brokenSuit)} have not been broken yet.`;
    }
  }

  if (def.climb && (move.actionId === 'climbPlay' || move.actionId === 'climbBomb')) {
    if (state.climbShape > 0) {
      return `You need ${state.climbShape} card${state.climbShape === 1 ? '' : 's'} of the same rank, beating ${state.climbTopRank}.`;
    }
  }

  if (def.solitaire && move.actionId === 'solMove') {
    return 'That card cannot go there — check the build rule and how many cards you can lift at once.';
  }

  return 'That move is not legal here.';
}

function suitWord(s: string): string {
  return { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' }[s] ?? s;
}
