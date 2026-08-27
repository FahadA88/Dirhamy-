import { dailyStreak } from '../social/daily';

// The navigation, five ways.
//
// These are all live — `?nav=rail`, `?nav=centre`, `?nav=dock`, `?nav=plate`, or nothing for
// the bar we have now — so the choice can be made by looking at the real site with the real
// games in it rather than at a mock. Once one is picked the others come out and the chosen one
// becomes the only one.

export type NavStyle = 'bar' | 'rail' | 'centre' | 'dock' | 'plate';

export const NAV_STYLES: { id: NavStyle; name: string; blurb: string }[] = [
  { id: 'bar', name: 'Top bar', blurb: 'Brand left, tabs right. What the site does today.' },
  { id: 'rail', name: 'Side rail', blurb: 'A fixed column down the left, icon over label. Reads as an application.' },
  { id: 'centre', name: 'Centred masthead', blurb: 'Brand on its own line, nav under it, hairline rule. Reads as a printed page.' },
  { id: 'dock', name: 'Floating dock', blurb: 'A pill that floats at the bottom of the screen. Reads as a game.' },
  { id: 'plate', name: 'Oak plate', blurb: 'The brand engraved on a board across the top, tabs cut into it.' },
];

/** Read once at start-up: this is a thing to look at, not a setting to persist. */
export function navStyle(): NavStyle {
  const q = new URLSearchParams(window.location.search).get('nav');
  return (NAV_STYLES.some((n) => n.id === q) ? q : 'bar') as NavStyle;
}

export function SiteNav({ style, view, onView, onSettings, onDaily }: {
  style: NavStyle;
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
  // The marks are only rendered where they are used. Hiding them with CSS leaves the glyph in
  // the element's text, so a button reading "Play" is really "\u2660Play" to anything matching on
  // text — screen readers included.
  const marks = style === 'rail' || style === 'dock';
  const settingsLabel = style === 'rail';
  const streak = dailyStreak();
  const items = (
    <>
      <button className={view === 'play' ? 'on' : ''} onClick={() => onView('play')}>
        {marks && <span className="nv-mark" aria-hidden="true">♠</span>}
        <span className="nv-label">Play</span>
      </button>
      <button className="nv-daily" title={streak > 0 ? `Today's Deal — ${streak} day streak` : "Today's Deal"} onClick={onDaily}>
        {marks && <span className="nv-mark" aria-hidden="true">♦</span>}
        <span className="nv-label">Daily{streak > 0 ? ` · ${streak}` : ''}</span>
      </button>
      <button className={view === 'create' ? 'on' : ''} onClick={() => onView('create')}>
        {marks && <span className="nv-mark" aria-hidden="true">✎</span>}
        <span className="nv-label">Create</span>
      </button>
      <button className={view === 'profile' ? 'on' : ''} onClick={() => onView('profile')}>
        {marks && <span className="nv-mark" aria-hidden="true">☺</span>}
        <span className="nv-label">You</span>
      </button>
      <button className="nv-settings" title="Preferences" aria-label="Preferences" onClick={onSettings}>
        <span className="nv-mark" aria-hidden="true">⚙</span>
        {settingsLabel && <span className="nv-label">Settings</span>}
      </button>
    </>
  );

  const brand = (
    <div className="brand">
      <div className="logo3d"><span>♠</span></div>
      <h1>DECKY</h1>
    </div>
  );

  if (style === 'rail') {
    return (
      <header className="nav-rail">
        {brand}
        <nav className="nv-items">{items}</nav>
      </header>
    );
  }

  if (style === 'centre') {
    return (
      <header className="nav-centre">
        {brand}
        <nav className="nv-items">{items}</nav>
      </header>
    );
  }

  if (style === 'dock') {
    return (
      <>
        <header className="nav-dock-head">{brand}</header>
        <nav className="nav-dock">{items}</nav>
      </>
    );
  }

  if (style === 'plate') {
    return (
      <header className="nav-plate">
        <div className="np-board">
          {brand}
          <nav className="nv-items">{items}</nav>
        </div>
      </header>
    );
  }

  return (
    <header className="nav-bar">
      {brand}
      <nav className="tabs nv-items">{items}</nav>
    </header>
  );
}
