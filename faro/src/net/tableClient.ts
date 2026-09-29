import { Move, RedactedState } from '../engine/types';
import { MatchApi, TableEvent } from './protocol';
import { MatchService, MoveRecord, Seat, TakebackRequest } from '../server/matchService';
import { BotMode } from '../bots/randomBot';
import { verifyReveal } from '../engine/fairness';

/** Worklist #89/#90: what a player can already see about a deal's fairness, and — once the
 *  match is over — the secret that lets them check it. commit/clientSeed/nonce are public from
 *  the moment the match starts; revealed stays null until the match ends, the same point the
 *  engine itself first allows the secret out (see MatchService.reveal). */
export interface FairnessInfo {
  commit: string;
  clientSeed: string;
  nonce: number;
  revealed: { serverSeed: string; handSeeds: number[]; verified: boolean } | null;
}

// One shape of table, two places the referee can live.
//
// The table UI was written against the in-process MatchService, synchronously: it reads a view,
// gets an answer, and renders. A networked referee cannot answer synchronously, and rewriting
// every read in the table as a promise would mean rewriting the table.
//
// So the difference is absorbed here instead. This client keeps the last known position in a
// cache and answers reads from it immediately — which is what the UI already assumed. Writes go
// out to whichever referee is in charge; when the answer comes back, or when the server pushes a
// change, the cache updates and the UI is told to re-render.
//
// The important part is what does NOT change: the referee is still the only thing that decides
// anything. A local table asks the service in this tab; a remote one asks a service across a
// socket. Neither version of this client contains a rule.

export interface Board {
  matchId: string;
  view: RedactedState;
  legal: Move[];
}

export interface TableClient {
  readonly matchId: string;
  /** True when the referee is on the other end of a socket. */
  readonly remote: boolean;
  /** The last known position for a seat. Never stale by more than one round trip. */
  read(seat: string): Board;
  submit(seat: string, move: Move): { ok: boolean; reason?: string };
  quickUndo(seat: string): { ok: boolean; reason?: string };
  hint(seat: string): Move | null;
  /** null outside a trick-taking bid, or for an online table (not wired over the socket yet). */
  handStrength(seat: string): number | null;
  pending(): string[];
  pendingTakeback(): TakebackRequest | null;
  requestTakeback(seat: string): TakebackRequest | null;
  agreeTakeback(seat: string): void;
  declineTakeback(seat: string): void;
  history(): MoveRecord[];
  botStep(humanSeats: string[], difficulty: BotMode): { moved: boolean };
  /** Item 69 of the punch list: how many legal moves the bot about to act actually has, so the
   *  table can let a real decision take a moment longer than a forced one — without ever
   *  handing the client a hand it isn't owed. Undefined for a client that doesn't offer it
   *  (an online table's host runs its own bot loop independently of this browser tab). */
  botComplexity?(humanSeats: string[]): number;
  nextHand(): void;
  seats(): Seat[];
  end(): void;
  /**
   * Deal a fresh match from the exact same starting layout as this one, if this client can —
   * only a local table can, since an online one's deal belongs to whoever is hosting it. Returns
   * the new match's id, or null where this is not offered.
   */
  replaySameDeal?(gameId: string): string | null;
  /** null for an online table for now — the reveal round-trip isn't wired over the socket yet. */
  fairness(): FairnessInfo | null;
  /** Fires whenever the cached position changes, so React can re-read. */
  onChange(cb: () => void): () => void;
  /** 'live' unless this table is over a socket that has dropped and is retrying. A local table
   *  is always 'live' — there is no wire to lose. */
  connectionState(): 'live' | 'reconnecting';
}

// ---------- the local one ----------

/**
 * Straight through to the service in this tab. Every call is already synchronous, so this is a
 * thin pass-through — it exists so the UI has one shape to talk to, not because it does work.
 */
export class LocalTableClient implements TableClient {
  readonly remote = false;
  private listeners = new Set<() => void>();

  constructor(readonly matchId: string, private service: MatchService) {}

