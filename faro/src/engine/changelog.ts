// Worklist #91: "Rules are data and the data changes. Nothing records that a game plays
// differently this week." This is that record — but only for changes that actually affect how
// a game plays: a new game, a rules fix, a scoring change. Not every visual or interface change,
// and not a restatement of a commit message to sound bigger than it was. Each entry is real,
// drawn from this repository's own history rather than invented for the occasion.
export interface ChangelogEntry {
  date: string;   // YYYY-MM-DD
  summary: string;
}

export const ENGINE_CHANGELOG: ChangelogEntry[] = [
  { date: '2026-08-27', summary: 'Fixed a custom highest/lowest-score rule always crowning the same seat on an exact tie.' },
  { date: '2026-08-27', summary: 'A passed-out contract auction no longer always names the same seat winner.' },
  { date: '2026-08-27', summary: "Euchre's stick-the-dealer no longer always names the same trump suit." },
  { date: '2026-08-27', summary: 'Hint and the post-move advisor no longer draw from stale randomness.' },
  { date: '2026-08-27', summary: 'Poker no longer reveals hole cards when a hand ends by folding rather than a real showdown.' },
  { date: '2026-08-27', summary: 'Kent and Pit can no longer be stalled open forever, and a 6-player Kent round could credit the wrong partnership.' },
  { date: '2026-08-27', summary: 'Fixed Dutch and Kent occasionally trading with the wrong card slot.' },
  { date: '2026-08-27', summary: 'Fixed the dealer and opening lead sticking on the same seat every hand in Briscola, Sixty-Six, Black Maria, Pinochle, Whist, Spades and Oh Hell.' },
  { date: '2026-08-27', summary: 'Canasta and Hand & Foot no longer offer same-suit runs, which neither game calls for.' },
  { date: '2026-08-27', summary: "Fixed Kent's 6-player partnerships, which were splitting the table wrong." },
  { date: '2026-08-25', summary: 'Gin Rummy now has a proper finale for a gin and for an undercut.' },
  { date: '2026-08-25', summary: 'Fixed a War bug where the same card could exist in two places at once.' },
  { date: '2026-08-24', summary: "Fixed how Kent scores and paces a round." },
  { date: '2026-08-24', summary: 'Added Kent to the catalogue.' },
  { date: '2026-08-24', summary: "Pit's market can no longer lock up with no legal trade for anyone." },
  { date: '2026-08-24', summary: 'Poker is now played as a sitting of hands, not a single deal.' },
  { date: '2026-08-24', summary: 'Fixed a resume bug, a match-record leak, and several Pit issues.' },
  { date: '2026-08-23', summary: 'Fixed a bug in Gin Rummy that could lose a card during a lay-off.' },
  { date: '2026-08-23', summary: 'Fixed a deadlock in Reflex, and a Pit win that could be missed right at deal time.' },
  { date: '2026-08-23', summary: 'Hand size now follows how many are actually seated, for the games where it depends on that.' },
];
