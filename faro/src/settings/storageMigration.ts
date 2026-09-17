// The site was called Decky; it is called Faro now. Every key this app has ever written to
// localStorage was namespaced with that old name — settings, drafts, the library, match
// records, saved seat plans, the safety lists. Renaming the constants alone would have been a
// silent wipe: a returning player would open Faro and find an empty profile, no saved games
// and every preference back at its default, with the old data still sitting in their browser
// under keys nothing reads any more.
//
// So the keys move with the name. This runs once, before anything reads storage, and re-keys
// whatever is there. It never overwrites a key Faro has already written — if both exist, the
// new one is the live one and the old one is stale — and it leaves the originals in place
// rather than deleting them, so a player who opens an older build of the site (a cached PWA,
// an offline copy of the single-file artifact) still finds their data where that build looks
// for it. Two copies of a few kilobytes is a cheap price for not losing somebody's profile.

const OLD = 'decky';
const NEW = 'faro';

/** Re-key anything written under the old name. Safe to call more than once. */
export function migrateLegacyStorage(): void {
  let store: Storage;
  try {
    store = window.localStorage;
    // Private mode and blocked site data both throw here rather than on the read below.
    store.getItem(`${NEW}.__probe`);
  } catch {
    return;
  }

  let keys: string[];
  try {
    keys = Object.keys(store);
  } catch {
    return;
  }

  for (const key of keys) {
    // Both separators were used: dotted namespaces for stored state, hyphens for the service
    // worker's cache version and a couple of one-off markers.
    if (!key.startsWith(`${OLD}.`) && !key.startsWith(`${OLD}-`) && !key.startsWith(`${OLD}:`)) continue;
    const moved = NEW + key.slice(OLD.length);
    try {
      if (store.getItem(moved) !== null) continue;
      const value = store.getItem(key);
      if (value !== null) store.setItem(moved, value);
    } catch {
      // A quota failure on one key should not stop the rest of somebody's data moving across.
    }
  }
}