  read(seat: string): Board {
    const view = this.service.view(this.matchId, seat);
    return { matchId: this.matchId, view, legal: view.isYourTurn ? this.service.legal(this.matchId, seat) : [] };
  }
  submit(seat: string, move: Move) {
    const r = this.service.submit(this.matchId, seat, move);
    this.changed();
    return { ok: r.ok, reason: r.reason };
  }
  quickUndo(seat: string) {
    const r = this.service.quickUndo(this.matchId, seat);
    this.changed();
    return { ok: r.ok, reason: r.reason };
  }
  hint(seat: string) { return this.service.hint(this.matchId, seat); }
  handStrength(seat: string) { return this.service.handStrength(this.matchId, seat); }
  pending() { return this.service.pending(this.matchId); }
  pendingTakeback() { return this.service.pendingTakeback(this.matchId); }
  requestTakeback(seat: string) {
    const r = this.service.requestTakeback(this.matchId, seat);
    this.changed();
    return r;
  }
  agreeTakeback(seat: string) { this.service.agreeTakeback(this.matchId, seat); this.changed(); }
  declineTakeback(seat: string) { this.service.declineTakeback(this.matchId, seat); this.changed(); }
  history() { return this.service.history(this.matchId); }
  botStep(humanSeats: string[], difficulty: BotMode) {
    const r = this.service.botStep(this.matchId, humanSeats, difficulty);
    if (r.moved) this.changed();
    return { moved: r.moved };
  }
  botComplexity(humanSeats: string[]) { return this.service.botComplexity(this.matchId, humanSeats); }
  nextHand() { this.service.nextHand(this.matchId); this.changed(); }
  seats() { return this.service.seats(this.matchId); }
  replaySameDeal(gameId: string): string | null {
    const next = this.service.replaySameDeal(this.matchId, gameId);
    return next.matchId;
  }
  end() { try { this.service.end(this.matchId); } catch { /* already gone */ } }

  fairness(): FairnessInfo {
    const summary = this.service.summaryOf(this.matchId);
    let revealed: FairnessInfo['revealed'] = null;
    if (summary.matchOver) {
      const r = this.service.reveal(this.matchId);
      revealed = { serverSeed: r.serverSeed, handSeeds: r.handSeeds, verified: verifyReveal(r, r.handSeeds).ok };
    }
    return { commit: summary.fair.commit, clientSeed: summary.fair.clientSeed, nonce: summary.fair.nonce, revealed };
  }

  onChange(cb: () => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  connectionState(): 'live' | 'reconnecting' { return 'live'; }
  private changed() { for (const l of this.listeners) l(); }
}

// ---------- the networked one ----------

/**
 * The referee is across a socket. Reads are answered from the last position the server sent;
 * writes are fired off and the cache is corrected when the reply lands.
 *
 * A move is NOT applied optimistically. The temptation is obvious — the local rules are right
 * here — but a client that shows you the result of your own move before the server has agreed is
 * a client that can show you a move that never happened. Waiting one round trip is cheap; being
 * wrong about the position is not.
 */
export class RemoteTableClient implements TableClient {
  readonly remote = true;
  private listeners = new Set<() => void>();
  private board: Board;
  private seatId: string;
  private cachedSeats: Seat[] = [];
  private cachedTakeback: TakebackRequest | null = null;
  private cachedHistory: MoveRecord[] = [];
  private waiting: string[] = [];
  private unsub: (() => void) | null = null;
  private closed = false;

  constructor(
    readonly matchId: string,
    private api: MatchApi,
    seat: string,
    first: Board,
  ) {
    this.seatId = seat;
    this.board = first;
    // The server pushes a bare "something changed" — deliberately carrying no cards — so the
    // only correct response is to go and read the position again for this seat.
    this.unsub = this.api.subscribe(matchId, (e: TableEvent) => {
      if (e.waitingOn) this.waiting = e.waitingOn;
      if (e.type === 'ended') { this.changed(); return; }
      void this.refresh();
    });
  }

