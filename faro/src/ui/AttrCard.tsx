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

// Trio finding: "worth confirming shape alone always disambiguates the three colours for
// red-green colourblind players" — it doesn't, since colour and shape are independent
// attributes and two cards can differ only in colour. Checked empirically by running red,
// green and violet through the same protanopia/deuteranopia feColorMatrix values App.tsx uses
// for the colour-vision preview: the original green (#30a46c) put red-vs-green at 0.39-0.53
// (of a max ~1.73 in normalised RGB) — roughly half its 0.81 distance under ordinary vision,
// and no better separated from violet than from red. This teal-shifted green raises red-vs-
// green to 0.53-0.70 under the same two filters, and green-vs-violet along with it, while also
// reading slightly better against the card's own cream background (3.28:1 vs 2.75:1).
const COLOURS: Record<string, string> = {
  red: '#e5484d',
  green: '#059669',
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
