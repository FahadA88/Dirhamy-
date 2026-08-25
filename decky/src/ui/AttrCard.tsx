import { Card } from '../engine/types';

// A card that is not a playing card.
//
// Drawn rather than typed out, because the game is entirely about noticing that three cards
// agree or disagree on each property — and a row of words is much harder to compare at a glance
// than three red ovals next to two green diamonds.
//
// The shapes are SVG so they scale with the card and stay crisp; the colours come from the
// card's own attribute rather than a palette, so a deck defined with different colours draws
// itself correctly without this file knowing about it.

const COLOURS: Record<string, string> = {
  red: '#e5484d',
  green: '#30a46c',
  violet: '#8b5cf6',
  blue: '#3b82f6',
  amber: '#d6af5c',
  slate: '#8b98a5',
};

function Shape({ kind, fill }: { kind: string; fill: string }) {
  const common = { fill, stroke: fill, strokeWidth: 2 };
  if (kind === 'diamond') {
    return <svg viewBox="0 0 40 24" aria-hidden="true"><polygon points="20,2 38,12 20,22 2,12" {...common} /></svg>;
  }
  if (kind === 'squiggle') {
    return (
      <svg viewBox="0 0 40 24" aria-hidden="true">
        <path d="M6 16 C 6 4, 18 4, 22 9 S 34 20, 34 8 C 34 20, 22 20, 18 15 S 6 4, 6 16 Z" {...common} />
      </svg>
    );
  }
  // Default: an oval.
  return <svg viewBox="0 0 40 24" aria-hidden="true"><ellipse cx="20" cy="12" rx="17" ry="10" {...common} /></svg>;
}

/** Reads a card out the way somebody would say it: "two red diamonds". */
export function describeAttrs(attrs: Record<string, string>): string {
  const n = Number(attrs.count ?? '1');
  const shape = attrs.shape ?? 'shape';
  const plural = n === 1 ? shape : `${shape}s`;
  return `${n} ${attrs.colour ?? ''} ${plural}`.replace(/\s+/g, ' ').trim();
}

export function AttrCard({ card }: { card: Card }) {
  const a = card.attrs ?? {};
  const n = Math.max(1, Math.min(5, Number(a.count ?? '1')));
  const fill = COLOURS[a.colour ?? ''] ?? a.colour ?? '#888';

  return (
    <div className="attrcard" data-flight={card.id} role="img" aria-label={describeAttrs(a)}>
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="ac-shape"><Shape kind={a.shape ?? 'oval'} fill={fill} /></span>
      ))}
    </div>
  );
}
