import { useMemo } from 'react';
import { EmptyMatchesMark, ShelfCard } from '../browseCommon';
import { useSettings } from '../../settings/SettingsContext';
import { currentStreak, leaderboard } from '../../social/records';
import { HomeLayoutProps } from './types';

/** A grid of small real widgets rather than one long page — jump back in, staff picks, and the
 *  same win-rate and streak numbers the leaderboard already keeps, just surfaced up front. A
 *  fixed arrangement, not a draggable one: real numbers over a rearranging affordance nobody
 *  asked for. */
export function WidgetsLayout({ games, shelves, onOpen, onPlay, onChanged }: HomeLayoutProps) {
  const { settings } = useSettings();
  const continueShelf = shelves.find((c) => c.id === 'continue');
  const staffShelf = shelves.find((c) => c.id === 'staff');
  const quickShelf = shelves.find((c) => c.id === 'quick');

  const me = useMemo(() => leaderboard(undefined, [settings.playerName])[0], [settings.playerName]);
  const streak = useMemo(() => currentStreak(), []);

  return (
    <div className="hl-widgets">
      <section className="hl-widget hl-widget-wide">
        <h3>Jump back in</h3>
        {continueShelf && continueShelf.games.length > 0 ? (
          <div className="hl-widget-row">
            {continueShelf.games.slice(0, 4).map((g) => (
              <ShelfCard key={g.id} game={g} onOpen={() => onOpen(g.id)} onPlay={() => onPlay(g)} onChanged={onChanged} />
            ))}
          </div>
        ) : (
          <div className="empty-inline">
            <EmptyMatchesMark />
            <p className="muted">Nothing in progress — play something and it'll wait for you here.</p>
          </div>
        )}
      </section>

      <section className="hl-widget hl-widget-stat">
        <h3>Your win rate</h3>
        <span className="hl-widget-num">{me ? `${Math.round(me.winRate * 100)}%` : '—'}</span>
        <span className="muted">{me ? `across ${me.played} finished game${me.played === 1 ? '' : 's'}` : 'play a game to the end to start one'}</span>
      </section>

      <section className="hl-widget hl-widget-stat">
        <h3>Current streak</h3>
        <span className="hl-widget-num">{streak}</span>
        <span className="muted">win{streak === 1 ? '' : 's'} in a row</span>
      </section>

      <section className="hl-widget">
        <h3>Staff picks</h3>
        <ul className="hl-widget-list">
          {(staffShelf?.games ?? []).slice(0, 5).map((g) => (
            <li key={g.id}><button className="linkish" onClick={() => onOpen(g.id)}>{g.definition.meta.name}</button></li>
          ))}
          {(!staffShelf || staffShelf.games.length === 0) && <li className="muted">None yet.</li>}
        </ul>
      </section>

      <section className="hl-widget">
        <h3>Quick games</h3>
        <ul className="hl-widget-list">
          {(quickShelf?.games ?? []).slice(0, 5).map((g) => (
            <li key={g.id}><button className="linkish" onClick={() => onOpen(g.id)}>{g.definition.meta.name}</button></li>
          ))}
          {(!quickShelf || quickShelf.games.length === 0) && <li className="muted">None yet.</li>}
        </ul>
      </section>

      <section className="hl-widget hl-widget-wide hl-widget-shelf">
        <h3>The full shelf — {games.length} games</h3>
        <div className="hl-widget-shelf-scroll shelf-grid">
          {games.map((g) => (
            <ShelfCard key={g.id} game={g} onOpen={() => onOpen(g.id)} onPlay={() => onPlay(g)} onChanged={onChanged} />
          ))}
        </div>
      </section>
    </div>
  );
}
