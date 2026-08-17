import { useState } from 'react';
import { PlayView } from './PlayView';
import { CreateView } from './CreateView';
import { Backdrop } from './Backdrop';
import { SettingsPanel } from './SettingsPanel';

type View = 'play' | 'create';

export function App() {
  const [view, setView] = useState<View>('play');
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="app">
      <Backdrop />
      <header>
        <div className="brand">
          <div className="logo3d"><span>♠</span></div>
          <h1>DECKY</h1>
        </div>
        <nav className="tabs">
          <button className={view === 'play' ? 'on' : ''} onClick={() => setView('play')}>Play</button>
          <button className={view === 'create' ? 'on' : ''} onClick={() => setView('create')}>Create</button>
          <button className="icon-btn" title="Customize" aria-label="Customize" onClick={() => setSettingsOpen(true)}>⚙</button>
        </nav>
      </header>
      {view === 'play' ? <PlayView /> : <CreateView />}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}
