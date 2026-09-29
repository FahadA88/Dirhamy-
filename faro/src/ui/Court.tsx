import { SuitShape, IllustratedSuitShape, SuitId } from './Suit';

// Jacks, queens and kings.
//
// A court card is a figure mirrored about the middle, so it reads either way up in a fanned
// hand: one <g> of shapes, then the same <g> turned half a turn about the centre of the panel.
//
// Everything is drawn inside y 0..70 and turned about (50, 75). The ten units either side of
// the midline are deliberately empty. The previous draft drew each half down to y=75, so the
// two robes met edge to edge and the figure came out as a single dark oval with the gold rule
// — the one thing that makes a card read as a court card — buried inside it.
//
// Deliberately geometric rather than a woodcut: at ninety pixels across, detail turns to mud.
// Three stroke weights only, so the drawing loses its parts in a deliberate order as it
// shrinks rather than a ragged one.
const W_MAIN = 1.6;   // silhouette and head
const W_SECOND = 1;   // costume linework
const W_DETAIL = 0.7; // gilt trim

const GOLD = '#c39a45';
const GOLD_HI = '#e8c877';
const STOCK = 'var(--card-bg,#fdfcf7)';

/** The head. An oval with a jaw and a neck, not a circle with two dots — that is what made the
 *  old figure read as a snowman balanced on a mound. */
function Head({ mouth }: { mouth?: boolean }) {
  return (
    <g>
      {/* neck, so the head joins the shoulders instead of floating above them */}
      <path d="M45.5 44h9v7h-9z" fill="currentColor" opacity=".55" />
      <path d="M50 23c6 0 10.5 4.2 10.5 10.2v4.6c0 7.2-4.6 12.4-10.5 12.4s-10.5-5.2-10.5-12.4v-4.6
               C39.5 27.2 44 23 50 23z"
        fill={STOCK} stroke="currentColor" strokeWidth={W_MAIN} strokeLinejoin="round" />
      <ellipse cx="45.8" cy="34" rx="1.15" ry="1.5" fill="currentColor" />
      <ellipse cx="54.2" cy="34" rx="1.15" ry="1.5" fill="currentColor" />
      <path d="M50 35.6v3.4" stroke="currentColor" strokeWidth={W_SECOND} strokeLinecap="round" fill="none" />
      {mouth !== false && (
        <path d="M46.8 42h6.4" stroke="currentColor" strokeWidth={W_SECOND} strokeLinecap="round" fill="none" />
      )}
    </g>
  );
}

/** The shoulders and body, shared by all three. Narrow at the collar, wide at the hem. */
function Robe() {
  return (
    <path d="M22 70v-8c0-7 6-12 14-14l6-2h16l6 2c8 2 14 7 14 14v8z" fill="currentColor" />
  );
}

/** An arm reaching out to the right, and the hand that holds the prop. Without these the
 *  sceptre was a gold stick standing beside the figure with nothing attached to it. */
function ArmAndHand() {
  return (
    <g>
      <path d="M63 50c7 .5 12.5 3.5 15 8.5l-5.2 2.8c-1.8-3.6-5.6-5.6-10.6-6z" fill="currentColor" />
      <rect x="73.8" y="56.2" width="9.8" height="7" rx="3.2" fill={STOCK} stroke="currentColor" strokeWidth={W_SECOND} />
    </g>
  );
}

/** The prop's shaft, running through the hand. Each rank caps it differently. */
function Shaft() {
  return <rect x="77.3" y="26" width="2.6" height="44" rx="1.3" fill={GOLD} />;
}

