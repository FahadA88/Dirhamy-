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

// More than one game at a time.
//
// A single pointer meant starting a second game silently abandoned the first, which is the wrong
// answer for a card game: people leave a hand half-played and come back to it. This keeps a list,
// newest first, and the single-pointer functions above it still work — they operate on the head
// of the list, so nothing that already used them had to change.
const OPEN = 'decky.opengames.v1';
const MAX_OPEN = 12;

function readOpen(): SessionPointer[] {
  try { return JSON.parse(localStorage.getItem(OPEN) || '[]') as SessionPointer[]; } catch { return []; }
}

function writeOpen(ps: SessionPointer[]): void {
  try { localStorage.setItem(OPEN, JSON.stringify(ps.slice(0, MAX_OPEN))); } catch { /* quota */ }
}

export function rememberSession(matchId: string, gameId: string, seats: number): void {
  const p: SessionPointer = { matchId, gameId, seats, savedAt: Date.now() };
  try { localStorage.setItem(SESSION, JSON.stringify(p)); } catch { /* ignore */ }
  // Move it to the front rather than adding a duplicate.
  writeOpen([p, ...readOpen().filter((x) => x.matchId !== matchId)]);
}

export function forgetSession(matchId?: string): void {
  try { localStorage.removeItem(SESSION); } catch { /* ignore */ }
  if (matchId) writeOpen(readOpen().filter((p) => p.matchId !== matchId));
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

export interface OpenGame extends SessionPointer {
  /** True when this table is waiting on a seat this device plays. */
  yourTurn: boolean;
}

/**
 * Every game still in play, newest first, each marked with whether it is waiting on you.
 * Entries the service can no longer find are dropped as they are read, so a cleared store or an
 * ended match never leaves a dead row on the screen.
 */
export function openGames(): OpenGame[] {
  const kept: SessionPointer[] = [];
  const out: OpenGame[] = [];
  for (const p of readOpen()) {
    try {
      const summary = service.summaryOf(p.matchId);
      if (summary.phase !== 'playing') continue;
      kept.push(p);
      out.push({ ...p, yourTurn: summary.waitingOn.includes('P1') });
    } catch { /* the record is gone; drop it */ }
  }
  if (kept.length !== readOpen().length) writeOpen(kept);
  return out;
}
