import { useEffect, useRef } from 'react';

// Telling somebody it is their turn when they are not looking.
//
// A card game is often played in a tab behind something else. Without this the table waits
// silently and the person never comes back. The browser gives us two places to put a mark that
// survives being in the background: the tab's title and its icon. Both are restored the moment
// the tab is looked at again, so nothing is left flashing at somebody who is already here.

const BASE_TITLE = 'Decky — play & build card games';

/** Draws the badge icon once and caches the data URI. */
let badgeHref: string | null = null;
function badgeIcon(): string | null {
  if (badgeHref) return badgeHref;
  try {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 64;
    const g = c.getContext('2d');
    if (!g) return null;
    // A card-shaped tile with a dot, readable at 16px where detail is lost anyway.
    g.fillStyle = '#12172a';
    g.fillRect(8, 4, 48, 56);
    g.strokeStyle = '#f0f2ff'; g.lineWidth = 4;
    g.strokeRect(8, 4, 48, 56);
    g.fillStyle = '#ff2e88';
    g.beginPath(); g.arc(44, 18, 13, 0, Math.PI * 2); g.fill();
    badgeHref = c.toDataURL('image/png');
    return badgeHref;
  } catch { return null; }
}

function iconLink(): HTMLLinkElement {
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  return link;
}

/**
 * Marks the tab while it is hidden and `waiting` is true. Clears itself on focus, on the flag
 * going false, and on unmount — a stale "your turn" is worse than none.
 */
export function useTurnAlert(waiting: boolean): void {
  // What the icon was before we touched it, so leaving puts it back exactly.
  const original = useRef<string | null>(null);

  useEffect(() => {
    let flipped = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    const clear = () => {
      document.title = BASE_TITLE;
      const link = iconLink();
      if (original.current !== null) link.href = original.current;
      else link.removeAttribute('href');
      flipped = false;
    };

    const start = () => {
      if (timer) return;
      const badge = badgeIcon();
      const link = iconLink();
      if (original.current === null) original.current = link.getAttribute('href');
      // Alternating rather than static: a changing tab title catches the eye in a way a
      // changed one does not.
      timer = setInterval(() => {
        flipped = !flipped;
        document.title = flipped ? '● Your turn — Decky' : BASE_TITLE;
        if (badge) link.href = flipped ? badge : (original.current ?? badge);
      }, 1200);
    };

    const stop = () => {
      if (timer) { clearInterval(timer); timer = null; }
      clear();
    };

    const sync = () => {
      if (waiting && document.hidden) start();
      else stop();
    };

    sync();
    document.addEventListener('visibilitychange', sync);
    window.addEventListener('focus', stop);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('focus', stop);
      stop();
    };
  }, [waiting]);
}
