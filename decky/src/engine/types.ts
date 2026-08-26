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
  /**
   * For decks that are not a pack of playing cards.
   *
   * A Set card is not a rank and a suit — it is four independent properties, and the game is
   * about the relationships between them. Rather than pretend otherwise, such a card carries its
   * real properties here, and keeps a synthetic rank and suit so that everything already written
   * against Card still works rather than needing a second card type threaded through the engine.
   */
  attrs?: Record<string, string>;
}

// ---------- Game definition (the schema) ----------

export interface GameDefinition {
  schemaVersion: string;
  meta: {
    id: string;
    name: string;
    description: string;
    players: {
      min: number;
      max: number;
      /**
       * Seats this game can only be dealt in multiples of. A partnership game cannot seat five
       * — somebody would have no partner — so it says two here and the seat picker offers four
       * and six rather than four, five and six.
       */
      step?: number;
    };
    family: string;
  };
  deck: {
    /**
     * 'standard54' is a pack of cards. 'attributes' builds every combination of the properties
     * listed below instead — three colours times three shapes times three counts is
     * twenty-seven cards, and no two are alike.
     */
    base: 'standard54' | 'attributes';
    /** Required for base 'attributes'. Order matters only for display. */
    attributes?: { name: string; values: string[] }[];
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
  // Present iff this is a claim/challenge game — see BluffConfig.
  bluff?: BluffConfig;
  // Present iff this is a reflex game — see ReflexConfig.
  reflex?: ReflexConfig;
  // Present iff this is a betting game — see PokerConfig.
  poker?: PokerConfig;
  // Present iff this is a trading game — see PitConfig.
  pit?: PitConfig;
  // Present iff this is Kent — see KentConfig.
  kent?: KentConfig;
  set?: SetConfig;
  // Present iff this is a single-player patience game: build the tableau down, the foundations
  // up, and win by clearing the deck. No opponents, no turns, no bot.
  solitaire?: SolitaireConfig;
  // Present iff each hand opens with a simultaneous card exchange (Hearts).
  handPass?: HandPassConfig;
  // Author-written conditional rules, layered on top of whichever family this game is.
  // Present on custom games; the classics don't need any.
  rules?: CustomRule[];
}

export interface WarConfig {
  aceHigh: boolean;
  roundCap: number; // safety bound: after this many flips, most cards wins
}

// Present iff this is a claim/challenge game (Cheat, "I Doubt It"): play cards face down while
// claiming a rank; any other player may call the claim a lie. Whoever is wrong takes the whole
// center pile. First to empty their hand wins.
export interface BluffConfig {
  // Ranks a claim may name. Defaults to every rank in the deck if omitted.
  claimableRanks?: Rank[];
}

// Present iff this is a reflex game (Slapjack, Snap): players flip one card at a time onto a
// shared pile; whenever the top card's rank is in `slapRanks` (or, for `slapMatch`, the top two
// cards share a rank), ANY player — not just whoever's turn it is — may slap to claim the pile.
// Whoever's slap reaches the engine first while it is still valid wins it.
export interface ReflexConfig {
  slapRanks: Rank[];      // e.g. ["J"] for Slapjack; [] if only slapMatch applies
  slapMatch?: boolean;    // Snap-style: slap when the top two cards match rank
  // Safety valve, same idea as War's roundCap: reflex games are a random walk of who's holding
  // what, and can occasionally run long. After this many flips, whoever holds the most cards
  // wins outright rather than the match running unbounded.
  flipCap?: number;
}

// Present iff this is a betting game (Poker-family): a single fixed deal, one betting round,
// then a showdown. No streets, no draws, no side pots — a player who cannot cover the current
// bet must fold. Documented simplifications, not oversights.
export interface PokerConfig {
  handSize: number;       // cards dealt to each player (5 = five-card showdown)
  startingChips: number;
  ante: number;            // every player pays this before the deal (0 = none)
  smallBlind: number;      // 0 = no blinds, ante-only
  bigBlind: number;
  minRaise: number;        // smallest amount a raise must increase the bet by
  /**
   * How many hands a sitting lasts. Chips carry from one hand to the next and the biggest
   * stack at the end wins; a player reaching zero ends it there and then. One hand and out
   * was not a game — you posted a blind, called once, and the table said "game over" with
   * everybody still holding chips. Absent means one hand, which is what it used to be.
   */
  hands?: number;
}

/**
 * Present iff this is Kent (also played as Kemps, Canes or Signal): a partnership game with no
 * turn order at all.
 *
 * Everybody holds `handSize` cards and there are `poolSize` more face up in the middle. Any
 * player may swap one of their cards for one of the pool's at any moment; the pool refreshes
 * when it has been picked over. Collect four of a kind and you have it — but you do not say so.
 * You signal, and your partner has to be the one who calls it. An opponent who spots the
 * signal first calls it off and the letter goes to you instead.
 *
 * The signal is the whole game and it is the part that does not survive being digitised
 * literally: across a table it is a raised eyebrow. Here it is a tell that shows on your seat
 * and everyone can see it — so what is actually raced is the same thing that is raced at a
 * real table, which is who is paying attention.
 */
export interface KentConfig {
  handSize: number;
  poolSize: number;
  /**
   * How long a tell stays up, counted in moves rather than milliseconds. The engine has no
   * clock and must not grow one: a rule that depends on wall time cannot be replayed from a
   * seed and a list of moves, which is the one thing every rule here has to be able to do.
   */
  tellPlies: number;
  /** Letters to spell before a pair is out. K-E-N-T is four. */
  letters: string;
}

// Present iff this is a trading game (Pit-style): no turn order at all. Any player may post an
// open offer (give N cards of one suit, want N of another) at any time, and any OTHER player
// holding the wanted commodity may accept it, executing the swap immediately. First to hold
// `cornerSize` cards of a single suit wins — "corners the market".
export interface PitConfig {
  cornerSize: number;
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
  // A numeric contract auction (Bridge-style): players bid a level (1..7) and a strain (a suit,
  // or "NT" for no-trump), each bid strictly outbidding the last, until three consecutive
  // passes settle it. The winning bid's side becomes declarer; trump is the winning strain
  // (or none, for NT); the target is 6 + level tricks. Mutually exclusive with `auction` — a
  // game has one auction shape or the other.
  numericAuction?: NumericAuctionConfig;
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

export type Strain = Suit | 'NT';
/**
 * A contract auction, as in Bridge.
 *
 * The distinguishing feature is that a bid is a NUMBER and a SUIT together, and every bid must
 * beat the last one — first on level, then on strain. That makes the auction a real negotiation
 * rather than a single choice, and it makes the result a contract: a promise about how many
 * tricks the winning side will take, which the hand is then scored against.
 *
 * Deliberately not the whole of Bridge. There are no doubles, no vulnerability, no rubber, and
 * no dummy — the declarer plays their own cards. What is here is the auction itself and being
 * scored on whether you kept your word.
 */
export interface NumericAuctionConfig {
  minLevel: number;   // 1
  maxLevel: number;   // 7
  strains: Strain[];  // bid order, weakest to strongest, e.g. ["C","D","H","S","NT"]
  /**
   * Tricks the contract is worth on top of the level. Bridge's "book" of six: a 3♠ contract
   * promises 3 + 6 = 9 tricks.
   */
  book: number;
  /** Points per trick bid when the contract is made. */
  trickValue: number;
  /** Points per trick over the contract. */
  overtrickValue: number;
  /** Points the other side takes per trick the contract falls short by. */
  undertrickValue: number;
  /** A bonus for bidding and making the top level. 0 for none. */
  slamBonus?: number;
  /** How many consecutive passes end the auction once somebody has bid. Usually all but one. */
  passesToClose?: number;
}

/**
 * Spotting sets on a shared board.
 *
 * The odd one out among the families: there are no turns, no hands, and no cards played to a
 * pile. A board of cards is face up, everyone is looking at the same thing, and the game is
 * whether you can see a valid combination before anybody else. A combination is valid when, for
 * every property, the chosen cards are either all the same or all different — which is the whole
 * rule, and the reason the deck has to be built from properties rather than ranks and suits.
 */
export interface SetConfig {
  /** Cards in a valid combination. Three, in the game everyone knows. */
  size: number;
  /** How many are face up at once. */
  boardSize: number;
  /** Points for spotting one. */
  score: number;
  /** Points lost for calling a combination that is not one. Discourages guessing. */
  penalty: number;
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
  // countPerPlayer is the fallback; countByPlayers overrides it for a specific seat count, for
  // the handful of games (Crazy Eights, Go Fish, Rummy…) whose real deal size actually depends
  // on how many are at the table rather than being one fixed number.
  | { op: 'deal'; from: string; to: string; countPerPlayer: number; countByPlayers?: Record<number, number> }
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
  | { always: true }
  // ----- near-programmable additions (Phase 2) -----
  // Everything below exists so a rule an author writes in the builder is expressible as data.
  // They are all pure reads of state, so they stay safe to evaluate inside the engine.
  | { cmp: Comparison }            // arbitrary numeric/string comparison between two values
  | { rankIn: Rank[] }             // the card in play is one of these ranks
  | { suitIn: Suit[] }             // ...one of these suits
  | { colorIs: 'red' | 'black' }
  | { handHas: HandQuery }         // does the acting player's hand contain N of something
  | { isFirstTurn: true };         // nobody has played a card yet this hand

/** Two values and an operator. The workhorse of author-written conditions. */
export interface Comparison {
  left: RuleValue;
  op: '==' | '!=' | '>' | '>=' | '<' | '<=';
  right: RuleValue;
}

/** "at least 3 hearts", "exactly one Ace", "any card above a 10". */
export interface HandQuery {
  rank?: Rank;
  suit?: Suit;
  color?: 'red' | 'black';
  minCount?: number;               // default 1
}

/**
 * A value inside a rule. Deliberately a closed set: an author can compose arithmetic over
 * things the engine already knows, and nothing else. No strings are ever evaluated as code.
 */
export type RuleValue =
  | { lit: number | string }
  | { stateVar: string }                       // a game variable, e.g. activeSuit
  | { count: string }                          // cards in a zone; '$hand' = the actor's hand
  | { cardProp: 'rank' | 'suit' | 'color' | 'value' }   // of the card in play
  | { score: PlayerRef }                       // that player's points THIS hand
  | { matchScore: PlayerRef }                  // ...across the match
  | { handNumber: true }
  | { playerCount: true }
  | { tricksWon: PlayerRef }
  | { add: [RuleValue, RuleValue] }
  | { sub: [RuleValue, RuleValue] }
  | { mul: [RuleValue, RuleValue] }
  | { min: [RuleValue, RuleValue] }
  | { max: [RuleValue, RuleValue] };

/** Who a rule is talking about. */
export type PlayerRef = '$me' | '$next' | '$prev' | '$all' | '$others';

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
  | { op: 'passCards'; direction: 'left' | 'right' } // every player passes one hand card to a neighbor, simultaneously
  // ----- near-programmable additions (Phase 2) -----
  | { op: 'addScore'; player: PlayerRef; amount: RuleValue }
  | { op: 'setVarNum'; var: string; value: RuleValue }
  | { op: 'announce'; text: string }              // a line in the game log, in the author's words
  | { op: 'endHand'; winner?: PlayerRef | 'highestScore' | 'lowestScore' }
  | { op: 'swapHands'; withPlayer: 'next' | 'prev' }
  | { op: 'moveMany'; from: string; to: string; count: RuleValue }
  | { op: 'drawTo'; player: PlayerRef; from: string; count: RuleValue }
  | { op: 'revealHand'; player: PlayerRef }
  | { op: 'skipTo'; player: 'next' | 'prev' };

export interface TriggerDef {
  on: 'drawPileEmpty' | 'cardPlayed';
  cardHasTag?: string;
  do: Effect[];
}

/**
 * An author-written rule: WHEN something happens, IF a condition holds, THEN do these things.
 *
 * This is the near-programmable layer. A CustomRule is ordinary data — it is stored in the
 * definition, pinned into a match like everything else, and interpreted by the same engine, so
 * a game somebody builds in the browser runs by exactly the same referee as Hearts does.
 */
export interface CustomRule {
  id: string;
  name: string;                     // the author's label, shown in the builder and the log
  when: RuleHook;
  cardHasTag?: string;              // narrow a cardPlayed rule to tagged cards
  if?: Predicate;                   // omitted = always
  then: Effect[];
  note?: string;                    // the author's own explanation, surfaced in the rules panel
  enabled?: boolean;                // default true; lets an author park a rule without deleting it
}

export type RuleHook =
  | 'handStart'      // once, as the hand is dealt
  | 'turnStart'      // before the acting player chooses
  | 'turnEnd'        // after their move resolves
  | 'cardPlayed'     // a card left a hand for a shared zone
  | 'cardDrawn'
  | 'trickWon'       // trick-taking only
  | 'drawPileEmpty';

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
  /**
   * The trick that was just taken, kept until the next card is led.
   *
   * Purely a report — the rules never read it. It exists because a trick used to vanish the
   * instant it was won: four cards appeared one at a time and then the middle of the table was
   * empty again before anyone could see who had beaten what. The table shows this until the
   * next lead and sweeps it to the winner.
   */
  lastTrick?: { plays: { player: string; card: Card }[]; winner: string } | null;
  /**
   * The last pair of cards flipped in War, kept for the table to draw.
   *
   * Deliberately a copy rather than the cards themselves. The flipped pair goes straight into
   * the winner's hand, so holding the real objects in a shared zone as well put the same card
   * in two places at once — which broke card conservation outright and, once cards started
   * being animated by id, gave the flying-card layer two candidate homes for one card.
   */
  lastBattle?: { card: Card }[] | null;
  /** War: how many ties have gone to a war (three down, flip again) so far this game. */
  warsCount: number;
  /** Who swept every penalty point this hand, if anyone — cleared each time scoring runs. */
  shotMoon?: string | null;
  /** How a hand just ended, for the table to name it as more than a score delta — gin rummy's
   *  three endings, or a bid contract made at the top of the ladder. */
  roundOutcome?: 'gin' | 'undercut' | 'knock' | 'slam' | null;
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
  // Points handed out by author-written rules DURING the hand. Kept separately because each
  // family computes state.scores from scratch when the hand ends; this is folded in afterwards
  // so a rule's points are never quietly overwritten by the family's own scoring.
  bonus: Record<string, number>;
  phase: 'playing' | 'roundOver';
  winner: string | null;            // this hand's winner
  // match play: when scoring.target is set, a match spans multiple hands, accumulating
  // scores until someone crosses the target. When it's null, a match is exactly one hand
  // (matchOver is true as soon as that hand ends) — this is the legacy single-hand behavior.
  matchScores: Record<string, number>; // cumulative points across all hands played so far
  // One row per hand that has finished, in order: what each player scored *that hand*. The
  // running total is the sum of the column, so nothing here can disagree with matchScores.
  // Append-only, and written in exactly one place (finalizeMatchProgress).
  handScores: Record<string, number>[];
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
  // bluff: the most recent claim, open to challenge until superseded by the next one.
  pendingClaim: { player: string; count: number; claimedRank: string; cardIds: string[] } | null;
  // bluff: lies caught (per liar) and correct challenges made (per challenger) — the two halves
  // of the same event, tallied for whoever it happened to.
  bluffCaught: Record<string, number>;
  bluffCalled: Record<string, number>;
  // bluff: what a challenge just turned up — the actual cards, face up, and whether the claim
  // held. Persists until the next challenge resolves, the same way lastBattle sits between wars.
  lastReveal: { claimant: string; challenger: string; claimedRank: string; cards: Card[]; wasTrue: boolean; ply: number } | null;
  // reflex: who has been eliminated (hand empty), in elimination order — last remaining wins.
  reflexOut: string[];
  // poker: chip stacks, the pot, and betting-round bookkeeping.
  chips: Record<string, number>;
  pot: number;
  currentBet: number;
  committed: Record<string, number>;      // this betting round's contribution per player
  folded: Record<string, boolean>;
  actedThisRound: Record<string, boolean>; // has acted since the last bet/raise
  pokerPhase: 'bet' | 'showdown';
  // pit: open offers on the market. Any player may post or accept one at any time.
  market: { id: number; player: string; give: Suit; count: number; want: Suit }[];
  nextOfferId: number;
  tradesCompleted: Record<string, number>; // pit: trades each player has made, either side counted
  // kent: the tell currently showing, and how many letters each pair has spelt.
  kentTell: { player: string; ply: number } | null;
  kentLetters: Record<string, number>;
  // numeric (Bridge-style) contract auction: the standing high bid, if any.
  highBid: { player: string; level: number; strain: Strain } | null;
  // rummy: the shared melds zone is one flat pile of cards with no separators, so this is the
  // record of where each group actually starts and ends — the length of each meld, in order.
  // Without it, re-deriving groups from the flat array by "same rank or same suit" adjacency is
  // ambiguous whenever one group happens to end in the same suit the next one starts with, and
  // silently drops cards that get parsed into the wrong (and then too-short-to-keep) group.
  rummyMeldSizes: number[];
  ply: number;                           // moves resolved this hand, all families (rules read it)
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
  claimedRank?: string;    // bluff: the rank being claimed
  amount?: number;         // poker: bet/raise size
  offerId?: number;        // pit: which open offer to accept/cancel
  give?: string;           // pit: suit offered (as Suit)
  want?: string;           // pit: suit wanted (as Suit)
  level?: number;          // numeric auction: bid level 1..7
  strain?: string;         // numeric auction: bid strain
  poolId?: string;         // kent: which face-up card to take from the middle
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
  /** Which way play is moving round the table — reversible in the games that carry a reverse
   *  card. Not secret information; every player at a real table can already see this. */
  direction: 1 | -1;
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
  mode: 'shedding' | 'trick' | 'climb' | 'fish' | 'rummy' | 'war' | 'solitaire'
    | 'bluff' | 'reflex' | 'poker' | 'pit' | 'set' | 'kent';
  // solitaire
  tableau?: { id: string; cards: Card[]; faceDown: number }[];
  foundations?: { id: string; cards: Card[] }[];
  freeCells?: { id: string; card: Card | null }[];
  moveCapacity?: number;                 // solitaire: how many cards a supermove can shift right now
  stockCount?: number;
  wasteCards?: Card[];
  redealsLeft?: number;
  moveCount?: number;
  solMoves?: Move[];
  rummyPhase?: 'draw' | 'play';
  meldMoves?: { cards: string[]; label: string }[];
  deadwood?: number;       // gin: what this viewer's unmatched cards are currently worth
  battle?: Card[];
  warsCount?: number;
  /** Who swept every penalty point this hand, if the game plays that way and anyone did. */
  shotMoon?: string | null;
  /** How a hand just ended — gin rummy's three endings, or a bid contract made as a slam. */
  roundOutcome?: 'gin' | 'undercut' | 'knock' | 'slam' | null;
  trick?: { player: string; card: Card }[];
  /** The trick just taken, held until somebody leads again. */
  lastTrick?: { plays: { player: string; card: Card }[]; winner: string };
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
  /** One row per finished hand: what each player scored that hand. The scorepad reads this. */
  handScores: Record<string, number>[];
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
  // bluff — the claimed rank is spoken aloud in real Cheat, so everyone sees it; only the
  // actual cards under it stay hidden until a challenge reveals them.
  centerCount?: number;               // cards face-down in the center pile right now
  pendingClaim?: { player: string; count: number; claimedRank: string } | null;
  bluffCaught?: Record<string, number>;  // lies caught, per liar
  bluffCalled?: Record<string, number>;  // correct challenges made, per challenger
  /** What the last challenge turned up — public the moment it resolves, same as the real game. */
  lastReveal?: { claimant: string; challenger: string; claimedRank: string; cards: Card[]; wasTrue: boolean; ply: number } | null;
  // reflex
  pileTop?: Card | null;
  slapValid?: boolean;                // true iff a slap would currently succeed for THIS viewer
  reflexOut?: string[];
  // poker
  chips?: Record<string, number>;
  pot?: number;
  currentBet?: number;
  committed?: Record<string, number>;
  folded?: Record<string, boolean>;
  showdown?: { player: string; cards: Card[]; label: string }[]; // revealed only once the hand ends
  // pit
  market?: { id: number; player: string; give: Suit; count: number; want: Suit }[];
  tradesCompleted?: Record<string, number>;
  /** kent: the face-up pool, whose seat is showing a tell, and the letters each pair has. */
  kentPool?: Card[];
  kentTell?: { player: string } | null;
  kentLetters?: Record<string, number>;
  kentWord?: string;
  /** kent: true when your own hand is four of a kind, so the table can offer the signal. */
  kentReady?: boolean;
  cornerSize?: number;
  /** set: the face-up board, and what is left behind it. Both public by design. */
  setBoard?: Card[];
  setDeckLeft?: number;
  setSize?: number;
  /** How many valid trios are actually on the board right now — not which ones. */
  setsAvailable?: number;
  // numeric (Bridge-style) auction
  highBid?: { player: string; level: number; strain: Strain } | null;
  /** True while a contract auction is still running. */
  contractAuction?: boolean;
  /** How many tricks the standing contract promises, once there is one. */
  contractTricks?: number;
}
