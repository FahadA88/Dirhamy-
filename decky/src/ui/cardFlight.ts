import { useLayoutEffect, useRef } from 'react';

// Cards that travel.
//
// Everything on this table used to arrive rather than move: a card left your hand by ceasing to
// exist and appeared in the middle as a different element with a fade on it. That is what makes
// a card game feel like a form rather than a table — the object you were holding never went
// anywhere, it was replaced.
//
// This is the standard FLIP trick, applied to whole cards rather than to one element. Every
// place a card can live carries a `data-slot`, every card carries a `data-flight`, and after
// each render we know where every visible card is. Comparing that against the previous render
// gives three kinds of movement, and a copy of the card is thrown along each:
//
//   moved    — the card was in one slot and is now in another. Both ends are known.
//   arrived  — the card was nowhere and is now somewhere. Where it came from is either stated
//              on the card (`data-origin`, e.g. a trick card naming the seat that played it) or
//              inferred: one new card in a slot that already had cards means a draw.
//   left     — the card was somewhere and is now nowhere, because it went face down or into
//              somebody else's hand. The slot it left says where its cards go (`data-sink`).
//
// It is deliberately keyed on the SLOT and not on the pixels: a hand re-fans every time you
// play from it, and animating every card that shifted a few pixels sideways would be a
// snowstorm. A card only flies when it has actually gone somewhere.
//
// The reason it lives here rather than in the twenty places cards are drawn is that it has to
// work for a game nobody has written yet. A new family gets card flight by labelling its
// containers, not by animating anything.

/*
  Where a card was, in the only terms that survive a fan.

  A card in your hand is rotated, so its bounding box is bigger than the card and its corner is
  not on the card at all. Its centre, though, is its centre whatever angle it is at — and its
  own width and height are the printed size rather than the box the rotation needs. Position
  from one, size from the other.
*/
interface Seen {
  slot: string;
  cx: number;
  cy: number;
  w: number;
  h: number;
  /*
    The card's own markup, kept only for cards that might leave the table.

    A card that moves or arrives is still on screen at the far end, so the copy can be taken
    from the live element. A card that goes face down into a pile, or into somebody else's
    hand, is gone by the time anything wants to draw it — that one has to have been kept.
    Keeping every card's markup on every render meant holding a couple of hundred kilobytes
    of SVG for a table where nothing was ever going to depart.
  */
  html?: string;
}

const FLIGHT_MS = 420;

/** How far a card can drift within its own slot before it counts as having gone somewhere. */
const NUDGE = 6;

/** A card sent somewhere it cannot be seen shrinks into the pile rather than landing on it. */
const SINK_SCALE = 0.62;

/*
  The CSS entry animations this layer replaces.

  They have to be cancelled rather than merely ignored. Every one of them animates `translate`,
  so a card one frame into `card-thrown` measures 190px below the felt — and a flight that
  believed that would throw the card to a place it was never going to be. Cancelling them here
  keeps the measurement honest and stops the same card being animated twice.
*/
const ENTRY = new Set(['card-thrown', 'card-landed', 'card-to-hand']);

/** A card that appeared from somewhere unknowable still should not simply blink into being. */
function settle(el: HTMLElement): void {
  el.animate(
    [{ opacity: 0, transform: 'translateY(16px) scale(.94)' }, { opacity: 1, transform: 'none' }],
    { duration: 220, easing: 'cubic-bezier(.2,.85,.3,1)' },
  );
}

/** The table renders the layer; this only finds it, and copes if a caller forgot one. */
function layerFor(host: HTMLElement): HTMLElement {
  let layer = host.querySelector<HTMLElement>(':scope > .flight-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'flight-layer';
    layer.setAttribute('aria-hidden', 'true');
    host.appendChild(layer);
  }
  return layer;
}

/**
 * The middle of a named slot.
 *
 * A slot is a whole region — a seat, a pile, the middle of the felt — so a card flying to it
 * aims at its centre rather than its corner, where the cards already are.
 */
function slotCentre(root: HTMLElement, name: string): { cx: number; cy: number } | null {
  const el = root.querySelector<HTMLElement>(`[data-slot="${CSS.escape(name)}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
}

/**
 * Throw one card from where it was to where it is.
 *
 * The copy is inert — no ids, no buttons, nothing focusable — because there are briefly two of
 * everything on screen and only one of them is the card.
 */
function fly(
  layer: HTMLElement,
  from: Seen,
  to: { cx: number; cy: number },
  html: string,
  scale: number,
  fade: boolean,
  live?: HTMLElement,
): void {
  const host = layer.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'flight-card';
  ghost.innerHTML = html;
  const inner = ghost.firstElementChild as HTMLElement | null;
  if (inner) {
    // A copy of a button is not a button, and a copy of a card in a fan should not keep the
    // fan's rotation — it is in the air now.
    inner.removeAttribute('id');
    inner.removeAttribute('data-flight');
    inner.removeAttribute('data-cardkey');
    inner.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    inner.style.transform = 'none';
    inner.style.translate = 'none';
    inner.style.rotate = 'none';
    inner.style.scale = 'none';
    inner.style.animation = 'none';
    inner.style.margin = '0';
    if (inner instanceof HTMLButtonElement) inner.disabled = true;
  }
  ghost.style.left = `${from.cx - from.w / 2 - host.left}px`;
  ghost.style.top = `${from.cy - from.h / 2 - host.top}px`;
  ghost.style.width = `${from.w}px`;
  ghost.style.height = `${from.h}px`;
  // The card draws its own corners, pips and frame off these, and the layer sits outside the
  // felt, where the responsive overrides that set them do not reach.
  ghost.style.setProperty('--cw', `${from.w}px`);
  ghost.style.setProperty('--ch', `${from.h}px`);
  layer.appendChild(ghost);

  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const mid = 1 + (scale - 1) * 0.5;
  const anim = ghost.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1 },
      // A card thrown across a table lifts before it lands.
      {
        transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 22}px) scale(${mid}) rotate(-4deg)`,
        opacity: 1,
        offset: 0.55,
      },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: fade ? 0 : 1 },
    ],
    { duration: FLIGHT_MS, easing: 'cubic-bezier(.3,.75,.35,1)', fill: 'forwards' },
  );
  // The real card waits at the far end. Without this there are two of it for the length of the
  // flight — one sitting where it is going, and one on its way there.
  if (live) live.style.visibility = 'hidden';
  const done = () => {
    ghost.remove();
    if (live) live.style.visibility = '';
  };
  anim.onfinish = done;
  anim.oncancel = done;
}

