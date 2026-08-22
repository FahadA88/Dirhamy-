import { MatchService, MoveRecord, Seat, TakebackRequest } from '../server/matchService';
import { Move, RedactedState } from '../engine/types';
import { MatchApi, Request, Response, TableEvent, expectKind } from './protocol';
import { handle, mutates, eventFor } from './dispatch';

// The in-process transport. No network, but the same protocol: every call is built as a Request,
// goes through the same dispatcher, and comes back as a Response.
//
// This is the async/pass-and-play path. Going through the protocol even here is deliberate —
// it means the local game exercises the identical code path a networked one does, so a bug in
// the wire format shows up in ordinary single-player play rather than only under multiplayer.

export class LocalApi implements MatchApi {
  private listeners = new Map<string, Set<(e: TableEvent) => void>>();

  constructor(private service: MatchService) {}

  private send(req: Request): Response {
    const res = handle(this.service, req);
    if (res.ok && mutates(req)) this.emit(eventFor(this.service, req));
    return res;
  }

  private emit(e: TableEvent): void {
    for (const l of this.listeners.get(e.matchId) ?? []) l(e);
  }

  async summary(matchId: string) {
    return expectKind(this.send({ kind: 'summary', matchId }), 'summary').summary;
  }
  async view(matchId: string, seat: string): Promise<RedactedState> {
    return expectKind(this.send({ kind: 'view', matchId, seat }), 'view').view;
  }
  async legal(matchId: string, seat: string): Promise<Move[]> {
    return expectKind(this.send({ kind: 'legal', matchId, seat }), 'legal').moves;
  }
  async submit(matchId: string, seat: string, move: Move) {
    return expectKind(this.send({ kind: 'submit', matchId, seat, move }), 'submit').result;
  }
  async history(matchId: string): Promise<MoveRecord[]> {
    return expectKind(this.send({ kind: 'history', matchId }), 'history').moves;
  }
  async spectate(matchId: string): Promise<RedactedState> {
    return expectKind(this.send({ kind: 'spectate', matchId }), 'view').view;
  }
  async botStep(matchId: string) {
    const r = expectKind(this.send({ kind: 'botStep', matchId }), 'botStep');
    return { moved: r.moved, seat: r.seat };
  }
  async nextHand(matchId: string) {
    return expectKind(this.send({ kind: 'nextHand', matchId }), 'summary').summary;
  }
  async setSeat(matchId: string, seat: string, patch: Partial<Omit<Seat, 'id'>>): Promise<Seat[]> {
    return expectKind(this.send({ kind: 'setSeat', matchId, seat, patch }), 'seats').seats;
  }
  async requestTakeback(matchId: string, seat: string): Promise<TakebackRequest | null> {
    return expectKind(this.send({ kind: 'requestTakeback', matchId, seat }), 'takeback').pending;
  }
  async agreeTakeback(matchId: string, seat: string) {
    const r = expectKind(this.send({ kind: 'agreeTakeback', matchId, seat }), 'takeback');
    return { pending: r.pending, applied: !!r.applied };
  }
  async declineTakeback(matchId: string): Promise<void> {
    expectKind(this.send({ kind: 'declineTakeback', matchId }), 'ack');
  }
  async hint(matchId: string, seat: string): Promise<Move | null> {
    return expectKind(this.send({ kind: 'hint', matchId, seat }), 'hint').move;
  }
  async pendingTakeback(matchId: string): Promise<TakebackRequest | null> {
    return expectKind(this.send({ kind: 'pendingTakeback', matchId }), 'takeback').pending;
  }
  async quickUndo(matchId: string, seat: string) {
    return expectKind(this.send({ kind: 'quickUndo', matchId, seat }), 'submit').result;
  }

  subscribe(matchId: string, listener: (e: TableEvent) => void): () => void {
    const set = this.listeners.get(matchId) ?? new Set();
    set.add(listener);
    this.listeners.set(matchId, set);
    return () => { set.delete(listener); };
  }

  close(): void { this.listeners.clear(); }

  /** Escape hatch for the parts of the app that legitimately host the service (creating a match). */
  get local(): MatchService { return this.service; }
}
