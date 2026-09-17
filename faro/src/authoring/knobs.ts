// The authoring model for the shedding/matching family. A "game" the user builds is a
// set of KNOBS; buildDefinition() compiles those knobs into a full GameDefinition the engine
// can run. This is what the visual editor edits and what the AI co-pilot writes to.

import { BuildRule, Effect, GameDefinition, Predicate, Rank, SolitaireConfig, Strain, Suit } from '../engine/types';
import { RestrictionDraft, RuleDraft, compileRestrictions, compileRules } from './ruleKit';
import { CURRENT_SCHEMA } from '../engine/migrate';

export const RANKS_13: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export interface Knobs {
  family: 'shedding' | 'trick' | 'climb' | 'fish' | 'rummy' | 'war' | 'solitaire'
    | 'bluff' | 'reflex' | 'poker' | 'pit' | 'kent' | 'set' | 'maid' | 'layout' | 'swap';
  // Author-written conditional rules. Kept as drafts (ingredient ids + parameters) so the
  // builder can re-open them; compiled into definition.rules on every build.
  customRules: RuleDraft[];
  /** Plays this game forbids. Same ingredients as a twist, with no "then". */
  restrictions: RestrictionDraft[];
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  // trick-taking
  trump: Suit | 'none';
  mustFollowSuit: boolean;
  aceHigh: boolean;
  trickScoreBy: 'mostTricks' | 'fewestTricks' | 'penalty';
  trickBidding: boolean;
  trickPartnerships: boolean;
  /**
   * Seats this game can only be dealt in multiples of. A partnership game cannot seat five, so
   * it says 2 here and the seat picker offers 4 and 6 rather than 4, 5 and 6.
   */
  seatStep: number;
  bustEnabled: boolean;   // match ends instantly if a player/team's score drops this low
  bustScore: number;      // stored positive; the actual threshold is -bustScore
  heartsValue: number;       // penalty per heart (penalty scoring)
  queenSpadesValue: number;  // penalty for the Queen of Spades (penalty scoring)
  /**
   * Penalties for anything else, keyed the way the engine names cards: a suit ("D"), a rank
   * ("K"), or one card ("DJ" — the jack of diamonds). Merged over the two presets above, so a
   * value written here wins.
   */
  penaltyCards: Record<string, number>;
  trumpAuction: boolean;     // trump is named per hand rather than fixed by the definition
  /**
   * A Bridge-style contract auction: bid a level and a suit together, each bid beating the last,
   * and the winner has promised that many tricks. Mutually exclusive with trumpAuction — a hand
   * has one auction or the other.
   */
  contractAuction: boolean;
  contractMinLevel: number;  // how low the bidding may open (Skat's minimum bid is nowhere near 1)
  contractMaxLevel: number;  // how high the bidding may go
  contractBook: number;      // tricks the level sits on top of (Bridge's six; 0 for a short deal)
  contractNoTrump: boolean;  // NT is a biddable strain, alongside the four suits
  contractTrickValue: number;      // points per trick bid, once made
  contractOvertrickValue: number;  // points per trick over the contract
  contractUndertrickValue: number; // points the defence takes per trick the contract falls short
  contractSlamBonus: number;       // bonus for bidding and making the top level (0 = none)
  /**
   * Score on card points taken (Skat) rather than on tricks — the contract is made once the
   * declaring side holds this many of the pack's own penalty points, whatever that took.
   */
  contractOnCardPoints: boolean;
  contractCardPointsTarget: number;
  /**
   * If the auction would otherwise pass out with nobody ever bidding, the dealer is stuck with a
   * mandatory contract at this level instead of the hand being thrown in.
   */
  contractDealerMustBid: boolean;
  contractDealerMustBidLevel: number;
  /**
   * A failed contract is scored by the tricks the DEFENCE actually took, not by how far short
   * the contract fell — the whole hand is one contest for the tricks rather than a priced
   * shortfall.
   */
  contractDefendersScoreOwnTricks: boolean;
  /**
   * Stop playing out a hand once its outcome is mathematically locked in either direction, and
   * credit whichever side is already guaranteed with the tricks nobody's fate depends on anymore.
   */
  contractConcedeWhenDecided: boolean;
  /**
   * A bid names a level only — nobody commits to a strain while the auction is still running.
   * Whoever's bid stands when it closes names trump as a separate decision afterward.
   */
  contractChooseTrumpAfter: boolean;
  bowers: boolean;           // trump jack, then the same-colour jack, top the trump suit
  goAlone: boolean;          // the maker may cut their partner out of the hand
  shootTheMoon: boolean;     // sweeping every penalty point scores you 0 and everyone else the pot
  brokenSuitLead: boolean;   // a suit may not be LED until it has been broken
  brokenSuit: Suit;          // which one. Hearts by default; the engine never cared which.
  forceOpeningLead: boolean; // one named card leads trick 1, and no points may fall on it
  openingLeadCard: string;   // which card, by suit+rank key. 2♣ is the Hearts convention.
  handPassCount: number;     // cards exchanged before each hand (0 = no exchange)
  // Every jack promoted out of its printed suit into trump (Skat), rather than just the two
  // bowers `bowers` already gives. Mutually exclusive with bowers — a jack is either special or
  // it isn't; a game does not promote it twice over.
  jacksAreTrumps: boolean;
  // The auction (or contract) winner plays alone against the rest of the table instead of with
  // a partner. Only means anything alongside partnerships and an auction of some kind.
  soloDeclarer: boolean;
  // Trump is whatever suit the last card dealt happens to be, rather than fixed or auctioned.
  // Mutually exclusive with both auction knobs — a hand has exactly one way to settle trump.
  turnedTrump: boolean;
  // A king-and-queen-of-one-suit marriage, scored once as the hand is dealt, before anyone
  // plays — the one meldPatterns shape every shipped meld game actually uses (Pinochle, Sixty-
  // Six). A fully generic pattern editor is a bigger authoring surface than one marriage is
  // worth; an author who needs something stranger still has the JSON override.
  meldMarriage: boolean;
  meldMarriagePoints: number;
  // climbing
  climbTwosHigh: boolean; // President order: 3 low … 2 high (else Ace high)
  climbCombos: boolean;   // allow playing pairs/triples as a unit (Big Two-style)
  climbBombSize: number;  // 0 = no bombs; N = N-of-a-kind can interrupt at any time
  // fishing
  bookSize: number;
  // rummy
  rummySetMin: number;
  rummyRunMin: number;
  rummyKnock: boolean;      // gin-style: melds stay hidden and you end the hand by knocking
  rummyKnockAt: number;     // most deadwood you may knock with
  rummyLayOff: boolean;     // spare cards may extend melds already on the table
  rummyWilds: boolean;      // cards tagged wild stand in for whatever a meld is short of
  rummyMaxWilds: number;    // how many wilds one meld may absorb (1 or 2)
  rummyGinBonus: number;    // extra for knocking with no deadwood at all
  rummyUndercutBonus: number; // extra to the defender who matches or beats the knocker
  // war
  warRoundCap: number;
  // bluff
  /** Ranks a claim may name. Empty = any rank in the deck. */
  bluffClaimRanks: Rank[];
  // reflex
  reflexSlapRanks: Rank[];
  reflexSlapMatch: boolean;
  reflexFlipCap: number; // safety valve — after this many flips, most cards held wins outright
  // poker
  pokerHandSize: number;
  pokerStartingChips: number;
  pokerAnte: number;
  pokerSmallBlind: number;
  pokerBigBlind: number;
  pokerMinRaise: number;
  pokerHands: number;      // hands in a sitting; chips carry between them
  // pit
  pitCornerSize: number;
  // kent — a partnership signalling game with no turn order
  kentHandSize: number;
  kentPoolSize: number;
  kentTellPlies: number;   // how long a tell stays up, in moves (the engine has no clock)
  kentLetters: string;     // spell this and the pair is out
  // maid — draw blind from a neighbour's fan; every rank pairs off except one
  maidOddRank: Rank;
  // layout — a shared board everybody plays into (Kings Corner)
  layoutPiles: number;
  layoutCornerPiles: number;
  layoutCornerRank: Rank;
  layoutBuild: 'alt-color' | 'same-suit' | 'down-any';
  layoutMovePiles: boolean;
  // swap — four cards face down in front of you that you are not allowed to look at (Dutch)
  swapSlots: number;
  swapPeekAtStart: number;
  swapPeekSelfRanks: Rank[];
  swapPeekOtherRanks: Rank[];
  swapBlindRanks: Rank[];
  swapCallName: string;
  swapTurnCap: number;
  swapCallPenalty: number;
  // set — the one family whose deck is properties rather than ranks and suits
  setProperties: { name: string; values: string[] }[];
  setSize: number;
  setBoardSize: number;
  setScore: number;
  setPenalty: number;
  // solitaire — the board is described, not drawn: these are the dials the engine reads.
  solColumns: number;
  solDeal: 'triangle' | 'even' | 'yukon';
  solFaceUp: 'top' | 'all';
  solFaceUpCount: number;    // cards shown at the top of each column when solFaceUp is 'top'
  solWrap: boolean;          // the rank order joins up, so a King sits next to an Ace
  /**
   * Golf's shape: cards are played ONTO the waste and the win is an empty tableau.
   *
   * This inverts the whole game. The waste stops being a place cards come from and becomes the
   * only place they can go, and the foundations stop mattering — so a board built this way is
   * won by clearing the columns rather than by filling anything.
   */
  solWasteIsTarget: boolean;
  /** Canfield's: the foundations start from a rank turned up at the deal, not from the aces. */
  solDealtBase: boolean;
  /** Cards stacked face up beside the tableau, of which only the top one is ever in play. */
  solReserve: number;
  /** Cards per column, when the deal shape should not decide it. 0 leaves the shape in charge. */
  solDealCount: number;
  solBuild: BuildRule;
  solMoveRun: SolitaireConfig['moveRun'];
  solEmpty: 'any' | 'king' | 'none';
  solFreeCells: number;
  solFoundations: number;
  solAutoRuns: boolean;      // a finished suit run clears itself (Spider) instead of being placed
  solStock: 'none' | 'waste' | 'deal-row';
  solStockTurn: number;
  solRedeals: number;        // -1 = unlimited
  solDecks: number;
  /**
   * Piles the author names themselves, on top of whatever their family already deals with.
   *
   * Every builder hard-codes its own zone list, so a twist could READ any pile by name and an
   * author had no way to make one exist. A named pile is somewhere to put cards aside — a
   * kitty, a widow, a penalty pile — reachable from "move cards between piles" and "a pile
   * has…".
   */
  extraPiles: { id: string; faceUp: boolean }[];
  // deck
  handSize: number;
  /**
   * Deal size at each seat count, for games where "thirteen each" only works at four. Empty
   * means handSize applies whatever the table size.
   */
  handSizeBySeats: Record<string, number>;
  deckCount: number;
  excludeRanks: Rank[];
  /** Individual cards struck out of the pack, by suit+rank key ("SQ", "H10"). */
  excludeCards: string[];
  /** Individual cards that are wild, alongside whole ranks in wildRanks. */
  wildCards: string[];
  /**
   * Which rank beats which, low to high.
   *
   * Every builder pinned this to ace-high and left it there, so "in this game the seven is the
   * highest card" was unsayable — even though the engine reads the order straight out of the
   * deck and has never cared what is in it. Empty means the ordinary order.
   */
  rankOrder: Rank[];
  includeJokers: boolean;
  jokerCount: number;
  /** What a joker does in a trick. Ignored by every other family. */
  jokerRank: 'low' | 'high' | 'trump';
  // matching
  matchSuit: boolean;
  matchRank: boolean;
  matchColor: boolean;
  // drawing
  canAlwaysDraw: boolean;
  drawUntilCanPlay: boolean;
  // special cards
  wildRanks: Rank[];
  skipRanks: Rank[];
  reverseRanks: Rank[];
  drawRanks: Rank[];
  drawCount: number;
  extraTurnRanks: Rank[];
  wildDrawRanks: Rank[];
  wildDrawCount: number;
  passRanks: Rank[];               // playing one of these sweeps the table: everyone passes a card at once
  passDirectionKnob: 'left' | 'right';
  // flow & endgame
  direction: 'clockwise' | 'counter-clockwise';
  reshuffleWhenEmpty: boolean;
  winMode: 'firstOut' | 'lowestTotal' | 'highestTotal';
  // match play: when on, a "game" is played as repeated hands with a running score until
  // someone crosses pointTarget, instead of ending after a single hand. Applies to every family.
  matchPlay: boolean;
  pointTarget: number;
  // scoring
  perRankPoints: Record<string, number>;
  jokerPoints: number;
  /**
   * Hand-scoring values for anything a whole-rank price cannot say: a suit ("D"), or one card
   * ("DJ"). Merged over perRankPoints, so a value here wins.
   */
  cardValues: Record<string, number>;
  /** Cards nobody priced score their own pip value instead of nothing. */
  unpricedScoreRankValue: boolean;
}

