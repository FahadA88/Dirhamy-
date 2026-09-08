import { useMemo } from 'react';
import { KINDS, PublishedGame, kindOf } from '../../library/library';

/** Games bucketed by the same kind classification `KindTabs` uses, kinds with nothing in them
 *  left out — every layout that groups by "family" reads the shelf the same way. */
export interface KindGroup { id: string; label: string; mark: string; games: PublishedGame[] }

export function useKindGroups(games: PublishedGame[]): KindGroup[] {
  return useMemo(() => {
    const byId = new Map<string, PublishedGame[]>();
    for (const g of games) {
      const k = kindOf(g.definition);
      const list = byId.get(k);
      if (list) list.push(g); else byId.set(k, [g]);
    }
    return KINDS.filter((k) => k.id && (byId.get(k.id)?.length ?? 0) > 0)
      .map((k) => ({ id: k.id, label: k.label, mark: k.mark, games: byId.get(k.id) ?? [] }));
  }, [games]);
}

/** "3 days ago", coarse on purpose — a feed item doesn't need to the minute. */
export function timeAgo(ms: number): string {
  const s = Math.max(0, (Date.now() - ms) / 1000);
  const units: [number, string][] = [
    [60, 'second'], [60, 'minute'], [24, 'hour'], [30, 'day'], [12, 'month'], [Infinity, 'year'],
  ];
  let val = s;
  let name = 'second';
  for (const [size, unit] of units) {
    if (val < size) { name = unit; break; }
    val /= size;
    name = unit;
  }
  const n = Math.max(1, Math.round(val));
  return n <= 1 && name === 'second' ? 'just now' : `${n} ${name}${n === 1 ? '' : 's'} ago`;
}
