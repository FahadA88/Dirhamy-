import { Card } from '../engine/types';
import { SUIT_SYMBOLS } from '../engine/deck';
import { useSettings } from '../settings/SettingsContext';

// Four-color deck (a common accessibility option): clubs green, diamonds blue, hearts red,
// spades black. Classic mode: red for hearts/diamonds, black for the rest.
const FOUR_COLOR: Record<string, string> = { S: '#14231b', H: '#dc2626', D: '#2563eb', C: '#15803d', JOKER: '#7c3aed' };

// Suit letters, for the letter-coded face. A letter cannot be misread by anyone who can read
// the rank, which is the whole point — it does not depend on telling two colours apart.
const SUIT_LETTER: Record<string, string> = { S: 'S', H: 'H', D: 'D', C: 'C', JOKER: 'J' };

const LONG_RANK: Record<string, string> = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };
const LONG_SUIT: Record<string, string> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };

// Real playing cards show their value as a pip arrangement, not one big symbol in the middle.
// Each entry is a column of vertical positions (0 = top, 1 = bottom); the middle column is
// listed separately so odd counts centre correctly. Pips below the halfway line are flipped,
// exactly as they are on a printed card.
const PIPS: Record<string, { x: number; y: number }[]> = {
  '2':  [{ x: 50, y: 16 }, { x: 50, y: 84 }],
  '3':  [{ x: 50, y: 16 }, { x: 50, y: 50 }, { x: 50, y: 84 }],
  '4':  [{ x: 28, y: 16 }, { x: 72, y: 16 }, { x: 28, y: 84 }, { x: 72, y: 84 }],
  '5':  [{ x: 28, y: 16 }, { x: 72, y: 16 }, { x: 50, y: 50 }, { x: 28, y: 84 }, { x: 72, y: 84 }],
  '6':  [{ x: 28, y: 16 }, { x: 72, y: 16 }, { x: 28, y: 50 }, { x: 72, y: 50 }, { x: 28, y: 84 }, { x: 72, y: 84 }],
  '7':  [{ x: 28, y: 16 }, { x: 72, y: 16 }, { x: 50, y: 33 }, { x: 28, y: 50 }, { x: 72, y: 50 }, { x: 28, y: 84 }, { x: 72, y: 84 }],
  '8':  [{ x: 28, y: 16 }, { x: 72, y: 16 }, { x: 50, y: 33 }, { x: 28, y: 50 }, { x: 72, y: 50 }, { x: 50, y: 67 }, { x: 28, y: 84 }, { x: 72, y: 84 }],
  '9':  [{ x: 28, y: 14 }, { x: 72, y: 14 }, { x: 28, y: 38 }, { x: 72, y: 38 }, { x: 50, y: 50 }, { x: 28, y: 62 }, { x: 72, y: 62 }, { x: 28, y: 86 }, { x: 72, y: 86 }],
  '10': [{ x: 28, y: 14 }, { x: 72, y: 14 }, { x: 50, y: 26 }, { x: 28, y: 38 }, { x: 72, y: 38 }, { x: 28, y: 62 }, { x: 72, y: 62 }, { x: 50, y: 74 }, { x: 28, y: 86 }, { x: 72, y: 86 }],
};

export function CardFace({ card }: { card: Card }) {
  const { settings } = useSettings();
  const red = card.suit === 'H' || card.suit === 'D';
  const sym = SUIT_SYMBOLS[card.suit];
  const label = card.rank === 'JOKER' ? '★' : card.rank;
  const face = settings.cardFace;
  // Four-colour and letter-coded both recolour the suits; letters additionally spell them out.
  const style = face === 'four-color' || face === 'letters'
    ? { color: FOUR_COLOR[card.suit] } : undefined;
  const pips = PIPS[card.rank];
  const isCourt = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';

  return (
    <div className={`card face f-${face} ${red ? 'red' : 'black'} ${isCourt ? 'court' : ''}`} style={style}
      role="img"
      aria-label={card.rank === 'JOKER' ? 'Joker' : `${LONG_RANK[card.rank] ?? card.rank} of ${LONG_SUIT[card.suit] ?? card.suit}`}>
      <div className="holo" />
      <div className="corner tl">{label}<span>{sym}</span>
        {face === 'letters' && <b className="suitletter">{SUIT_LETTER[card.suit]}</b>}
      </div>

      {pips ? (
        <div className="pips" aria-hidden="true">
          {pips.map((p, i) => (
            <span key={i} className="spot"
              style={{ left: `${p.x}%`, top: `${p.y}%`, transform: `translate(-50%,-50%) rotate(${p.y > 55 ? 180 : 0}deg)` }}>
              {sym}
            </span>
          ))}
        </div>
      ) : isCourt ? (
        <div className="court-art" aria-hidden="true">
          <span className="court-letter">{label}</span>
          <span className="court-suit">{sym}</span>
        </div>
      ) : (
        <div className="pip">{sym}</div>
      )}

      <div className="corner br">{label}<span>{sym}</span>
        {face === 'letters' && <b className="suitletter">{SUIT_LETTER[card.suit]}</b>}
      </div>
    </div>
  );
}
