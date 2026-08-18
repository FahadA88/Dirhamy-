import { TableFelt } from '../settings/settings';

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
    // House rules printed straight onto the baize, curving with the table edge. Everything
    // sits in the upper half of the box so it never fights the hand along the bottom.
    return (
      <svg className="dressing vg" viewBox="0 0 1000 400" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        <defs>
          <path id="feltArcName" d="M 255 196 A 300 205 0 0 1 745 196" fill="none" />
          <path id="feltArcRule" d="M 290 240 A 270 185 0 0 1 710 240" fill="none" />
        </defs>
        <path className="vg-rail" d="M 120 140 A 430 300 0 0 1 880 140" />
        <path className="vg-rail thin" d="M 152 156 A 430 300 0 0 1 848 156" />
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
      <svg className="dressing nt" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <path id="neonArc" d="M 262 468 A 300 210 0 0 0 738 468" fill="none" />
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

  // midnight — a single lit ring and nothing else.
  return (
    <svg className="dressing mn" viewBox="0 0 1000 560" preserveAspectRatio="none" aria-hidden="true">
      <ellipse className="mn-ring" cx="500" cy="280" rx="474" ry="256" />
      <ellipse className="mn-ring faint" cx="500" cy="280" rx="452" ry="236" />
    </svg>
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
