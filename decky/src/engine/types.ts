// Core types for the game-definition schema and the runtime.
// A game is DATA (GameDefinition). The engine interprets it. No game-specific code lives in the engine.

export type Suit = 'C' | 'D' | 'H' | 'S' | 'JOKER';
export type Rank =
  | 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'
  | 'JOKER';

export interface Card {
  id: string;      // stable unique id, e.g. "H8" or "JOKER1"
  rank: Rank;
  suit: Suit;
}

// ---------- Game definition (the schema) ----------

export interface GameDefinition {
  schemaVersion: string;
  meta: {
    id: string;
    name: string;
    description: string;
    players: { min: number; max: number };
    family: string;
  };
  deck: {
    base: 'standard54';
    includeJokers: boolean;
    deckCount?: number;        // how many copies of the deck are shuffled together (default 1)
    excludeRanks?: Rank[];     // ranks removed from the deck entirely (short-deck games)
    rankOrder: Rank[];
    tags: Record<string, { ranks: Rank[] }>; // named card sets, e.g. wild -> ["8"]
  };
  zones: ZoneDef[];
  setup: SetupStep[];
  turnFlow: {
    order: 'clockwise' | 'counter-clockwise';
    startPlayer: 'dealerLeft' | 'first';
    actionsPerTurn: { min: number; max: number };
  };
  actions: ActionDef[];
  triggers: TriggerDef[];
  endConditions: EndConditionDef[];
  scoring: ScoringDef;
  // Present iff this is a trick-taking game. The interpreter runs a trick-taking loop
  // (follow suit, trump, highest card takes the trick and leads next) instead of shedding.
  trick?: TrickConfig;
  // Present iff this is a climbing game (President/Big Two): beat the previous play or pass;
  // when everyone passes the pile clears and the last player to play leads again.
  climb?: ClimbConfig;
  // Present iff this is a fishing game (Go Fish): ask an opponent for a rank you hold; collect
  // sets ("books") of the same rank; most books wins.
  fish?: FishConfig;
  // Present iff this is a rummy/melding game: draw, lay down sets (same rank) and runs
  // (consecutive same suit), discard; first to shed their whole hand wins.
  rummy?: RummyConfig;
  // Present iff this is a comparison game (War): flip the top card, higher rank wins both;
  // ties trigger a "war". No decisions — win by taking all the cards.
  war?: WarConfig;
}

export interface WarConfig {
  aceHigh: boolean;
  roundCap: number; // safety bound: after this many flips, most cards wins
}

export interface RummyConfig {
  setMin: number; // cards of equal rank to form a set (usually 3)
  runMin: number; // consecutive same-suit cards to form a run (usually 3)
}

export interface ClimbConfig {
  order: Rank[]; // rank strength, low → high (e.g. 3,4,…,K,A,2)
}

export interface FishConfig {
  bookSize: number; // cards of one rank that form a book (usually 4)
}

export interface TrickConfig {
  trump: Suit | 'none';        // suit that beats all others when resolving a trick
  mustFollowSuit: boolean;     // must play the led suit if you hold one
  aceHigh: boolean;            // Ace is the strongest rank (else lowest)
  scoreBy: 'mostTricks' | 'fewestTricks' | 'penalty';
  penaltyPoints?: Record<string, number>; // card rank/suit → points (Hearts-style), for scoreBy: 'penalty'
  bidding?: boolean;           // players bid tricks before play (Spades); overrides scoreBy with bid scoring
  partnerships?: boolean;      // 4 players in 2 teams (seats 1&3 vs 2&4)
}

export type Visibility = 'none' | 'owner' | 'top-public' | 'all';

export interface ZoneDef {
  id: string;
  type: 'pile' | 'hand' | 'trick';
  ordered: boolean;
  faceDown: boolean;
  visibility: Visibility;
  shared?: boolean;
  perPlayer?: boolean;
}

export type SetupStep =
  | { op: 'shuffle'; zone: string }
  | { op: 'deal'; from: string; to: string; countPerPlayer: number }
  | { op: 'dealAll'; from: string; to: string } // distribute every card round-robin
  | { op: 'move'; from: string; to: string; count: number };

export interface ActionDef {
  id: string;
  target?: { from: string; select: 'one' };
  when: Predicate;
  effects: Effect[];
}

// ---------- Predicates ----------

export type Predicate =
  | { any: Predicate[] }
  | { all: Predicate[] }
  | { not: Predicate }
  | { matches: MatchPredicate }
  | { cardHasTag: string }
  | { existsLegal: string }        // is action <id> currently legal for the player?
  | { always: true };

