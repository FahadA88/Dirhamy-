/*
  Two more single-listener effects, in the same shape as cardSheen.ts: one document-level
  pointermove, coalesced to one write per frame, writing custom properties rather than
  triggering React at all. Neither of these needs to be a hook per element for the same
  reason the sheen does not — a table has a handful of buttons and one felt, but the pattern
  that scales is worth reusing anyway.
*/

/**
 * A button drifts a few pixels toward the pointer as it nears, and eases back once the
 * pointer moves on. `translate` is used rather than `transform` on purpose: the machined
 * controls already animate `transform` on hover and on press (the lip lifting, the press-down
 * squash), and the two properties compose independently — a magnetic nudge layered underneath
 * never fights the button's own motion.
 */
export function startMagneticButtons(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};

  const SEL = 'button.primary, button.ghost';
  const REACH = 46;   // px beyond the button's own edge that still pulls it
  const PULL = 0.24;
  const MAX = 7;       // never drifts far enough to misalign a click

  let pending: PointerEvent | null = null;
  let frame = 0;
  let last: HTMLElement | null = null;

  const release = (el: HTMLElement | null) => {
    el?.style.removeProperty('--mgx');
    el?.style.removeProperty('--mgy');
  };

  const paint = () => {
    frame = 0;
    const e = pending;
    pending = null;
    if (!e) return;

    const candidates = document.querySelectorAll<HTMLButtonElement>(SEL);
    let bestEl: HTMLButtonElement | null = null;
    let bestD = REACH;
    let bestDx = 0;
    let bestDy = 0;
    // A plain loop rather than `.forEach` — a callback capturing and reassigning an outer
    // variable defeats TypeScript's narrowing of that variable afterward.
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el.disabled) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      // Distance to the nearest edge, not the centre — a wide button should not reach out
      // from its own middle as far as a narrow one does.
      const ex = Math.max(0, Math.abs(dx) - r.width / 2);
      const ey = Math.max(0, Math.abs(dy) - r.height / 2);
      const d = Math.hypot(ex, ey);
      if (d < bestD) { bestEl = el; bestD = d; bestDx = dx; bestDy = dy; }
    }

    if (bestEl !== last) release(last);
    last = bestEl;
    if (!bestEl) return;

    const pull = 1 - bestD / REACH;
    const mx = Math.max(-MAX, Math.min(MAX, bestDx * PULL * pull));
    const my = Math.max(-MAX, Math.min(MAX, bestDy * PULL * pull));
    bestEl.style.setProperty('--mgx', `${mx.toFixed(1)}px`);
    bestEl.style.setProperty('--mgy', `${my.toFixed(1)}px`);
  };

  const onMove = (e: PointerEvent) => {
    pending = e;
    if (!frame) frame = requestAnimationFrame(paint);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  return () => {
    window.removeEventListener('pointermove', onMove);
    if (frame) cancelAnimationFrame(frame);
    release(last);
  };
}

/**
 * The felt's own markings — the arcs, rings and rails drawn in TableDressing — drift a few
 * pixels opposite the pointer, the way a background layer sitting behind glass would. Kept to
 * `.table`, which there is only ever one of on screen at a time, so this never touches
 * anything outside a game in progress.
 */
export function startTableParallax(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};

  const REACH = 6; // px of drift at full deflection

  let pending: PointerEvent | null = null;
  let frame = 0;

  const paint = () => {
    frame = 0;
    const e = pending;
    pending = null;
    if (!e) return;
    document.querySelectorAll<HTMLElement>('.table').forEach((el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const nx = Math.max(-1, Math.min(1, ((e.clientX - r.left) / r.width - 0.5) * 2));
      const ny = Math.max(-1, Math.min(1, ((e.clientY - r.top) / r.height - 0.5) * 2));
      el.style.setProperty('--px', `${(-nx * REACH).toFixed(1)}px`);
      el.style.setProperty('--py', `${(-ny * REACH).toFixed(1)}px`);
    });
  };

  const onMove = (e: PointerEvent) => {
    pending = e;
    if (!frame) frame = requestAnimationFrame(paint);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  return () => {
    window.removeEventListener('pointermove', onMove);
    if (frame) cancelAnimationFrame(frame);
  };
}

/**
 * A near-invisible spotlight that follows the pointer across the felt — the stylesheet gates it
 * to `(hover: hover) and (pointer: fine)` so a touch table never pays for it, and this only has
 * to write the two coordinates a frame actually changed.
 */
export function startFeltSpotlight(): () => void {
  if (typeof window === 'undefined') return () => {};
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return () => {};

  let pending: PointerEvent | null = null;
  let frame = 0;
  let lit: HTMLElement | null = null;

  const paint = () => {
    frame = 0;
    const e = pending;
    pending = null;
    if (!e) return;
    const felt = document.querySelector<HTMLElement>('.felt');
    if (!felt) return;
    const r = felt.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) {
      lit?.classList.remove('spotlit');
      lit = null;
      return;
    }
    felt.style.setProperty('--sx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    felt.style.setProperty('--sy', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
    if (lit !== felt) { lit?.classList.remove('spotlit'); felt.classList.add('spotlit'); lit = felt; }
  };

  const onMove = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    pending = e;
    if (!frame) frame = requestAnimationFrame(paint);
  };

  window.addEventListener('pointermove', onMove, { passive: true });
  return () => {
    window.removeEventListener('pointermove', onMove);
    if (frame) cancelAnimationFrame(frame);
    lit?.classList.remove('spotlit');
  };
}

/**
 * A ripple born where a primary or ghost button was actually pressed. One short-lived `<span>`
 * per press, sized to the button it landed on and removed once its animation ends — nothing
 * kept around between presses.
 */
export function startTapRipple(): () => void {
  if (typeof window === 'undefined') return () => {};

  const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    || document.documentElement.getAttribute('data-motion') === 'reduced';

  const onDown = (e: PointerEvent) => {
    if (reduced()) return;
    const target = (e.target as HTMLElement)?.closest<HTMLButtonElement>('button.primary, button.ghost');
    if (!target || target.disabled) return;
    const r = target.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 1.6;
    const span = document.createElement('span');
    span.className = 'tap-ripple';
    span.style.setProperty('--rx', `${e.clientX - r.left}px`);
    span.style.setProperty('--ry', `${e.clientY - r.top}px`);
    span.style.setProperty('--rr', `${size}px`);
    target.appendChild(span);
    span.addEventListener('animationend', () => span.remove(), { once: true });
  };

  window.addEventListener('pointerdown', onDown);
  return () => window.removeEventListener('pointerdown', onDown);
}
