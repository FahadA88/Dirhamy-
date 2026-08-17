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

export interface MatchSummary {
  matchId: string;
  gameId: string;
  fingerprint: string;
  players: string[];
  handNumber: number;
  phase: MatchState['phase'];
  matchOver: boolean;
  fair: FairCommit;
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
  // Prior states, for undo. Only kept where taking a move back can't reveal anything an
  // opponent has since acted on — patience, which has no opponents. Never persisted.
  history: MatchState[];
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
    players: string[],
    clientSeed?: string,
    // A host with its own CSPRNG (or a test that needs determinism) may supply the secret.
    injectedServerSeed?: string,
  ): MatchSummary {
    const { definition } = migrate(rawDefinition);
    const pinned = pinDefinition(definition);

    const serverSeed = injectedServerSeed ?? newServerSeed();
    const seed0 = clientSeed ?? newClientSeed();
    const nonce = 1;
    const handSeed = deriveSeed(serverSeed, seed0, nonce);

    const rec: MatchRecord = {
      matchId: newId(),
      gameId,
      definition: pinned,
      fingerprint: definitionFingerprint(pinned),
      state: createMatch(pinned, players, handSeed),
      serverSeed,
      commit: commitTo(serverSeed),
      clientSeed: seed0,
      nonce,
      handSeeds: [handSeed],
      botSeed: (handSeed ^ 0x9e3779b9) >>> 0,
      createdAt: Date.now(),
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
    rec.state = applyMove(rec.state, playerId, match);
    this.store.set(matchId, rec);
    return { ok: true, view: redact(rec.state, playerId) };
  }

  /**
   * Take back the last move. Offered only for patience: with opponents at the table an undo is
   * a rewind of other people's information, which is a rules question (and a cheat vector), not
   * a UI affordance. `canUndo` lets the client grey the button out rather than guess.
   */
  canUndo(matchId: string): boolean {
    const rec = this.require(matchId);
    return rec.history.length > 0;
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
  botStep(matchId: string, humanSeats: string[], difficulty: 'smart' | 'random' = 'smart'):
    { moved: boolean; seat?: string; view: RedactedState } {
    const rec = this.require(matchId);
    const viewer = humanSeats[0] ?? rec.state.players[0];
    if (rec.state.phase !== 'playing') return { moved: false, view: redact(rec.state, viewer) };

    const seat = actingPlayers(rec.state).find((p) => !humanSeats.includes(p));
    if (!seat) return { moved: false, view: redact(rec.state, viewer) };

    const r = chooseMove(rec.state, seat, rec.botSeed, difficulty);
    rec.botSeed = r.botSeed;
    // A bot goes through exactly the same validation as a person.
    const allowed = legalMoves(rec.state, seat);
    const picked = allowed.find((m) => sameMove(m, r.move)) ?? allowed[0];
    if (!picked) return { moved: false, view: redact(rec.state, viewer) };

    this.remember(rec);
    rec.state = applyMove(rec.state, seat, picked);
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
      handNumber: rec.state.handNumber,
      phase: rec.state.phase,
      matchOver: rec.state.matchOver,
      fair: { commit: rec.commit, clientSeed: rec.clientSeed, nonce: rec.nonce },
    };
  }

  /** Snapshot the position before a move, where the game allows taking one back. */
  private remember(rec: MatchRecord): void {
    if (!rec.definition.solitaire) return;
    rec.history.push(rec.state);
    if (rec.history.length > UNDO_LIMIT) rec.history.shift();
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
