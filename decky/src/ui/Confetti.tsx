import { useMemo } from 'react';
import { useSettings } from '../settings/SettingsContext';

// Winning should feel like winning.
//
// Forty-odd scraps of card thrown up and allowed to fall, each one turning on its own axis at
// its own speed. Plain divs and CSS transforms — no canvas, no library, no per-frame work in
// JavaScript. It never takes a pointer event and it disappears on its own, so it cannot get in
// the way of the button underneath it.

const COLOURS = ['#ff2e88', '#1fe3ff', '#ffc531', '#9b5cff', '#4dffa0', '#ffffff'];

export function Confetti({ pieces = 46, spread = 'burst' }: {
  pieces?: number;
  /** `burst` throws from the middle; `rain` falls from above the whole width. */
  spread?: 'burst' | 'rain';
}) {
  const { settings } = useSettings();
  const bits = useMemo(
    () => Array.from({ length: pieces }, (_, i) => {
      // Deterministic per index: the same celebration twice looks composed, not random.
      const a = (i * 2.39996) % (Math.PI * 2);        // golden angle, so nothing clumps
      const r = 30 + ((i * 37) % 60);
      return {
        x: spread === 'burst' ? 50 + Math.cos(a) * r * 0.9 : ((i * 17) % 100),
        delay: (i % 12) * 55 + ((i * 13) % 90),
        drift: (((i * 29) % 60) - 30),
        spin: 420 + ((i * 71) % 720),
        dur: 2100 + ((i * 97) % 1400),
        size: 7 + ((i * 5) % 7),
        colour: COLOURS[i % COLOURS.length],
        flat: i % 3 === 0,
      };
    }),
    [pieces, spread],
  );

  if (settings.motion === 'reduced') return null;

  return (
    <div className="confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <span
          key={i}
          className={`cf ${b.flat ? 'flat' : ''}`}
          style={{
            left: `${b.x}%`,
            width: `${b.size}px`,
            height: `${Math.round(b.size * 1.5)}px`,
            background: b.colour,
            boxShadow: `0 0 10px ${b.colour}`,
            animationDelay: `${b.delay}ms`,
            animationDuration: `${b.dur}ms`,
            ['--drift' as string]: `${b.drift}vw`,
            ['--spin' as string]: `${b.spin}deg`,
          }}
        />
      ))}
    </div>
  );
}
