import { TableFelt } from '../settings/settings';

const SEASON_N = 16;
const SEASON_GLYPH: Record<'snow' | 'leaves', string> = { snow: '❄', leaves: '🍂' };

/** A slow scatter of snow or leaves over the felt — see FeltDust just below for the same
 *  deterministic-spread trick, so a re-render never reshuffles where anything is falling. */
export function SeasonalDrift({ kind }: { kind: 'snow' | 'leaves' }) {
  const glyph = SEASON_GLYPH[kind];
  return (
    <div className="season-layer" aria-hidden="true">
      {Array.from({ length: SEASON_N }, (_, i) => {
        const left = (i * 6.4 + (i % 4) * 9) % 100;
        const delay = (i * 1.3) % 10;
        const dur = 7 + (i % 6) * 1.8;
        const drift = 16 + (i % 5) * 8;
        const size = 10 + (i % 3) * 4;
        return (
          <span
            key={i}
            className="season-flake"
            style={{
              ['--sx' as string]: `${left}%`,
              ['--sdelay' as string]: `${delay}s`,
              ['--sdur' as string]: `${dur}s`,
              ['--sdrift' as string]: `${drift}px`,
              fontSize: size,
            }}
          >
            {glyph}
          </span>
        );
      })}
    </div>
  );
}

/*
  Shared furniture for the cloths drawn below.

  Every table is the same box — the felt, stretched to whatever size it is — and every name
  sits on the same curve inside it, so a game reads in the same place whichever table you
  chose. The arc gets a per-table id because two of these can be on the page at once (the
  table itself, and a swatch of another one in Preferences). They are all the same curve, so
  a duplicate id costs nothing — every one of them resolves to the same geometry.
*/
const BOX = '0 0 1000 560';
const SVG = 'dressing dr';

function NameArc() {
  return <path id="drNameArc" d="M 262 232 A 300 210 0 0 1 738 232" fill="none" />;
}

function Name({ title, className, y }: { title: string; className: string; y?: number }) {
  // A straight line where the mat asks for one, the shared curve everywhere else.
  if (y !== undefined) {
    return <text className={className} x="500" y={y} textAnchor="middle">{title.toUpperCase()}</text>;
  }
  return (
    <text className={className}>
      <textPath href="#drNameArc" startOffset="50%" textAnchor="middle">{title.toUpperCase()}</textPath>
    </text>
  );
}

