import { MatchService } from '../server/matchService';
import { Request, Response, TableEvent } from './protocol';

// The single place a request turns into a MatchService call.
//
// Every transport — in-process, cross-tab, WebSocket — routes through this function. That is
// what makes "the same game runs correctly async and real-time with no rule drift" a structural
// fact rather than a promise: there is exactly one implementation of every verb, and it is the
// same referee in all three cases.

export function handle(service: MatchService, req: Request): Response {
  try {
    switch (req.kind) {
      case 'hello': {
        if (req.seat) service.touch(req.matchId, req.seat, true);
        return { ok: true, kind: 'summary', summary: service.summaryOf(req.matchId) };
      }
      case 'summary': return { ok: true, kind: 'summary', summary: service.summaryOf(req.matchId) };
      case 'view': return { ok: true, kind: 'view', view: service.view(req.matchId, req.seat) };
      case 'legal': return { ok: true, kind: 'legal', moves: service.legal(req.matchId, req.seat) };
      case 'submit': return { ok: true, kind: 'submit', result: service.submit(req.matchId, req.seat, req.move) };
      case 'history': return { ok: true, kind: 'history', moves: service.history(req.matchId) };
      case 'spectate': return { ok: true, kind: 'view', view: service.spectate(req.matchId) };
      case 'botStep': {
        const r = service.botStep(req.matchId);
        return { ok: true, kind: 'botStep', moved: r.moved, seat: r.seat };
      }
      case 'nextHand': return { ok: true, kind: 'summary', summary: service.nextHand(req.matchId) };
      case 'setSeat': return { ok: true, kind: 'seats', seats: service.setSeat(req.matchId, req.seat, req.patch) };
      case 'requestTakeback': return { ok: true, kind: 'takeback', pending: service.requestTakeback(req.matchId, req.seat) };
      case 'agreeTakeback': {
        const r = service.agreeTakeback(req.matchId, req.seat);
        return { ok: true, kind: 'takeback', pending: r.pending, applied: r.applied };
      }
      case 'declineTakeback': service.declineTakeback(req.matchId); return { ok: true, kind: 'ack' };
      default: return { ok: false, error: 'Unknown request.' };
    }
  } catch (e) {
    // A thrown error is a protocol-level refusal (no such match, not seated). An ILLEGAL MOVE is
    // not an error — it comes back as a submit result with a reason, which is the difference
    // between "you can't do that" and "something is broken".
    return { ok: false, error: (e as Error).message };
  }
}

/** Which requests change the table, and therefore need pushing to everyone watching. */
export function mutates(req: Request): boolean {
  return req.kind === 'submit' || req.kind === 'botStep' || req.kind === 'nextHand'
    || req.kind === 'agreeTakeback' || req.kind === 'setSeat';
}

export function eventFor(service: MatchService, req: Request): TableEvent {
  let waitingOn: string[] = [];
  try { waitingOn = service.summaryOf(req.matchId).waitingOn; } catch { /* match gone */ }
  const type: TableEvent['type'] = req.kind === 'setSeat' ? 'seats'
    : req.kind === 'agreeTakeback' ? 'takeback' : 'changed';
  return { type, matchId: req.matchId, waitingOn, at: Date.now() };
}