/** The half-figure. Everything sits inside y 0..70 so it can be turned about (50, 75). */
function Half({ rank, suit, illustrated }: { rank: 'J' | 'Q' | 'K'; suit: SuitId; illustrated?: boolean }) {
  return (
    <g>
      <Robe />

      {/* Costume, flanking the chest suit rather than running under it — this is where the
          three ranks are actually told apart at card size, not by the hat. The king is the
          heaviest in gold, the queen the lightest, the jack the plainest. */}
      {/* The placket down the front, which is where the three ranks are actually told apart
          at card size — not by the hat, which is four pixels tall on a phone. An earlier draft
          flanked the chest with two panels instead; mirrored, the four of them closed into a
          white ring through the middle of the card that read as a letter O. */}
      {rank === 'J' && (
        // a baldric, crossing the robe under the placket
        <path d="M37.5 50.5l-5.5 4.5 15 19 5-4z" fill={GOLD} opacity=".9" />
      )}
      <path d="M50 48.5l7.5 3.5v18h-15v-18z" fill={STOCK} stroke={GOLD} strokeWidth={W_SECOND} strokeLinejoin="round" />
      {rank === 'K' && (
        <g stroke={GOLD} strokeWidth={W_DETAIL} fill="none" opacity=".9">
          <path d="M44.6 53.5v15.5M55.4 53.5v15.5M43.4 55.5h13.2" />
        </g>
      )}
      {rank === 'Q' && (
        <path d="M42.5 68l2.5 2.6 2.5-2.6 2.5 2.6 2.5-2.6 2.5 2.6 2.5-2.6" fill="none"
          stroke={GOLD} strokeWidth={W_DETAIL} strokeLinejoin="round" opacity=".9" />
      )}

      {/* the suit worn on the chest — the one mark that says what suit the card is, so it sits
          on top of the costume rather than half-hidden behind a panel of it */}
      <g transform="translate(44.3 54.3) scale(.115)" fill="currentColor">
        {illustrated ? <IllustratedSuitShape suit={suit} /> : <SuitShape suit={suit} />}
      </g>

      <ArmAndHand />
      <Shaft />
      <Head mouth={rank !== 'K'} />

      {rank === 'K' && (
        <g>
          {/* a full beard, which is what separates a king from a jack at a glance */}
          <path d="M39.5 36.5c0 9.5 4.7 16.5 10.5 16.5s10.5-7 10.5-16.5c-1.2 4.2-5.2 6.8-10.5 6.8
                   s-9.3-2.6-10.5-6.8z" fill="currentColor" />
          <path d="M45.5 40.5h9" stroke={STOCK} strokeWidth={W_SECOND} strokeLinecap="round" fill="none" opacity=".5" />
          {/* crown */}
          <path d="M36 19.5l1.5-13.5 5.5 6.5 7-9.5 7 9.5 5.5-6.5 1.5 13.5z" fill={GOLD} stroke={GOLD_HI} strokeWidth={W_DETAIL} />
          <rect x="35.6" y="19.5" width="28.8" height="5" rx="1.8" fill={GOLD} stroke={GOLD_HI} strokeWidth={W_DETAIL} />
          <circle cx="43" cy="22" r="1.3" fill="currentColor" />
          <circle cx="50" cy="22" r="1.3" fill="currentColor" />
          <circle cx="57" cy="22" r="1.3" fill="currentColor" />
          {/* the orb the sceptre carries */}
          <circle cx="78.6" cy="21.5" r="4.4" fill={GOLD} stroke={GOLD_HI} strokeWidth={W_DETAIL} />
          <path d="M78.6 14.5v3.2" stroke={GOLD} strokeWidth={W_SECOND} strokeLinecap="round" />
        </g>
      )}

      {rank === 'Q' && (
        <g>
          {/* hair, falling either side of the face */}
          <path d="M38.8 33c-1-8.5 4.2-13.8 11.2-13.8s12.2 5.3 11.2 13.8c-2.2-5.2-6.2-7.4-11.2-7.4
                   s-9 2.2-11.2 7.4z" fill="currentColor" />
          <path d="M38.6 35.5c-3.6 8-3.6 14.2-1.6 19.5l-4.6 1.2c-3-7.4-2.4-14.8 1.2-21.5z
                   M61.4 35.5c3.6 8 3.6 14.2 1.6 19.5l4.6 1.2c3-7.4 2.4-14.8-1.2-21.5z"
            fill="currentColor" opacity=".9" />
          {/* a pearl coronet rather than a crown */}
          <path d="M38.8 20.5c2-6.2 5.6-8.8 11.2-8.8s9.2 2.6 11.2 8.8c-3.2-2.2-7.2-3.2-11.2-3.2
                   s-8 1-11.2 3.2z" fill={GOLD} stroke={GOLD_HI} strokeWidth={W_DETAIL} />
          <circle cx="43" cy="15.5" r="1.7" fill={GOLD_HI} />
          <circle cx="50" cy="13.4" r="2" fill={GOLD_HI} />
          <circle cx="57" cy="15.5" r="1.7" fill={GOLD_HI} />
          {/* a rose, held */}
          <g fill={GOLD} stroke={GOLD_HI} strokeWidth={W_DETAIL}>
            <circle cx="78.6" cy="21.5" r="3.4" />
            <circle cx="74.4" cy="24.2" r="2.8" />
            <circle cx="82.8" cy="24.2" r="2.8" />
            <circle cx="78.6" cy="26.6" r="2.8" />
          </g>
        </g>
      )}

      {rank === 'J' && (
        <g>
          {/* a soft cap set at an angle, with a feather */}
          <path d="M37 24.5c.5-8.2 6-12.8 13-12.8s12.5 4.6 13 12.8c-4-4.4-8-6.4-13-6.4s-9 2-13 6.4z"
            fill="currentColor" />
          <path d="M36.6 24.5h26.8v3.6H36.6z" fill={GOLD} stroke={GOLD_HI} strokeWidth={W_DETAIL} />
          <path d="M63.4 22.4c5.4-5.6 10.8-8.6 15.8-8.6-3.2 4.2-5 8.6-5 12.8-3.2-2.2-6.4-3.6-10.8-4.2z"
            fill={GOLD} stroke={GOLD_HI} strokeWidth={W_DETAIL} />
          {/* a halberd */}
          <path d="M78.6 12.8l6.6 7.6-6.6 7.6-6.6-7.6z" fill={GOLD} stroke={GOLD_HI} strokeWidth={W_DETAIL} />
        </g>
      )}
    </g>
  );
}

