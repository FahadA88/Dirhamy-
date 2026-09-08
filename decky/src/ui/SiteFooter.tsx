import { RouteView } from './route';

// The page used to simply stop. No footer at all — which meant the things a card site has to be
// able to say plainly had nowhere to live: that the shuffle can be checked, that generated games
// are played by bots before anyone sees them, that no money is involved. All three were true and
// none of them were written down anywhere a player would look.
//
// Only real destinations are linked. A column of kind names would look like more of a site map,
// but the kind filter lives in the shelf's own tabs and a footer link that did not actually
// apply it would be decoration pretending to be navigation.

const TRUST = [
  'The deck is committed to before it is dealt, so the shuffle can be checked afterwards.',
  'Every game written from a description is played by bots 120 times before you see it.',
  'No real money, anywhere in it.',
];

export function SiteFooter({ onView }: { onView: (v: RouteView) => void }) {
  return (
    <footer className="site-footer">
      <ul className="trust-strip">
        {TRUST.map((t) => <li key={t}>{t}</li>)}
      </ul>
      <nav className="footer-links" aria-label="Site">
        <button onClick={() => onView('play')}>All games</button>
        <button onClick={() => onView('create')}>Build a game</button>
        <button onClick={() => onView('profile')}>Your shelf</button>
      </nav>
      <p className="footer-foot">Decky — card games, dealt honestly. Built to work offline.</p>
    </footer>
  );
}
