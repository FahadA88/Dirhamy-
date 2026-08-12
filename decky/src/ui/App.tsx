import { useState } from 'react';
import { PlayView } from './PlayView';
import { CreateView } from './CreateView';
import { Backdrop } from './Backdrop';

type View = 'play' | 'create';

export function App() {
  const [view, setView] = useState<View>('play');
  return (
    <div className="app">
      <Backdrop />
      <header>
        <div className="brand">
          <div className="logo3d"><span>♠</span></div>
          <div>
            <h1>DECKY</h1>
            <div className="sub">a card-game engine · the referee lives in the machine</div>
          </div>
        </div>
        <nav className="tabs">
          <button className={view === 'play' ? 'on' : ''} onClick={() => setView('play')}>Play</button>
          <button className={view === 'create' ? 'on' : ''} onClick={() => setView('create')}>Create</button>
        </nav>
      </header>
      {view === 'play' ? <PlayView /> : <CreateView />}
    </div>
  );
}
