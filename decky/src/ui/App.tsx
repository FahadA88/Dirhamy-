import { useState } from 'react';
import { PlayView } from './PlayView';
import { CreateView } from './CreateView';
import { ProfileView } from './ProfileView';
import { Backdrop } from './Backdrop';
import { SettingsPanel } from './SettingsPanel';
import { SiteNav, navStyle } from './SiteNav';
import { FirstRun } from './FirstRun';

type View = 'play' | 'create' | 'profile';

export function App() {
  const [view, setView] = useState<View>('play');
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Fixed at start-up: the navigation is being chosen between, not switched at runtime.
  const [nav] = useState(navStyle);
  return (
    <div className={`app nav-is-${nav}`}>
      <Backdrop />
      <SiteNav style={nav} view={view} onView={setView} onSettings={() => setSettingsOpen(true)} />
      <main>
        {view === 'play' ? <PlayView />
          : view === 'create' ? <CreateView />
          : <ProfileView />}
      </main>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <FirstRun />
    </div>
  );
}
