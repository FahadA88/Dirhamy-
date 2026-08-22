import { useState } from 'react';
import { GameDefinition } from '../engine/types';
import { Seat } from '../server/matchService';

// Who is at the table.
//
// One screen covers what used to be three separate ideas: single-player against bots is a table
// of one local seat and some bots; pass-and-play is several local seats; a mixed table is both.
// The engine has never known the difference — this is where a person gets to say it.

const KINDS: { value: Seat['kind']; label: string; blurb: string }[] = [
  { value: 'local', label: 'Person here', blurb: 'Plays on this device' },
  { value: 'bot', label: 'Bot', blurb: 'Plays itself' },
];

/** Old saved seats say 'smart' or 'random'; the picker speaks in tiers. Translate both ways. */
function tierOf(d: Seat['difficulty']): 'easy' | 'normal' | 'hard' {
  if (d === 'random' || d === 'easy') return 'easy';
  if (d === 'normal') return 'normal';
  return 'hard';
}

export function SeatSetup({ def, defaultSeats, defaultName, onStart, onCancel }: {
  def: GameDefinition;
  defaultSeats: number;
  defaultName: string;
  onStart: (seats: Seat[], practice: boolean) => void;
  onCancel: () => void;
}) {
  const min = def.meta.players.min;
  const max = def.meta.players.max;
  const [count, setCount] = useState(Math.min(Math.max(defaultSeats, min), max));
  const [seats, setSeats] = useState<Seat[]>(() => initial(Math.min(Math.max(defaultSeats, min), max), defaultName));
  // Practice is a table you can learn at: it is not recorded and a move can always be taken back.
  const [practice, setPractice] = useState(false);

  function resize(n: number) {
    setCount(n);
    setSeats((prev) => {
      const next = initial(n, defaultName);
      // Keep what was already configured rather than resetting every chair on a resize.
      for (let i = 0; i < Math.min(prev.length, n); i++) next[i] = prev[i];
      return next;
    });
  }

  function patch(i: number, p: Partial<Seat>) {
    setSeats((prev) => prev.map((s, k) => (k === i ? { ...s, ...p } : s)));
  }

  const humans = seats.filter((s) => s.kind === 'local').length;

  return (
    <div className="seatsetup">
      <div className="crumbs">
        <button className="ghost" onClick={onCancel}>← All games</button>
        <span className="crumb-title">{def.meta.name} · set up the table</span>
      </div>

      <div className="panel glass">
        <div className="field"><span>How many seats</span>
          <div className="seg wrap">
            {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
              <button key={n} className={count === n ? 'on' : ''} onClick={() => resize(n)}>{n}</button>
            ))}
          </div>
        </div>

        <ol className="seatlist">
          {seats.map((s, i) => (
            <li key={s.id} className={`seatrow ${s.kind}`}>
              <span className="seatrow-n">{i + 1}</span>
              <input className="seatrow-name" value={s.name}
                onChange={(e) => patch(i, { name: e.target.value })} aria-label={`Name for seat ${i + 1}`} />
              <div className="seg">
                {KINDS.map((k) => (
                  <button key={k.value} className={s.kind === k.value ? 'on' : ''}
                    title={k.blurb}
                    onClick={() => patch(i, { kind: k.value, name: defaultNameFor(k.value, i, defaultName) })}>
                    {k.label}
                  </button>
                ))}
              </div>
              {s.kind === 'bot' && (
                <div className="seg">
                  {([['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Sharp']] as const).map(([val, label]) => (
                    <button
                      key={val}
                      className={tierOf(s.difficulty) === val ? 'on' : ''}
                      aria-pressed={tierOf(s.difficulty) === val}
                      onClick={() => patch(i, { difficulty: val })}
                    >{label}</button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>

        <label className="practice-toggle">
          <input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} />
          <span>
            <b>Practice</b>
            <em>Nothing is recorded, and you can always take a move back.</em>
          </span>
        </label>

        <p className="muted seat-note">
          {humans === 0
            ? 'Every seat is a bot — you will be watching, not playing.'
            : humans === 1
              ? 'One person at this device, the rest played by bots.'
              : `Pass-and-play: ${humans} people sharing this device. The screen hides each hand until its owner takes over.`}
        </p>

        <div className="step-actions">
          <button className="ghost" onClick={onCancel}>Cancel</button>
          <button className="primary" onClick={() => onStart(seats, practice)}>Deal →</button>
        </div>
      </div>
    </div>
  );
}

function defaultNameFor(kind: Seat['kind'], i: number, you: string): string {
  if (kind === 'local') return i === 0 ? you : `Player ${i + 1}`;
  return `Bot ${i + 1}`;
}

function initial(n: number, you: string): Seat[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `P${i + 1}`,
    name: defaultNameFor(i === 0 ? 'local' : 'bot', i, you),
    kind: (i === 0 ? 'local' : 'bot') as Seat['kind'],
    difficulty: 'normal' as const,
  }));
}
