// Where you are, in the address bar.
//
// Before this the whole site lived at one URL. Every game, every screen, one entry in history —
// so a game could not be linked to, the back button left the site instead of going back a
// screen, and a refresh dropped you at the front page.
//
// Query parameters rather than paths (/?g=hearts, not /g/hearts): this is a static bundle with
// no server in front of it, and a real path would 404 on refresh anywhere that does not rewrite
// unknown paths to index.html. The online table already addresses itself with ?table=CODE, so
// this follows a convention the app had rather than inventing a second one.

/** The app's own names for its three tabs, so no caller has to translate. */
export type RouteView = 'play' | 'create' | 'profile';

export interface Route {
  view: RouteView;
  /** The game whose detail page is open, if any. */
  game?: string;
}

// The profile tab is labelled "You" everywhere a person sees it, so that is what its share
// links say. The internal name stays 'profile' to match the view it selects.
const PARAM: Record<RouteView, string> = { play: 'play', create: 'create', profile: 'you' };
const FROM_PARAM: Record<string, RouteView> = { play: 'play', create: 'create', you: 'profile' };

export function readRoute(): Route {
  const q = new URLSearchParams(window.location.search);
  const view = FROM_PARAM[q.get('v') ?? ''] ?? 'play';
  const game = q.get('g') || undefined;
  return { view, game };
}

function toSearch(r: Route): string {
  // Everything else already on the query string stays — ?table= and ?lab= are both read
  // elsewhere, and a share link that silently dropped one would be worse than no routing.
  const q = new URLSearchParams(window.location.search);
  if (r.view === 'play') q.delete('v'); else q.set('v', PARAM[r.view]);
  if (r.game) q.set('g', r.game); else q.delete('g');
  const s = q.toString();
  return s ? `?${s}` : window.location.pathname;
}

/** Adds a history entry, so back returns to where you were. No entry if nothing moved. */
export function pushRoute(r: Route): void {
  const now = readRoute();
  if (now.view === r.view && now.game === r.game) return;
  window.history.pushState(null, '', toSearch(r));
}

/** Rewrites the current entry. For corrections that should not cost a press of back. */
export function replaceRoute(r: Route): void {
  window.history.replaceState(null, '', toSearch(r));
}

export function onRouteChange(fn: (r: Route) => void): () => void {
  const h = () => fn(readRoute());
  window.addEventListener('popstate', h);
  return () => window.removeEventListener('popstate', h);
}
