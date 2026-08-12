import { useMemo } from 'react';

// Ambient 3D scene behind the whole app: drifting, rotating holographic cards plus a couple
// of glowing orbs. Purely decorative, fixed, non-interactive, GPU-driven CSS transforms.
const SUITS = ['♠', '♥', '♦', '♣', '★', '♠', '♥', '♦'];

export function Backdrop() {
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

  return (
    <div className="backdrop" aria-hidden>
      <div className="orb orb-a" />
      <div className="orb orb-b" />
      <div className="grid3d" />
      {cards.map((c, i) => (
        <div
          key={i}
          className={`floaty ${c.hue}`}
          style={{
            left: c.left, top: c.top,
            animationDelay: c.delay, animationDuration: c.dur,
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