  /** Pull the current position for our seat and tell the UI if anything moved. */
  private async refresh(): Promise<void> {
    if (this.closed) return;
    try {
      const view = await this.api.view(this.matchId, this.seatId);
      const legal = view.isYourTurn ? await this.api.legal(this.matchId, this.seatId) : [];
      this.board = { matchId: this.matchId, view, legal };
      this.cachedTakeback = await this.api.pendingTakeback(this.matchId);
      this.changed();
    } catch { /* a dropped socket retries on its own; the cache stays as it was */ }
  }

  read(): Board { return this.board; }

  submit(seat: string, move: Move) {
    void (async () => {
      try {
        const r = await this.api.submit(this.matchId, seat, move);
        if (!r.ok) {
          // A refusal is worth surfacing even though it arrives late.
          this.lastRefusal = r.reason ?? 'That move is not legal here.';
        }
        await this.refresh();
      } catch (e) {
        this.lastRefusal = e instanceof Error ? e.message : 'The table did not answer.';
        this.changed();
      }
    })();
    // Optimistically report acceptance; a refusal arrives through lastRefusal a moment later.
    return { ok: true };
  }

  /** Set when the server refuses something we already told the UI was fine. */
  lastRefusal: string | null = null;

  quickUndo(seat: string) {
    void (async () => {
      try { await this.api.quickUndo(this.matchId, seat); await this.refresh(); } catch { /* ignore */ }
    })();
    return { ok: true };
  }

  // A hint has to be asked for and answered before it can be shown, so the synchronous call
  // returns nothing and the answer arrives as a change. The table asks again on the next render.
  private cachedHint: Move | null = null;
  hint(seat: string): Move | null {
    void (async () => {
      try {
        const m = await this.api.hint(this.matchId, seat);
        if (m) { this.cachedHint = m; this.changed(); }
      } catch { /* ignore */ }
    })();
    const m = this.cachedHint;
    this.cachedHint = null;
    return m;
  }

  // Not wired over the socket yet, same as fairness() below — null is the honest answer.
  handStrength(): number | null { return null; }

  pending(): string[] { return this.waiting; }
  pendingTakeback(): TakebackRequest | null { return this.cachedTakeback; }

  requestTakeback(seat: string): TakebackRequest | null {
    void (async () => {
      try { this.cachedTakeback = await this.api.requestTakeback(this.matchId, seat); this.changed(); }
      catch { /* ignore */ }
    })();
    return this.cachedTakeback;
  }
  agreeTakeback(seat: string) {
    void (async () => {
      try { await this.api.agreeTakeback(this.matchId, seat); await this.refresh(); } catch { /* ignore */ }
    })();
  }
  declineTakeback(seat: string) {
    void (async () => {
      try { await this.api.declineTakeback(this.matchId, seat); await this.refresh(); } catch { /* ignore */ }
    })();
  }

  history(): MoveRecord[] {
    void (async () => {
      try { this.cachedHistory = await this.api.history(this.matchId); this.changed(); } catch { /* ignore */ }
    })();
    return this.cachedHistory;
  }

  // Bots belong to the host, not to a guest's browser. A remote client never steps them.
  botStep() { return { moved: false }; }

  nextHand() {
    void (async () => {
      try { await this.api.nextHand(this.matchId); await this.refresh(); } catch { /* ignore */ }
    })();
  }

  seats(): Seat[] { return this.cachedSeats; }

  end(): void {
    this.closed = true;
    this.unsub?.();
    this.unsub = null;
    this.api.close();
  }

  // Not wired over the socket yet — MatchApi has no summary/reveal round-trip. Returning null
  // here rather than guessing is the honest answer; the UI hides the fairness panel for it.
  fairness(): FairnessInfo | null { return null; }

  onChange(cb: () => void) { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; }
  connectionState(): 'live' | 'reconnecting' { return (this.api.isLive?.() ?? true) ? 'live' : 'reconnecting'; }
  private changed() { for (const l of this.listeners) l(); }
}
