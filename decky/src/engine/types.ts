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
  // Present iff this is a single-player patience game: build the tableau down, the foundations
  // up, and win by clearing the deck. No opponents, no turns, no bot.
  solitaire?: SolitaireConfig;
  // Present iff each hand opens with a simultaneous card exchange (Hearts).
  handPass?: HandPassConfig;
}

export interface WarConfig {
  aceHigh: boolean;
  roundCap: number; // safety bound: after this many flips, most cards wins
}

export interface RummyConfig {
  setMin: number; // cards of equal rank to form a set (usually 3)
  runMin: number; // consecutive same-suit cards to form a run (usually 3)

  // Gin-family rules. With `knock` set, melds are never laid down during play — you hold them
  // concealed and end the hand by knocking, scoring the difference in unmatched ("deadwood") cards.
  knock?: number;          // most deadwood you may knock with (10 in Gin; 0 = gin only)
  ginBonus?: number;       // extra for knocking with no deadwood at all
  undercutBonus?: number;  // extra to the defender when their deadwood matches or beats the knocker's
  layOff?: boolean;        // the defender's spare cards may extend the knocker's melds before scoring
}

export interface ClimbConfig {
  order: Rank[]; // rank strength, low → high (e.g. 3,4,…,K,A,2)
  combos?: boolean;   // allow playing 2 or 3 matching-rank cards as a unit; a reply must
                       // match the same group size (pair beats pair, triple beats triple)
  bombSize?: number;  // N-of-a-kind that ANY player may play at ANY time, even out of turn,
                       // beating whatever's on the pile regardless of shape or size (0/undefined = off)
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

  // Euchre-family rules. With `auction`, trump is not fixed by the definition — it is named
  // during a bidding round and lives on MatchState for the duration of the hand.
  auction?: AuctionConfig;
  bowers?: boolean;            // the trump jack, then the same-colour jack, outrank every trump
  goAlone?: boolean;           // the maker may play the hand without their partner
  euchreScoring?: boolean;     // makers 1 / all five 2 / alone-all-five 4 / set 2 to the defenders

  // Hearts-family rules.
  brokenSuit?: Suit;           // may not be LED until it has been discarded off-suit ("hearts broken")
  leadCard?: string;           // card id (e.g. "C2") — its holder leads trick 1 and must play it
  noPenaltyFirstTrick?: boolean; // no point-carrying card may be discarded on the opening trick
  shootTheMoon?: boolean;      // taking EVERY penalty point scores you 0 and everyone else the full pot
}

// ---------- solitaire / patience ----------
// The one single-player family. Instead of hands and turns it has a laid-out tableau: columns
// you build down, foundations you build up, optional free cells, and a stock. The engine
// synthesises all of those zones from this config, so a definition never lists them by hand.

export type BuildRule = 'alt-color' | 'same-suit' | 'any-suit' | 'down-any';
export type EmptyRule = 'any' | 'king' | 'none';

export interface SolitaireConfig {
  decks: number;               // Spider uses two
  columns: number;
  deal: 'triangle' | 'even';   // Klondike's 1,2,3… staircase vs an even split
  faceUp: 'top' | 'all';       // Klondike/Spider show only the top of each column; FreeCell shows all

  // Stacking a card onto a tableau column.
  build: BuildRule;            // alt-color (Klondike/FreeCell) | down-any (Spider: rank only)
  // Lifting more than one card at a time.
  moveRun: 'single' | 'built' | 'same-suit';
  empty: EmptyRule;            // what may be dropped into an empty column

  freeCells: number;
  foundations: number;
  // Spider has no foundations you place onto — a complete K→A same-suit run leaves the board.
  foundationMode: 'place' | 'auto-run';

  stock: 'none' | 'waste' | 'deal-row';
  stockTurn: number;           // cards flipped to the waste at a time
  redeals: number;             // -1 = unlimited
}

// A trump-naming auction (Euchre). Round 1 offers the turned-up card's suit; round 2 lets each
// player name any other suit. If nobody takes it, the hand is thrown in and redealt.
export interface AuctionConfig {
  upcardZone: string;          // shared pile holding the kitty; its top card is turned up
  dealerDiscards: boolean;     // ordering it up makes the dealer take the upcard and discard one
  rounds: 1 | 2;
}

