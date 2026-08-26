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
