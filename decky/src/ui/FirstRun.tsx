import { useEffect, useState } from 'react';
import { useDismissable } from './useEscape';
import { catalog } from '../games/catalog';

// The first thing somebody sees.
//
// Not a tour with a spotlight chasing them round the interface — those are usually skipped, and
// they teach the layout rather than the game. This says the three things that are actually
// non-obvious about this app, in three cards, and gets out of the way. It appears once, it is
// skippable from the first frame, and dismissing it is remembered.
//
// Deliberately no "step 3 of 5" progress bar: three cards is short enough that counting them
// makes it feel longer than it is.

const KEY = 'decky.seenintro.v1';

interface Card {
  mark: string;
  title: string;
  body: string;
}

/** Spelt out up to a point, because "21 games" in the middle of a sentence reads like a spec. */
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
  'eighteen', 'nineteen', 'twenty', 'twenty-one', 'twenty-two', 'twenty-three', 'twenty-four'];
const GAME_COUNT = (() => {
  const n = catalog.length;
  const w = WORDS[n] ?? String(n);
  return w.charAt(0).toUpperCase() + w.slice(1);
})();

const CARDS: Card[] = [
  {
    mark: '🂡',
    title: 'Everything here is a real game',
    // Counted, not written down: this said "Twenty games" while the button under it offered
    // to show you twenty-one, and a number in prose goes stale the moment one is added.
    body: `${GAME_COUNT} games, dealt and refereed properly — the same rules your family argues `
      + 'about, enforced by something that cannot be argued with. Play against bots, pass one '
      + 'device around, or open a table for people somewhere else.',
  },
  {
    mark: '✎',
    title: 'You can build one',
    body: 'Create takes you to an editor, or you can just describe a game in a sentence and let '
      + 'it write one. Either way it is playtested — a hundred and twenty games against bots — '
      + 'before you ever see it, so it cannot hand you something that does not finish.',
  },
  {
    mark: '⚙',
    title: 'Make it yours',
    body: 'Card faces built for colour blindness, text you can actually read, motion you can '
      + 'turn down, a table you can recolour, and a card back you can draw. All of it in '
      + 'Settings, all of it saved on this device.',
  },
];

export function FirstRun() {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);

  useEffect(() => {
    try { if (!localStorage.getItem(KEY)) setOpen(true); } catch { /* private mode: skip it */ }
  }, []);

  function close() {
    setOpen(false);
    try { localStorage.setItem(KEY, '1'); } catch { /* nothing to do about it */ }
  }

  const ref = useDismissable(open, close);
  if (!open) return null;

  const card = CARDS[at];
  const last = at === CARDS.length - 1;

  return (
    <div className="modal firstrun">
      <div className="modal-box intro" ref={ref} role="dialog" aria-modal="true" aria-labelledby="intro-title">
        <span className="intro-mark" aria-hidden="true">{card.mark}</span>
        <h3 id="intro-title">{card.title}</h3>
        <p>{card.body}</p>

        <div className="intro-dots" role="tablist" aria-label="Introduction">
          {CARDS.map((c, i) => (
            <button
              key={c.title}
              role="tab"
              aria-selected={i === at}
              aria-label={c.title}
              className={`intro-dot ${i === at ? 'on' : ''}`}
              onClick={() => setAt(i)}
            />
          ))}
        </div>

        <div className="intro-actions">
          {/* Skip is present from the first card. Somebody who does not want this should not
              have to page through it to escape. */}
          <button className="ghost" onClick={close}>{last ? 'Close' : 'Skip'}</button>
          {!last && <button className="primary" onClick={() => setAt((n) => n + 1)}>Next</button>}
          {last && <button className="primary" onClick={close}>Start playing</button>}
        </div>
      </div>
    </div>
  );
}

/** Lets Settings offer to show it again, rather than it being a one-time thing you cannot revisit. */
export function resetFirstRun(): void {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
