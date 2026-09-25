import { dailyStreak } from '../social/daily';

// The navigation: an oak plate, the brand engraved on a board across the top and the tabs cut
// in beside it — the brass plate on the door of a card room. Picked over four other candidates
// (a plain top bar, a side rail, a centred masthead, a floating dock) that lived here during
// design, switched with `?nav=`, so the choice could be made by looking at the real site with
// the real games in it rather than a mock. This is the one that read as a game rather than a
// website; the other four are gone now, not just unreachable.

export function SiteNav({ view, onView, onSettings, onDaily }: {
  view: 'play' | 'create' | 'profile';
  onView: (v: 'play' | 'create' | 'profile') => void;
  onSettings: () => void;
  /**
   * Item 84 of the audit pass: the daily deal is described in its own code as "the single
   * highest-value thing on this list for bringing anybody back tomorrow," and yet it had zero
   * presence in primary navigation — it only existed as one card, easy to miss, inside the Play
   * tab's shelf. This puts it in the same row as Play/Create/You on every screen, not just one.
   */
  onDaily: () => void;
}) {
  const streak = dailyStreak();
  const items = (
    <>
      <button className={view === 'play' ? 'on' : ''} onClick={() => onView('play')}>
        <span className="nv-mark" aria-hidden="true">♠</span>
        <span className="nv-label">Play</span>
      </button>
      <button className="nv-daily" title={streak > 0 ? `Today's Deal — ${streak} day streak` : "Today's Deal"} onClick={onDaily}>
        <span className="nv-mark" aria-hidden="true">♦</span>
        <span className="nv-label">Daily{streak > 0 ? ` · ${streak}` : ''}</span>
      </button>
      <button className={view === 'create' ? 'on' : ''} onClick={() => onView('create')}>
        <span className="nv-mark" aria-hidden="true">✎</span>
        <span className="nv-label">Create</span>
      </button>
      <button className={view === 'profile' ? 'on' : ''} onClick={() => onView('profile')}>
        <span className="nv-mark" aria-hidden="true">☺</span>
        <span className="nv-label">You</span>
      </button>
      <button className="nv-settings" title="Preferences" aria-label="Preferences" onClick={onSettings}>
        <span className="nv-mark" aria-hidden="true">⚙</span>
      </button>
    </>
  );

  return (
    <header className="nav-plate">
      <div className="np-board">
        <div className="brand">
          <div className="logo3d"><span>♠</span></div>
          {/* Not an <h1>. This is the brand, and it rendered on every screen — so a screen-reader
              user landing on a Hearts table heard "Faro" as the page heading and never heard
              "Hearts". The heading level belongs to whatever the screen is actually about. */}
          <div className="wordmark">FARO</div>
        </div>
        <nav className="nv-items">{items}</nav>
      </div>
    </header>
  );
}
