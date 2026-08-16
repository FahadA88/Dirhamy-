import { MatchState } from './types';
import { getGame } from '../games/catalog';

// A match lives in component state, so a refresh used to throw the game away. This snapshots it
// to localStorage and restores it on load. The definition is stored by id and re-linked on the
// way back in — definitions contain functions-free data but are large, and re-linking also means
// a game that has since changed loads its current rules rather than a stale copy.

const KEY = 'decky.game.v1';

interface Saved {
  gameId: string;
  state: Omit<MatchState, 'definition'> & { definition?: undefined };
  savedAt: number;
}

export function saveMatch(gameId: string, state: MatchState): void {
  try {
    const { definition, ...rest } = state;
    void definition;
    const payload: Saved = { gameId, state: rest as Saved['state'], savedAt: Date.now() };
    localStorage.setItem(KEY, JSON.stringify(payload));
  } catch { /* quota or private mode — losing a save is not worth breaking play over */ }
}

export function clearMatch(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

// Returns the restored match plus the game it belongs to, or null if there's nothing usable.
export function loadMatch(): { gameId: string; state: MatchState; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as Saved;
    const def = getGame(payload.gameId);
    if (!def || !payload.state?.players?.length) return null;
    const state = { ...payload.state, definition: def } as MatchState;
    // A save from an older build may be missing fields added since; bail rather than half-load.
    if (!state.zones || typeof state.turnIndex !== 'number') return null;
    return { gameId: payload.gameId, state, savedAt: payload.savedAt };
  } catch {
    return null;
  }
}
