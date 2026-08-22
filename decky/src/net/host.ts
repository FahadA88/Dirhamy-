// Where the table host is, and whether there is one at all.
//
// The app is happy to run with no host — everything except playing with other people works
// entirely in the browser. So this never throws and never blocks: it asks once, caches the
// answer, and the online parts of the interface simply do not appear when the answer is no.

export interface HostInfo {
  /** The base URL for REST calls. Same origin unless pointed elsewhere at build time. */
  base: string;
  /** The socket URL, derived from the base so one setting configures both. */
  ws: string;
  /** Whether a host actually answered. */
  up: boolean;
  /** Whether that host can write games, so the Create view can say so honestly. */
  canAuthor: boolean;
  /** Which provider is behind the writer, and which models it will actually run. */
  authorProvider: string;
  authorModels: { id: string; name: string; blurb: string }[];
}

function baseUrl(): string {
  const pinned = (import.meta as { env?: Record<string, string> }).env?.VITE_HOST_URL;
  if (pinned) return pinned.replace(/\/$/, '');
  if (typeof window === 'undefined') return '';
  return window.location.origin;
}

function socketUrl(base: string): string {
  return base.replace(/^http/, 'ws');
}

let cached: Promise<HostInfo> | null = null;

/**
 * Ask the host whether it is there. Cached for the life of the page: a host that was down when
 * the tab opened is not going to be found by asking again on every render, and the online
 * buttons should not flicker.
 */
export function hostInfo(): Promise<HostInfo> {
  if (cached) return cached;
  const base = baseUrl();
  const fallback: HostInfo = { base, ws: socketUrl(base), up: false, canAuthor: false, authorProvider: '', authorModels: [] };
  cached = (async () => {
    if (!base) return fallback;
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2500);
      const res = await fetch(`${base}/health`, { signal: controller.signal });
      clearTimeout(timer);
      if (!res.ok) return fallback;
      const body = await res.json() as {
        ok?: boolean; canAuthor?: boolean;
        author?: { provider?: string; models?: { id: string; name: string; blurb: string }[] };
      };
      return {
        base, ws: socketUrl(base), up: !!body.ok, canAuthor: !!body.canAuthor,
        authorProvider: body.author?.provider ?? '',
        authorModels: body.author?.models ?? [],
      };
    } catch {
      // No host, a static deployment, or an offline tab. All the same answer.
      return fallback;
    }
  })();
  return cached;
}

/** Forget the cached answer — used after a deliberate retry. */
export function forgetHost(): void { cached = null; }