// The furniture on each table build — the things that make it read as a real table rather
// than a coloured box. Purely decorative: absolutely positioned over the felt, never
// interactive, never in the accessibility tree.
export function TableDressing({ felt, title }: { felt: TableFelt; title: string }) {
  if (felt === 'mahogany') {
    // A hard overhead light falling across the cloth. The drink wells belong to the rail and
    // are drawn separately, above everything.
    return <div className="dressing mh" aria-hidden="true"><span className="spot" /></div>;
  }

  if (felt === 'vegas') {
    /*
      House rules printed straight onto the baize, curving with the table edge.

      The box used to be 1000x400 fitted into the felt with `meet`, which centred it — so
      whatever height the felt happened to be, the printing landed across the middle and the
      rule line ran through the row of seat names under the trick. It maps 1:1 onto the felt
      now, like every other cloth, and the printing sits in the upper third: under the ring of
      seats, above the cards, and never behind the hand.
    */
    return (
      <svg className="dressing vg" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          {/* The name sits in the middle of the cloth, where a house prints its own — behind
              the trick while one is out, and readable the rest of the time. The rule line is
              flavour, so it goes up under the rail where a seat panel may cross it. */}
          <path id="feltArcName" d="M 255 300 A 300 205 0 0 1 745 300" fill="none" />
          <path id="feltArcRule" d="M 290 196 A 270 185 0 0 1 710 196" fill="none" />
        </defs>
        <path className="vg-rail" d="M 120 136 A 430 300 0 0 1 880 136" />
        <path className="vg-rail thin" d="M 152 152 A 430 300 0 0 1 848 152" />
        <text className="vg-name">
          <textPath href="#feltArcName" startOffset="50%" textAnchor="middle">{title.toUpperCase()}</textPath>
        </text>
        <text className="vg-rule">
          <textPath href="#feltArcRule" startOffset="50%" textAnchor="middle">
            DEALER PLAYS THE RULES · THE HOUSE KEEPS NONE
          </textPath>
        </text>
      </svg>
    );
  }

  if (felt === 'neon') {
    // The house table: a lit ring around the middle and the game's name burnt into the cloth
    // above it, the way the sign outside spells it.
    return (
      /*
        The name used to arc along the BOTTOM of the ring, at 84% of the way down the cloth —
        which is where the hand is. Half of every letter was behind a card and the other half
        read as a scuff. It hangs off the top of the ring now, where the only thing that ever
        reaches is a seat panel, and that is translucent.
      */
      <svg className="dressing nt" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <path id="neonArc" d="M 262 232 A 300 210 0 0 1 738 232" fill="none" />
        </defs>
        <ellipse className="nt-ring" cx="500" cy="290" rx="466" ry="250" />
        <ellipse className="nt-ring faint" cx="500" cy="290" rx="440" ry="228" />
        <text className="nt-name">
          <textPath href="#neonArc" startOffset="50%" textAnchor="middle">{title.toUpperCase()}</textPath>
        </text>
      </svg>
    );
  }

  if (felt === 'parlour') {
    // Chalked onto the cloth: the table's own outline and a centre ring. Drawn in CSS so it
    // scales with the table instead of stretching with a viewBox.
    return <div className="dressing pl" aria-hidden="true"><span className="pl-ring" /></div>;
  }

  /*
    The nine later cloths.

    Every one of them shipped with a full set of tokens — a rail, a baize, ink colours that
    read on it — and then fell through to the midnight ring, so nine different tables all had
    the same single ellipse printed on them and none of them said what game you were playing.
    Each one now carries a mark drawn from its own material: scored joints in the concrete, a
    specular sweep across the glass, rivets in the zinc, chalk on the chalkboard.

    They share a band. `NAME_ARC` is the same curve the neon cloth uses — under the ring of
    seats, above whatever the game puts in the middle — so a name lands in the same place on
    every table, and the marks themselves stay clear of the hand along the bottom.
  */
  if (felt === 'concrete') {
    // A poured slab: scored expansion joints, and the name stencilled between them.
    return (
      <svg className={SVG} viewBox={BOX} preserveAspectRatio="none" aria-hidden="true">
        <defs><NameArc /></defs>
        <g className="dr-line">
          <path d="M 0 118 H 1000" /><path d="M 0 470 H 1000" />
          <path d="M 214 0 V 560" /><path d="M 786 0 V 560" />
        </g>
        <Name className="dr-name stencil" title={title} />
      </svg>
    );
  }

  if (felt === 'darkglass') {
    // One long reflection travelling across the sheet, and an etched hairline under it.
    return (
      <svg className={SVG} viewBox={BOX} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <NameArc />
          <linearGradient id="dgSweep" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fff" stopOpacity="0" />
            <stop offset="42%" stopColor="#fff" stopOpacity=".085" />
            <stop offset="52%" stopColor="#fff" stopOpacity=".13" />
            <stop offset="62%" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="1000" height="560" fill="url(#dgSweep)" />
        <path className="dr-line" d="M 40 300 H 960" />
        <Name className="dr-name" title={title} />
      </svg>
    );
  }

  if (felt === 'papermat') {
    // A printed play mat: a boxed play area with corner ticks, name set into the top rule.
    return (
      <svg className={SVG} viewBox={BOX} preserveAspectRatio="none" aria-hidden="true">
        <defs><NameArc /></defs>
        <g className="dr-line">
          <rect x="34" y="30" width="932" height="500" rx="6" fill="none" />
          <path d="M 34 96 H 386 M 614 96 H 966" />
          <path d="M 74 30 V 62 M 926 30 V 62 M 74 530 V 498 M 926 530 V 498" />
        </g>
        <Name className="dr-name serif" title={title} y={104} />
      </svg>
    );
  }

  if (felt === 'velvet') {
    // A gold oval debossed into the pile, with the name inside it.
    return (
      <svg className={SVG} viewBox={BOX} preserveAspectRatio="none" aria-hidden="true">
        <defs><NameArc /></defs>
        <ellipse className="dr-line gold" cx="500" cy="292" rx="392" ry="212" />
        <ellipse className="dr-line gold faint" cx="500" cy="292" rx="374" ry="196" />
        <Name className="dr-name gold" title={title} />
      </svg>
    );
  }

  if (felt === 'marble') {
    // Two brass rings inlaid into the stone.
    return (
      <svg className={SVG} viewBox={BOX} preserveAspectRatio="none" aria-hidden="true">
        <defs><NameArc /></defs>
        <ellipse className="dr-line brass" cx="500" cy="290" rx="410" ry="222" />
        <ellipse className="dr-line brass thin" cx="500" cy="290" rx="398" ry="212" />
        <Name className="dr-name brass" title={title} />
      </svg>
    );
  }

  if (felt === 'zinc') {
    // A riveted band across the top, the way a zinc counter is fixed down.
    return (
      <svg className={SVG} viewBox={BOX} preserveAspectRatio="none" aria-hidden="true">
        <defs><NameArc /></defs>
        <g className="dr-line">
          <path d="M 0 108 H 1000" /><path d="M 0 132 H 1000" />
        </g>
        <g className="dr-rivet">
          {[60, 160, 260, 360, 460, 560, 660, 760, 860, 960].map((x) => (
            <circle key={x} cx={x} cy="120" r="4.5" />
          ))}
        </g>
        <Name className="dr-name" title={title} />
      </svg>
    );
  }

  if (felt === 'litedges') {
    // The light is in the edge, so the mark is an inset of the same edge.
    return (
      <svg className={SVG} viewBox={BOX} preserveAspectRatio="none" aria-hidden="true">
        <defs><NameArc /></defs>
        <rect className="dr-line lit" x="26" y="20" width="948" height="520" rx="14" fill="none" />
        <rect className="dr-line lit faint" x="44" y="34" width="912" height="492" rx="10" fill="none" />
        <Name className="dr-name lit" title={title} />
      </svg>
    );
  }

  if (felt === 'chalkboard') {
    // Drawn on in chalk, including the wobble: two passes of the same ring, slightly apart.
    return (
      <svg className={SVG} viewBox={BOX} preserveAspectRatio="none" aria-hidden="true">
        <defs><NameArc /></defs>
        <ellipse className="dr-line chalk" cx="500" cy="288" rx="404" ry="218" />
        <ellipse className="dr-line chalk faint" cx="503" cy="292" rx="399" ry="213" />
        <Name className="dr-name chalk" title={title} />
      </svg>
    );
  }

  if (felt === 'studio') {
    // A design canvas: a bounding rule and a centre mark, and nothing else at all.
    return (
      <svg className={SVG} viewBox={BOX} preserveAspectRatio="none" aria-hidden="true">
        <defs><NameArc /></defs>
        <g className="dr-line">
          <rect x="40" y="34" width="920" height="492" fill="none" />
          <path d="M 470 290 H 530 M 500 260 V 320" />
        </g>
        <Name className="dr-name mono" title={title} />
      </svg>
    );
  }

  // midnight, and any cloth a player has supplied themselves — a single lit ring.
  return (
    <svg className="dressing mn" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
      <ellipse className="mn-ring" cx="500" cy="280" rx="474" ry="256" />
      <ellipse className="mn-ring faint" cx="500" cy="280" rx="452" ry="236" />
    </svg>
  );
}