export const RANK_CHOICES: Rank[] = [...RANKS_13, 'JOKER'];

const defaultPoints: Record<string, number> = {
  A: 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, J: 10, Q: 10, K: 10,
};

export const defaultKnobs: Knobs = {
  family: 'shedding',
  customRules: [],
  restrictions: [],
  name: 'My Card Game',
  description: '',
  minPlayers: 2,
  maxPlayers: 6,
  trump: 'S',
  mustFollowSuit: true,
  aceHigh: true,
  trickScoreBy: 'mostTricks',
  trickBidding: false,
  trickPartnerships: false,
  seatStep: 1,
  bustEnabled: false,
  bustScore: 200,
  heartsValue: 1,
  queenSpadesValue: 13,
  penaltyCards: {},
  trumpAuction: false,
  contractAuction: false,
  contractMinLevel: 1,
  contractMaxLevel: 7,
  contractBook: 0,
  contractNoTrump: true,
  contractTrickValue: 10,
  contractOvertrickValue: 3,
  contractUndertrickValue: 12,
  contractSlamBonus: 30,
  contractOnCardPoints: false,
  contractCardPointsTarget: 61,
  contractDealerMustBid: false,
  contractDealerMustBidLevel: 1,
  contractDefendersScoreOwnTricks: false,
  contractConcedeWhenDecided: false,
  contractChooseTrumpAfter: false,
  bowers: false,
  goAlone: false,
  shootTheMoon: false,
  brokenSuitLead: false,
  brokenSuit: 'H',
  forceOpeningLead: false,
  openingLeadCard: 'C2',
  handPassCount: 0,
  jacksAreTrumps: false,
  soloDeclarer: false,
  turnedTrump: false,
  meldMarriage: false,
  meldMarriagePoints: 20,
  climbTwosHigh: true,
  climbCombos: false,
  climbBombSize: 0,
  bookSize: 4,
  rummySetMin: 3,
  rummyRunMin: 3,
  rummyKnock: false,
  rummyKnockAt: 10,
  rummyLayOff: true,
  rummyWilds: false,
  rummyMaxWilds: 1,
  rummyGinBonus: 25,
  rummyUndercutBonus: 25,
  warRoundCap: 800,
  bluffClaimRanks: [],
  reflexSlapRanks: ['J'],
  reflexSlapMatch: false,
  reflexFlipCap: 0,
  pokerHandSize: 5,
  pokerStartingChips: 200,
  pokerAnte: 0,
  pokerSmallBlind: 5,
  pokerBigBlind: 10,
  pokerMinRaise: 10,
  pokerHands: 6,
  pitCornerSize: 7,
  kentHandSize: 4,
  kentPoolSize: 4,
  kentTellPlies: 3,
  kentLetters: 'KENT',
  maidOddRank: 'Q',
  layoutPiles: 4,
  layoutCornerPiles: 4,
  layoutCornerRank: 'K',
  layoutBuild: 'alt-color',
  layoutMovePiles: true,
  swapSlots: 4,
  swapPeekAtStart: 2,
  swapPeekSelfRanks: ['7', '8'],
  swapPeekOtherRanks: ['9', '10'],
  swapBlindRanks: ['J', 'Q'],
  swapCallName: 'Dutch',
  swapTurnCap: 40,
  swapCallPenalty: 10,
  setProperties: [
    { name: 'colour', values: ['red', 'green', 'violet'] },
    { name: 'shape', values: ['oval', 'diamond', 'squiggle'] },
    { name: 'count', values: ['1', '2', '3'] },
  ],
  setSize: 3,
  setBoardSize: 12,
  setScore: 1,
  setPenalty: 1,
  solColumns: 7,
  solDeal: 'triangle',
  solFaceUp: 'top',
  solFaceUpCount: 1,
  solWrap: false,
  solWasteIsTarget: false,
  solDealtBase: false,
  solReserve: 0,
  solDealCount: 0,
  solBuild: 'alt-color',
  solMoveRun: 'built',
  solEmpty: 'king',
  solFreeCells: 0,
  solFoundations: 4,
  solAutoRuns: false,
  solStock: 'waste',
  solStockTurn: 3,
  solRedeals: -1,
  solDecks: 1,
  extraPiles: [],
  handSize: 5,
  handSizeBySeats: {},
  deckCount: 1,
  excludeRanks: [],
  excludeCards: [],
  wildCards: [],
  rankOrder: [],
  includeJokers: false,
  jokerCount: 2,
  jokerRank: 'low',
  matchSuit: true,
  matchRank: true,
  matchColor: false,
  canAlwaysDraw: false,
  drawUntilCanPlay: false,
  wildRanks: ['8'],
  skipRanks: [],
  reverseRanks: [],
  drawRanks: [],
  drawCount: 2,
  extraTurnRanks: [],
  wildDrawRanks: [],
  wildDrawCount: 4,
  passRanks: [],
  passDirectionKnob: 'left',
  direction: 'clockwise',
  reshuffleWhenEmpty: true,
  winMode: 'firstOut',
  matchPlay: false,
  pointTarget: 100,
  perRankPoints: { ...defaultPoints },
  jokerPoints: 50,
  cardValues: {},
  unpricedScoreRankValue: false,
};

/** Author-named piles, as zone definitions the engine will create and the rules can reach. */
function extraZones(knobs: Knobs, taken: Set<string>): GameDefinition['zones'] {
  return knobs.extraPiles
    .map((p) => p.id.trim().replace(/[^a-zA-Z0-9_-]/g, ''))
    .filter((id, i, all) => id && !taken.has(id) && all.indexOf(id) === i)
    .map((id, i) => ({
      id,
      type: 'pile' as const,
      ordered: true,
      faceDown: !knobs.extraPiles[i]?.faceUp,
      visibility: (knobs.extraPiles[i]?.faceUp ? 'all' : 'none') as 'all' | 'none',
      shared: true,
    }));
}

export function buildDefinition(knobs: Knobs, id = 'draft'): GameDefinition {
  const base = buildFamilyDefinition(knobs, id);
  const extra = extraZones(knobs, new Set(base.zones.map((z) => z.id)));
  const def = extra.length ? { ...base, zones: [...base.zones, ...extra] } : base;
  // The near-programmable layer rides on top of whichever family this is, so a custom rule
  // works the same in a trick-taking game as in a shedding one.
  const rules = compileRules(knobs.customRules ?? []);
  const playRestrictions = compileRestrictions(knobs.restrictions ?? []);
  return {
    ...def,
    ...(rules.length > 0 ? { rules } : {}),
    ...(playRestrictions.length > 0 ? { playRestrictions } : {}),
  };
}

