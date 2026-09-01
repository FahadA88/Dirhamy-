import { Card } from '../engine/types';
import { useSettings } from '../settings/SettingsContext';
import { Suit, SuitId } from './Suit';
import { CourtFigure, JokerFigure } from './Court';

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
  const label = card.rank === 'JOKER' ? '★' : card.rank;
  const face = settings.cardFace;
  // A real pack's two jokers are not identical: one is printed in colour, the other plain. The
  // first joker built per deck copy (deck.ts's `JOKER1`) is that colour one — every other joker
  // stays the plain black it always was. A game does not have to care which is which for this to
  // be true; it only matters once one does (Hokm's joker-timing rule needs the two told apart).
  const coloredJoker = card.rank === 'JOKER' && card.id.startsWith('JOKER1');
  // Four-colour and letter-coded both recolour the suits; letters additionally spell them out.
  // Faces that give every suit its own colour rather than the traditional two.
  const FOUR = face === 'four-color' || face === 'letters' || face === 'shapes';
  const style = FOUR ? { color: FOUR_COLOR[card.suit] } : coloredJoker ? { color: FOUR_COLOR.JOKER } : undefined;
  const pips = PIPS[card.rank];
  // The joker sits in the same framed panel a court figure does — it earns one too, now that it
  // is a figure rather than a bare star standing in for a face nobody drew.
  const isCourt = card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' || card.rank === 'JOKER';

  const suit = card.suit as SuitId;

  // Everywhere a specific card is drawn, it says which card it is (data-flight). That is the
  // whole contract the flying-card layer needs: it can then tell that the six of clubs which was
  // in your hand last render is the six of clubs now sitting in the middle, and throw it there
  // rather than letting one vanish and another appear.
  return (
    <div className={`card face f-${face} ${red ? 'red' : 'black'} ${isCourt ? 'court' : ''}`} style={style}
      data-flight={card.id}
      role="img"
      aria-label={card.rank === 'JOKER' ? (coloredJoker ? 'Colored joker' : 'Joker') : `${LONG_RANK[card.rank] ?? card.rank} of ${LONG_SUIT[card.suit] ?? card.suit}`}>
      <div className="holo" />
      {/* A hairline frame inside the trim, the way a printed deck is cut. */}
      <div className="face-frame" aria-hidden="true" />
      <div className="corner tl">
        <b className="ix-rank">{label}</b>
        <Suit suit={suit} className="ix-suit" illustrated={settings.illustratedSuits} />
        {face === 'letters' && <b className="suitletter">{SUIT_LETTER[card.suit]}</b>}
      </div>

      {face === 'shapes' ? (
        // A shape carries the suit for anyone who cannot separate two colours, and unlike a
        // letter it still reads at a glance from across the table.
        <div className="shapemark" data-suit={card.suit} aria-hidden="true" />
      ) : pips ? (
        <div className="pips" aria-hidden="true">
          {pips.map((p, i) => (
            <span key={i} className="spot"
              style={{ left: `${p.x}%`, top: `${p.y}%`, transform: `translate(-50%,-50%) rotate(${p.y > 55 ? 180 : 0}deg)` }}>
              <Suit suit={suit} illustrated={settings.illustratedSuits} />
            </span>
          ))}
        </div>
      ) : card.rank === 'JOKER' ? (
        <div className="court-art" aria-hidden="true"><JokerFigure /></div>
      ) : isCourt ? (
        <div className="court-art" aria-hidden="true"><CourtFigure rank={label as 'J' | 'Q' | 'K'} suit={suit} illustrated={settings.illustratedSuits} /></div>
      ) : (
        // The ace, which every deck makes something of: one big suit inside a fine ring.
        <div className="pip ace" aria-hidden="true">
          <span className="ace-ring" />
          <Suit suit={suit} illustrated={settings.illustratedSuits} />
        </div>
      )}

      <div className="corner br">
        <b className="ix-rank">{label}</b>
        <Suit suit={suit} className="ix-suit" illustrated={settings.illustratedSuits} />
        {(face === 'letters' || face === 'shapes') && <b className="suitletter">{SUIT_LETTER[card.suit]}</b>}
      </div>
    </div>
  );
}
