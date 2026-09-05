import { useCallback, useEffect, useRef, useState } from 'react';

// Worklist #53, ranked the single highest-value item on the list: "Every move in the app is a
// click. Dragging a card onto the trick, onto a foundation, onto a meld is how a card game is
// played by hand, and it is the single largest gap between this and a table."
//
// This does not replace the click. Tapping a card still plays it exactly as it always has —
// drag is a second way in, not a rebuild of the first. A pointer-down starts watching; only
// once it has moved past a small threshold does it count as a drag at all, so an ordinary tap
// never renders a ghost or steals the click. Releasing far enough toward the table confirms the
// same move a click on that card would have submitted; releasing short of that snaps back, and
// nothing was played.
//
// Deliberately not the HTML5 drag-and-drop API: it has no story for touch without a polyfill,
// and the ghost it gives you is the browser's own screenshot of the element, not a card that can
// keep animating. Pointer events cover mouse, touch and pen from one code path, which is the
// same reason the flying-card layer (cardFlight.ts) is built on Web Animations rather than CSS
// classes it would have to coordinate with a native drag image.

const TAP_THRESHOLD = 8;     // px of movement before a pointer-down counts as a drag, not a tap
const CONFIRM_DISTANCE = 70; // px moved toward the table before release counts as "play it"

export interface DragGhost {
  cardId: string;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  html: string;
}

interface Tracking {
  cardId: string;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  html: string;
  dragging: boolean;
}

/**
 * Makes any card in `enabled` state draggable toward the table. `onConfirm` is called with the
 * card's id once a drag has travelled far enough upward (toward where a played card lands) to
 * count as a play; it should submit exactly the move clicking that card would have submitted.
 */
export function useCardDrag(enabled: boolean, onConfirm: (cardId: string) => void) {
  const [ghost, setGhost] = useState<DragGhost | null>(null);
  const tracking = useRef<Tracking | null>(null);
  // A fresh function every render is normal in this file (clickCard is the same), but the
  // window listeners below only need to exist once — routing through a ref keeps them from
  // tearing down and resubscribing on every board poll while still calling today's closure.
  const onConfirmRef = useRef(onConfirm);
  onConfirmRef.current = onConfirm;
  // Set the instant a drag crosses the tap threshold, cleared on the next tick — long enough to
  // suppress the synthetic click a browser still fires after a pointerup, too short to eat a
  // player's next real tap.
  const justDragged = useRef(false);

  const startDrag = useCallback((e: React.PointerEvent<HTMLElement>, cardId: string) => {
    if (!enabled || e.button !== 0 && e.pointerType === 'mouse') return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    // A copy of a button is not a button: strip the identity a live element needs but an inert
    // ghost must not duplicate, the same stripping fly() does in cardFlight.ts for the same
    // reason — two nodes claiming the same id or tab stop while one of them is mid-air.
    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.removeAttribute('data-cardkey');
    clone.removeAttribute('tabindex');
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    tracking.current = {
      cardId,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      width: rect.width,
      height: rect.height,
      html: clone.outerHTML,
      dragging: false,
    };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    function move(e: PointerEvent) {
      const t = tracking.current;
      if (!t) return;
      const dx = e.clientX - t.startX;
      const dy = e.clientY - t.startY;
      if (!t.dragging && Math.hypot(dx, dy) > TAP_THRESHOLD) t.dragging = true;
      if (!t.dragging) return;
      setGhost({
        cardId: t.cardId,
        x: e.clientX - t.offsetX,
        y: e.clientY - t.offsetY,
        offsetX: t.offsetX,
        offsetY: t.offsetY,
        width: t.width,
        height: t.height,
        html: t.html,
      });
    }
    function up(e: PointerEvent) {
      const t = tracking.current;
      tracking.current = null;
      setGhost(null);
      if (!t?.dragging) return;
      justDragged.current = true;
      setTimeout(() => { justDragged.current = false; }, 0);
      // Up, not "toward the felt in any direction": the hand sits below everything else a card
      // could be played to, so up is the one direction that always points at the table from it.
      const movedUp = t.startY - e.clientY;
      if (movedUp > CONFIRM_DISTANCE) onConfirmRef.current(t.cardId);
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [enabled]);

  /** Call at the top of a card's click handler; returns true if this click is the tail end of a
   * drag that already resolved (or snapped back) and should be ignored. */
  const wasDrag = useCallback(() => justDragged.current, []);

  return { ghost, startDrag, wasDrag };
}

// Worklist: "every move is a click or a drag — there is no way to just look at a card up close
// before committing to either one." This sits beside both without touching them: a pointer-down
// starts a plain timer, same shape as the drag tracking just above, and if nothing has moved by
// the time it fires, an enlarged copy appears over the card. Move past a small threshold, or let
// go, and it is cancelled — no different from the tap or drag it was sitting underneath, which
// still run exactly as they did before this file grew a second hook. A quick tap never lives
// long enough to start the timer at all, so nothing here can slow one down.

const PREVIEW_DELAY = 480;   // ms held still before the enlarged copy appears
const PREVIEW_CANCEL = 10;   // px of movement that cancels it, same idea as TAP_THRESHOLD above

export interface CardPreview {
  cardId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  html: string;
}

interface PreviewTracking {
  cardId: string;
  startX: number;
  startY: number;
  x: number;
  y: number;
  width: number;
  height: number;
  html: string;
  timer: ReturnType<typeof setTimeout>;
}

/** Makes any card in `enabled` state show an enlarged copy of itself after being held still for
 *  a moment — a long-press on touch, a click-and-hold with a mouse. Purely a look; it never
 *  submits anything and never reaches for `onConfirm`, which stays the drag hook's job alone. */
export function useCardPreview(enabled: boolean) {
  const [preview, setPreview] = useState<CardPreview | null>(null);
  const tracking = useRef<PreviewTracking | null>(null);

  const cancel = useCallback(() => {
    if (tracking.current) clearTimeout(tracking.current.timer);
    tracking.current = null;
    setPreview(null);
  }, []);

  const startPreview = useCallback((e: React.PointerEvent<HTMLElement>, cardId: string) => {
    if (!enabled) return;
    const el = e.currentTarget;
    const rect = el.getBoundingClientRect();
    const clone = el.cloneNode(true) as HTMLElement;
    clone.removeAttribute('id');
    clone.removeAttribute('data-cardkey');
    clone.removeAttribute('tabindex');
    clone.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    const x = rect.left, y = rect.top, width = rect.width, height = rect.height;
    const html = clone.outerHTML;
    const timer = setTimeout(() => setPreview({ cardId, x, y, width, height, html }), PREVIEW_DELAY);
    tracking.current = { cardId, startX: e.clientX, startY: e.clientY, x, y, width, height, html, timer };
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    function move(e: PointerEvent) {
      const t = tracking.current;
      if (!t) return;
      if (Math.hypot(e.clientX - t.startX, e.clientY - t.startY) > PREVIEW_CANCEL) cancel();
    }
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', cancel);
    window.addEventListener('pointercancel', cancel);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', cancel);
      window.removeEventListener('pointercancel', cancel);
    };
  }, [enabled, cancel]);

  return { preview, startPreview };
}
