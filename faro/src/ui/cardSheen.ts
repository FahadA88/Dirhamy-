/*
  The specular highlight on a card follows the pointer across it.

  This is deliberately not a React hook on every card. A table can have sixty cards on it and a
  hook per card means sixty listeners and a re-render on every mouse move, which is a lot of work
  to move a gradient. One listener on the document, walking up to the nearest card and writing
  two custom properties on it, costs the same whether there is one card or a hundred — and
  writing a custom property does not invalidate React's tree at all, so nothing re-renders.

  The CSS falls back to a fixed highlight near the top-left (where the room's key light is) when
  these are not set, so a card is lit whether this is running or not — on a touch screen, under
  reduced motion, or before the first mouse move.
*/

const SEL = '.card-btn, .sol-card, .card.face';

export function startCardSheen(): () => void {
  if (typeof window === 'undefined') return () => {};
  // A highlight chasing the finger is exactly the kind of movement people who ask for less of it
  // are asking for less of.
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};

  let pending: PointerEvent | null = null;
  let frame = 0;
  let last: HTMLElement | null = null;

  const paint = () => {
    frame = 0;
    const e = pending;
    pending = null;
    if (!e) return;

    const el = (e.target as Element | null)?.closest?.(SEL) as HTMLElement | null;
    if (el !== last) {
      // Put the old card back to its resting highlight rather than leaving it frozen wherever
      // the pointer happened to leave it.
      last?.style.removeProperty('--mx');
      last?.style.removeProperty('--my');
      last = el;
    }
    if (!el) return;

    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  const onMove = (e: PointerEvent) => {
    // Coalesced to one write per frame: pointermove fires far faster than the screen refreshes,
    // and every extra write is a style recalc nobody sees.
    pending = e;
    if (!frame) frame = requestAnimationFrame(paint);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  return () => {
    window.removeEventListener('pointermove', onMove);
    if (frame) cancelAnimationFrame(frame);
    last?.style.removeProperty('--mx');
    last?.style.removeProperty('--my');
  };
}
