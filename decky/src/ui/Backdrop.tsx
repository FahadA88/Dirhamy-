import { useMemo } from 'react';
import { useSettings } from '../settings/SettingsContext';

// Ambient 3D scene behind the app: drifting holographic cards, glowing orbs, a perspective
// grid floor. Every layer is individually toggleable in Settings; the whole thing is off when
// ambient3d is disabled.
const SUITS = ['♠', '♥', '♦', '♣', '★', '♠', '♥', '♦'];

export function Backdrop() {
  const { settings } = useSettings();
  const cards = useMemo(
    () =>
      SUITS.map((s, i) => ({
        s,
        left: `${(i * 12.5 + 4) % 96}%`,
        top: `${(i * 27 + 10) % 88}%`,
        delay: `${-i * 2.3}s`,
        dur: `${16 + (i % 5) * 4}s`,
        scale: 0.6 + (i % 4) * 0.18,
        hue: i % 2 === 0 ? 'cyan' : 'violet',
      })),
    [],
  );

  if (!settings.ambient3d) return null;

  return (
    <div className="backdrop" aria-hidden>
      {settings.orbs && <><div className="orb orb-a" /><div className="orb orb-b" /></>}
      {settings.grid && <div className="grid3d" />}
      {settings.floaties && cards.map((c, i) => (
        <div
          key={i}
          className={`floaty ${c.hue}`}
          style={{
            left: c.left, top: c.top, animationDelay: c.delay, animationDuration: c.dur,
            // @ts-expect-error custom prop
            '--sc': c.scale,
          }}
        >
          <div className="floaty-inner">{c.s}</div>
        </div>
      ))}
    </div>
  );
}
