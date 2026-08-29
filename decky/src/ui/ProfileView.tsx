import { useMemo, useState } from 'react';
import { useSettings } from '../settings/SettingsContext';
import { catalog } from '../games/catalog';
import {
  Badge, allResults, badges, currentStreak, highlights, leaderboard, mySummary,
} from '../social/records';

// Your record.
//
// Everything on this page is derived from the results already on the device — nothing here is
// tracked separately, so a badge is correct for games played long before the badge existed and
// there is only one story about what somebody did. The summary functions had been sitting in
// records.ts with no reader for a while; this is that reader.

type Tab = 'overview' | 'games' | 'badges';

export function ProfileView({ onPlay }: { onPlay: () => void }) {
  const { settings } = useSettings();
  const [tab, setTab] = useState<Tab>('overview');

  const summary = useMemo(() => mySummary(), []);
  const results = useMemo(() => allResults(), []);
  const earned = useMemo(() => badges(catalog.length), []);
  const bests = useMemo(() => highlights(), []);

  // Per-game record, most-played first. Only games actually finished appear — a list of
  // nineteen zeroes is not a record of anything.
  const perGame = useMemo(() => {
    const rows = new Map<string, { id: string; name: string; played: number; won: number; streak: number }>();
    for (const r of results) {
      const cur = rows.get(r.gameId) ?? { id: r.gameId, name: r.gameName, played: 0, won: 0, streak: 0 };
      cur.played += 1;
      if (r.youWon) cur.won += 1;
      rows.set(r.gameId, cur);
    }
    for (const row of rows.values()) row.streak = currentStreak(row.id);
    return [...rows.values()].sort((a, b) => b.played - a.played);
  }, [results]);

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  /*
    Every result lives in this one browser. Clear site data, switch devices, or the browser
    just decides storage is full, and a hundred games of history are gone with no warning and
    no way back — because there was never a way out. This is the way out: the exact JSON the
    rest of the page already reads, so a saved file is a real backup rather than a summary that
    has thrown information away.
  */
  function exportRecord() {
    const payload = { exportedAt: new Date().toISOString(), player: settings.playerName, results };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `decky-record-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  if (summary.played === 0) {
    /*
      An empty record used to be one line on an otherwise blank screen, which answers the
      question "why did I open this?" with "no reason". The badges already know how to draw
      themselves unearned, and showing what there is to go after is a better answer than a
      shrug — so the page shows what a record would look like once there is one.
    */
    /*
      A start screen, not a dead end.

      This used to be a 42px glyph, two lines of text and 46px of padding — a small card
      floating in an otherwise empty page, which reads exactly like a page that failed to
      load rather than like a page that has not started yet. It gets a real hero treatment
      now, the same weight the "Tonight's table" panel gets on Play, with a button that
      actually takes you there — the honest fix for a page with nothing to show is a door
      to the page that will give it something.
    */
    return (
      <section className="profile">
        <ProfileHead name={settings.playerName} avatar={settings.avatar} summary={summary} />
        <div className="empty-hero">
          <div className="eh-cards" aria-hidden="true">
            <span className="eh-card c1">A♠</span>
            <span className="eh-card c2">K♥</span>
            <span className="eh-card c3">Q♦</span>
          </div>
          <h3>Nothing here yet — that’s the whole story</h3>
          <p className="muted">
            Win, lose or draw, every finished game lands here — results, streaks and how you do
            at each one. Practice games are left out on purpose, so the first line in this
            page is a real one.
          </p>
          <button className="primary lg" onClick={onPlay}>Play a game ▶</button>
        </div>
        <div className="section-head">
          <h2>Up for grabs</h2>
          <p className="shelf-blurb">{earned.length} badges, none of them earned yet.</p>
        </div>
        <div className="badge-grid">
          {earned.map((b) => <BadgeCard key={b.id} badge={b} />)}
        </div>
      </section>
    );
  }

  return (
    <section className="profile">
      <ProfileHead name={settings.playerName} avatar={settings.avatar} summary={summary} />

      <div className="profile-tabrow">
        <div className="seg profile-tabs" role="tablist" aria-label="Your record">
          {([['overview', 'Overview'], ['games', 'By game'], ['badges', 'Badges']] as [Tab, string][]).map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? 'on' : ''}
              onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
        <button className="ghost sm profile-export" onClick={exportRecord}
          title="Save every result on this device as a JSON file">
          Download your record ↓
        </button>
      </div>

      {tab === 'overview' && (
        <>
          <div className="stat-row">
            <Stat label="Played" value={String(summary.played)} />
            <Stat label="Won" value={String(summary.won)} />
            <Stat label="Win rate" value={pct(summary.winRate)} />
            <Stat label="Streak" value={String(summary.streak)} hint={summary.streak > 0 ? 'in a row' : 'no run yet'} />
          </div>

          {summary.favouriteGame && (
            <p className="muted profile-note">
              Most played: <b>{summary.favouriteGame}</b>.
            </p>
          )}

          {bests.length > 0 && (
            <section className="panel glass profile-panel">
              <h4>Best of</h4>
              <ul className="highlight-list">
                {bests.map((h) => (
                  <li key={h.key}>
                    <span className="hl-label">{h.label}</span>
                    <b className="hl-value">{h.value}</b>
                    <em className="muted">{h.gameName}</em>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel glass profile-panel">
            <h4>Recent games</h4>
            <ol className="recent-list">
              {results.slice(0, 8).map((r, i) => (
                <li key={`${r.at}-${i}`} className={r.youWon ? 'won' : ''}>
                  <span className="rl-mark" aria-hidden="true">{r.youWon ? '★' : '·'}</span>
                  <span className="rl-name">{r.gameName}</span>
                  <span className="rl-seats muted">{r.seats} seats</span>
                  <span className="rl-when muted">{ago(r.at)}</span>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}

      {tab === 'games' && (
        <section className="panel glass profile-panel">
          <table className="record-table">
            <caption className="sr-only">Your record in each game</caption>
            <thead>
              <tr><th scope="col">Game</th><th scope="col">Played</th><th scope="col">Won</th><th scope="col">Rate</th></tr>
            </thead>
            <tbody>
              {perGame.map((g) => (
                <tr key={g.id}>
                  <th scope="row">{g.name}</th>
                  <td>{g.played}</td>
                  <td>{g.won}</td>
                  <td>{pct(g.played ? g.won / g.played : 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'badges' && (
        <div className="badge-grid">
          {earned.map((b) => <BadgeCard key={b.id} badge={b} />)}
        </div>
      )}
    </section>
  );
}

function ProfileHead({ name, avatar, summary }: {
  name: string; avatar: string; summary: { played: number; won: number; streak?: number };
}) {
  // A run of three or more wins earns the avatar a faint warmth of its own — nothing louder
  // than that, since this is a badge you carry everywhere, not a trophy you stop to admire.
  const streak = summary.streak ?? 0;
  return (
    <header className="profile-head">
      <span className={`profile-avatar ${streak >= 3 ? 'on-streak' : ''}`} aria-hidden="true">{avatar}</span>
      <div>
        <h2>{name}</h2>
        <p className="muted">
          {summary.played === 0
            ? 'No games finished yet'
            : `${summary.won} of ${summary.played} games won`}
        </p>
      </div>
    </header>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="stat">
      <b className="stat-value">{value}</b>
      <span className="stat-label">{label}</span>
      {hint && <em className="stat-hint muted">{hint}</em>}
    </div>
  );
}

function BadgeCard({ badge }: { badge: Badge }) {
  const done = badge.progress >= 1;
  return (
    <article className={`badge ${done ? 'earned' : ''}`}>
      <span className="badge-mark" aria-hidden="true">{badge.mark}</span>
      <h4>{badge.name}</h4>
      <p className="muted">{badge.blurb}</p>
      <div
        className="badge-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(badge.progress * 100)}
        aria-label={`${badge.name}: ${badge.detail}`}
      >
        <span style={{ inlineSize: `${Math.round(badge.progress * 100)}%` }} />
      </div>
      <em className="badge-detail">{done ? 'Earned' : badge.detail}</em>
    </article>
  );
}

/** Rough, friendly ages. Nobody wants a timestamp on a game they played this morning. */
function ago(at: number): string {
  const mins = Math.max(0, Math.round((Date.now() - at) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

// Kept so the module owns its own leaderboard access rather than the view importing it twice.
export { leaderboard };
