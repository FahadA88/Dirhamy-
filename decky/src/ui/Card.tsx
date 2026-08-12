import { Card } from '../engine/types';
import { SUIT_SYMBOLS } from '../engine/deck';
import { useSettings } from '../settings/SettingsContext';

// Four-color deck (a common accessibility option): clubs green, diamonds blue, hearts red,
// spades black. Classic mode: red for hearts/diamonds, black for the rest.
const FOUR_COLOR: Record<string, string> = { S: '#14231b', H: '#dc2626', D: '#2563eb', C: '#15803d', JOKER: '#7c3aed' };

export function CardFace({ card }: { card: Card }) {
  const { settings } = useSettings();
  const red = card.suit === 'H' || card.suit === 'D';
  const sym = SUIT_SYMBOLS[card.suit];
  const label = card.rank === 'JOKER' ? '★' : card.rank;
  const style = settings.fourColor ? { color: FOUR_COLOR[card.suit] } : undefined;
  return (
    <div className={`card face ${red ? 'red' : 'black'}`} style={style}>
      <div className="holo" />
      <div className="corner tl">{label}<span>{sym}</span></div>
      <div className="pip">{sym}</div>
      <div className="corner br">{label}<span>{sym}</span></div>
    </div>
  );
}
