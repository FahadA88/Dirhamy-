import { Card } from '../engine/types';
import { SUIT_SYMBOLS } from '../engine/deck';

export function CardFace({ card }: { card: Card }) {
  const red = card.suit === 'H' || card.suit === 'D';
  const sym = SUIT_SYMBOLS[card.suit];
  const label = card.rank === 'JOKER' ? '★' : card.rank;
  return (
    <div className={`card face ${red ? 'red' : 'black'}`}>
      <div className="corner tl">{label}<span>{sym}</span></div>
      <div className="pip">{sym}</div>
      <div className="corner br">{label}<span>{sym}</span></div>
    </div>
  );
}