/**
 * One deck, built the same way for every family.
 *
 * It used to be that only the shedding builder read the deck knobs; the other ten hard-coded
 * `includeJokers: false, deckCount: 1` and quietly dropped whatever the author had set. Which
 * meant a two-deck Rummy or a jokers-in-trumps game was unbuildable for reasons that had
 * nothing to do with the engine — it could run both perfectly well.
 *
 * `maxDecks` is the one honest per-family limit: War splits the pack between two players and
 * Patience lays a fixed board, so both cap where their own shape stops making sense.
 */
function deckOf(
  knobs: Knobs,
  opts: { maxDecks?: number; rankOrder?: Rank[]; tags?: GameDefinition['deck']['tags']; noJokers?: boolean } = {},
): GameDefinition['deck'] {
  const jokers = !opts.noJokers && knobs.includeJokers;
  return {
    base: 'standard54',
    includeJokers: jokers,
    ...(jokers ? { jokerCount: clampInt(knobs.jokerCount, 1, 8) } : {}),
    deckCount: clampInt(knobs.deckCount, 1, opts.maxDecks ?? 3),
    excludeRanks: knobs.excludeRanks,
    ...(knobs.excludeCards.length ? { excludeCards: [...knobs.excludeCards] } : {}),
    // An author's own order wins, then whatever the family insists on, then the ordinary one.
    // Ranks they removed from the deck are dropped so the order never names a card that is
    // not in the pack.
    rankOrder: knobs.rankOrder.length
      ? knobs.rankOrder.filter((r) => !knobs.excludeRanks.includes(r))
      : (opts.rankOrder ?? RANKS_13),
    tags: opts.tags ?? {},
  };
}

/**
 * The deal step, with a per-seat-count table when the author gave one.
 *
 * "Thirteen each" only works at four players; at three it deals 39 of 52 and leaves a stub, and
 * at five it cannot be dealt at all. countByPlayers has been in the schema since the beginning
 * and no builder ever emitted it.
 */
function dealStep(knobs: Knobs, from: string, to: string) {
  const table = Object.entries(knobs.handSizeBySeats)
    .filter(([seats, n]) => Number(seats) > 0 && Number(n) > 0)
    .map(([seats, n]) => [Number(seats), Math.round(n)] as const);
  return {
    op: 'deal' as const, from, to, countPerPlayer: knobs.handSize,
    ...(table.length ? { countByPlayers: Object.fromEntries(table) } : {}),
  };
}

/** Whether the author has named anything at all as wild. */
function hasWilds(knobs: Knobs): boolean {
  return knobs.wildRanks.length > 0 || knobs.wildCards.length > 0;
}

/** The 'wild' tag, built the same way wherever a family wants one. */
function wildTags(knobs: Knobs): GameDefinition['deck']['tags'] {
  if (!hasWilds(knobs)) return {};
  return { wild: { ranks: dedup(knobs.wildRanks), ...(knobs.wildCards.length ? { cards: [...knobs.wildCards] } : {}) } };
}

function buildFamilyDefinition(knobs: Knobs, id: string): GameDefinition {
  if (knobs.family === 'trick') return buildTrickDefinition(knobs, id);
  if (knobs.family === 'climb') return buildClimbDefinition(knobs, id);
  if (knobs.family === 'fish') return buildFishDefinition(knobs, id);
  if (knobs.family === 'rummy') return buildRummyDefinition(knobs, id);
  if (knobs.family === 'war') return buildWarDefinition(knobs, id);
  if (knobs.family === 'solitaire') return buildSolitaireDefinition(knobs, id);
  if (knobs.family === 'bluff') return buildBluffDefinition(knobs, id);
  if (knobs.family === 'reflex') return buildReflexDefinition(knobs, id);
  if (knobs.family === 'poker') return buildPokerDefinition(knobs, id);
  if (knobs.family === 'pit') return buildPitDefinition(knobs, id);
  if (knobs.family === 'kent') return buildKentDefinition(knobs, id);
  if (knobs.family === 'set') return buildSetDefinition(knobs, id);
  if (knobs.family === 'maid') return buildMaidDefinition(knobs, id);
  if (knobs.family === 'layout') return buildLayoutDefinition(knobs, id);
  if (knobs.family === 'swap') return buildSwapDefinition(knobs, id);
  return buildSheddingDefinition(knobs, id);
}

