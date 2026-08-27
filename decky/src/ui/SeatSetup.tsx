import { useState } from 'react';
import { GameDefinition } from '../engine/types';
import { Seat } from '../server/matchService';

// Who is at the table.
//
// One screen covers what used to be three separate ideas: single-player against bots is a table
// of one local seat and some bots; pass-and-play is several local seats; a mixed table is both.
// The engine has never known the difference — this is where a person gets to say it.
//
// A plan built here is remembered per game. Pass-and-play exists so a household can name every
// seat for themselves — "Mum", "Dad", "Sam" — and that naming used to evaporate the moment you
// left the screen, so every single game of every session started back at "Player 2" and "Player
// 3". It is saved under the game's own id, since a seat count and a cast of bots that suits
// Hearts has no reason to survive a jump to Euchre.

const PLAN_PREFIX = 'decky.seatplan.';

type SavedSeat = Pick<Seat, 'name' | 'kind' | 'difficulty'>;

function loadPlan(gameId: string): SavedSeat[] | null {
  try {
    const raw = localStorage.getItem(PLAN_PREFIX + gameId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}

function savePlan(gameId: string, seats: Seat[]): void {
  try {
    const trimmed: SavedSeat[] = seats.map((s) => ({ name: s.name, kind: s.kind, difficulty: s.difficulty }));
    localStorage.setItem(PLAN_PREFIX + gameId, JSON.stringify(trimmed));
  } catch { /* storage full or unavailable — the plan just doesn't survive this time */ }
}

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
  const savedPlan = loadPlan(def.meta.id);
  const startCount = savedPlan ? Math.min(Math.max(savedPlan.length, min), max) : Math.min(Math.max(defaultSeats, min), max);
  const [count, setCount] = useState(startCount);
  const [seats, setSeats] = useState<Seat[]>(() => initial(startCount, defaultName, savedPlan));
  // Practice is a table you can learn at: it is not recorded and a move can always be taken back.
  const [practice, setPractice] = useState(false);

  function resize(n: number) {
    setCount(n);
    setSeats((prev) => {
      const next = initial(n, defaultName, savedPlan);
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
              <button key={n} className={count === n ? 'on' : ''} aria-pressed={count === n} onClick={() => resize(n)}>{n}</button>
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
                    aria-pressed={s.kind === k.value}
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
          <input type="checkbox" checked={practice} onChange={(e) => setPractice(e.target.checked)} aria-label="Practice" />
          <span>
            <b aria-hidden="true">Practice</b>
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
          <button className="primary" onClick={() => { savePlan(def.meta.id, seats); onStart(seats, practice); }}>Deal →</button>
        </div>
      </div>
    </div>
  );
}

function defaultNameFor(kind: Seat['kind'], i: number, you: string): string {
  if (kind === 'local') return i === 0 ? you : `Player ${i + 1}`;
  return `Bot ${i + 1}`;
}

function initial(n: number, you: string, saved?: SavedSeat[] | null): Seat[] {
  return Array.from({ length: n }, (_, i) => {
    const kind = (saved?.[i]?.kind ?? (i === 0 ? 'local' : 'bot')) as Seat['kind'];
    return {
      id: `P${i + 1}`,
      name: saved?.[i]?.name || defaultNameFor(kind, i, you),
      kind,
      difficulty: saved?.[i]?.difficulty ?? 'normal',
    };
  });
}