/**
 * Watch the table and animate anything that moved.
 *
 * `host` is the element the copies are drawn into — the table wrapper, so a card in flight is
 * clipped by the same box the real ones are. `key` is whatever changes when the position does;
 * it only exists to make the effect run.
 */
export function useCardFlights(
  host: React.RefObject<HTMLElement | null>,
  key: unknown,
  enabled: boolean,
): void {
  const last = useRef<Map<string, Seen>>(new Map());
  const first = useRef(true);

  useLayoutEffect(() => {
    const root = host.current;
    if (!root) return;

    // Before anything is measured. See ENTRY.
    if (!first.current && enabled) {
      for (const a of root.getAnimations({ subtree: true })) {
        const name = (a as Animation & { animationName?: string }).animationName;
        if (name && ENTRY.has(name)) a.cancel();
      }
    }

    const now = new Map<string, Seen>();
    const origin = new Map<string, string>();
    const arrivals = new Map<string, string[]>();   // slot -> cards that were not there before
    const live = new Map<string, HTMLElement>();
    root.querySelectorAll<HTMLElement>('[data-flight]').forEach((el) => {
      const id = el.getAttribute('data-flight');
      if (!id) return;
      const rect = el.getBoundingClientRect();
      const w = el.offsetWidth || rect.width;
      const h = el.offsetHeight || rect.height;
      if (w === 0 || h === 0 || rect.width === 0) return;   // hidden, mid-deal
      const slotEl = el.closest<HTMLElement>('[data-slot]');
      const slot = slotEl?.getAttribute('data-slot') ?? '?';
      now.set(id, {
        slot, w, h,
        cx: rect.left + rect.width / 2,
        cy: rect.top + rect.height / 2,
        html: slotEl?.hasAttribute('data-sink') ? el.outerHTML : undefined,
      });
      live.set(id, el);
      const from = el.closest<HTMLElement>('[data-origin]')?.getAttribute('data-origin');
      if (from) origin.set(id, from);
    });

    // The first look is only a baseline: nothing has moved yet, and the deal has its own
    // animation which this must not fight.
    if (first.current || !enabled) {
      first.current = false;
      last.current = now;
      return;
    }

    const before = last.current;
    // How full each slot was a moment ago, so a hand that has just been dealt can be told apart
    // from a hand that has just drawn one card.
    const wasInSlot = new Map<string, number>();
    for (const seen of before.values()) wasInSlot.set(seen.slot, (wasInSlot.get(seen.slot) ?? 0) + 1);

    const layer = layerFor(root);

    for (const [id, cur] of now) {
      const was = before.get(id);
      if (!was) {
        const list = arrivals.get(cur.slot) ?? [];
        list.push(id);
        arrivals.set(cur.slot, list);
        continue;
      }
      if (was.slot === cur.slot) continue;
      if (Math.abs(cur.cx - was.cx) < NUDGE && Math.abs(cur.cy - was.cy) < NUDGE) continue;
      const el = live.get(id);
      if (!el) continue;
      fly(layer, was, cur, el.outerHTML, was.w > 0 ? cur.w / was.w : 1, false, el);
    }

    // Cards that were not on the table a moment ago.
    for (const [slot, ids] of arrivals) {
      for (const id of ids) {
        const cur = now.get(id)!;
        const stated = origin.get(id);
        // Without a stated origin, one new card in a slot that already had cards is a draw, and
        // a whole handful at once is a deal — which has its own animation and must be left alone.
        const guess = !stated && ids.length === 1 && (wasInSlot.get(slot) ?? 0) > 0 ? 'draw' : null;
        const name = stated ?? guess;
        const at = name && name !== slot ? slotCentre(root, name) : null;
        const el = live.get(id);
        if (!el) continue;
        if (!at || (Math.abs(at.cx - cur.cx) < NUDGE && Math.abs(at.cy - cur.cy) < NUDGE)) {
          settle(el);
          continue;
        }
        fly(layer, { ...cur, cx: at.cx, cy: at.cy }, cur, el.outerHTML, 1, false, el);
      }
    }

    // Cards that have gone somewhere they cannot be seen — face down into a pile, or into
    // somebody else's hand. The slot they left says where its cards go.
    for (const [id, was] of before) {
      if (now.has(id) || !was.html) continue;
      const slotEl = root.querySelector<HTMLElement>(`[data-slot="${CSS.escape(was.slot)}"]`);
      const sink = slotEl?.getAttribute('data-sink');
      if (!sink) continue;
      const at = slotCentre(root, sink);
      if (!at) continue;
      fly(layer, was, at, was.html, SINK_SCALE, true);
    }

    last.current = now;
  }, [key, enabled, host]);
}
