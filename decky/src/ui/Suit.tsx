// The suits, drawn.
//
// They used to be the Unicode characters ♠ ♥ ♦ ♣ set in whatever the system had lying about,
// which is why the deck looked like a spreadsheet: the shapes changed between machines, the
// weights did not match each other, and none of them was designed to sit on a card. These are
// paths on a 100×100 box, so they are the same everywhere, they scale to any size without
// going soft, and they take their colour from the text colour like the glyphs did.

export type SuitId = 'S' | 'H' | 'D' | 'C' | 'JOKER';

/** The shape only — no <svg> wrapper, so it can be dropped into a bigger drawing. */
export function SuitShape({ suit }: { suit: SuitId }) {
  switch (suit) {
    case 'H':
      return (
        <path d="M50 92C22 71 9 57 9 40 9 26 19 15 32 15c9 0 15 4 18 11 3-7 9-11 18-11
                 13 0 23 11 23 25 0 17-13 31-41 52z" />
      );
    case 'D':
      return <path d="M50 5 90 50 50 95 10 50z" />;
    case 'S':
      return (
        <path d="M50 6C31 28 11 40 11 57c0 12 9 21 21 21 6 0 11-2 14-6-1 10-6 16-14 20v3h36v-3
                 c-8-4-13-10-14-20 3 4 8 6 14 6 12 0 21-9 21-21C89 40 69 28 50 6z" />
      );
    case 'C':
      return (
        <g>
          <circle cx="50" cy="27" r="18" />
          <circle cx="27" cy="59" r="18" />
          <circle cx="73" cy="59" r="18" />
          <path d="M44 55h12c0 16 2 26 10 33v3H34v-3c8-7 10-17 10-33z" />
        </g>
      );
    default:
      return (
        <path d="M50 6l11 27 29 2-22 19 7 29-25-16-25 16 7-29-22-19 29-2z" />
      );
  }
}

// Worklist: "a hand-drawn custom suit-glyph set matching the joker's illustrated style." Court.tsx
// built that style already — flat currentColor shapes with a vein of gold ink through them,
// rather than a bare woodcut silhouette — so this reuses its exact same two inks rather than
// inventing a third palette for one more mark. Same silhouette as the plain suit above, offered
// as a choice (Settings → illustratedSuits) rather than in place of it, the way a card back or a
// table cloth is offered: nobody who liked the plain mark loses it.
const GOLD = '#c39a45';
const GOLD_HI = '#e8c877';

/** The illustrated shape only — no <svg> wrapper, same contract as SuitShape above. */
export function IllustratedSuitShape({ suit }: { suit: SuitId }) {
  switch (suit) {
    case 'H':
      return (
        <g>
          <path d="M50 92C22 71 9 57 9 40 9 26 19 15 32 15c9 0 15 4 18 11 3-7 9-11 18-11
                   13 0 23 11 23 25 0 17-13 31-41 52z" />
          <path d="M50 80c-18-15-28-27-28-38 0-8 5-15 13-15 6 0 10 3 12 8"
            fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" opacity=".85" />
        </g>
      );
    case 'D':
      return (
        <g>
          <path d="M50 5 90 50 50 95 10 50z" />
          <path d="M50 20 76 50 50 80" fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" opacity=".85" />
        </g>
      );
    case 'S':
      return (
        <g>
          <path d="M50 6C31 28 11 40 11 57c0 12 9 21 21 21 6 0 11-2 14-6-1 10-6 16-14 20v3h36v-3
                   c-8-4-13-10-14-20 3 4 8 6 14 6 12 0 21-9 21-21C89 40 69 28 50 6z" />
          <path d="M50 19c-13 16-26 26-26 38 0 8 6 14 14 14"
            fill="none" stroke={GOLD} strokeWidth="2.4" strokeLinecap="round" opacity=".85" />
          <path d="M50 47l-11 6 11 20 11-20z" fill="none" stroke={GOLD_HI} strokeWidth="1.6" opacity=".75" />
        </g>
      );
    case 'C':
      return (
        <g>
          <circle cx="50" cy="27" r="18" />
          <circle cx="27" cy="59" r="18" />
          <circle cx="73" cy="59" r="18" />
          <path d="M44 55h12c0 16 2 26 10 33v3H34v-3c8-7 10-17 10-33z" />
          <circle cx="44" cy="21" r="3.6" fill={GOLD} opacity=".85" />
          <circle cx="21" cy="53" r="3.6" fill={GOLD} opacity=".85" />
          <circle cx="67" cy="53" r="3.6" fill={GOLD} opacity=".85" />
        </g>
      );
    default:
      // The joker's own figure already carries the illustrated style; a plain mark stands in
      // wherever a bare joker glyph is asked for on its own.
      return <SuitShape suit={suit} />;
  }
}

/** A suit on its own, sized by CSS. `illustrated` swaps in the joker-style linework version —
 *  same silhouette, same colour contract, one gold vein added. */
export function Suit({ suit, className, illustrated }: { suit: SuitId; className?: string; illustrated?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 100 100" fill="currentColor" aria-hidden="true"
      focusable="false" preserveAspectRatio="xMidYMid meet">
      {illustrated ? <IllustratedSuitShape suit={suit} /> : <SuitShape suit={suit} />}
    </svg>
  );
}
