import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useSettings } from '../settings/SettingsContext';

// The dealer's hands.
//
// Two beats, in the order a person does them: the deck is riffled — split in two, bridged
// together, squared up — and then it goes round the table a card at a time. Nothing here knows
// or cares what was actually dealt; the real cards are already in the view by the time this
// plays. It is the gesture, not the transaction, so it never blocks a click and never lies
// about a hand: every card in it is face-down.
//
// All of it is CSS transforms on plain divs. No canvas, no assets, no library.

// Long enough to read as a deal, short enough to sit through every hand of a match to a
// hundred. Anyone who would rather not see it at all sets motion to reduced.
const SHUFFLE_MS = 620;
const ROUNDS = 3;            // cards flicked to each seat
const STEP_MS = 42;          // gap between one card leaving and the next
const FLIGHT_MS = 400;

/**
 * Where to throw the cards, in pixels from the middle of the felt.
 *
 * The seats are measured off the page rather than guessed from a seat count: a four-hander and
 * a six-hander lay their opponents out differently, patience has seven columns and no seats at
 * all, and a narrow window stacks everything. Aiming at whatever is actually on screen is the
 * only version that is right in all of those.
 */
function measure(root: HTMLElement, aim: string[]): { x: number; y: number }[] {
  const box = root.getBoundingClientRect();
  const cx = box.left + box.width / 2;
  const cy = box.top + box.height / 2;
  const felt = root.parentElement ?? root;
  const out: { x: number; y: number }[] = [];
  for (const sel of aim) {
    felt.querySelectorAll<HTMLElement>(sel).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return;
      out.push({ x: r.left + r.width / 2 - cx, y: r.top + r.height / 2 - cy });
    });
  }
  return out;
}

export function DealMotion({ seats, aim, round, onStart, onDone }: {
  /** How many seats to flick cards to, if none of `aim` resolves. */
  seats: number;
  /** Selectors, inside the felt, for the places a card is dealt to. */
  aim: string[];
  /** Changing this replays the motion — pass the hand number, or the match id and hand. */
  round: string;
  /** Fires as the riffle begins, so the table can hold its cards back until they land. */
  onStart?: () => void;
  onDone?: () => void;
}) {
  const { settings } = useSettings();
  const reduced = settings.motion === 'reduced';
  const [phase, setPhase] = useState<'shuffle' | 'deal' | 'done'>('shuffle');

  useEffect(() => {
    if (reduced) { setPhase('done'); onDone?.(); return; }
    setPhase('shuffle');
    onStart?.();
    const a = window.setTimeout(() => setPhase('deal'), SHUFFLE_MS);
    // The table gets its cards back as the last one is still in the air, so the fade-in and
    // the final flight overlap instead of leaving a beat of empty felt.
    const dealMs = Math.max(seats, 1) * ROUNDS * STEP_MS + FLIGHT_MS * 0.4;
    const reveal = window.setTimeout(() => onDone?.(), SHUFFLE_MS + dealMs);
    const b = window.setTimeout(() => setPhase('done'), SHUFFLE_MS + dealMs + FLIGHT_MS);
    return () => { window.clearTimeout(a); window.clearTimeout(reveal); window.clearTimeout(b); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, seats, reduced]);

  // A percentage inside a `translate` is a percentage of the *card*, not of the felt, so the
  // seats have to be measured in pixels. Without that every card lands a card's width from the
  // deck and the whole deal happens in a puddle in the middle.
  const box = useRef<HTMLDivElement>(null);
  const [targets, setTargets] = useState<{ x: number; y: number }[]>([]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el || phase !== 'deal') return;
    const read = () => setTargets(measure(el, aim));
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round, aim.join('|')]);

  // The flight plan: round by round, seat by seat, the way a dealer actually goes round.
  const flights = useMemo(() => {
    const out: { key: string; x: number; y: number; delay: number; spin: number }[] = [];
    if (targets.length === 0) return out;
    let k = 0;
    for (let r = 0; r < ROUNDS; r++) {
      for (let s = 0; s < targets.length; s++) {
        const t = targets[s];
        // A dealt card does not land dead centre on the last one — it slides off a little.
        out.push({
          key: `${r}-${s}`,
          x: t.x + (r - (ROUNDS - 1) / 2) * 9,
          y: t.y + (r - (ROUNDS - 1) / 2) * 5,
          delay: k * STEP_MS,
          spin: (s % 2 ? 1 : -1) * (8 + r * 3),
        });
        k++;
      }
    }
    return out;
  }, [targets]);

  if (reduced || phase === 'done') return null;

  return (
    <div className="dealmotion" aria-hidden="true" ref={box}>
      {phase === 'shuffle' ? (
        <div className="dm-riffle">
          {Array.from({ length: 18 }, (_, i) => (
            <div
              key={i}
              className={`dm-card dm-riff ${i % 2 ? 'right' : 'left'}`}
              style={{ ['--i' as string]: String(i), ['--n' as string]: String(Math.floor(i / 2)) }}
            >
              <div className="card back" />
            </div>
          ))}
        </div>
      ) : (
        <div className="dm-deal">
          {/* What is left of the deck, still squared up in the dealer's hand. */}
          <div className="dm-stock">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="dm-card dm-stockcard" style={{ ['--i' as string]: String(i) }}>
                <div className="card back" />
              </div>
            ))}
          </div>
          {flights.map((f) => (
            <div
              key={f.key}
              className="dm-card dm-fly"
              style={{
                ['--tx' as string]: `${f.x.toFixed(1)}px`,
                ['--ty' as string]: `${f.y.toFixed(1)}px`,
                ['--spin' as string]: `${f.spin}deg`,
                animationDelay: `${f.delay}ms`,
              }}
            >
              <div className="card back" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
