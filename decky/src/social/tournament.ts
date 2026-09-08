// Ladders and tournaments (item 38): "a bracket of four-handed Hearts is a weekend, and the
// engine already plays every seat." A single-elimination bracket where every table is a real
// match at the game's own seat count — not a 1v1 abstraction laid over a 4-handed game — and
// every table you aren't sitting at is resolved headlessly by the same bot that already fills
// every practice-mode seat (see playOneMatch in engine/simulator.ts), so nobody waits through a
// game that isn't theirs.

import { GameDefinition } from '../engine/types';
import { playOneMatch } from '../engine/simulator';
import { Seat } from '../server/matchService';

export interface TournamentTable {
  round: number;
  index: number;       // position within its round, and how winners regroup into the next one
  seats: string[];      // entrant names, in seat order
  winner?: string;      // an entrant name, once this table is decided
}

export interface Tournament {
  id: string;
  gameId: string;
  gameName: string;
  seatsPerTable: number;
  rounds: number;
  you: string;
  tables: TournamentTable[];
  champion?: string;
  createdAt: number;
}

/** Bracket tables need a fixed number of seats — a game dealt for anywhere from three to eight
 *  has no single table size a bracket round could be built out of, and solitaire has no
 *  opponent to knock out in the first place. */
export function canRunTournament(def: GameDefinition): boolean {
  return !def.solitaire && def.meta.players.min === def.meta.players.max;
}

const STORE_KEY = 'decky.tournaments.v1';

function readAll(): Record<string, Tournament> {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as Record<string, Tournament>; }
  catch { return {}; }
}

function writeAll(all: Record<string, Tournament>): void {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(all)); } catch { /* quota */ }
}

function save(t: Tournament): void {
  const all = readAll();
  all[t.gameId] = t;
  writeAll(all);
}

/** The bracket in progress for this game, if there is one — cleared once it crowns a champion
 *  and a fresh one is started, so there's at most one live bracket per game at a time. */
export function activeTournament(gameId: string): Tournament | null {
  return readAll()[gameId] ?? null;
}

export function clearTournament(gameId: string): void {
  const all = readAll();
  delete all[gameId];
  writeAll(all);
}

// A four-handed bracket (Hearts, Spades, Euchre...) plays two rounds: a first round of tables
// and one final table of the winners — 16 entrants for a 4-seat game. A head-to-head game
// (Gin Rummy, War) gets a third round instead, which is what turns the same shape into the
// familiar 8-entrant single-elimination bracket rather than a 4-entrant one too small to feel
// like a tournament at all.
function roundsFor(seatsPerTable: number): number {
  return seatsPerTable <= 2 ? 3 : 2;
}

const BOT_NAMES = [
  'Ada', 'Blaise', 'Cleo', 'Dov', 'Esi', 'Farid', 'Greta', 'Hana', 'Iggy', 'Jael', 'Kofi', 'Luz',
  'Milo', 'Nadia', 'Omar', 'Priya', 'Quinn', 'Rosa', 'Sami', 'Tara', 'Uri', 'Vera', 'Wes', 'Xin',
  'Yara', 'Zeb', 'Amara', 'Bo', 'Cass', 'Deng', 'Elin', 'Finn', 'Gia', 'Hugo', 'Ines', 'Jax',
];

function botName(i: number, used: Set<string>): string {
  const base = BOT_NAMES[i % BOT_NAMES.length];
  let name = base;
  let n = 2;
  while (used.has(name)) { name = `${base} ${n}`; n++; }
  used.add(name);
  return name;
}

function shuffled<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A small, well-mixed integer hash of the bracket id and a table's address in it — not for
// fairness (a headless table has no stake in fairness, nobody's watching) but so the same
// bracket, read back after a reload, resolves every already-decided table to the identical
// result rather than reshuffling history.
function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const part of String(parts.join(':'))) h = Math.imul(h ^ part.charCodeAt(0), 16777619) >>> 0;
  return h >>> 0;
}

