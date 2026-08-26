// The authoring model for the shedding/matching family. A "game" the user builds is a
// set of KNOBS; buildDefinition() compiles those knobs into a full GameDefinition the engine
// can run. This is what the visual editor edits and what the AI co-pilot writes to.

import { Effect, GameDefinition, Predicate, Rank, Strain, Suit } from '../engine/types';
import { RuleDraft, compileRules } from './ruleKit';
import { CURRENT_SCHEMA } from '../engine/migrate';

export const RANKS_13: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export interface Knobs {
  family: 'shedding' | 'trick' | 'climb' | 'fish' | 'rummy' | 'war' | 'solitaire'
    | 'bluff' | 'reflex' | 'poker' | 'pit';
  // Author-written conditional rules. Kept as drafts (ingredient ids + parameters) so the
  // builder can re-open them; compiled into definition.rules on every build.
  customRules: RuleDraft[];
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
  contractMaxLevel: number;  // how high the bidding may go
  contractBook: number;      // tricks the level sits on top of (Bridge's six; 0 for a short deal)
  bowers: boolean;           // trump jack, then the same-colour jack, top the trump suit
  goAlone: boolean;          // the maker may cut their partner out of the hand
  shootTheMoon: boolean;     // sweeping every penalty point scores you 0 and everyone else the pot
  brokenSuitLead: boolean;   // the penalty suit may not be LED until it has been broken
  forceOpeningLead: boolean; // the 2♣ holder leads it, and no points may fall on the first trick
  handPassCount: number;     // cards exchanged before each hand (0 = no exchange)
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
  // bluff — no extra knobs; claims may name any rank in the deck.
  // reflex
  reflexSlapRanks: Rank[];
  reflexSlapMatch: boolean;
  // poker
  pokerHandSize: number;
  pokerStartingChips: number;
  pokerAnte: number;
  pokerSmallBlind: number;
  pokerBigBlind: number;
  pokerMinRaise: number;
  // pit
  pitCornerSize: number;
  // solitaire — the board is described, not drawn: these are the dials the engine reads.
  solColumns: number;
  solDeal: 'triangle' | 'even';
  solFaceUp: 'top' | 'all';
  solBuild: 'alt-color' | 'same-suit' | 'any-suit' | 'down-any';
  solMoveRun: 'single' | 'built' | 'same-suit';
  solEmpty: 'any' | 'king' | 'none';
  solFreeCells: number;
  solFoundations: number;
  solAutoRuns: boolean;      // a finished suit run clears itself (Spider) instead of being placed
  solStock: 'none' | 'waste' | 'deal-row';
  solStockTurn: number;
  solRedeals: number;        // -1 = unlimited
  solDecks: number;
  // deck
  handSize: number;
  deckCount: number;
  excludeRanks: Rank[];
  /** Individual cards struck out of the pack, by suit+rank key ("SQ", "H10"). */
  excludeCards: string[];
  /** Individual cards that are wild, alongside whole ranks in wildRanks. */
  wildCards: string[];
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
  bustEnabled: false,
  bustScore: 200,
  heartsValue: 1,
  queenSpadesValue: 13,
  penaltyCards: {},
  trumpAuction: false,
  contractAuction: false,
  contractMaxLevel: 7,
  contractBook: 0,
  bowers: false,
  goAlone: false,
  shootTheMoon: false,
  brokenSuitLead: false,
  forceOpeningLead: false,
  handPassCount: 0,
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
  reflexSlapRanks: ['J'],
  reflexSlapMatch: false,
  pokerHandSize: 5,
  pokerStartingChips: 200,
  pokerAnte: 0,
  pokerSmallBlind: 5,
  pokerBigBlind: 10,
  pokerMinRaise: 10,
  pitCornerSize: 7,
  solColumns: 7,
  solDeal: 'triangle',
  solFaceUp: 'top',
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
  handSize: 5,
  deckCount: 1,
  excludeRanks: [],
  excludeCards: [],
  wildCards: [],
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

export function buildDefinition(knobs: Knobs, id = 'draft'): GameDefinition {
  const def = buildFamilyDefinition(knobs, id);
  // The near-programmable layer rides on top of whichever family this is, so a custom rule
  // works the same in a trick-taking game as in a shedding one.
  const rules = compileRules(knobs.customRules ?? []);
  return rules.length > 0 ? { ...def, rules } : def;
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
    rankOrder: opts.rankOrder ?? RANKS_13,
    tags: opts.tags ?? {},
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
  return buildSheddingDefinition(knobs, id);
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
      build: knobs.solBuild,
      moveRun: knobs.solMoveRun,
      empty: knobs.solEmpty,
      freeCells: clampInt(knobs.solFreeCells, 0, 6),
      foundations: clampInt(knobs.solFoundations, 1, 8),
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
  const finish = k.solAutoRuns
    ? 'Complete a King-to-Ace run in one suit and it clears itself off the board.'
    : 'Build the foundations up by suit from the aces.';
  return `A patience laid out in ${k.solColumns} columns. Build the columns downward ${build}. ${finish} ${gap}${cells}${stock}`;
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
    setup: [{ op: 'shuffle', zone: 'draw' }, { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: knobs.handSize }, { op: 'move', from: 'draw', to: 'discard', count: 1 }],
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
    bluff: {},
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
    reflex: { slapRanks: knobs.reflexSlapRanks, slapMatch: knobs.reflexSlapMatch },
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
    setup: [{ op: 'shuffle', zone: 'ocean' }, { op: 'deal', from: 'ocean', to: 'hand', countPerPlayer: knobs.handSize }],
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
      players: { min: clampInt(knobs.minPlayers, 2, 8), max: clampInt(knobs.maxPlayers, knobs.minPlayers, 8) },
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
      { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: knobs.handSize },
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
      trump: knobs.trump, mustFollowSuit: knobs.mustFollowSuit, aceHigh: knobs.aceHigh,
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
        minLevel: 1,
        maxLevel: Math.max(1, Math.min(7, knobs.contractMaxLevel)),
        strains: ['C', 'D', 'H', 'S', 'NT'] as const as Strain[],
        book: Math.max(0, knobs.contractBook),
        trickValue: 10,
        overtrickValue: 3,
        undertrickValue: 12,
        slamBonus: 30,
      } : undefined,
      bowers: knobs.trumpAuction && knobs.bowers ? true : undefined,
      goAlone: knobs.trumpAuction && knobs.goAlone && knobs.trickPartnerships ? true : undefined,
      euchreScoring: knobs.trumpAuction && knobs.trickPartnerships ? true : undefined,
      // Hearts rules only make sense alongside penalty scoring.
      shootTheMoon: knobs.trickScoreBy === 'penalty' && knobs.shootTheMoon ? true : undefined,
      brokenSuit: knobs.trickScoreBy === 'penalty' && knobs.brokenSuitLead ? 'H' : undefined,
      leadCard: knobs.forceOpeningLead ? 'C2' : undefined,
      // Only worth writing when there are jokers to rank, and only when it changes anything.
      jokerRank: knobs.includeJokers && knobs.jokerRank !== 'low' ? knobs.jokerRank : undefined,
      noPenaltyFirstTrick: knobs.trickScoreBy === 'penalty' && knobs.forceOpeningLead ? true : undefined,
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
      { op: 'deal', from: 'draw', to: 'hand', countPerPlayer: knobs.handSize },
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
      : def.bluff ? 'bluff' : def.reflex ? 'reflex' : def.poker ? 'poker' : def.pit ? 'pit' : 'shedding',
    // Compiled rules can't be turned back into the ingredients they were assembled from, so
    // importing a definition starts the rule list empty rather than pretending otherwise.
    customRules: [],
    trump: def.trick?.trump ?? 'S',
    mustFollowSuit: def.trick?.mustFollowSuit ?? true,
    aceHigh: def.trick?.aceHigh ?? def.war?.aceHigh ?? true,
    trickScoreBy: def.trick?.scoreBy ?? 'mostTricks',
    trickBidding: !!def.trick?.bidding,
    trickPartnerships: !!def.trick?.partnerships,
    bustEnabled: def.scoring.bust != null,
    bustScore: def.scoring.bust != null ? Math.abs(def.scoring.bust) : 200,
    heartsValue: (def.trick?.penaltyPoints?.H as number) ?? 1,
    queenSpadesValue: (def.trick?.penaltyPoints?.SQ as number) ?? 13,
    penaltyCards: Object.fromEntries(
      Object.entries(def.trick?.penaltyPoints ?? {}).filter(([k]) => k !== 'H' && k !== 'SQ'),
    ),
    trumpAuction: !!def.trick?.auction,
    contractAuction: !!def.trick?.numericAuction,
    contractMaxLevel: def.trick?.numericAuction?.maxLevel ?? 7,
    contractBook: def.trick?.numericAuction?.book ?? 0,
    bowers: !!def.trick?.bowers,
    goAlone: !!def.trick?.goAlone,
    shootTheMoon: !!def.trick?.shootTheMoon,
    brokenSuitLead: !!def.trick?.brokenSuit,
    forceOpeningLead: !!def.trick?.leadCard,
    handPassCount: def.handPass?.count ?? 0,
    bookSize: def.fish?.bookSize ?? 4,
    solColumns: def.solitaire?.columns ?? 7,
    solDeal: def.solitaire?.deal ?? 'triangle',
    solFaceUp: def.solitaire?.faceUp ?? 'top',
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
    handSize: deal?.countPerPlayer ?? 5,
    deckCount: def.deck.deckCount ?? 1,
    excludeRanks: def.deck.excludeRanks ?? [],
    excludeCards: def.deck.excludeCards ?? [],
    wildCards: def.deck.tags.wild?.cards ?? [],
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
    pokerHandSize: def.poker?.handSize ?? 5,
    pokerStartingChips: def.poker?.startingChips ?? 200,
    pokerAnte: def.poker?.ante ?? 0,
    pokerSmallBlind: def.poker?.smallBlind ?? 5,
    pokerBigBlind: def.poker?.bigBlind ?? 10,
    pokerMinRaise: def.poker?.minRaise ?? 10,
    pitCornerSize: def.pit?.cornerSize ?? 7,
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