/** The double rule down the middle, drawn in the gap the two halves leave for it. */
function Midline() {
  return (
    <g stroke={GOLD} strokeWidth={W_SECOND} opacity=".75">
      <path d="M8 73.5h84M8 76.5h84" />
    </g>
  );
}

export function CourtFigure({ rank, suit, illustrated }: { rank: 'J' | 'Q' | 'K'; suit: SuitId; illustrated?: boolean }) {
  return (
    <svg className="court-svg" viewBox="0 0 100 150" aria-hidden="true" focusable="false"
      preserveAspectRatio="xMidYMid meet">
      <Half rank={rank} suit={suit} illustrated={illustrated} />
      <g transform="rotate(180 50 75)"><Half rank={rank} suit={suit} illustrated={illustrated} /></g>
      <Midline />
    </svg>
  );
}

// The joker's own half-figure, built the same way but its own character rather than a fourth
// rank grafted onto the same body: a scalloped motley collar in place of the court robe's plain
// shoulder line, a three-point belled cap in place of the crown, a grin in place of the court
// cards' level mouth, and a marotte — a jester's mock-sceptre — in the hand where a king holds
// his real one.
//
// Built at the crown's weight on purpose: one bold zigzag silhouette rather than a woven,
// curling one. An earlier draft drew the cap as a looping ribbon and tiled small diamonds
// across the collar — striking at card size, mud at thumbnail size, which is the one failure
// mode this whole file exists to avoid.
function JokerHalf() {
  return (
    <g>
      {/* The same shoulders as the courts. An earlier draft scalloped the hem into points,
          which put a jagged edge exactly where the mirrored halves come closest and turned the
          middle of the card into a black scribble. The motley lives on the collar and the cap
          instead, well away from the midline. */}
      <Robe />
      <path d="M38 50l4 5 4-5 4 5 4-5 4 5 4-5" fill="none" stroke={GOLD}
        strokeWidth={W_SECOND} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="42" cy="59" r="1.9" fill={GOLD} />
      <circle cx="50" cy="63" r="1.9" fill={GOLD} />
      <circle cx="58" cy="59" r="1.9" fill={GOLD} />
      <path d="M31 70c1-7.5 5.5-12 13-14M69 70c-1-7.5-5.5-12-13-14" fill="none"
        stroke={GOLD} strokeWidth={W_DETAIL} opacity=".85" />

      <ArmAndHand />
      <Shaft />
      <Head mouth={false} />
      {/* a grin — the one expression this size allows, and enough to read as amused rather
          than the court cards' level gaze */}
      <path d="M45.4 40c2.6 3.2 6.6 3.2 9.2 0" stroke="currentColor" strokeWidth={W_SECOND}
        strokeLinecap="round" fill="none" />

      {/* the three-point cap, built like the crown's zigzag — three peaks, a bell at each tip */}
      <path d="M35.5 22.5l4-13 6 8 4.5-11 4.5 11 6-8 4 13z" fill="currentColor" />
      <circle cx="39.5" cy="9.5" r="2.6" fill={GOLD} stroke={GOLD_HI} strokeWidth={W_DETAIL} />
      <circle cx="50" cy="6.5" r="2.6" fill={GOLD} stroke={GOLD_HI} strokeWidth={W_DETAIL} />
      <circle cx="60.5" cy="9.5" r="2.6" fill={GOLD} stroke={GOLD_HI} strokeWidth={W_DETAIL} />

      {/* the marotte's own little head, on the end of the stick */}
      <circle cx="78.6" cy="21.5" r="4.2" fill={STOCK} stroke={GOLD} strokeWidth={W_SECOND} />
      <circle cx="77" cy="20.8" r=".8" fill={GOLD} />
      <circle cx="80.2" cy="20.8" r=".8" fill={GOLD} />
      <path d="M76.8 23.4c1.2 1.4 2.4 1.4 3.6 0" fill="none" stroke={GOLD} strokeWidth={W_DETAIL} strokeLinecap="round" />
    </g>
  );
}

export function JokerFigure() {
  return (
    <svg className="court-svg" viewBox="0 0 100 150" aria-hidden="true" focusable="false"
      preserveAspectRatio="xMidYMid meet">
      <JokerHalf />
      <g transform="rotate(180 50 75)"><JokerHalf /></g>
      <Midline />
    </svg>
  );
}
