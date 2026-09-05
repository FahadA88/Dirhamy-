import { RedactedState } from '../engine/types';

// The pad beside the table.
//
// A row of pills reading "Bot 2 · 14" is a status bar. What a card table actually has is a pad
// of ruled paper with a column per player and a row per hand, written in pencil, with the
// running total underlined at the bottom — and it is better information, not just better
// dressing: you can see at a glance who had the bad hand and who has been quietly collecting.
//
// The rows come from the service (`view.handScores`), not from watching the running total
// change, so reloading mid-match brings the whole pad back rather than starting a fresh sheet.

export function ScorePad({ view, me, nameOf, lowWins }: {
  view: RedactedState;
  me: string;
  nameOf: (id: string) => string;
  /** True when the game is a race away from points rather than towards them — Hearts, mainly. */
  lowWins: boolean;
}) {
  const players = view.players.map((p) => p.id);
  const rows = view.handScores ?? [];
  const target = view.matchTarget;
  const highest = view.matchWinner == null ? null : view.matchWinner;

  // Whoever is closest to winning is underlined. Which end is "closest" depends on the game:
  // most of these race up to a target, Hearts races away from one.
  const leader = players.length === 0 ? null : players.reduce((best, p) => {
    const a = view.matchScores?.[p] ?? 0;
    const b = view.matchScores?.[best] ?? 0;
    return (lowWins ? a < b : a > b) ? p : best;
  }, players[0]);

  // Column heads: a pad column is three characters wide, not "Bot 2 (you)". A short name is
  // left alone — "You" reads as a word, "YO" reads as a typo — and anything longer collapses
  // the way a person writing it down would: first letter, then the number or second initial.
  const head = (id: string) => {
    const n = nameOf(id).replace(/\s*\(you\)$/, '').trim();
    if (n.length <= 3) return n;
    const words = n.split(/\s+/);
    if (words.length > 1) return words[0][0].toUpperCase() + words[words.length - 1][0].toUpperCase();
    return n.slice(0, 3);
  };

  return (
    <aside className="scorepad" aria-label="Score pad">
      <div className="sp-clip" aria-hidden="true" />
      <div className="sp-sheet">
        <div className="sp-title">
          <span>Hand {view.handNumber}</span>
          {target != null && <em>to {target}</em>}
        </div>

        <table className="sp-table">
          <thead>
            <tr>
              <th scope="col" className="sp-rowhead"><span className="sr-only">Hand</span></th>
              {players.map((p) => (
                <th key={p} scope="col" className={p === me ? 'mine' : ''} title={nameOf(p)}>
                  {head(p)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr className="sp-blank">
                <td className="sp-rowhead">1</td>
                {players.map((p) => <td key={p}>·</td>)}
              </tr>
            )}
            {rows.map((row, i) => (
              <tr key={i}>
                <td className="sp-rowhead">{i + 1}</td>
                {players.map((p) => (
                  <td key={p} className={p === me ? 'mine' : ''}>
                    {row[p] === 0 ? '—' : row[p]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="sp-rowhead">Σ</td>
              {players.map((p) => (
                <td key={p} className={`sp-total ${p === me ? 'mine' : ''} ${p === leader ? 'ahead' : ''}`}>
                  {view.matchScores?.[p] ?? 0}
                </td>
              ))}
            </tr>
          </tfoot>
        </table>

        {highest && <div className="sp-won">{nameOf(highest)} wins</div>}
      </div>
    </aside>
  );
}
