import { MatchStore, MatchRecord } from './matchService';
import { MatchState } from '../engine/types';

// Where a match lives between page loads.
//
// This is deliberately a MatchStore and not a "save my game" helper on the client. In a hosted
// deployment the match record sits in Postgres and the browser holds nothing but a match id;
// running locally, the browser is the host, so the record sits in localStorage and the browser
// still holds nothing but a match id. Same shape, same boundary — only the backing store moves.
//
// Two things are deliberately not written out:
//   • undo history, which is large and rebuildable by simply not offering undo across a reload;
//   • state.definition, which is the same object as record.definition, so it is re-linked on
//     read rather than stored twice.
//
// The pinned definition IS written. That is the point of pinning: a match resumed tomorrow plays
// by the rules it was dealt under, even if the author has edited the game since.

const PREFIX = 'decky.match.';
const KEEP = 4;   // how many matches to retain before evicting the oldest

type Stored = Omit<MatchRecord, 'state' | 'history'> & {
  state: Omit<MatchState, 'definition'> & { definition?: undefined };
};

export class LocalMatchStore implements MatchStore {
  private mem = new Map<string, MatchRecord>();

  get(id: string): MatchRecord | undefined {
    const live = this.mem.get(id);
    if (live) return live;
    const rec = this.read(id);
    if (rec) this.mem.set(id, rec);
    return rec;
  }

  set(id: string, rec: MatchRecord): void {
    this.mem.set(id, rec);
    this.write(id, rec);
  }

  delete(id: string): void {
    this.mem.delete(id);
    try { localStorage.removeItem(PREFIX + id); } catch { /* nothing to lose */ }
  }

  // ----- localStorage plumbing -----

  private read(id: string): MatchRecord | undefined {
    try {
      const raw = localStorage.getItem(PREFIX + id);
      if (!raw) return undefined;
      const s = JSON.parse(raw) as Stored;
      if (!s?.definition || !s.state?.players?.length || typeof s.state.turnIndex !== 'number') {
        return undefined;   // a save from an older build; bail rather than half-load
      }
      return {
        ...s,
        state: { ...s.state, definition: s.definition } as MatchState,
        history: [],
      };
    } catch {
      return undefined;
    }
  }

  private write(id: string, rec: MatchRecord): void {
    try {
      const { state: whole, history, ...rest } = rec;
      void history;
      const { definition, ...stateWithoutDefinition } = whole;
      void definition;
      const payload: Stored = { ...rest, state: stateWithoutDefinition as Stored['state'] };
      localStorage.setItem(PREFIX + id, JSON.stringify(payload));
      this.evict(id);
    } catch {
      // Quota, private mode, or no localStorage at all (the service also runs under Node in the
      // test suite). Losing the ability to resume is not worth breaking the game over.
    }
  }

  /** Keep the store from growing without bound; drop the oldest matches first. */
  private evict(keepId: string): void {
    try {
      const keys: { key: string; at: number }[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (!k || !k.startsWith(PREFIX)) continue;
        let at = 0;
        try { at = (JSON.parse(localStorage.getItem(k) || '{}') as Stored).createdAt ?? 0; } catch { /* treat as oldest */ }
        keys.push({ key: k, at });
      }
      if (keys.length <= KEEP) return;
      keys.sort((a, b) => a.at - b.at);
      for (const { key } of keys.slice(0, keys.length - KEEP)) {
        if (key !== PREFIX + keepId) localStorage.removeItem(key);
      }
    } catch { /* ignore */ }
  }
}
