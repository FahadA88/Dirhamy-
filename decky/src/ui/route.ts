// Where you are, in the address bar.
//
// Before this the whole site lived at one URL. Every game, every screen, one entry in history —
// so a game could not be linked to, the back button left the site instead of going back a
// screen, and a refresh dropped you at the front page.
//
// Query parameters rather than paths (/?g=hearts, not /g/hearts) for in-app navigation: this is
// a static bundle with no server in front of it, and a real path would 404 on refresh anywhere
// that does not rewrite unknown paths to index.html. The online table already addresses itself
// with ?table=CODE, so this follows a convention the app had rather than inventing a second one.
//
// /g/<id>/ is the one exception, and it is not really an exception — those are real files on
// disk (see scripts/prerender.mjs), so they need no rewrite rule to survive a refresh or a
// crawler. readRoute() recognises the path so a cold load of one opens the right game; the app
// then rewrites the address bar back to /?g=<id> on boot (see normalizeEntry below), so every
// subsequent click, pushRoute and popstate only ever has one address shape to reason about.

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

const PATH_GAME = /^\/g\/([^/]+)\/?$/;

export function readRoute(): Route {
  const q = new URLSearchParams(window.location.search);
  const pathGame = window.location.pathname.match(PATH_GAME)?.[1];
  const view = FROM_PARAM[q.get('v') ?? ''] ?? 'play';
  const game = q.get('g') || (pathGame && decodeURIComponent(pathGame)) || undefined;
  return { view, game };
}

function toSearch(r: Route): string {
  // Everything else already on the query string stays — ?table= and ?lab= are both read
  // elsewhere, and a share link that silently dropped one would be worse than no routing.
  // Always root-relative (leading /), never the current pathname: a prerendered /g/<id>/ page
  // pushing a plain "?g=..." would resolve against its own path and read back /g/<id>/?g=other
  // on the next click. The whole site lives at one path, so every address is built from it.
  const q = new URLSearchParams(window.location.search);
  if (r.view === 'play') q.delete('v'); else q.set('v', PARAM[r.view]);
  if (r.game) q.set('g', r.game); else q.delete('g');
  const s = q.toString();
  return s ? `/?${s}` : '/';
}

/** Called once at boot. Rewrites a /g/<id>/ entry to its equivalent /?g=<id>, so every address
 *  after the first paint has the one shape the rest of this module assumes. A no-op from a
 *  normal load, which is already at '/'. */
export function normalizeEntry(): void {
  if (window.location.pathname !== '/') replaceRoute(readRoute());
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
