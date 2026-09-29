import { useCallback, useRef } from 'react';
import { FeltSpot, TableArrangement } from '../settings/settings';

/**
 * Dragging a seat or the pile cluster around the felt.
 *
 * Positions are stored as PER CENT of the felt's own box, never pixels: the same arrangement
 * then holds on a phone and a desktop, at any card size, in any game. A pixel offset saved on a
 * 1280px screen would put a seat off the edge of a 375px one.
 *
 * Pointer events rather than HTML5 drag-and-drop, because the latter has no touch story worth
 * having and this has to work on the device where the felt is tightest.
 */
export function useArrange(
  getFelt: () => HTMLElement | null,
  arrangement: TableArrangement | null,
  onChange: (next: TableArrangement) => void,
) {
  // Where in the dragged element the pointer went down, so it does not jump to centre on grab.
  const grab = useRef<{ dx: number; dy: number } | null>(null);

  const spotFrom = useCallback((clientX: number, clientY: number): FeltSpot | null => {
    const felt = getFelt();
    if (!felt) return null;
    const r = felt.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    const g = grab.current ?? { dx: 0, dy: 0 };
    // Clamped so nothing can be dragged off the cloth and lost. The margins are half a seat's
    // width at the sides and a little more top and bottom, which is what keeps a seat's own box
    // on the felt rather than just its anchor point.
    const x = ((clientX - g.dx - r.left) / r.width) * 100;
    const y = ((clientY - g.dy - r.top) / r.height) * 100;
    return { x: Math.min(92, Math.max(2, x)), y: Math.min(88, Math.max(1, y)) };
  }, [getFelt]);

  const startDrag = useCallback((
    e: React.PointerEvent<HTMLElement>,
    key: 'piles' | 'l' | 'tl' | 't' | 'tr' | 'r',
  ) => {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    grab.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    el.setPointerCapture(e.pointerId);

    const base: TableArrangement = arrangement
      ? { seats: { ...arrangement.seats }, piles: arrangement.piles }
      : { seats: {}, piles: null };

    const move = (ev: PointerEvent) => {
      const spot = spotFrom(ev.clientX, ev.clientY);
      if (!spot) return;
      if (key === 'piles') onChange({ ...base, piles: spot });
      else onChange({ ...base, seats: { ...base.seats, [key]: spot } });
    };
    const end = () => {
      grab.current = null;
      el.releasePointerCapture?.(e.pointerId);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', end);
      el.removeEventListener('pointercancel', end);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }, [arrangement, onChange, spotFrom]);

  /** Nudge by keyboard, so arranging is not a pointer-only feature. One per cent a press. */
  const nudge = useCallback((
    key: 'piles' | 'l' | 'tl' | 't' | 'tr' | 'r',
    dx: number,
    dy: number,
    current: FeltSpot | undefined,
  ) => {
    const from = current ?? { x: 50, y: 50 };
    const spot: FeltSpot = {
      x: Math.min(92, Math.max(2, from.x + dx)),
      y: Math.min(88, Math.max(1, from.y + dy)),
    };
    const base: TableArrangement = arrangement
      ? { seats: { ...arrangement.seats }, piles: arrangement.piles }
      : { seats: {}, piles: null };
    if (key === 'piles') onChange({ ...base, piles: spot });
    else onChange({ ...base, seats: { ...base.seats, [key]: spot } });
  }, [arrangement, onChange]);

  return { startDrag, nudge };
}
