import { MatchService } from './matchService';
import { LocalMatchStore } from './localStore';

// The one match service the app talks to. Today it runs in this tab; when it moves behind a
// socket, this module is the only thing that changes shape — every caller already speaks the
// same four verbs (create, view, legal, submit) and already receives redacted state only.
export const service = new MatchService(new LocalMatchStore());

// What the client is allowed to remember between page loads: which match it was sitting at.
// Not the position, not the hands, not the seed — an id. Ask the service for the rest.
const SESSION = 'decky.session.v1';

export interface SessionPointer {
  matchId: string;
  gameId: string;
  seats: number;
  savedAt: number;
}

export function rememberSession(matchId: string, gameId: string, seats: number): void {
  try {
    const p: SessionPointer = { matchId, gameId, seats, savedAt: Date.now() };
    localStorage.setItem(SESSION, JSON.stringify(p));
  } catch { /* ignore */ }
}

export function forgetSession(): void {
  try { localStorage.removeItem(SESSION); } catch { /* ignore */ }
}

/** The remembered match, but only if the service can still find it and it is still in play. */
export function resumableSession(): SessionPointer | null {
  try {
    const raw = localStorage.getItem(SESSION);
    if (!raw) return null;
    const p = JSON.parse(raw) as SessionPointer;
    if (!p?.matchId || !p.gameId) return null;
    const summary = service.summaryOf(p.matchId);   // throws if the record is gone
    return summary.phase === 'playing' ? p : null;
  } catch {
    return null;
  }
}