// A simultaneous pre-hand exchange (Hearts). Direction cycles per hand; 'hold' skips a hand.
export type PassDir = 'left' | 'right' | 'across' | 'hold';
export interface HandPassConfig {
  count: number;               // cards each player passes
  rotation: PassDir[];         // cycled by hand number: [left, right, across, hold]
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
  | { op: 'drawUntilPlayable'; from: string }        // draw until a legal play appears
  | { op: 'passCards'; direction: 'left' | 'right' }; // every player passes one hand card to a neighbor, simultaneously

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
  // A cumulative match score at or below this value ends the match immediately as a loss for
  // whoever crossed it (e.g. Spades' "-200 and you're out"), regardless of the target above.
  // Only meaningful alongside a negative-scoring match (bidding games where a hand can lose points).
  bust?: number | null;
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
  // Euchre auction. trumpSuit overrides TrickConfig.trump once a hand's trump is named.
  trumpSuit: Suit | 'none' | null;
  auctionRound: 0 | 1 | 2;  // 0 = no auction running
  auctionPasses: number;
  turnedDownSuit: Suit | null; // the upcard's suit once it is turned down; barred in round 2
  dealerIndex: number;
  maker: string | null;     // who named trump this hand
  alone: boolean;
  sittingOut: string | null; // the maker's partner, when going alone
  discarding: string | null; // the dealer, while they owe a discard after taking the upcard
  rummyPhase: 'draw' | 'play'; // rummy turn phase
  // climbing state (unused by other families)
  passStreak: number;       // consecutive passes since the last play
  lastPlayer: string | null; // who made the last play (leads when the pile clears)
  finished: string[];       // players who have emptied their hand, in finishing order
  climbShape: number;       // size of the group currently on the pile (1/2/3/bombSize; 0 = empty)
  climbTopRank: string | null; // rank of the group currently on the pile
  climbBombDeclined: Record<string, boolean>; // who has passed on interrupting THIS pile state
  booksWon: Record<string, number>; // fishing: completed books per player
  vars: Record<string, string>;
  scores: Record<string, number>;   // THIS HAND's points, set when the hand ends
  phase: 'playing' | 'roundOver';
  winner: string | null;            // this hand's winner
  // match play: when scoring.target is set, a match spans multiple hands, accumulating
  // scores until someone crosses the target. When it's null, a match is exactly one hand
  // (matchOver is true as soon as that hand ends) — this is the legacy single-hand behavior.
  matchScores: Record<string, number>; // cumulative points across all hands played so far
  handNumber: number;                  // 1-indexed
  matchOver: boolean;
  matchWinner: string | null;
  pendingChoice: { type: 'suit'; player: string; setState: string } | null;
  // A simultaneous card pass in progress (e.g. "everyone passes a card left"), triggered by
  // the passCards effect. While set, EVERY player (not just whoever's turn it is) may submit
  // a `choosePass` move; once all have chosen, the swap resolves atomically and turn flow
  // resumes from wherever it was paused.
  passDirection: PassDir | null;
  passCount: number;                     // cards each player owes this pass (1 for the sweep effect)
  passChoices: Record<string, string[]>; // playerId -> chosen cardIds, only once they've picked in full
  passStaged: Record<string, string[]>;  // partial picks while a multi-card pass is being assembled
  brokenSuitPlayed: boolean;             // Hearts: has the broken suit been discarded off-suit yet
  faceUp: Record<string, boolean>;       // solitaire: which cards are turned face up
  redealsLeft: number;                   // solitaire: stock passes remaining (-1 = unlimited)
  moveCount: number;                     // solitaire: moves made, for scoring/stats
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
  alone?: boolean;        // euchre: name trump and play the hand without your partner
  from?: string;          // solitaire: source zone id
  to?: string;            // solitaire: destination zone id
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
  mode: 'shedding' | 'trick' | 'climb' | 'fish' | 'rummy' | 'war' | 'solitaire';
  // solitaire
  tableau?: { id: string; cards: Card[]; faceDown: number }[];
  foundations?: { id: string; cards: Card[] }[];
  freeCells?: { id: string; card: Card | null }[];
  stockCount?: number;
  wasteCards?: Card[];
  redealsLeft?: number;
  moveCount?: number;
  solMoves?: Move[];
  rummyPhase?: 'draw' | 'play';
  meldMoves?: { cards: string[]; label: string }[];
  deadwood?: number;       // gin: what this viewer's unmatched cards are currently worth
  battle?: Card[];
  trick?: { player: string; card: Card }[];
  lead?: Suit | null;
  tricksWon?: Record<string, number>;
  finished?: string[];
  climbPile?: Card[]; // the whole current group on the pile (1-3 cards; a single card back-compat)
  booksWon?: Record<string, number>;
  oceanCount?: number;
  bids?: Record<string, number>;
  bidding?: boolean;
  teams?: string[][];
  trumpSuit?: Suit | 'none' | null;
  auctionRound?: 0 | 1 | 2;
  upcard?: Card | null;
  maker?: string | null;
  alone?: boolean;
  sittingOut?: string | null;
  dealer?: string | null;
  // match play (see MatchState)
  matchScores: Record<string, number>;
  handNumber: number;
  matchOver: boolean;
  matchWinner: string | null;
  matchTarget: number | null;
  matchBust: number | null;
  // simultaneous card pass (see MatchState.passDirection)
  passDirection: PassDir | null;
  needsPassChoice: boolean;  // true iff a pass is pending and this viewer hasn't chosen yet
  passWaitingOn: number;     // how many players still need to choose
  passCount: number;         // cards owed this pass
  passStaged: string[];      // this viewer's picks so far, for a multi-card pass
  brokenSuitPlayed?: boolean;
}