// Dutch: four cards face down in front of each player that they may look at only once, at the
// start. From there the only way to learn more is the ranks that buy a look — at your own row,
// at somebody else's, or a sight-unseen trade with them, all three separately configurable
// ranks rather than fixed to sevens-and-eights the way the shipped game happens to use.
function buildSwapDefinition(knobs: Knobs, id: string): GameDefinition {
  const callName = knobs.swapCallName.trim() || 'Call';
  return {
    schemaVersion: CURRENT_SCHEMA,
    meta: {
      id, name: knobs.name,
      description: knobs.description
        || `${knobs.swapSlots} cards each, face down, and you may look at ${knobs.swapPeekAtStart} `
        + `of them once. Then take a card from the stock or the pile and either slide it into `
        + `your row — throwing out whatever was there — or throw it away.`
        + (knobs.swapPeekSelfRanks.length ? ` ${knobs.swapPeekSelfRanks.map(rankLabel).join('/')} buy a look at one of your own.` : '')
        + (knobs.swapPeekOtherRanks.length ? ` ${knobs.swapPeekOtherRanks.map(rankLabel).join('/')} buy a look at somebody else's.` : '')
        + (knobs.swapBlindRanks.length ? ` ${knobs.swapBlindRanks.map(rankLabel).join('/')} trade one of yours for one of theirs, neither of you looking.` : '')
        + ` Call "${callName}" when you think you are lowest — everyone gets one more turn, then `
        + `the cards come over. Be wrong and it costs you ${knobs.swapCallPenalty}.`,
      players: { min: clampInt(knobs.minPlayers, 2, 8), max: clampInt(knobs.maxPlayers, knobs.minPlayers, 8) },
      family: 'swap',
    },
    deck: deckOf(knobs, { maxDecks: 1, noJokers: true, rankOrder: RANKS_13 }),
    zones: [
      { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
      { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
    ],
    setup: [{ op: 'shuffle', zone: 'draw' }],
    turnFlow: { order: 'clockwise', startPlayer: 'dealerLeft', actionsPerTurn: { min: 1, max: 1 } },
    actions: [], triggers: [], endConditions: [],
    scoring: {
      mode: 'lowestPoints', winner: 'lowestTotal',
      cardPoints: Object.fromEntries(RANKS_13.map((r) => [r, knobs.perRankPoints[r] ?? defaultPoints[r] ?? 0])),
      target: matchTarget(knobs),
    },
    swap: {
      slots: clampInt(knobs.swapSlots, 3, 6),
      peekAtStart: clampInt(knobs.swapPeekAtStart, 0, knobs.swapSlots),
      ...(knobs.swapPeekSelfRanks.length ? { peekSelfRanks: [...knobs.swapPeekSelfRanks] } : {}),
      ...(knobs.swapPeekOtherRanks.length ? { peekOtherRanks: [...knobs.swapPeekOtherRanks] } : {}),
      ...(knobs.swapBlindRanks.length ? { blindSwapRanks: [...knobs.swapBlindRanks] } : {}),
      callName,
      turnCap: clampInt(knobs.swapTurnCap, 10, 200),
      callPenalty: clampInt(knobs.swapCallPenalty, 0, 100),
    },
  };
}

// Kings Corner: a shared board everybody plays into rather than a private tableau — the piles
// and corners are synthesised by the engine from this config the same way solitaire's board is,
// so the definition only carries the deck and the dials. Jokers have no colour to alternate
// against (cardColor() returns 'none' for them), so unlike every other family here they would
// be an unplaceable, permanently stuck card rather than a wild one — left out entirely instead
// of offered as a knob that quietly breaks the game the moment it's turned on.
function buildLayoutDefinition(knobs: Knobs, id: string): GameDefinition {
  const buildWord = knobs.layoutBuild === 'alt-color' ? 'in alternating colours, red on black, black on red'
    : knobs.layoutBuild === 'same-suit' ? 'in one suit' : 'down, any suit';
  return {
    schemaVersion: CURRENT_SCHEMA,
    meta: {
      id, name: knobs.name,
      description: knobs.description
        || `Draw one card, then place as many as you like: build down ${buildWord}. Only a `
        + `${rankLabel(knobs.layoutCornerRank)} may open a corner, which is why it's the best `
        + `card in the game.`
        + (knobs.layoutMovePiles
          ? ' You can also lift a whole pile and drop it on another it continues, freeing a space.'
          : '')
        + ' First to empty their hand wins.',
      players: { min: clampInt(knobs.minPlayers, 2, 8), max: clampInt(knobs.maxPlayers, knobs.minPlayers, 8) },
      family: 'layout',
    },
    deck: deckOf(knobs, { maxDecks: 1, noJokers: true, rankOrder: RANKS_13 }),
    zones: [
      { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
      { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    ],
    setup: [{ op: 'shuffle', zone: 'draw' }],
    turnFlow: { order: 'clockwise', startPlayer: 'dealerLeft', actionsPerTurn: { min: 1, max: 1 } },
    actions: [], triggers: [], endConditions: [],
    scoring: { mode: 'lowestPoints', winner: 'firstOut', cardPoints: {}, target: null },
    layout: {
      piles: clampInt(knobs.layoutPiles, 1, 8),
      cornerPiles: clampInt(knobs.layoutCornerPiles, 0, 8),
      cornerRank: knobs.layoutCornerRank || 'K',
      build: knobs.layoutBuild,
      handSize: clampInt(knobs.handSize, 1, 13),
      movePiles: knobs.layoutMovePiles,
    },
  };
}

// Old Maid: take every suited copy but one of a single rank out of the pack, so the survivor
// has nothing left to pair with, then deal out the rest. The odd rank is a knob, not fixed to
// the queen — buildMaidDefinition computes which three suit-copies to drop from whichever rank
// the author chose, the same arithmetic src/games/oldMaid.ts does by hand for the queen.
function buildMaidDefinition(knobs: Knobs, id: string): GameDefinition {
  const oddRank = knobs.maidOddRank || 'Q';
  const dropped = (['S', 'H', 'D'] as const).map((suit) => `${suit}${oddRank}`);
  const deck = deckOf(knobs, { maxDecks: 1, noJokers: true, rankOrder: RANKS_13 });
  return {
    schemaVersion: CURRENT_SCHEMA,
    meta: {
      id, name: knobs.name,
      description: knobs.description
        || `Take three ${rankLabel(oddRank)}s out of the pack, so one is left with no partner, `
        + `and deal out everything else. Any pair in your hand falls out of it at once. On your `
        + `turn, draw one card — sight unseen — from whoever draws next after you: you pick where `
        + `in their fan, not what it is. Whoever is holding the odd ${rankLabel(oddRank)} once `
        + `everyone else is empty-handed loses.`,
      players: { min: clampInt(knobs.minPlayers, 3, 8), max: clampInt(knobs.maxPlayers, knobs.minPlayers, 8) },
      family: 'maid',
    },
    deck: { ...deck, excludeCards: Array.from(new Set([...dropped, ...(deck.excludeCards ?? [])])) },
    zones: [
      { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
      { id: 'void', type: 'pile', ordered: false, faceDown: true, visibility: 'none', shared: true },
      { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    ],
    setup: [{ op: 'shuffle', zone: 'draw' }, { op: 'dealAll', from: 'draw', to: 'hand' }],
    turnFlow: { order: 'clockwise', startPlayer: 'dealerLeft', actionsPerTurn: { min: 1, max: 1 } },
    actions: [], triggers: [], endConditions: [],
    scoring: { mode: 'lowestPoints', winner: 'lowestTotal', cardPoints: {}, target: null },
    maid: { oddRank },
  };
}

// Patience: the engine synthesises the whole board from this config, so the definition only
// carries the deck and the dials.
function buildSolitaireDefinition(knobs: Knobs, id: string): GameDefinition {
  return {
    schemaVersion: CURRENT_SCHEMA,
    meta: {
      id, name: knobs.name, description: knobs.description || autoSolitaireDescription(knobs),
      players: { min: 1, max: 1 },
      family: 'solitaire',
    },
    deck: {
      ...deckOf(knobs, { noJokers: true }),
      // Patience deals a fixed board from a known pack, so its deck count is the board's, not
      // the deck panel's — and a joker has no foundation to go to.
      deckCount: clampInt(knobs.solDecks, 1, 2),
    },
    zones: [], setup: [],
    turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
    actions: [], triggers: [], endConditions: [],
    scoring: { mode: 'lowestPoints', winner: 'lowestTotal', cardPoints: {}, target: null },
    solitaire: {
      decks: clampInt(knobs.solDecks, 1, 2),
      columns: clampInt(knobs.solColumns, 4, 12),
      deal: knobs.solDeal,
      faceUp: knobs.solFaceUp,
      faceUpCount: clampInt(knobs.solFaceUpCount, 1, 12),
      build: knobs.solBuild,
      wrap: knobs.solWrap,
      wasteIsTarget: knobs.solWasteIsTarget,
      foundationStart: knobs.solDealtBase ? 'dealt' : 'ace',
      reserve: clampInt(knobs.solReserve, 0, 26),
      ...(knobs.solDealCount > 0 ? { dealCount: clampInt(knobs.solDealCount, 1, 12) } : {}),
      moveRun: knobs.solMoveRun,
      empty: knobs.solEmpty,
      freeCells: clampInt(knobs.solFreeCells, 0, 6),
      foundations: knobs.solWasteIsTarget ? 0 : clampInt(knobs.solFoundations, 1, 8),
      foundationMode: knobs.solAutoRuns ? 'auto-run' : 'place',
      stock: knobs.solStock,
      stockTurn: clampInt(knobs.solStockTurn, 1, 3),
      redeals: knobs.solRedeals,
    },
  };
}

function autoSolitaireDescription(k: Knobs): string {
  const build = k.solBuild === 'alt-color' ? 'in alternating colours'
    : k.solBuild === 'same-suit' ? 'in the same suit'
    : k.solBuild === 'any-suit' ? 'in a different suit' : 'by rank, any suit';
  const gap = k.solEmpty === 'king' ? 'Only a King may fill an empty column.'
    : k.solEmpty === 'none' ? 'Empty columns stay empty.' : 'Any card may fill an empty column.';
  const stock = k.solStock === 'waste'
    ? ` Turn the stock ${k.solStockTurn} at a time${k.solRedeals < 0 ? ', as many passes as you like' : k.solRedeals === 0 ? ', one pass only' : `, ${k.solRedeals} redeals`}.`
    : k.solStock === 'deal-row' ? ' When stuck, deal another row across every column.' : '';
  const cells = k.solFreeCells > 0 ? ` ${k.solFreeCells} free cells each hold one card.` : '';
  const shown = k.solFaceUp === 'top' && k.solFaceUpCount > 1
    ? ` The top ${k.solFaceUpCount} cards of every column are face up.` : '';
  const wrap = k.solWrap ? ' The order joins up at the ends, so a King sits next to an Ace.' : '';
  const finish = k.solWasteIsTarget
    ? 'There are no foundations: play cards onto the waste and clear every column to win.'
    : k.solAutoRuns
      ? 'Complete a King-to-Ace run in one suit and it clears itself off the board.'
      : k.solDealtBase
        ? 'One card is turned up at the deal and every foundation builds from that rank, wrapping round the top back to the Ace.'
        : 'Build the foundations up by suit from the aces.';
  const reserve = k.solReserve > 0
    ? ` A reserve of ${k.solReserve} cards sits face up beside the board — you can see them all and only ever take the top one.` : '';
  return `A patience laid out in ${k.solColumns} columns. Build the columns downward ${build}.${wrap} ${finish} ${gap}${shown}${reserve}${cells}${stock}`;
}

function buildRummyDefinition(knobs: Knobs, id: string): GameDefinition {
  return {
    schemaVersion: CURRENT_SCHEMA,
    meta: {
      id, name: knobs.name, description: knobs.description || `A melding game. Deal ${knobs.handSize} cards each. Draw, lay down sets of ${knobs.rummySetMin}+ of a rank and runs of ${knobs.rummyRunMin}+ in sequence, then discard. First to shed every card wins.`,
      players: { min: clampInt(knobs.minPlayers, 2, 4), max: clampInt(knobs.maxPlayers, knobs.minPlayers, 4) },
      family: 'rummy',
    },
    deck: deckOf(knobs, { maxDecks: 2, tags: wildTags(knobs) }),
    zones: [
      { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
      { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
      { id: 'melds', type: 'pile', ordered: true, faceDown: false, visibility: 'all', shared: true },
      { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    ],
    setup: [{ op: 'shuffle', zone: 'draw' }, dealStep(knobs, 'draw', 'hand'), { op: 'move', from: 'draw', to: 'discard', count: 1 }],
    turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
    actions: [], triggers: [],
    endConditions: [{ id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' }],
    scoring: { mode: 'lowestPoints', winner: 'lowestTotal', cardPoints: {}, target: matchTarget(knobs) },
    rummy: {
      setMin: clampInt(knobs.rummySetMin, 2, 4), runMin: clampInt(knobs.rummyRunMin, 2, 5),
      knock: knobs.rummyKnock ? clampInt(knobs.rummyKnockAt, 0, 30) : undefined,
      ginBonus: knobs.rummyKnock ? clampInt(knobs.rummyGinBonus, 0, 200) : undefined,
      undercutBonus: knobs.rummyKnock ? clampInt(knobs.rummyUndercutBonus, 0, 200) : undefined,
      layOff: knobs.rummyLayOff || undefined,
      wilds: knobs.rummyWilds && hasWilds(knobs) ? true : undefined,
      maxWildsPerMeld: knobs.rummyWilds ? clampInt(knobs.rummyMaxWilds, 1, 2) : undefined,
    },
  };
}

function buildWarDefinition(knobs: Knobs, id: string): GameDefinition {
  return {
    schemaVersion: CURRENT_SCHEMA,
    meta: {
      id, name: knobs.name, description: knobs.description || 'A comparison game. Split the deck; each flip the higher card takes both, ties trigger a war. Take every card to win.',
      players: { min: 2, max: 2 }, family: 'comparison',
    },
    deck: deckOf(knobs, { maxDecks: 1 }),
    zones: [
      { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
      { id: 'battle', type: 'pile', ordered: true, faceDown: false, visibility: 'all', shared: true },
      { id: 'hand', type: 'hand', ordered: true, faceDown: true, visibility: 'none', perPlayer: true },
    ],
    setup: [{ op: 'shuffle', zone: 'draw' }, { op: 'dealAll', from: 'draw', to: 'hand' }],
    turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
    actions: [], triggers: [],
    endConditions: [{ id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' }],
    scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: matchTarget(knobs) },
    war: { aceHigh: knobs.aceHigh, roundCap: clampInt(knobs.warRoundCap, 100, 5000) },
  };
}

function buildBluffDefinition(knobs: Knobs, id: string): GameDefinition {
  return {
    schemaVersion: CURRENT_SCHEMA,
    meta: {
      id, name: knobs.name,
      description: knobs.description || 'Play cards face down, claiming a rank. Anyone can call your bluff — whoever is wrong takes the whole pile. First to empty their hand wins.',
      players: { min: clampInt(knobs.minPlayers, 2, 6), max: clampInt(knobs.maxPlayers, knobs.minPlayers, 6) },
      family: 'bluff',
    },
    deck: deckOf(knobs, { maxDecks: 2 }),
    zones: [
      { id: 'center', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
      { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    ],
    setup: [{ op: 'shuffle', zone: 'center' }, { op: 'dealAll', from: 'center', to: 'hand' }],
    turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
    actions: [], triggers: [], endConditions: [],
    scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: null },
    bluff: knobs.bluffClaimRanks.length ? { claimableRanks: [...knobs.bluffClaimRanks] } : {},
  };
}

function buildReflexDefinition(knobs: Knobs, id: string): GameDefinition {
  return {
    schemaVersion: CURRENT_SCHEMA,
    meta: {
      id, name: knobs.name,
      description: knobs.description || 'Flip a card each turn onto the shared pile. Whenever it matches, slap first to take the whole thing. Last player holding cards wins.',
      players: { min: clampInt(knobs.minPlayers, 2, 6), max: clampInt(knobs.maxPlayers, knobs.minPlayers, 6) },
      family: 'reflex',
    },
    deck: deckOf(knobs, { maxDecks: 2 }),
    zones: [
      { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
      { id: 'pile', type: 'pile', ordered: true, faceDown: false, visibility: 'all', shared: true },
      { id: 'hand', type: 'hand', ordered: true, faceDown: true, visibility: 'none', perPlayer: true },
    ],
    setup: [{ op: 'shuffle', zone: 'draw' }, { op: 'dealAll', from: 'draw', to: 'hand' }],
    turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
    actions: [], triggers: [], endConditions: [],
    scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: null },
    reflex: {
      slapRanks: knobs.reflexSlapRanks, slapMatch: knobs.reflexSlapMatch,
      ...(knobs.reflexFlipCap > 0 ? { flipCap: clampInt(knobs.reflexFlipCap, 50, 5000) } : {}),
    },
  };
}

function buildPokerDefinition(knobs: Knobs, id: string): GameDefinition {
  return {
    schemaVersion: CURRENT_SCHEMA,
    meta: {
      id, name: knobs.name,
      description: knobs.description || 'A fixed deal, one round of betting, then a showdown. Real chips, no side pots, no draw.',
      players: { min: clampInt(knobs.minPlayers, 2, 8), max: clampInt(knobs.maxPlayers, knobs.minPlayers, 8) },
      family: 'poker',
    },
    deck: deckOf(knobs, { maxDecks: 1 }),
    zones: [
      { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
      { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    ],
    setup: [{ op: 'shuffle', zone: 'draw' }, { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: clampInt(knobs.pokerHandSize, 3, 7) }],
    turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
    actions: [], triggers: [], endConditions: [],
    scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: null },
    poker: {
      handSize: clampInt(knobs.pokerHandSize, 3, 7),
      startingChips: Math.max(knobs.pokerBigBlind * 4, knobs.pokerStartingChips),
      ante: Math.max(0, knobs.pokerAnte),
      smallBlind: Math.max(0, knobs.pokerSmallBlind),
      bigBlind: Math.max(0, knobs.pokerBigBlind),
      minRaise: Math.max(1, knobs.pokerMinRaise),
      hands: clampInt(knobs.pokerHands, 1, 20),
    },
  };
}

function buildPitDefinition(knobs: Knobs, id: string): GameDefinition {
  return {
    schemaVersion: CURRENT_SCHEMA,
    meta: {
      id, name: knobs.name,
      description: knobs.description || 'No turns. Post trades, accept anyone else\'s, first to corner a suit wins.',
      players: { min: clampInt(knobs.minPlayers, 3, 8), max: clampInt(knobs.maxPlayers, knobs.minPlayers, 8) },
      family: 'pit',
    },
    deck: deckOf(knobs, { maxDecks: 2 }),
    zones: [
      { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
      { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    ],
    setup: [{ op: 'shuffle', zone: 'draw' }, { op: 'dealAll', from: 'draw', to: 'hand' }],
    turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
    actions: [], triggers: [], endConditions: [],
    scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: null },
    pit: { cornerSize: clampInt(knobs.pitCornerSize, 4, 13) },
  };
}

// Kent: a partnership game with no turn order at all. Partners sit opposite, so the seats have
// to come in pairs — the seat step is not optional here the way it is elsewhere.
function buildKentDefinition(knobs: Knobs, id: string): GameDefinition {
  const hand = clampInt(knobs.kentHandSize, 3, 5);
  return {
    schemaVersion: CURRENT_SCHEMA,
    meta: {
      id, name: knobs.name,
      description: knobs.description
        || `${hand} cards each and ${clampInt(knobs.kentPoolSize, 3, 6)} face up in the middle. No turns — swap with the table whenever you like. Get ${hand} of a kind and a tell goes up at your seat; your partner has to call it before an opponent does. ${knobs.kentLetters.split('').join('-')} and that pair is out.`,
      players: { min: 4, max: clampInt(Math.max(4, knobs.maxPlayers), 4, 6), step: 2 },
      family: 'kent',
    },
    deck: deckOf(knobs, { maxDecks: 1, noJokers: true }),
    zones: [
      { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
      { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
      { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    ],
    setup: [{ op: 'shuffle', zone: 'draw' }, { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: hand }],
    turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
    actions: [], triggers: [], endConditions: [],
    scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: null },
    kent: {
      handSize: hand,
      poolSize: clampInt(knobs.kentPoolSize, 3, 6),
      tellPlies: clampInt(knobs.kentTellPlies, 1, 8),
      letters: (knobs.kentLetters || 'KENT').toUpperCase().slice(0, 8),
    },
  };
}

// The one family whose deck is not a pack of cards: every combination of the author's own
// properties, once each. Three colours × three shapes × three counts is twenty-seven.
function buildSetDefinition(knobs: Knobs, id: string): GameDefinition {
  const props = knobs.setProperties.filter((p) => p.name.trim() && p.values.length >= 2);
  const deckSize = props.reduce((n, p) => n * p.values.length, 1);
  return {
    schemaVersion: CURRENT_SCHEMA,
    meta: {
      id, name: knobs.name,
      description: knobs.description
        || `${deckSize} cards, each a unique combination of ${props.map((p) => p.name).join(', ')}. Find ${knobs.setSize} where every property is all the same or all different. No turns — whoever sees it first takes it, and a wrong call costs you.`,
      players: { min: 1, max: clampInt(knobs.maxPlayers, 1, 6) },
      family: 'set',
    },
    deck: { base: 'attributes', attributes: props, includeJokers: false, rankOrder: [], tags: {} },
    zones: [], setup: [],
    turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
    actions: [], triggers: [], endConditions: [],
    scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: null },
    set: {
      size: clampInt(knobs.setSize, 2, 4),
      boardSize: clampInt(knobs.setBoardSize, 6, 21),
      score: clampInt(knobs.setScore, 1, 10),
      penalty: clampInt(knobs.setPenalty, 0, 10),
    },
  };
}

function buildFishDefinition(knobs: Knobs, id: string): GameDefinition {
  return {
    schemaVersion: CURRENT_SCHEMA,
    meta: {
      id, name: knobs.name, description: knobs.description || autoFishDescription(knobs),
      players: { min: clampInt(knobs.minPlayers, 2, 6), max: clampInt(knobs.maxPlayers, knobs.minPlayers, 6) },
      family: 'fishing',
    },
    deck: deckOf(knobs, { maxDecks: 2 }),
    zones: [
      { id: 'ocean', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
      { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    ],
    setup: [{ op: 'shuffle', zone: 'ocean' }, dealStep(knobs, 'ocean', 'hand')],
    turnFlow: { order: 'clockwise', startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
    actions: [],
    triggers: [],
    endConditions: [],
    scoring: { mode: 'lowestPoints', winner: 'highestTotal', cardPoints: {}, target: matchTarget(knobs) },
    fish: { bookSize: clampInt(knobs.bookSize, 2, 4) },
  };
}

function buildClimbDefinition(knobs: Knobs, id: string): GameDefinition {
  const order: Rank[] = knobs.climbTwosHigh
    ? ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2']
    : ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
  return {
    schemaVersion: CURRENT_SCHEMA,
    meta: {
      id, name: knobs.name, description: knobs.description || autoClimbDescription(knobs),
      players: { min: clampInt(knobs.minPlayers, 2, 8), max: clampInt(knobs.maxPlayers, knobs.minPlayers, 8) },
      family: 'climbing',
    },
    deck: deckOf(knobs, { maxDecks: 2 }),
    zones: [
      { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
      { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
      { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    ],
    setup: [{ op: 'shuffle', zone: 'draw' }, { op: 'dealAll', from: 'draw', to: 'hand' }],
    turnFlow: { order: knobs.direction, startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
    actions: [],
    triggers: [],
    endConditions: [{ id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' }],
    scoring: { mode: 'lowestPoints', winner: 'lowestTotal', cardPoints: {}, target: matchTarget(knobs) },
    climb: { order, combos: knobs.climbCombos || undefined, bombSize: knobs.climbBombSize > 0 ? clampInt(knobs.climbBombSize, 4, 6) : undefined },
  };
}

function buildTrickDefinition(knobs: Knobs, id: string): GameDefinition {
  return {
    schemaVersion: CURRENT_SCHEMA,
    meta: {
      id, name: knobs.name, description: knobs.description || autoTrickDescription(knobs),
      players: {
        min: clampInt(knobs.minPlayers, 2, 8), max: clampInt(knobs.maxPlayers, knobs.minPlayers, 8),
        ...(knobs.seatStep > 1 ? { step: clampInt(knobs.seatStep, 1, 4) } : {}),
      },
      family: 'trick-taking',
    },
    deck: deckOf(knobs, { maxDecks: 2 }),
    zones: [
      { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
      // The auction needs somewhere to turn a card up from.
      ...(knobs.trumpAuction
        ? [{ id: 'kitty', type: 'pile' as const, ordered: true, faceDown: false, visibility: 'top-public' as const, shared: true }]
        : []),
      { id: 'trick', type: 'trick', ordered: true, faceDown: false, visibility: 'all', shared: true },
      { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    ],
    setup: [
      { op: 'shuffle', zone: 'draw' },
      dealStep(knobs, 'draw', 'hand'),
      ...(knobs.trumpAuction ? [{ op: 'move' as const, from: 'draw', to: 'kitty', count: 1 }] : []),
    ],
    turnFlow: { order: knobs.direction, startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
    actions: [],
    triggers: [],
    endConditions: [{ id: 'handsEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' }],
    scoring: {
      mode: 'lowestPoints',
      // Penalty and fewest-tricks scoring both want LOW cumulative scores to win a match
      // (Hearts-style); most-tricks and bidding want HIGH cumulative scores to win (Spades-style).
      winner: knobs.trickScoreBy === 'penalty' || knobs.trickScoreBy === 'fewestTricks' ? 'lowestTotal' : 'highestTotal',
      cardPoints: {}, target: matchTarget(knobs),
      bust: knobs.trickBidding && knobs.matchPlay && knobs.bustEnabled ? -Math.abs(clampInt(knobs.bustScore, 10, 2000)) : null,
    },
    trick: {
      // Turned trump overrides the fixed-trump knob outright — the definition's own trump field
      // is meaningless once the last card dealt decides it instead.
      trump: knobs.turnedTrump && !knobs.trumpAuction && !knobs.contractAuction ? 'none' : knobs.trump,
      mustFollowSuit: knobs.mustFollowSuit, aceHigh: knobs.aceHigh,
      scoreBy: knobs.trickScoreBy,
      penaltyPoints: knobs.trickScoreBy === 'penalty'
        ? {
            ...(knobs.heartsValue ? { H: knobs.heartsValue } : {}),
            ...(knobs.queenSpadesValue ? { SQ: knobs.queenSpadesValue } : {}),
            // Anything the author priced by hand overrides the two presets.
            ...Object.fromEntries(Object.entries(knobs.penaltyCards).filter(([, v]) => v !== 0)),
          }
        : undefined,
      bidding: knobs.trickBidding || undefined,
      partnerships: knobs.trickPartnerships || undefined,
      // Euchre: trump is auctioned per hand instead of fixed.
      auction: knobs.trumpAuction && !knobs.contractAuction
        ? { upcardZone: 'kitty', dealerDiscards: true, rounds: 2 as const } : undefined,
      // A contract auction replaces the trump auction rather than stacking on it.
      numericAuction: knobs.contractAuction ? {
        minLevel: Math.max(1, Math.min(knobs.contractMinLevel, knobs.contractMaxLevel)),
        maxLevel: Math.max(1, knobs.contractMaxLevel),
        strains: (knobs.contractNoTrump ? ['C', 'D', 'H', 'S', 'NT'] : ['C', 'D', 'H', 'S']) as Strain[],
        book: Math.max(0, knobs.contractBook),
        trickValue: Math.max(1, knobs.contractTrickValue),
        overtrickValue: Math.max(0, knobs.contractOvertrickValue),
        undertrickValue: Math.max(0, knobs.contractUndertrickValue),
        ...(knobs.contractSlamBonus > 0 ? { slamBonus: knobs.contractSlamBonus } : {}),
        ...(knobs.contractOnCardPoints ? { makeOnCardPoints: clampInt(knobs.contractCardPointsTarget, 1, 1000) } : {}),
        ...(knobs.contractDealerMustBid
          ? { dealerMustBid: Math.max(1, Math.min(knobs.contractDealerMustBidLevel, knobs.contractMaxLevel)) }
          : {}),
        ...(knobs.contractDefendersScoreOwnTricks ? { defendersScoreOwnTricks: true } : {}),
        ...(knobs.contractConcedeWhenDecided ? { concedeWhenDecided: true } : {}),
        ...(knobs.contractChooseTrumpAfter ? { chooseTrumpAfter: true } : {}),
      } : undefined,
      // jacksAreTrumps promotes all four jacks out of their printed suits; bowers only promotes
      // two while leaving the other two where they are printed — a jack cannot be both at once.
      // Works with either auction shape — Five Hundred pairs it with a numeric contract, not a
      // turn-up trump auction.
      bowers: (knobs.trumpAuction || knobs.contractAuction) && knobs.bowers && !knobs.jacksAreTrumps ? true : undefined,
      jacksAreTrumps: knobs.jacksAreTrumps || undefined,
      goAlone: knobs.trumpAuction && knobs.goAlone && knobs.trickPartnerships ? true : undefined,
      euchreScoring: knobs.trumpAuction && knobs.trickPartnerships ? true : undefined,
      // Needs some way to decide who the declarer is, but not partnerships — Napoleon has no
      // partner to sit out at all; the auction winner plays alone against the whole table.
      soloDeclarer: knobs.soloDeclarer && (knobs.trumpAuction || knobs.contractAuction) ? true : undefined,
      turnedTrump: knobs.turnedTrump && !knobs.trumpAuction && !knobs.contractAuction ? true : undefined,
      // Hearts rules only make sense alongside penalty scoring.
      shootTheMoon: knobs.trickScoreBy === 'penalty' && knobs.shootTheMoon ? true : undefined,
      brokenSuit: knobs.trickScoreBy === 'penalty' && knobs.brokenSuitLead ? knobs.brokenSuit : undefined,
      leadCard: knobs.forceOpeningLead ? (knobs.openingLeadCard || 'C2') : undefined,
      // Only worth writing when there are jokers to rank, and only when it changes anything.
      jokerRank: knobs.includeJokers && knobs.jokerRank !== 'low' ? knobs.jokerRank : undefined,
      noPenaltyFirstTrick: knobs.trickScoreBy === 'penalty' && knobs.forceOpeningLead ? true : undefined,
      meldPatterns: knobs.meldMarriage
        ? [{ name: 'Marriage', ranks: ['K', 'Q'], points: clampInt(knobs.meldMarriagePoints, 1, 200), doubleInTrump: true }]
        : undefined,
    },
    handPass: knobs.handPassCount > 0
      ? { count: clampInt(knobs.handPassCount, 1, 4), rotation: ['left', 'right', 'across', 'hold'] }
      : undefined,
  };
}

function buildSheddingDefinition(knobs: Knobs, id: string): GameDefinition {
  const wildAll = dedup([...knobs.wildRanks, ...knobs.wildDrawRanks]);

  const tags: GameDefinition['deck']['tags'] = {};
  if (wildAll.length || knobs.wildCards.length) tags.wild = { ranks: wildAll, ...(knobs.wildCards.length ? { cards: [...knobs.wildCards] } : {}) };
  if (knobs.skipRanks.length) tags.skip = { ranks: knobs.skipRanks };
  if (knobs.reverseRanks.length) tags.reverse = { ranks: knobs.reverseRanks };
  if (knobs.drawRanks.length) tags.drawTwo = { ranks: knobs.drawRanks };
  if (knobs.extraTurnRanks.length) tags.again = { ranks: knobs.extraTurnRanks };
  if (knobs.wildDrawRanks.length) tags.wildDraw = { ranks: knobs.wildDrawRanks };
  if (knobs.passRanks.length) tags.wind = { ranks: knobs.passRanks };

  const triggers: GameDefinition['triggers'] = [];
  if (knobs.skipRanks.length) triggers.push({ on: 'cardPlayed', cardHasTag: 'skip', do: [{ op: 'skipNext' }] });
  if (knobs.reverseRanks.length) triggers.push({ on: 'cardPlayed', cardHasTag: 'reverse', do: [{ op: 'reverseOrder' }] });
  if (knobs.drawRanks.length) {
    triggers.push({ on: 'cardPlayed', cardHasTag: 'drawTwo', do: [{ op: 'forceDraw', target: 'next', from: 'draw', count: knobs.drawCount }, { op: 'skipNext' }] });
  }
  if (knobs.extraTurnRanks.length) triggers.push({ on: 'cardPlayed', cardHasTag: 'again', do: [{ op: 'extraTurn' }] });
  if (knobs.wildDrawRanks.length) {
    triggers.push({ on: 'cardPlayed', cardHasTag: 'wildDraw', do: [{ op: 'forceDraw', target: 'next', from: 'draw', count: knobs.wildDrawCount }, { op: 'skipNext' }] });
  }
  if (knobs.passRanks.length) triggers.push({ on: 'cardPlayed', cardHasTag: 'wind', do: [{ op: 'passCards', direction: knobs.passDirectionKnob }] });
  if (knobs.reshuffleWhenEmpty) triggers.push({ on: 'drawPileEmpty', do: [{ op: 'reshuffleDiscardInto', zone: 'draw', keepTop: true }] });

  const matchClauses: Predicate[] = [];
  if (knobs.matchSuit) matchClauses.push({ matches: { cardProp: 'suit', equalsStateOrTopOf: ['activeSuit', 'discard'] } });
  if (knobs.matchRank) matchClauses.push({ matches: { cardProp: 'rank', equalsTopOf: 'discard' } });
  if (knobs.matchColor) matchClauses.push({ matches: { cardProp: 'color', equalsTopOf: 'discard' } });
  if (wildAll.length || knobs.wildCards.length) matchClauses.push({ cardHasTag: 'wild' });
  // Never leave the play with zero ways to match (that would be unplayable): fall back to rank.
  if (matchClauses.length === 0) matchClauses.push({ matches: { cardProp: 'rank', equalsTopOf: 'discard' } });

  const playEffects: Effect[] = [
    { op: 'move', card: '$target', to: 'discard' },
    { op: 'setState', var: 'activeSuit', value: '$target.suit' },
  ];
  if (wildAll.length || knobs.wildCards.length) playEffects.push({ op: 'if', cond: { cardHasTag: 'wild' }, then: [{ op: 'chooseSuit', setState: 'activeSuit' }] });

  const drawEffects: Effect[] = knobs.drawUntilCanPlay && !knobs.canAlwaysDraw
    ? [{ op: 'drawUntilPlayable', from: 'draw' }]
    : [{ op: 'move', from: 'draw', to: 'hand', count: 1 }];
  const drawWhen: Predicate = knobs.canAlwaysDraw ? { always: true } : { not: { existsLegal: 'playCard' } };

  const cardPoints: Record<string, number | 'rankValue'> = { JOKER: knobs.jokerPoints };
  for (const r of RANKS_13) cardPoints[r] = knobs.perRankPoints[r] ?? 0;
  // Suits and single cards override the per-rank prices; `default` catches whatever is left.
  for (const [k, v] of Object.entries(knobs.cardValues)) cardPoints[k] = v;
  if (knobs.unpricedScoreRankValue) cardPoints.default = 'rankValue';

  return {
    schemaVersion: CURRENT_SCHEMA,
    meta: {
      id, name: knobs.name, description: knobs.description || autoDescription(knobs),
      players: { min: clampInt(knobs.minPlayers, 2, 8), max: clampInt(knobs.maxPlayers, knobs.minPlayers, 8) },
      family: 'shedding-matching',
    },
    deck: deckOf(knobs, { tags }),
    zones: [
      { id: 'draw', type: 'pile', ordered: true, faceDown: true, visibility: 'none', shared: true },
      { id: 'discard', type: 'pile', ordered: true, faceDown: false, visibility: 'top-public', shared: true },
      { id: 'hand', type: 'hand', ordered: false, faceDown: true, visibility: 'owner', perPlayer: true },
    ],
    setup: [
      { op: 'shuffle', zone: 'draw' },
      dealStep(knobs, 'draw', 'hand'),
      { op: 'move', from: 'draw', to: 'discard', count: 1 },
    ],
    turnFlow: { order: knobs.direction, startPlayer: 'first', actionsPerTurn: { min: 1, max: 1 } },
    actions: [
      { id: 'playCard', target: { from: 'hand', select: 'one' }, when: { any: matchClauses }, effects: playEffects },
      { id: 'drawCard', when: drawWhen, effects: drawEffects },
    ],
    triggers,
    endConditions: [
      { id: 'handEmpty', when: { zoneCount: { zone: 'hand', of: 'anyPlayer', eq: 0 } }, result: 'roundOver' },
    ],
    scoring: {
      mode: knobs.winMode === 'firstOut' ? 'firstToEmptyWins' : 'lowestPoints',
      cardPoints,
      target: matchTarget(knobs),
      winner: knobs.winMode,
    },
  };
}

// Best-effort: read knobs back out of a definition, so you can REMIX a classic.
export function knobsFromDefinition(def: GameDefinition): Knobs {
  const deal = def.setup.find((s) => s.op === 'deal') as { countPerPlayer: number } | undefined;
  const tagRanks = (t: string) => def.deck.tags[t]?.ranks ?? [];
  const play = def.actions.find((a) => a.id === 'playCard');
  const clauses = play && 'any' in play.when ? play.when.any : [];
  const hasMatch = (prop: string) => clauses.some((c) => 'matches' in c && c.matches.cardProp === prop);
  const drawTrig = def.triggers.find((t) => t.on === 'cardPlayed' && t.cardHasTag === 'drawTwo');
  const wildDrawTrig = def.triggers.find((t) => t.on === 'cardPlayed' && t.cardHasTag === 'wildDraw');
  const passTrig = def.triggers.find((t) => t.on === 'cardPlayed' && t.cardHasTag === 'wind');
  const passOp = passTrig?.do.find((e) => e.op === 'passCards') as { direction: 'left' | 'right' } | undefined;
  const countOf = (trig: typeof drawTrig, d: number) => {
    const fd = trig?.do.find((e) => e.op === 'forceDraw') as { count: number } | undefined;
    return fd?.count ?? d;
  };
  const drawAction = def.actions.find((a) => a.id === 'drawCard');
  const cp = def.scoring.cardPoints || {};
  const perRank: Record<string, number> = {};
  for (const r of RANKS_13) perRank[r] = typeof cp[r] === 'number' ? (cp[r] as number) : (defaultPoints[r] ?? 0);
  const wildDrawRanks = tagRanks('wildDraw');
  const wildRanks = tagRanks('wild').filter((r) => !wildDrawRanks.includes(r));

  return {
    family: def.solitaire ? 'solitaire' : def.war ? 'war' : def.rummy ? 'rummy' : def.fish ? 'fish' : def.climb ? 'climb' : def.trick ? 'trick'
      : def.bluff ? 'bluff' : def.reflex ? 'reflex' : def.poker ? 'poker' : def.pit ? 'pit'
      : def.kent ? 'kent' : def.set ? 'set' : def.maid ? 'maid' : def.layout ? 'layout' : def.swap ? 'swap' : 'shedding',
    /*
      Twists and restrictions survive a round trip now.

      A compiled rule is a Predicate/Effect tree; the ingredients that produced it are not
      recoverable from it, so importing a definition used to start the list empty — meaning a
      trip through the JSON editor silently DELETED every twist an author had written. Each
      compiled rule now carries its own draft alongside it, so what comes back is what went in.
    */
    customRules: (def.rules ?? []).map((r) => r.draft as RuleDraft | undefined).filter((d): d is RuleDraft => !!d),
    restrictions: (def.playRestrictions ?? []).map((r) => r.draft as RestrictionDraft | undefined).filter((d): d is RestrictionDraft => !!d),
    trump: def.trick?.trump ?? 'S',
    mustFollowSuit: def.trick?.mustFollowSuit ?? true,
    aceHigh: def.trick?.aceHigh ?? def.war?.aceHigh ?? true,
    trickScoreBy: def.trick?.scoreBy ?? 'mostTricks',
    trickBidding: !!def.trick?.bidding,
    trickPartnerships: !!def.trick?.partnerships,
    seatStep: def.meta.players.step ?? 1,
    bustEnabled: def.scoring.bust != null,
    bustScore: def.scoring.bust != null ? Math.abs(def.scoring.bust) : 200,
    // 0, not defaultKnobs' 1/13 — a shipped penalty game that never mentions H or SQ at all
    // (Briscola, Sixty-Six) means neither card carries a penalty, not "Hearts' own default value
    // happened to apply here too." The 1/13 defaults are for a fresh build with nothing to
    // reconstruct from, which is a different knob's job (see `defaultKnobs` above).
    heartsValue: (def.trick?.penaltyPoints?.H as number) ?? 0,
    queenSpadesValue: (def.trick?.penaltyPoints?.SQ as number) ?? 0,
    penaltyCards: Object.fromEntries(
      Object.entries(def.trick?.penaltyPoints ?? {}).filter(([k]) => k !== 'H' && k !== 'SQ'),
    ),
    trumpAuction: !!def.trick?.auction,
    contractAuction: !!def.trick?.numericAuction,
    contractMinLevel: def.trick?.numericAuction?.minLevel ?? 1,
    contractMaxLevel: def.trick?.numericAuction?.maxLevel ?? 7,
    contractBook: def.trick?.numericAuction?.book ?? 0,
    contractNoTrump: def.trick?.numericAuction ? def.trick.numericAuction.strains.includes('NT') : true,
    contractTrickValue: def.trick?.numericAuction?.trickValue ?? 10,
    contractOvertrickValue: def.trick?.numericAuction?.overtrickValue ?? 3,
    contractUndertrickValue: def.trick?.numericAuction?.undertrickValue ?? 12,
    contractSlamBonus: def.trick?.numericAuction?.slamBonus ?? 0,
    contractOnCardPoints: def.trick?.numericAuction?.makeOnCardPoints !== undefined,
    contractCardPointsTarget: def.trick?.numericAuction?.makeOnCardPoints ?? 61,
    contractDealerMustBid: def.trick?.numericAuction?.dealerMustBid !== undefined,
    contractDealerMustBidLevel: def.trick?.numericAuction?.dealerMustBid ?? 1,
    contractDefendersScoreOwnTricks: !!def.trick?.numericAuction?.defendersScoreOwnTricks,
    contractConcedeWhenDecided: !!def.trick?.numericAuction?.concedeWhenDecided,
    contractChooseTrumpAfter: !!def.trick?.numericAuction?.chooseTrumpAfter,
    bowers: !!def.trick?.bowers,
    goAlone: !!def.trick?.goAlone,
    shootTheMoon: !!def.trick?.shootTheMoon,
    brokenSuitLead: !!def.trick?.brokenSuit,
    brokenSuit: def.trick?.brokenSuit ?? 'H',
    forceOpeningLead: !!def.trick?.leadCard,
    openingLeadCard: def.trick?.leadCard ?? 'C2',
    handPassCount: def.handPass?.count ?? 0,
    jacksAreTrumps: !!def.trick?.jacksAreTrumps,
    soloDeclarer: !!def.trick?.soloDeclarer,
    turnedTrump: !!def.trick?.turnedTrump,
    meldMarriage: !!def.trick?.meldPatterns?.length,
    meldMarriagePoints: def.trick?.meldPatterns?.[0]?.points ?? 20,
    bookSize: def.fish?.bookSize ?? 4,
    solColumns: def.solitaire?.columns ?? 7,
    solDeal: def.solitaire?.deal ?? 'triangle',
    solFaceUp: def.solitaire?.faceUp ?? 'top',
    solFaceUpCount: def.solitaire?.faceUpCount ?? 1,
    solWrap: def.solitaire?.wrap ?? false,
    solWasteIsTarget: def.solitaire?.wasteIsTarget ?? false,
    solDealtBase: def.solitaire?.foundationStart === 'dealt',
    solReserve: def.solitaire?.reserve ?? 0,
    solDealCount: def.solitaire?.dealCount ?? 0,
    solBuild: def.solitaire?.build ?? 'alt-color',
    solMoveRun: def.solitaire?.moveRun ?? 'built',
    solEmpty: def.solitaire?.empty ?? 'king',
    solFreeCells: def.solitaire?.freeCells ?? 0,
    solFoundations: def.solitaire?.foundations ?? 4,
    solAutoRuns: def.solitaire?.foundationMode === 'auto-run',
    solStock: def.solitaire?.stock ?? 'waste',
    solStockTurn: def.solitaire?.stockTurn ?? 3,
    solRedeals: def.solitaire?.redeals ?? -1,
    solDecks: def.solitaire?.decks ?? 1,
    rummyKnock: def.rummy?.knock !== undefined,
    rummyKnockAt: def.rummy?.knock ?? 10,
    rummyLayOff: !!def.rummy?.layOff,
    rummyWilds: !!def.rummy?.wilds,
    rummyMaxWilds: def.rummy?.maxWildsPerMeld ?? 1,
    rummyGinBonus: def.rummy?.ginBonus ?? 25,
    rummyUndercutBonus: def.rummy?.undercutBonus ?? 25,
    rummySetMin: def.rummy?.setMin ?? 3,
    rummyRunMin: def.rummy?.runMin ?? 3,
    warRoundCap: def.war?.roundCap ?? 800,
    climbTwosHigh: def.climb ? def.climb.order[def.climb.order.length - 1] === '2' : true,
    climbCombos: !!def.climb?.combos,
    climbBombSize: def.climb?.bombSize ?? 0,
    name: def.meta.name,
    description: def.meta.description,
    minPlayers: def.meta.players.min,
    maxPlayers: def.meta.players.max,
    extraPiles: def.zones
      .filter((z) => z.shared && z.type === 'pile'
        && !['draw', 'discard', 'melds', 'ocean', 'center', 'pile', 'battle', 'kitty', 'stock'].includes(z.id))
      .map((z) => ({ id: z.id, faceUp: !z.faceDown })),
    // Kings Corner has no `deal` setup step — the engine synthesises its opening hand straight
    // from layout.handSize, so that's the one other place a real hand size can come from.
    handSize: deal?.countPerPlayer ?? def.layout?.handSize ?? 5,
    handSizeBySeats: (def.setup.find((x) => x.op === 'deal') as { countByPlayers?: Record<string, number> } | undefined)?.countByPlayers ?? {},
    deckCount: def.deck.deckCount ?? 1,
    excludeRanks: def.deck.excludeRanks ?? [],
    excludeCards: def.deck.excludeCards ?? [],
    wildCards: def.deck.tags.wild?.cards ?? [],
    // Only worth carrying back when it actually differs from the ordinary order; otherwise the
    // editor would show a custom order for every game that never asked for one.
    rankOrder: def.deck.rankOrder.join(',') === RANKS_13.join(',') ? [] : [...def.deck.rankOrder],
    includeJokers: def.deck.includeJokers,
    jokerCount: def.deck.jokerCount ?? 2,
    jokerRank: def.trick?.jokerRank ?? 'low',
    matchSuit: hasMatch('suit'),
    matchRank: hasMatch('rank'),
    matchColor: hasMatch('color'),
    canAlwaysDraw: !!drawAction && 'always' in (drawAction.when as object),
    drawUntilCanPlay: !!drawAction?.effects.some((e) => e.op === 'drawUntilPlayable'),
    wildRanks,
    skipRanks: tagRanks('skip'),
    reverseRanks: tagRanks('reverse'),
    drawRanks: tagRanks('drawTwo'),
    drawCount: countOf(drawTrig, 2),
    extraTurnRanks: tagRanks('again'),
    wildDrawRanks,
    wildDrawCount: countOf(wildDrawTrig, 4),
    passRanks: tagRanks('wind'),
    passDirectionKnob: passOp?.direction ?? 'left',
    direction: def.turnFlow.order,
    reshuffleWhenEmpty: def.triggers.some((t) => t.on === 'drawPileEmpty'),
    winMode: def.scoring.winner,
    matchPlay: typeof def.scoring.target === 'number',
    pointTarget: typeof def.scoring.target === 'number' ? def.scoring.target : 100,
    perRankPoints: perRank,
    jokerPoints: typeof cp.JOKER === 'number' ? (cp.JOKER as number) : 50,
    cardValues: Object.fromEntries(
      Object.entries(cp).filter(([k, v]) => typeof v === 'number' && k !== 'JOKER' && k !== 'default'
        && !RANKS_13.includes(k as Rank)),
    ) as Record<string, number>,
    unpricedScoreRankValue: cp.default === 'rankValue',
    reflexSlapRanks: def.reflex?.slapRanks ?? ['J'],
    reflexSlapMatch: def.reflex?.slapMatch ?? false,
    reflexFlipCap: def.reflex?.flipCap ?? 0,
    pokerHandSize: def.poker?.handSize ?? 5,
    pokerStartingChips: def.poker?.startingChips ?? 200,
    pokerAnte: def.poker?.ante ?? 0,
    pokerSmallBlind: def.poker?.smallBlind ?? 5,
    pokerBigBlind: def.poker?.bigBlind ?? 10,
    pokerMinRaise: def.poker?.minRaise ?? 10,
    pokerHands: def.poker?.hands ?? 1,
    bluffClaimRanks: def.bluff?.claimableRanks ?? [],
    pitCornerSize: def.pit?.cornerSize ?? 7,
    kentHandSize: def.kent?.handSize ?? 4,
    kentPoolSize: def.kent?.poolSize ?? 4,
    kentTellPlies: def.kent?.tellPlies ?? 3,
    kentLetters: def.kent?.letters ?? 'KENT',
    maidOddRank: def.maid?.oddRank ?? 'Q',
    layoutPiles: def.layout?.piles ?? 4,
    layoutCornerPiles: def.layout?.cornerPiles ?? 4,
    layoutCornerRank: def.layout?.cornerRank ?? 'K',
    layoutBuild: def.layout?.build ?? 'alt-color',
    layoutMovePiles: def.layout?.movePiles ?? true,
    swapSlots: def.swap?.slots ?? 4,
    swapPeekAtStart: def.swap?.peekAtStart ?? 2,
    swapPeekSelfRanks: def.swap?.peekSelfRanks ?? [],
    swapPeekOtherRanks: def.swap?.peekOtherRanks ?? [],
    swapBlindRanks: def.swap?.blindSwapRanks ?? [],
    swapCallName: def.swap?.callName ?? 'Dutch',
    swapTurnCap: def.swap?.turnCap ?? 40,
    swapCallPenalty: def.swap?.callPenalty ?? 10,
    setProperties: def.deck.attributes ?? defaultKnobs.setProperties,
    setSize: def.set?.size ?? 3,
    setBoardSize: def.set?.boardSize ?? 12,
    setScore: def.set?.score ?? 1,
    setPenalty: def.set?.penalty ?? 1,
  };
}

export function rankLabel(r: Rank): string { return r === 'JOKER' ? 'Joker' : r; }

const SUIT_WORD: Record<string, string> = { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades', none: 'no suit' };
function autoTrickDescription(k: Knobs): string {
  const parts = [`A trick-taking game. Deal ${k.handSize} cards each.`];
  parts.push(k.mustFollowSuit ? 'You must follow the led suit if you can.' : 'You may play any card.');
  if (k.trump !== 'none') parts.push(`${SUIT_WORD[k.trump]} are trump and beat every other suit.`);
  parts.push('The highest card wins the trick and leads the next.');
  parts.push(k.trickScoreBy === 'mostTricks' ? 'Take the most tricks to win.' : 'Take the fewest tricks to win.');
  return parts.join(' ');
}

function autoClimbDescription(k: Knobs): string {
  const order = k.climbTwosHigh ? 'run 3 (low) up to 2 (high)' : 'run 2 (low) up to Ace (high)';
  const beat = k.climbCombos
    ? 'Lead a single card, a pair or a triple; a reply must match that shape and beat its rank, or pass.'
    : 'Beat the card on the pile with a strictly higher one, or pass.';
  const bomb = k.climbBombSize > 0
    ? ` Four of a kind is a bomb — play it at any moment, even out of turn, and it beats anything.`
    : '';
  return `A climbing game. ${beat} When everyone passes, the pile clears and the last player to play leads.${bomb} Ranks ${order}. First to empty their hand wins.`;
}

function autoFishDescription(k: Knobs): string {
  return `A fishing game. Deal ${k.handSize} cards each. Ask an opponent for a rank you hold; if they have it you take all of it and ask again, otherwise draw from the ocean. Collect four of a rank for a book. Most books wins.`;
}

function dedup(rs: Rank[]): Rank[] { return Array.from(new Set(rs)); }
function clampInt(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, Math.round(n))); }
// null = a match is exactly one hand (legacy). A number = play repeated hands, accumulating
// score, until someone crosses it.
function matchTarget(knobs: Knobs): number | null {
  return knobs.matchPlay ? clampInt(knobs.pointTarget, 10, 2000) : null;
}

function autoDescription(k: Knobs): string {
  const list = (rs: Rank[]) => rs.map(rankLabel).join('/');
  const crit: string[] = [];
  if (k.matchSuit) crit.push('suit');
  if (k.matchRank) crit.push('rank');
  if (k.matchColor) crit.push('color');
  const parts = [`Match the top card by ${crit.join(' or ') || 'rank'}. Deal ${k.handSize} cards each${k.deckCount > 1 ? ` from ${k.deckCount} decks` : ''}.`];
  if (k.excludeRanks.length) parts.push(`${list(k.excludeRanks)} are removed from the deck.`);
  if (k.wildRanks.length) parts.push(`${list(k.wildRanks)} are wild.`);
  if (k.wildDrawRanks.length) parts.push(`${list(k.wildDrawRanks)} are wild and make the next player draw ${k.wildDrawCount}.`);
  if (k.skipRanks.length) parts.push(`${list(k.skipRanks)} skip the next player.`);
  if (k.reverseRanks.length) parts.push(`${list(k.reverseRanks)} reverse direction.`);
  if (k.drawRanks.length) parts.push(`${list(k.drawRanks)} make the next player draw ${k.drawCount}.`);
  if (k.extraTurnRanks.length) parts.push(`${list(k.extraTurnRanks)} let you play again.`);
  if (k.drawUntilCanPlay) parts.push('If you cannot play, keep drawing until you can.');
  parts.push(k.winMode === 'firstOut' ? 'First to empty their hand wins.'
    : k.winMode === 'highestTotal' ? 'Highest points wins.' : 'Lowest points wins.');
  return parts.join(' ');
}