const DUST_N = 12;

// Motes of light, drifting up off the cloth. Purely atmospheric — deterministic per index for
// the same reason Confetti's positions are, so a re-render does not restart every mote at a
// new, jarring spot.
export function FeltDust() {
  return (
    <div className="felt-dust" aria-hidden="true">
      {Array.from({ length: DUST_N }, (_, i) => {
        const left = (i * 8.3 + (i % 3) * 11) % 100;
        const delay = (i * 1.7) % 9;
        const dur = 9 + (i % 5) * 2.2;
        const size = 2 + (i % 3);
        return (
          <span
            key={i}
            style={{
              left: `${left}%`, width: size, height: size,
              animationDelay: `${delay}s`, animationDuration: `${dur}s`,
            }}
          />
        );
      })}
    </div>
  );
}

// Chrome drink wells set into the rail — rail furniture, so it sits above the cloth.
export function TableRail({ felt }: { felt: TableFelt }) {
  if (felt !== 'mahogany') return null;
  return (
    <div className="rail-furniture" aria-hidden="true">
      {[14, 32, 50, 68, 86].map((x) => <span key={`t${x}`} className="well top" style={{ left: `${x}%` }} />)}
      {[24, 50, 76].map((x) => <span key={`b${x}`} className="well bottom" style={{ left: `${x}%` }} />)}
    </div>
  );
}