/** Every table in this round that isn't yours, played out headlessly and recorded. */
function resolveAutoTables(def: GameDefinition, t: Tournament, round: number): void {
  for (const table of t.tables) {
    if (table.round !== round || table.winner || table.seats.includes(t.you)) continue;
    const ids = table.seats.map((_, i) => `P${i + 1}`);
    const seed = hashSeed(t.id, round, table.index);
    const { winner } = playOneMatch(def, ids, seed, seed ^ 0x9e3779b9);
    const idx = winner ? ids.indexOf(winner) : -1;
    // playOneMatch is only ever null on a game that never terminates at all, which the
    // buildability/simulator gate (see selftest.ts) already refuses to ship — a defensive
    // fallback, not an expected path.
    table.winner = idx >= 0 ? table.seats[idx] : table.seats[0];
  }
}

// Once every table in a round has a winner, the next round can be built — its tables are the
// previous round's winners, regrouped in the same table order they were decided in. Recurses
// forward only as far as rounds are actually complete, so calling it after every single result
// (yours is the only table this module doesn't resolve immediately) always leaves the bracket
// in a consistent state, however far it's gotten.
function advance(def: GameDefinition, t: Tournament): void {
  for (let round = 1; round <= t.rounds; round++) {
    const tables = t.tables.filter((tb) => tb.round === round);
    if (tables.length === 0 || tables.some((tb) => !tb.winner)) return;
    if (round === t.rounds) { t.champion = tables[0].winner; return; }
    if (t.tables.some((tb) => tb.round === round + 1)) continue;
    const winners = tables.slice().sort((a, b) => a.index - b.index).map((tb) => tb.winner!);
    const next: TournamentTable[] = [];
    for (let i = 0; i < winners.length / t.seatsPerTable; i++) {
      next.push({ round: round + 1, index: i, seats: winners.slice(i * t.seatsPerTable, (i + 1) * t.seatsPerTable) });
    }
    t.tables.push(...next);
    resolveAutoTables(def, t, round + 1);
  }
}

/** Starts a fresh bracket for this game, with `you` drawn into it alongside enough bots to fill
 *  every seat. Every round-1 table that isn't yours is decided immediately. */
export function createTournament(def: GameDefinition, you: string): Tournament {
  const seatsPerTable = def.meta.players.min;
  const rounds = roundsFor(seatsPerTable);
  const entrantCount = seatsPerTable ** rounds;
  const used = new Set([you]);
  const bots = Array.from({ length: entrantCount - 1 }, (_, i) => botName(i, used));
  const names = shuffled([you, ...bots], Math.random);

  const tables: TournamentTable[] = [];
  for (let i = 0; i < entrantCount / seatsPerTable; i++) {
    tables.push({ round: 1, index: i, seats: names.slice(i * seatsPerTable, (i + 1) * seatsPerTable) });
  }

  const t: Tournament = {
    id: `${def.meta.id}-${Date.now().toString(36)}`,
    gameId: def.meta.id,
    gameName: def.meta.name,
    seatsPerTable,
    rounds,
    you,
    tables,
    createdAt: Date.now(),
  };
  resolveAutoTables(def, t, 1);
  save(t);
  return t;
}

/** Your table for whichever round is still open, or null once you're out or the bracket is
 *  finished — either way there's nothing left for you to play. */
export function yourTable(t: Tournament): TournamentTable | null {
  if (t.champion) return null;
  return t.tables.find((tb) => tb.seats.includes(t.you) && !tb.winner) ?? null;
}

/** The live plan for your table, in the same shape SeatSetup hands to Table's `plan` prop. */
export function seatsForTable(table: TournamentTable, you: string): Seat[] {
  return table.seats.map((name, i) => ({
    id: `P${i + 1}`,
    name,
    kind: name === you ? 'local' : 'bot',
    difficulty: 'normal',
  }));
}

/** Records your table's result and advances the bracket as far as that unlocks. */
export function recordYourTable(def: GameDefinition, t: Tournament, table: TournamentTable, winnerName: string): Tournament {
  const live = t.tables.find((tb) => tb.round === table.round && tb.index === table.index);
  if (live) live.winner = winnerName;
  advance(def, t);
  save(t);
  return { ...t, tables: t.tables.slice() };
}
