import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../settings/SettingsContext';

// A score that changes should tick, not blink. Interpolates from the last value it drew to
// the new one over a short window — the interpolation itself never touches the engine, it is
// purely what this component paints between one render and the next.
export function CountUp({ value }: { value: number }) {
  const { settings } = useSettings();
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  const frame = useRef(0);

  useEffect(() => {
    if (settings.motion === 'reduced' || value === from.current) {
      from.current = value;
      setShown(value);
      return;
    }
    const start = from.current;
    const delta = value - start;
    const t0 = performance.now();
    const DUR = 480;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / DUR);
      // ease-out cubic: quick to start, settling in — a number landing, not sliding.
      const eased = 1 - (1 - p) ** 3;
      setShown(Math.round(start + delta * eased));
      if (p < 1) frame.current = requestAnimationFrame(tick);
      else from.current = value;
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, settings.motion]);

  return <>{shown}</>;
}
