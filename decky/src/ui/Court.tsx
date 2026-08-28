import { SuitShape, SuitId } from './Suit';

// Jacks, queens and kings.
//
// These used to be the letter J, Q or K set enormous in the middle of the card over a pale
// ghost of the suit. That is what a card looks like when nobody has drawn one: the rank is
// already in both corners, so the middle was saying the same thing twice and saying it badly.
//
// A court card is a figure, and a real one is mirrored about the middle — the top half drawn
// and the bottom half the same drawing turned upside down, so it reads either way up in a
// fanned hand. That is exactly how this is built: one <g> of shapes, then the same <g> again
// rotated half a turn about the centre of the panel.
//
// Deliberately geometric rather than a woodcut. At ninety pixels across, detail turns to
// mud; flat shapes with two inks and a gold hold their edges all the way down to a thumbnail.

const GOLD = '#c39a45';
const GOLD_HI = '#e8c877';

/** The half-figure. Everything is drawn inside 0..75 so it can be turned about (50, 75). */
function Half({ rank, suit }: { rank: 'J' | 'Q' | 'K'; suit: SuitId }) {
  return (
    <g>
      {/* the robe */}
      <path d="M18 75V63c0-9 8-15 18-17l14-3 14 3c10 2 18 8 18 17v12z" fill="currentColor" />
      {/* its lining, in the stock colour and trimmed in gold, so the figure is not one flat slab */}
      <path d="M50 45l-13 7 13 23 13-23z" fill="var(--card-bg,#fdfcf7)" />
      <path d="M50 45l-13 7 13 23 13-23z" fill="none" stroke={GOLD} strokeWidth="1.2" />
      <path d="M23 75c1-11 8-17 19-20M77 75c-1-11-8-17-19-20" fill="none" stroke={GOLD}
        strokeWidth="1.3" opacity=".9" />
      {/* the suit worn on the chest */}
      <g transform="translate(43 57) scale(.14)" fill="currentColor" opacity=".85">
        <SuitShape suit={suit} />
      </g>

      {/* head */}
      <circle cx="50" cy="34" r="11" fill="var(--card-bg,#fdfcf7)" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="46" cy="33" r="1.4" fill="currentColor" />
      <circle cx="54" cy="33" r="1.4" fill="currentColor" />
      <path d="M47 39h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" fill="none" />

      {rank === 'K' && (
        <g>
          {/* a beard, which is the only thing that tells a king from a jack at this size */}
          <path d="M39 37c0 9 5 15 11 15s11-6 11-15c0 5-5 8-11 8s-11-3-11-8z" fill="currentColor" opacity=".92" />
          {/* crown */}
          <path d="M36 23l3-11 5 7 6-10 6 10 5-7 3 11z" fill={GOLD} stroke={GOLD_HI} strokeWidth=".9" />
          <rect x="36" y="23" width="28" height="5" rx="1.8" fill={GOLD} stroke={GOLD_HI} strokeWidth=".9" />
          <circle cx="50" cy="25.5" r="1.6" fill="currentColor" />
          {/* sceptre */}
          <rect x="82" y="40" width="2.6" height="35" rx="1.3" fill={GOLD} />
          <circle cx="83.3" cy="36" r="4" fill={GOLD} stroke={GOLD_HI} strokeWidth=".9" />
        </g>
      )}

      {rank === 'Q' && (
        <g>
          {/* hair falling either side */}
          <path d="M38 33c-1-8 4-13 12-13s13 5 12 13c-2-5-6-7-12-7s-10 2-12 7z" fill="currentColor" />
          <path d="M39 35c-3 7-3 13-1 18l-4 1c-3-7-2-14 1-20zM61 35c3 7 3 13 1 18l4 1c3-7 2-14-1-20z"
            fill="currentColor" opacity=".85" />
          {/* coronet */}
          <path d="M39 22c2-6 5-8 11-8s9 2 11 8c-3-2-7-3-11-3s-8 1-11 3z" fill={GOLD} stroke={GOLD_HI} strokeWidth=".9" />
          <circle cx="50" cy="15" r="2.2" fill={GOLD_HI} />
          {/* a flower, held */}
          <rect x="83" y="44" width="2.5" height="31" rx="1.25" fill={GOLD} />
          <g fill={GOLD} stroke={GOLD_HI} strokeWidth=".8">
            <circle cx="84" cy="38" r="3.4" />
            <circle cx="79" cy="41" r="3" />
            <circle cx="89" cy="41" r="3" />
            <circle cx="84" cy="44" r="3" />
          </g>
        </g>
      )}

      {rank === 'J' && (
        <g>
          {/* a cap, worn at an angle, with a feather */}
          <path d="M37 25c1-8 6-12 13-12s12 4 13 12c-4-4-8-6-13-6s-9 2-13 6z" fill="currentColor" />
          <path d="M37 25h26v3.4H37z" fill={GOLD} stroke={GOLD_HI} strokeWidth=".7" />
          <path d="M63 23c5-5 10-8 15-8-3 4-5 8-5 12-3-2-6-3-10-4z" fill={GOLD} stroke={GOLD_HI} strokeWidth=".7" />
          {/* a halberd */}
          <rect x="82" y="36" width="2.4" height="39" rx="1.2" fill={GOLD} />
          <path d="M83.2 27l6 7-6 7-6-7z" fill={GOLD} stroke={GOLD_HI} strokeWidth=".9" />
        </g>
      )}
    </g>
  );
}

