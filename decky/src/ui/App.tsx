import { useState } from 'react';
import { PlayView } from './PlayView';
import { CreateView } from './CreateView';

type View = 'play' | 'create';

export function App() {
  const [view, setView] = useState<View>('play');
  return (
    <div className="app">
      <header>
        <h1>♠ Decky</h1>
        <div className="sub">play &amp; build card games · the engine is the referee</div>
        <nav className="tabs">
          <button className={view === 'play' ? 'on' : ''} onClick={() => setView('play')}>Play</button>
          <button className={view === 'create' ? 'on' : ''} onClick={() => setView('create')}>Create</button>
        </nav>
      </header>
      {view === 'play' ? <PlayView /> : <CreateView />}
    </div>
  );
}
