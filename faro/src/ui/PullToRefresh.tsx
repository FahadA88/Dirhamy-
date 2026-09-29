import { useEffect, useRef, useState } from 'react';

// Worklist: "pull-to-refresh bounce — needs a new gesture state machine that risks colliding
// with the existing drag/click logic." It only risks that where a plain downward drag already
// means something else — panning the Infinite Canvas, dragging a card. Nothing on the front page
// grid, Newsprint Ledger or Kanban board claims a downward drag for anything, so this wraps only
// those, watching touch events no other handler on this page reads.
//
// Native touch events rather than pointer events on purpose: the thing this has to suppress —
// the browser's own overscroll bounce — is driven by touch, and only a non-passive touchmove
// listener's preventDefault() actually stops it. It only ever engages when the page is already
// scrolled to the very top and the drag is downward; anywhere else, this gets out of the way and
// an ordinary scroll happens exactly as it always has.

const THRESHOLD = 62;   // px pulled before letting go triggers a refresh
const MAX_PULL = 96;    // px the indicator ever travels, however far the finger has actually gone
const RESISTANCE = 0.5; // an elastic pull is heavier the further it stretches, not 1:1

function atTop(): boolean {
  return (document.scrollingElement?.scrollTop ?? window.scrollY) <= 0;
}

export function PullToRefresh({ onRefresh, children }: { onRefresh: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const live = useRef(false);
  const refreshingRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function onTouchStart(e: TouchEvent) {
      if (refreshingRef.current || e.touches.length !== 1 || !atTop()) return;
      startY.current = e.touches[0].clientY;
      live.current = true;
      setDragging(true);
    }
    function onTouchMove(e: TouchEvent) {
      if (!live.current || startY.current == null) return;
      const dy = e.touches[0].clientY - startY.current;
      if (dy <= 0 || !atTop()) { live.current = false; setDragging(false); setPull(0); return; }
      // Only once this is genuinely a pull, not the first pixel of an ordinary scroll, does it
      // start eating the gesture — an ordinary scroll starting at the top is still untouched.
      e.preventDefault();
      setPull(Math.min(MAX_PULL, dy * RESISTANCE));
    }
    function onTouchEnd() {
      if (!live.current) return;
      live.current = false;
      startY.current = null;
      setDragging(false);
      setPull((p) => {
        if (p >= THRESHOLD) {
          refreshingRef.current = true;
          setRefreshing(true);
          onRefresh();
          // A refresh here is a synchronous re-read of the local library, not a round trip — the
          // spinner holds for a beat regardless, so "pull to refresh" reads as having done
          // something rather than blinking shut before the gesture finished.
          setTimeout(() => { refreshingRef.current = false; setRefreshing(false); }, 480);
        }
        return 0;
      });
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [onRefresh]);

  const armed = pull >= THRESHOLD;

  return (
    <div className="ptr-wrap" ref={ref}>
      <div className="ptr-indicator" style={{ height: refreshing ? 46 : pull, opacity: pull > 4 || refreshing ? 1 : 0 }}>
        <span className={`ptr-mark ${refreshing ? 'spin' : ''} ${armed ? 'armed' : ''}`}
          style={!refreshing ? { transform: `rotate(${Math.min(1, pull / THRESHOLD) * 200}deg)` } : undefined}
          aria-hidden="true">♣</span>
      </div>
      <div className="ptr-content" style={{ transform: pull ? `translateY(${pull}px)` : undefined, transition: dragging ? 'none' : undefined }}>
        {children}
      </div>
      {/* Announced once, when it actually happens — not on every pixel of the pull itself. */}
      <span className="sr-only" role="status">{refreshing ? 'Refreshing' : ''}</span>
    </div>
  );
}