export function CourtFigure({ rank, suit }: { rank: 'J' | 'Q' | 'K'; suit: SuitId }) {
  return (
    <svg className="court-svg" viewBox="0 0 100 150" aria-hidden="true" focusable="false"
      preserveAspectRatio="xMidYMid meet">
      <Half rank={rank} suit={suit} />
      <g transform="rotate(180 50 75)"><Half rank={rank} suit={suit} /></g>
      {/* the rule down the middle, which is what makes it read as a court card */}
      <g stroke={GOLD} strokeWidth="1" opacity=".65">
        <path d="M6 73.5h88M6 76.5h88" />
      </g>
    </svg>
  );
}

// The joker's own half-figure, same construction as a court card — mirrored top and bottom
// about the panel centre — but its own character rather than a fourth rank grafted onto the
// same body. A three-point cap stands in for the crown, a grin for the court cards' flat
// mouth, and the one prop every court figure holds out to the side becomes a bauble on a
// stick — a jester's own mock-sceptre — in exactly the king's sceptre position.
//
// Built at the same weight as the crown on purpose: one bold zigzag silhouette rather than a
// woven, curling one. An earlier draft drew the cap as a looping curved ribbon and tiled three
// small diamonds across the collar — striking at card size, mud at thumbnail size, which is
// the one failure mode this whole file exists to avoid (see the header comment above).
function JokerHalf() {
  return (
    <g>
      {/* the collar, scalloped into points rather than the court robe's plain shoulder line */}
      <path d="M19 75V64c0-2 1-4 3-5l7 9 8-10 8 10 8-10 7 9c2 1 3 3 3 5v11z" fill="currentColor" />
      {/* one gold notch at the collar's centre point, the single "motley" accent this palette
          allows rather than a pattern tiled across it */}
      <path d="M46 62l4 6 4-6" fill="none" stroke={GOLD} strokeWidth="1.4" strokeLinecap="round" />
      <path d="M22 75c1-9 7-14 17-16M78 75c-1-9-7-14-17-16" fill="none" stroke={GOLD}
        strokeWidth="1.3" opacity=".9" />

      {/* head */}
      <circle cx="50" cy="34" r="11" fill="var(--card-bg,#fdfcf7)" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="46" cy="33" r="1.4" fill="currentColor" />
      <circle cx="54" cy="33" r="1.4" fill="currentColor" />
      {/* a grin, curved rather than the court cards' flat mouth — the one expression the size
          allows, and enough to read as "amused" rather than the court cards' level gaze */}
      <path d="M44.5 38c3 3.5 8 3.5 11 0" stroke="currentColor" strokeWidth="1.3"
        strokeLinecap="round" fill="none" />

      {/* the three-point cap, built exactly like the crown's zigzag ribbon — same technique,
          three peaks instead of the crown's implied four, a bell at each tip instead of a band */}
      <path d="M35 25l4-13 6 8 5-11 5 11 6-8 4 13z" fill="currentColor" />
      <circle cx="39" cy="12" r="2.6" fill={GOLD} stroke={GOLD_HI} strokeWidth=".8" />
      <circle cx="50" cy="9" r="2.6" fill={GOLD} stroke={GOLD_HI} strokeWidth=".8" />
      <circle cx="61" cy="12" r="2.6" fill={GOLD} stroke={GOLD_HI} strokeWidth=".8" />

      {/* the marotte, held out where every other court figure's one prop goes */}
      <rect x="82" y="40" width="2.6" height="35" rx="1.3" fill={GOLD} />
      <circle cx="83.3" cy="36" r="4" fill="var(--card-bg,#fdfcf7)" stroke={GOLD} strokeWidth="1.1" />
    </g>
  );
}

export function JokerFigure() {
  return (
    <svg className="court-svg" viewBox="0 0 100 150" aria-hidden="true" focusable="false"
      preserveAspectRatio="xMidYMid meet">
      <JokerHalf />
      <g transform="rotate(180 50 75)"><JokerHalf /></g>
      <g stroke={GOLD} strokeWidth="1" opacity=".65">
        <path d="M6 73.5h88M6 76.5h88" />
      </g>
    </svg>
  );
}