export interface MatchPredicate {
  cardProp: 'suit' | 'rank' | 'color'; // color = red (H/D) vs black (C/S)
  // compare the target card's prop against the top card of a zone,
  // optionally preferring a state var (e.g. activeSuit) over the zone's top.
  equalsTopOf?: string;
  equalsStateOrTopOf?: [string, string]; // [stateVar, zoneId]
}

// ---------- Effects ----------

export type Effect =
  | { op: 'move'; card?: '$target'; from?: string; to: string; count?: number }
  | { op: 'setState'; var: string; value: string } // value may be "$target.suit"/"$target.rank" or literal
  | { op: 'if'; cond: Predicate; then: Effect[]; else?: Effect[] }
  | { op: 'chooseSuit'; setState: string }          // pauses for the current player to pick a suit
  | { op: 'reverseOrder' }
  | { op: 'skipNext' }
  | { op: 'forceDraw'; target: 'next'; from: string; count: number }
  | { op: 'reshuffleDiscardInto'; zone: string; keepTop: boolean }
  | { op: 'extraTurn' }                              // current player takes another turn
  | { op: 'drawUntilPlayable'; from: string };       // draw until a legal play appears

export interface TriggerDef {
  on: 'drawPileEmpty' | 'cardPlayed';
  cardHasTag?: string;
  do: Effect[];
}

export interface EndConditionDef {
  id: string;
  when: { zoneCount: { zone: string; of: 'anyPlayer'; eq: number } };
  result: 'roundOver';
}

export interface ScoringDef {
  mode: 'firstToEmptyWins' | 'lowestPoints';
  cardPoints?: Record<string, number | 'rankValue'>;
  target?: number | null;
  winner: 'lowestTotal' | 'highestTotal' | 'firstOut';
}

// ---------- Runtime state ----------

export interface MatchState {
  definition: GameDefinition;
  seed: number;
  rngState: number;
  players: string[];        // player ids, seat order
  zones: Record<string, Card[]>; // shared zones keyed by id; perPlayer keyed by `${id}:${playerId}`
  turnIndex: number;        // index into players
  direction: 1 | -1;
  skipCount: number;        // seats to skip on next advance
  repeatTurn: boolean;      // current player takes another turn (extra-turn cards)
  stallCount: number;       // consecutive non-productive draws (deadlock guard)
  // trick-taking state (unused by shedding games)
  lead: Suit | null;        // led suit of the current trick
  trickPlays: { player: string; card: Card }[]; // cards played into the current trick
  tricksWon: Record<string, number>;
  bids: Record<string, number>; // trick bids (Spades)
  bidding: boolean;         // true while the bidding phase is open
  rummyPhase: 'draw' | 'play'; // rummy turn phase
  // climbing state (unused by other families)
  passStreak: number;       // consecutive passes since the last play
  lastPlayer: string | null; // who made the last play (leads when the pile clears)
  finished: string[];       // players who have emptied their hand, in finishing order
  booksWon: Record<string, number>; // fishing: completed books per player
  vars: Record<string, string>;
  scores: Record<string, number>;
  phase: 'playing' | 'roundOver';
  winner: string | null;
  pendingChoice: { type: 'suit'; player: string; setState: string } | null;
  log: LogEntry[];
}

export interface LogEntry {
  t: number;
  player: string | null;
  text: string;
}

// A concrete move a player can submit.
export interface Move {
  actionId: string;
  cardId?: string;        // for target: select one
  choice?: string;        // e.g. chosen suit when resolving pendingChoice
  target?: string;        // fishing: the player being asked
  rank?: string;          // fishing: the rank being asked for
  cards?: string[];       // rummy: the card ids that form a meld
}

// ---------- Redacted (per-player) view ----------

export interface RedactedZone {
  id: string;
  visibility: Visibility;
  cards: Card[];          // only cards this viewer is allowed to see
  count: number;          // total count (even for hidden zones)
  faceDown: boolean;
}

export interface RedactedState {
  gameName: string;
  you: string;
  players: { id: string; handCount: number; isTurn: boolean }[];
  zones: Record<string, RedactedZone>;
  hand: Card[];            // convenience: your own hand
  vars: Record<string, string>;
  phase: MatchState['phase'];
  winner: string | null;
  isYourTurn: boolean;
  pendingChoice: MatchState['pendingChoice'];
  scores: Record<string, number>;
  log: LogEntry[];
  // family-specific view
  mode: 'shedding' | 'trick' | 'climb' | 'fish' | 'rummy' | 'war';
  rummyPhase?: 'draw' | 'play';
  meldMoves?: { cards: string[]; label: string }[];
  battle?: Card[];
  trick?: { player: string; card: Card }[];
  lead?: Suit | null;
  tricksWon?: Record<string, number>;
  finished?: string[];
  booksWon?: Record<string, number>;
  oceanCount?: number;
  bids?: Record<string, number>;
  bidding?: boolean;
  teams?: string[][];
}
