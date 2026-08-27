import { Move, RedactedState } from '../engine/types';
import { MatchSummary, MoveRecord, Seat, TakebackRequest } from '../server/matchService';

// One wire protocol, three transports.
//
// The point of Phase 1's authority boundary was that moving the service across a network should
// be a transport change, not a rewrite. This is that transport: a request/response protocol
// whose verbs are exactly MatchService's methods, plus a push channel so a table can be live.
//
// Async and real-time are NOT different models here. They are the same commands over the same
// protocol — async just means nobody is listening at the moment, so the state is waiting in the
// store when they come back. That is what makes "no rule drift between the two" true by
// construction rather than by discipline.

export type Request =
  // `token` is the secret handed back when this seat was opened or joined (see GameHost). A
  // spectator (`seat: null`) needs none; a real seat's token must match what the host issued, or
  // the invite code alone would let any client read or move as somebody else's hand.
  | { kind: 'hello'; matchId: string; seat: string | null; token: string | null }
  | { kind: 'summary'; matchId: string }
  | { kind: 'view'; matchId: string; seat: string }
  | { kind: 'legal'; matchId: string; seat: string }
  | { kind: 'submit'; matchId: string; seat: string; move: Move }
  | { kind: 'history'; matchId: string }
  | { kind: 'spectate'; matchId: string }
  | { kind: 'botStep'; matchId: string }
  | { kind: 'nextHand'; matchId: string }
  | { kind: 'setSeat'; matchId: string; seat: string; patch: Partial<Omit<Seat, 'id'>> }
  | { kind: 'requestTakeback'; matchId: string; seat: string }
  | { kind: 'agreeTakeback'; matchId: string; seat: string }
  | { kind: 'declineTakeback'; matchId: string; seat: string }
  // Added so a networked table has the same instruments as a local one. Each is answered by the
  // referee rather than worked out client-side: a hint reads the position, and taking a move
  // back is a rule about who has seen what.
  | { kind: 'hint'; matchId: string; seat: string }
  | { kind: 'pendingTakeback'; matchId: string }
  | { kind: 'quickUndo'; matchId: string; seat: string };

export type Response =
  | { ok: true; kind: 'summary'; summary: MatchSummary }
  | { ok: true; kind: 'view'; view: RedactedState }
  | { ok: true; kind: 'legal'; moves: Move[] }
  | { ok: true; kind: 'submit'; result: { ok: boolean; reason?: string; view: RedactedState } }
  | { ok: true; kind: 'history'; moves: MoveRecord[] }
  | { ok: true; kind: 'seats'; seats: Seat[] }
  | { ok: true; kind: 'takeback'; pending: TakebackRequest | null; applied?: boolean }
  | { ok: true; kind: 'botStep'; moved: boolean; seat?: string }
  | { ok: true; kind: 'ack' }
  | { ok: true; kind: 'hint'; move: Move | null }
  | { ok: false; error: string };

export type OkResponse = Extract<Response, { ok: true }>;

/**
 * Unwrap a response, or throw. Every transport shares this so a protocol mismatch fails the same
 * way everywhere rather than being handled three slightly different ways.
 */
export function expectKind<K extends OkResponse['kind']>(
  res: Response, kind: K,
): Extract<OkResponse, { kind: K }> {
  if (!res.ok) throw new Error(res.error);
  if (res.kind !== kind) throw new Error(`Expected a ${kind} response, got ${res.kind}.`);
  return res as Extract<OkResponse, { kind: K }>;
}

/** Pushed to everyone at a table when the position changes. Carries no cards — clients re-read. */
export interface TableEvent {
  type: 'changed' | 'seats' | 'takeback' | 'ended';
  matchId: string;
  /** Whose move it is now, so a client can raise a "your turn" without fetching anything. */
  waitingOn?: string[];
  by?: string;
  at: number;
}

/**
 * The client-side surface. Everything the table UI needs, and nothing that could hand it a card
 * it should not see — `view` takes the seat it is answering for, and `spectate` cannot take one
 * at all.
 */
export interface MatchApi {
  summary(matchId: string): Promise<MatchSummary>;
  view(matchId: string, seat: string): Promise<RedactedState>;
  legal(matchId: string, seat: string): Promise<Move[]>;
  submit(matchId: string, seat: string, move: Move): Promise<{ ok: boolean; reason?: string; view: RedactedState }>;
  history(matchId: string): Promise<MoveRecord[]>;
  spectate(matchId: string): Promise<RedactedState>;
  botStep(matchId: string): Promise<{ moved: boolean; seat?: string }>;
  nextHand(matchId: string): Promise<MatchSummary>;
  setSeat(matchId: string, seat: string, patch: Partial<Omit<Seat, 'id'>>): Promise<Seat[]>;
  requestTakeback(matchId: string, seat: string): Promise<TakebackRequest | null>;
  agreeTakeback(matchId: string, seat: string): Promise<{ pending: TakebackRequest | null; applied: boolean }>;
  declineTakeback(matchId: string, seat: string): Promise<void>;
  /** The advisor's suggestion for this seat, or null when there is nothing to suggest. */
  hint(matchId: string, seat: string): Promise<Move | null>;
  /** A takeback already asked for and still waiting on people, if there is one. */
  pendingTakeback(matchId: string): Promise<TakebackRequest | null>;
  /** Take back your own last move in a solo game. Refused once anyone else is seated. */
  quickUndo(matchId: string, seat: string): Promise<{ ok: boolean; reason?: string; view: RedactedState }>;
  /** Live updates. Returns an unsubscribe. Async transports simply never call the listener. */
  subscribe(matchId: string, listener: (e: TableEvent) => void): () => void;
  close(): void;
}
