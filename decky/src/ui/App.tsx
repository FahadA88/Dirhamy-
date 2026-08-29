import { lazy, Suspense, useEffect, useState } from 'react';
import { PlayView } from './PlayView';
import { ProfileView } from './ProfileView';
import { Backdrop } from './Backdrop';
import { startCardSheen } from './cardSheen';
import { startMagneticButtons, startTableParallax, startFeltSpotlight, startTapRipple } from './tableFx';
import { SettingsPanel } from './SettingsPanel';
import { SiteNav, navStyle } from './SiteNav';
import { FirstRun } from './FirstRun';

// Worklist #98: opening the shelf used to download the whole builder — the rule kit, the
// knob catalogue, the AI copilot prompts and templates — to draw a grid of cards that has
// nothing to do with any of it. Create is one tab of three and most sessions never open it,
// so it is its own chunk now, fetched only by the click that actually needs it.
const CreateView = lazy(() => import('./CreateView').then((m) => ({ default: m.CreateView })));

type View = 'play' | 'create' | 'profile';

// The three filters Preferences ▸ Accessibility ▸ "See it as" can switch on, applied to the
// whole app via a CSS `filter: url(#id)` keyed off data-colorvision (see applySettings).
// Standard simulation matrices (Machado/Oliveira/Fernandes), not anyone's approximation —
// the same ones most colour-blindness browser extensions use. Defined once, off-screen,
// referenced by id rather than duplicated per element.
function ColorVisionFilters() {
  return (
    <svg aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0 }}>
      <defs>
        <filter id="cvd-protanopia" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="
            0.567 0.433 0     0 0
            0.558 0.442 0     0 0
            0     0.242 0.758 0 0
            0     0     0     1 0" />
        </filter>
        <filter id="cvd-deuteranopia" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="
            0.625 0.375 0   0 0
            0.7   0.3   0   0 0
            0     0.3   0.7 0 0
            0     0     0   1 0" />
        </filter>
        <filter id="cvd-tritanopia" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="
            0.95 0.05  0     0 0
            0    0.433 0.567 0 0
            0    0.475 0.525 0 0
            0    0     0     1 0" />
        </filter>
      </defs>
    </svg>
  );
}

export function App() {
  const [view, setView] = useState<View>('play');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Fixed at start-up: the navigation is being chosen between, not switched at runtime.
  const [nav] = useState(navStyle);
  // Bumped every time the nav's Daily button is pressed. PlayView watches it (it owns the
  // actual daily-deal boot logic already, for the shelf's own "Today's Deal" card) and jumps
  // straight into today's deal on every change, from whichever of the three tabs was open.
  const [dailyTrigger, setDailyTrigger] = useState(0);
  // One document-level listener, started once: see cardSheen.ts.
  useEffect(() => startCardSheen(), []);
  // Two more of the same shape: see tableFx.ts.
  useEffect(() => startMagneticButtons(), []);
  useEffect(() => startTableParallax(), []);
  useEffect(() => startFeltSpotlight(), []);
  useEffect(() => startTapRipple(), []);
  // An almost-imperceptible day/night warmth: the felt's own haze (see SEVENTY-THREE MORE,
  // "ambient atmosphere") leans a little warmer at midday, a little cooler overnight. Read once
  // at mount rather than kept live — nobody sits at one table long enough for the hour to turn
  // over, and there is nothing here worth a running clock for.
  useEffect(() => {
    const h = new Date().getHours();
    const warmth = h >= 6 && h < 18 ? Math.sin(((h - 6) / 12) * Math.PI) : 0.15;
    document.documentElement.style.setProperty('--daywarm', warmth.toFixed(2));
  }, []);
  return (
    <div className={`app nav-is-${nav}`}>
      <ColorVisionFilters />
      <Backdrop />
      <SiteNav
        style={nav} view={view} onView={setView} onSettings={() => setSettingsOpen(true)}
        onDaily={() => { setView('play'); setDailyTrigger((n) => n + 1); }}
      />
      <main>
        {view === 'play' ? <PlayView startDailyTrigger={dailyTrigger} />
          : view === 'create'
            ? <Suspense fallback={<div className="view-loading muted">Loading the builder…</div>}><CreateView /></Suspense>
          : <ProfileView onPlay={() => setView('play')} />}
      </main>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <FirstRun />
    </div>
  );
}
