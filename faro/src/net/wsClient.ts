import { Move, RedactedState } from '../engine/types';
import { MoveRecord, Seat, TakebackRequest, MatchSummary } from '../server/matchService';
import { MatchApi, Request, Response, TableEvent, expectKind } from './protocol';

// The networked transport. Same verbs, same responses, a socket in between.
//
// Reconnection is the substance of this file rather than an afterthought: an async game is one
// where people close the tab, and a table that forgets you the moment your connection blips is
// not async, it is fragile. So the socket retries with backoff, re-announces which seat it is,
// and any call made while it is down waits rather than failing.

type Pending = { resolve: (r: Response) => void; reject: (e: Error) => void; req: Request };

export class WebSocketApi implements MatchApi {
  private sock: WebSocket | null = null;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Map<string, Set<(e: TableEvent) => void>>();
  private queued: (() => void)[] = [];
  private closed = false;
  private attempt = 0;
  private seatClaim: { matchId: string; seat: string | null; token: string | null } | null = null;

  constructor(private url: string) { this.connect(); }

  /**
   * Announce which seat this client is, so the host can mark it present and route events.
   * `token` is the secret handed back when this seat was opened or joined — required for any
   * real seat (a spectator identifying with `seat: null` needs none), and re-sent on every
   * reconnect so the host never has to just take a seat's word for it.
   */
  identify(matchId: string, seat: string | null, token: string | null = null): Promise<MatchSummary> {
    this.seatClaim = { matchId, seat, token };
    return this.call({ kind: 'hello', matchId, seat, token }).then((r) => expectKind(r, 'summary').summary);
  }

  private connect(): void {
    if (this.closed) return;
    const sock = new WebSocket(this.url);
    this.sock = sock;

    sock.onopen = () => {
      this.attempt = 0;
      if (this.seatClaim) {
        // Re-announce before anything queued goes out, so the host knows who is speaking.
        sock.send(JSON.stringify({ id: this.nextId++, body: { kind: 'hello', ...this.seatClaim } }));
      }
      const q = this.queued;
      this.queued = [];
      for (const fn of q) fn();
    };

    sock.onmessage = (ev) => {
      let msg: { id: number; body: Response | TableEvent; reply?: boolean; event?: boolean };
      try { msg = JSON.parse(String(ev.data)); } catch { return; }
      if (msg.event) {
        const e = msg.body as TableEvent;
        for (const l of this.listeners.get(e.matchId) ?? []) l(e);
        return;
      }
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      p.resolve(msg.body as Response);
    };

    sock.onclose = () => {
      if (this.closed) return;
      // Anything in flight when the wire dropped is retried on the new socket rather than lost.
      const inFlight = [...this.pending.values()];
      this.pending.clear();
      for (const p of inFlight) this.queued.push(() => this.rawSend(p));
      const wait = Math.min(8000, 400 * 2 ** this.attempt++);
      setTimeout(() => this.connect(), wait);
    };

    sock.onerror = () => { /* onclose does the work */ };
  }

  /** Whether the socket is open right now — the connection-status dot's only source of truth. */
  isLive(): boolean { return this.sock?.readyState === WebSocket.OPEN; }

  private rawSend(p: Pending): void {
    const id = this.nextId++;
    this.pending.set(id, p);
    this.sock!.send(JSON.stringify({ id, body: p.req }));
  }

  private call(req: Request): Promise<Response> {
    return new Promise((resolve, reject) => {
      const p: Pending = { resolve, reject, req };
      if (this.sock && this.sock.readyState === WebSocket.OPEN) this.rawSend(p);
      else this.queued.push(() => this.rawSend(p));
    });
  }

  async summary(matchId: string) {
    return expectKind(await this.call({ kind: 'summary', matchId }), 'summary').summary;
  }
  async view(matchId: string, seat: string): Promise<RedactedState> {
    return expectKind(await this.call({ kind: 'view', matchId, seat }), 'view').view;
  }
  async legal(matchId: string, seat: string): Promise<Move[]> {
    return expectKind(await this.call({ kind: 'legal', matchId, seat }), 'legal').moves;
  }
  async submit(matchId: string, seat: string, move: Move) {
    return expectKind(await this.call({ kind: 'submit', matchId, seat, move }), 'submit').result;
  }
  async history(matchId: string): Promise<MoveRecord[]> {
    return expectKind(await this.call({ kind: 'history', matchId }), 'history').moves;
  }
  async spectate(matchId: string): Promise<RedactedState> {
    return expectKind(await this.call({ kind: 'spectate', matchId }), 'view').view;
  }
  async botStep(matchId: string) {
    const r = expectKind(await this.call({ kind: 'botStep', matchId }), 'botStep');
    return { moved: r.moved, seat: r.seat };
  }
  async nextHand(matchId: string) {
    return expectKind(await this.call({ kind: 'nextHand', matchId }), 'summary').summary;
  }
  async setSeat(matchId: string, seat: string, patch: Partial<Omit<Seat, 'id'>>) {
    return expectKind(await this.call({ kind: 'setSeat', matchId, seat, patch }), 'seats').seats;
  }
  async requestTakeback(matchId: string, seat: string): Promise<TakebackRequest | null> {
    return expectKind(await this.call({ kind: 'requestTakeback', matchId, seat }), 'takeback').pending;
  }
  async agreeTakeback(matchId: string, seat: string) {
    const r = expectKind(await this.call({ kind: 'agreeTakeback', matchId, seat }), 'takeback');
    return { pending: r.pending, applied: !!r.applied };
  }
  async declineTakeback(matchId: string, seat: string): Promise<void> {
    expectKind(await this.call({ kind: 'declineTakeback', matchId, seat }), 'ack');
  }
  async hint(matchId: string, seat: string): Promise<Move | null> {
    return expectKind(await this.call({ kind: 'hint', matchId, seat }), 'hint').move;
  }
  async pendingTakeback(matchId: string): Promise<TakebackRequest | null> {
    return expectKind(await this.call({ kind: 'pendingTakeback', matchId }), 'takeback').pending;
  }
  async quickUndo(matchId: string, seat: string) {
    return expectKind(await this.call({ kind: 'quickUndo', matchId, seat }), 'submit').result;
  }

  subscribe(matchId: string, listener: (e: TableEvent) => void): () => void {
    const set = this.listeners.get(matchId) ?? new Set();
    set.add(listener);
    this.listeners.set(matchId, set);
    return () => { set.delete(listener); };
  }

  close(): void {
    this.closed = true;
    this.listeners.clear();
    this.sock?.close();
  }

  get connected(): boolean {
    return this.sock?.readyState === WebSocket.OPEN;
  }
}

/** Open or join a table over the host's REST surface, before any socket exists. */
export async function openRemoteTable(base: string, gameId: string, seats: Seat[]) {
  const r = await fetch(`${base}/open`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ gameId, seats }),
  });
  return r.json() as Promise<{ matchId: string; code: string; seatTokens: Record<string, string> } | { error: string }>;
}

export async function joinRemoteTable(base: string, code: string, name: string) {
  const r = await fetch(`${base}/join`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, name }),
  });
  return r.json() as Promise<{ matchId: string; seat: string; token: string; gameId: string } | { error: string }>;
}

export async function quickPlay(base: string, gameId: string, name: string, seats = 4) {
  const r = await fetch(`${base}/quickplay`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ gameId, name, seats }),
  });
  return r.json() as Promise<
    { matchId: string; seat: string; code: string; hosted: boolean; token: string } | { error: string }
  >;
}
