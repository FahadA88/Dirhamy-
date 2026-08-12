import { useRef, useCallback } from 'react';

// Mouse-driven 3D tilt. Attach the returned handlers to an element with `transform-style:
// preserve-3d`; it rotates toward the cursor and springs back on leave. Pure DOM, no deps.
export function useTilt(max = 12) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = useCallback((e: React.MouseEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(700px) rotateY(${px * max}deg) rotateX(${-py * max}deg) translateZ(8px)`;
  }, [max]);

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (el) el.style.transform = 'perspective(700px) rotateY(0) rotateX(0) translateZ(0)';
  }, []);

  return { ref, onMouseMove: onMove, onMouseLeave: onLeave };
}
