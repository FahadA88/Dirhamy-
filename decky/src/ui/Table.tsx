import { MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Card, GameDefinition, Move, RedactedState } from '../engine/types';
import { SUIT_SYMBOLS, buildDeck } from '../engine/deck';
import { CardFace } from './Card';
import { AttrCard, describeAttrs } from './AttrCard';
import { TableDressing, TableRail, FeltDust, SeasonalDrift } from './TableDressing';
import { CountUp } from './CountUp';
import { SevenSegmentNumber } from './SevenSegment';
import { DealMotion } from './DealMotion';
import { ScorePad } from './ScorePad';
import { Confetti } from './Confetti';
import { useSettings } from '../settings/SettingsContext';
import { BOT_SPEED_MS, botNameFor } from '../settings/settings';
import { playSound } from './sound';
import { haptic } from './haptics';
import { speak, stopSpeaking, spokenCard } from './speech';
import { useTurnAlert } from './useTurnAlert';
import { useDismissable } from './useEscape';
import { Confirm } from './Confirm';
import { useCardFlights } from './cardFlight';
import { useCardDrag, useCardPreview } from './cardDrag';
import { useGamepad } from './useGamepad';
import { useFullscreen } from './fullscreen';
import { service, rememberSession, forgetSession, resumableSession } from '../server/local';
import { Board, LocalTableClient, TableClient } from '../net/tableClient';
import { Seat, MoveRecord } from '../server/matchService';
import { recordResult } from '../social/records';

// This component holds a match id and a redacted view — never a MatchState. Every move it wants
// to make goes to the service as an intent; the service decides, and hands back the board as
// this player is allowed to see it. Opponents' hands are not in this file's reach, and a move
// the rules don't allow comes back refused with a reason rather than silently doing nothing.

const HUMAN = 'P1';
const SUIT_ORDER: Record<string, number> = { S: 0, H: 1, C: 2, D: 3, JOKER: 4 };
// Worklist: "no tutorial-highlight mechanism exists to hook onto" — this is that mechanism, kept
// to the one moment it is actually needed rather than a general-purpose spotlight system nobody
// asked for. Seen once, ever, the same way FirstRun's own key retires itself: the first card this
// player is ever offered a legal move on gets a gentle glow, and playing any card at all — this
// one or another — retires it for good.
const FIRST_CARD_KEY = 'decky.seenfirstcard.v1';

/**
 * Where each opponent sits, given how many of them there are. You are always at the bottom
 * of the screen, so the others fill the rest of the table the way people actually sit round
 * one: the seat that plays after you on your left, then round the top, to your right. Listing
 * the arrangements is clearer than deriving them, and there are only five.
 */
/**
 * Third-person verbs the engine writes about a seat, and what they become once that seat is
 * addressed as "you". Only the forms that actually appear in the log are listed; a verb that
 * is not here is left exactly as written, so an unlisted one reads oddly rather than wrongly.
 */
const YOU_VERB: Record<string, string> = {
  wins: 'win', takes: 'take', is: 'are', was: 'were', has: 'have', scores: 'score',
  passes: 'pass', posts: 'post', plays: 'play', draws: 'draw', discards: 'discard',
  deals: 'deal', bids: 'bid', asks: 'ask', withdraws: 'withdraw', trades: 'trade',
  spots: 'spot', slaps: 'slap', sits: 'sit', reveals: 'reveal', picks: 'pick',
  offers: 'offer', melds: 'meld', makes: 'make', leads: 'lead', lays: 'lay',
  knocks: 'knock', holds: 'hold', goes: 'go', folds: 'fold', flips: 'flip',
  corners: 'corner', completes: 'complete', checks: 'check', calls: 'call', fishes: 'fish',
  swaps: 'swap', signals: 'signal', turns: 'turn', spells: 'spell',
};

/**
 * What the hint should say when the move it suggests is not a card you can point at. The
 * engine names its own actions — `rummyDraw`, `orderUp`, `climbPass` — and those are internal
 * vocabulary a player has never been shown, so each one gets a sentence instead.
 */
function describeHint(m: Move, nameOf: (id: string) => string): string {
  const a = m.actionId;
  switch (a) {
    case 'bid': return `Bid ${m.choice ?? ''}.`.replace(' .', '.');
    case 'contractBid': return `Bid ${m.level ?? ''} ${m.strain ?? ''}.`.replace(/\s+\./, '.');
    case 'passBid': return 'Pass on the bidding.';
    case 'orderUp': return 'Order it up.';
    case 'nameTrump': return `Name ${m.choice ?? 'trump'} as trump.`;
    case 'dealerDiscard': return 'Discard one to the kitty.';
    case 'buryDiscard': return 'Bury a card in the kitty.';
    case 'drawStock': case 'fishDraw': return 'Draw from the stock.';
    case 'drawDiscard': return 'Take the discard.';
    case 'drawCard': return 'Draw a card.';
    case 'rummyDiscard': return 'Discard a card.';
    case 'meld': return 'Lay down that meld.';
    case 'layOff': return 'Lay it off on a meld already down.';
    case 'knock': return 'Knock — your deadwood is low enough.';
    case 'ask': return `Ask ${m.target ? nameOf(m.target) : 'someone'} for ${m.rank ?? 'a rank'}s.`;
    case 'climbPass': return 'Pass — you cannot beat that.';
    case 'climbNoBomb': return 'Let it stand.';
    case 'climbBomb': return 'Drop a bomb on it.';
    case 'bluffChallenge': return 'Call that claim a lie.';
    case 'reflexFlip': return 'Flip the next card.';
    case 'reflexSlap': return 'Slap it!';
    case 'warFlip': return 'Flip.';
    case 'pokerCheck': return 'Check.';
    case 'pokerCall': return 'Call.';
    case 'pokerFold': return 'Fold.';
    case 'pitAccept': return 'Take that trade.';
    case 'pitOffer': return 'Put an offer up.';
    case 'pitCancel': return 'Withdraw your offer.';
    case 'callSet': return 'Call that set.';
    case 'setPass': return 'Nothing there — pass.';
    case 'choosePass': return 'Pick a card to pass.';
    // Always a suit code (the engine only ever builds resolveChoice for a wild-card suit
    // pick) — spelled out as a symbol rather than the raw letter, the same as every other
    // suit shown at the table.
    case 'resolveChoice': return `Choose ${m.choice ? (SUIT_SYMBOLS[m.choice] ?? m.choice) : 'a suit'}.`;
    case 'solDraw': case 'solDeal': return 'Turn the stock.';
    case 'solRedeal': return 'Go through the stock again.';
    case 'kentSwap': return 'Trade one of yours for one on the table.';
    case 'kentRefresh': return 'Nothing there worth having — turn the table over.';
    case 'kentSignal': return 'You have four of a kind. Signal your partner.';
    case 'kentCall': return 'Your partner is signalling — call it.';
    case 'kentStop': return 'Somebody opposite is signalling. Call it off.';
    case 'kentWait': return 'Nothing to do but watch.';
    default: return 'There is a move available.';
  }
}

/**
 * Remove a leading "<name> " from a line that is already filed under that name, and put the
 * capital back on whatever now starts it. "You bid 0 (nil)." under a column reading "You"
 * becomes "Bid 0 (nil)."
 */
function stripLeadingName(text: string, name: string): string {
  if (!name || !text.toLowerCase().startsWith(name.toLowerCase() + ' ')) return text;
  const rest = text.slice(name.length + 1);
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

const SEAT_RING: Record<number, string[]> = {
  1: ['t'],
  2: ['l', 'r'],
  3: ['l', 't', 'r'],
  4: ['l', 'tl', 'tr', 'r'],
  5: ['l', 'tl', 't', 'tr', 'r'],
};
const SUIT_NAMES: Record<string, string> = { C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades' };
const SHAPE_NAME: Record<number, string> = { 1: 'single', 2: 'pair', 3: 'triple', 4: 'four', 5: 'five' };

/**
 * The one number worth remembering from a finished game, chosen per family because "best" means
 * something different in each. Returns null for families where no single number stands out —
 * a made-up statistic is worse than none.
 */
function highlightOf(view: RedactedState, me: string, def: GameDefinition): { key: string; label: string; value: number } | null {
  if (view.mode === 'poker') {
    const chips = view.chips?.[me];
    if (typeof chips === 'number') return { key: 'poker-chips', label: 'Biggest stack', value: chips };
  }
  if (view.mode === 'reflex') {
    const n = view.players.find((p) => p.id === me)?.handCount ?? 0;
    if (n > 0) return { key: 'reflex-cards', label: 'Most cards taken', value: n };
  }
  if (view.mode === 'trick') {
    const t = view.tricksWon?.[me];
    if (typeof t === 'number' && t > 0) return { key: 'tricks', label: 'Most tricks in a hand', value: t };
  }
  if (view.mode === 'fish') {
    const b = view.booksWon?.[me];
    if (typeof b === 'number' && b > 0) return { key: 'books', label: 'Most books', value: b };
  }
  if (view.mode === 'bluff') {
    const called = view.bluffCalled?.[me];
    if (typeof called === 'number' && called > 0) return { key: 'bluffs-called', label: 'Bluffs called', value: called };
  }
  if (view.mode === 'pit') {
    const trades = view.tradesCompleted?.[me];
    if (typeof trades === 'number' && trades > 0) return { key: 'pit-trades', label: 'Trades made', value: trades };
  }
  if (view.mode === 'war') {
    const wars = view.warsCount;
    if (typeof wars === 'number' && wars > 0) return { key: 'wars-fought', label: 'Wars fought', value: wars };
  }
  if (view.mode === 'kent') {
    // Letters live per pair, not per player — a seat's own team is the even/odd half of the
    // seating order, the same rule kentTeamOf uses server-side (partners sit opposite).
    const myIdx = view.players.findIndex((p) => p.id === me);
    const team = myIdx % 2 === 0 ? 'A' : 'B';
    const letters = view.kentLetters?.[team];
    if (typeof letters === 'number' && letters > 0) return { key: 'kent-letters', label: 'Letters spelled toward KENT', value: letters };
  }
  // Every other family falls back to the raw score — but only where a bigger score is the
  // thing worth bragging about. Climb (finish position: 1 = first out) and lowest-wins rummy
  // (cards left in hand) both score in the OPPOSITE direction, so this used to file a
  // last-place finish or a hand full of unmelded cards as somebody's "Best score".
  if (def.scoring.winner === 'highestTotal') {
    const score = view.matchScores?.[me] ?? view.scores?.[me];
    if (typeof score === 'number' && score > 0) return { key: 'score', label: 'Best score', value: score };
  }
  return null;
}

/** Piles the standard layout already draws somewhere of its own. */
const STANDARD_PILES = new Set([
  'draw', 'discard', 'melds', 'ocean', 'center', 'pile', 'battle', 'kitty', 'stock', 'trick',
]);

export function Table({ def, seats = 3, plan, practice = false, client: injected, mySeat, resumeMatchId, onMatchOver }: {
  def: GameDefinition;
  seats?: number;
  /** Who is sitting where. Omitted means the classic single human against bots. */
  plan?: Seat[];
  /**
   * The referee. Omitted means the one in this tab, which is the ordinary case. An online table
   * passes a client whose referee is across a socket — the table cannot tell the difference,
   * which is the whole point of the boundary.
   */
  client?: TableClient;
  /**
   * Which seat is this browser. Only meaningful online, where every seat is 'remote' and the
   * table cannot work out which one is yours by looking.
   */
  mySeat?: string;
  /** Resume this exact match rather than whichever was most recent. */
  resumeMatchId?: string;
  /**
   * A game for trying things out. Nothing is recorded, the undo window never closes, and a
   * hint is always on offer — so somebody can learn a game without it counting against them.
   */
  practice?: boolean;
  /**
   * Item 38: a tournament bracket table needs to know the match is fully decided — not just
   * one hand of it — so it can record who won and advance the bracket. Fired once, the moment
   * `matchOver` turns true; `null` only if the match somehow ended with nobody the winner.
   */
  onMatchOver?: (winnerId: string | null) => void;
}) {
  const { settings } = useSettings();
  const players = useMemo(
    () => plan ?? Array.from({ length: seats }, (_, i) => `P${i + 1}`),
    [seats, plan],
  );
  // Which local seat is looking at the screen. With one human this never changes; with
  // pass-and-play it follows whoever is owed a move, behind a hand-off screen so the next
  // player doesn't see the last one's cards.
  const localSeats = useMemo(
    // Online, exactly one seat belongs to this browser and it is named rather than inferred.
    () => (mySeat ? [mySeat] : plan ? plan.filter((s) => s.kind === 'local').map((s) => s.id) : [HUMAN]),
    [plan, mySeat],
  );
  const [me, setMe] = useState(localSeats[0] ?? HUMAN);
  const [handoff, setHandoff] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // The three match-level buttons — history, take back, restart — live behind one control
  // rather than on the line above your cards. See the .table-menu note below.
  const [tableMenu, setTableMenu] = useState(false);
  const { supported: fullscreenSupported, isFullscreen, toggle: toggleFullscreen } = useFullscreen();
  const [confirmingRestart, setConfirmingRestart] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const [history, setHistory] = useState<MoveRecord[]>([]);
  // The referee, and the last position it gave us. A local table makes its own client; an
  // online one is handed one already connected to the table it joined.
  // useRef's argument is NOT lazy: it is evaluated on every render and the value thrown away
  // on all but the first. Calling bootLocal there dealt a whole new match on every re-render of
  // an ended table — Pit and Trio finish in under a second, so a single visit left three
  // abandoned matches in the store and pointed the "unfinished game" pointer at the last of
  // them. Boot once, into a null ref.
  const bootRef = useRef<TableClient | null>(null);
  if (bootRef.current === null) bootRef.current = injected ?? bootLocal(def, players, false, resumeMatchId);
  const clientRef = bootRef as MutableRefObject<TableClient>;
  const [board, setBoard] = useState<Board>(() => clientRef.current.read(localSeats[0] ?? HUMAN));
  // One toast, two tones: a refusal is a red ✕, a status note is not.
  const [toast, setToast] = useState<{ text: string; tone: 'bad' | 'info' } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  /**
   * A card this seat has just played over a socket, before the referee has confirmed it. Only
   * ever set for a remote table's own outbound plays — never for anything reflected in from the
   * server about another seat, since the client has no visibility into an opponent's move before
   * their host confirms it either. Cleared the moment the round trip settles, whichever way it
   * goes, so it is never stale by more than one lag spike.
   */
  const [optimisticPlay, setOptimisticPlay] = useState<{ cardId: string; card: Card } | null>(null);
  const [firstCardSeen, setFirstCardSeen] = useState(() => {
    try { return !!localStorage.getItem(FIRST_CARD_KEY); } catch { return true; }
  });
  const markFirstCardSeen = () => {
    if (firstCardSeen) return;
    setFirstCardSeen(true);
    try { localStorage.setItem(FIRST_CARD_KEY, '1'); } catch { /* private mode: skip it */ }
  };
  // A shared layout has a second thing you can pick up: a whole pile, to drop on another one.
  const [selPile, setSelPile] = useState<string | null>(null);
  const [askRank, setAskRank] = useState<string | null>(null);
  // True while the dealer's hands are working. The cards are already in the view by then —
  // this only holds them back on screen so they appear to arrive rather than to have been
  // there all along.
  const [dealing, setDealing] = useState(false);
  // Nudges the bot loop when a step did nothing, so one seat that cannot move is not the end of
  // the game. Reset whenever the position actually changes.
  const [botTick, setBotTick] = useState(0);
  const botRetries = useRef(0);
  // bluff: which of your own cards are staged for the next claim, and what rank you'll claim
  // them as. Cleared on every submit and every fresh deal.
  const [bluffSelected, setBluffSelected] = useState<string[]>([]);
  const [bluffRank, setBluffRank] = useState<string | null>(null);
  // pit: the offer you're composing. No engine state backs this — it's just the form.
  const [pitGive, setPitGive] = useState<'C' | 'D' | 'H' | 'S'>('C');
  const [pitWant, setPitWant] = useState<'C' | 'D' | 'H' | 'S'>('D');
  const [pitCount, setPitCount] = useState(1);
  // The misclick window: set on every move you make, cleared when it lapses or is used.
  const [undoable, setUndoable] = useState(false);
  // Seconds left on the clock, or null when there is no clock.
  const [secsLeft, setSecsLeft] = useState<number | null>(null);
  // Which card the keyboard is on. Null means the keyboard is not driving the hand.
  const [cursor, setCursor] = useState<number | null>(null);
  // Replay: how far through the recorded moves we are looking, or null for "live".
  const [replayAt, setReplayAt] = useState<number | null>(null);
  // set: which board cards are picked so far. Cleared the moment a call is made either way.
  const [setPicked, setSetPicked] = useState<string[]>([]);

  const { matchId, view } = board;
  const passAndPlay = localSeats.length > 1;
  const myLegal = board.legal;

  function deal(fresh: boolean) {
    setSelected(null);
    setAskRank(null);
    setToast(null);
    // Card ids are deterministic per rank+suit, so a fresh shuffle can easily redeal the same id
    // into the same seat — leaving a stale staged/picked id here would make it render as already
    // selected in a hand nobody has touched yet.
    setBluffSelected([]);
    setBluffRank(null);
    setSetPicked([]);
    // Don't leave the abandoned match sitting in the store. An online table is never re-dealt
    // from this side — the host owns it — so this only ever replaces a local one.
    if (clientRef.current.remote) return;
    if (fresh) clientRef.current.end();
    clientRef.current = bootLocal(def, players, fresh);   // a fresh deal, never a resume
    setBoard(clientRef.current.read(localSeats[0] ?? HUMAN));
    setMe(localSeats[0] ?? HUMAN);
  }

  // Re-deal when the game or the seat count changes — but not on the first render, which the
  // lazy initializer above already handled.
  const bootKey = `${def.meta.id}:${players.length}`;
  const lastKey = useRef(bootKey);
  useEffect(() => {
    if (lastKey.current === bootKey) return;
    lastKey.current = bootKey;
    deal(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootKey]);

  // The pointer is only worth keeping while there is something to come back to.
  useEffect(() => {
    if (view.phase !== 'playing') forgetSession(matchId);
  }, [view.phase, matchId]);

  function restart() { deal(true); }

  /**
   * Play the same table again. The seat plan is a prop, so re-dealing keeps every seat, name
   * and bot tier exactly as they were — which is the whole point of the button.
   */
  function rematch() {
    setUndoable(false);
    deal(true);
  }

  /**
   * The exact hand this table started from, dealt fresh — not a new random one. Only offered
   * for a local table (see TableClient.replaySameDeal): an online match's deal belongs to
   * whoever is hosting it, not to any one seat at it.
   */
  function replayDeal() {
    const fn = clientRef.current.replaySameDeal;
    if (!fn) return;
    const newId = fn.call(clientRef.current, def.meta.id);
    if (!newId) return;
    setUndoable(false);
    clientRef.current = new LocalTableClient(newId, service);
    rememberSession(newId, def.meta.id, players.length);
    setBoard(clientRef.current.read(localSeats[0] ?? HUMAN));
    setMe(localSeats[0] ?? HUMAN);
  }
  const isFish = view.mode === 'fish';
  // Climbing moves carry a card group rather than a single cardId; a one-card group is still
  // a plain tap-to-play, so fold those in alongside the normal cardId moves.
  const playableCardIds = useMemo(
    () => (isFish
      ? new Set(view.isYourTurn ? view.hand.map((c) => c.id) : [])
      : new Set([
          ...myLegal.filter((m) => m.cardId).map((m) => m.cardId!),
          ...myLegal.filter((m) => m.actionId === 'climbPlay' && m.cards?.length === 1).map((m) => m.cards![0]),
        ])),
    [myLegal, isFish, view.isYourTurn, view.hand],
  );
  const canDraw = myLegal.some((m) => m.actionId === 'drawCard');
  const canPass = myLegal.some((m) => m.actionId === 'climbPass');
  const canFishDraw = myLegal.some((m) => m.actionId === 'fishDraw');
  const canDrawStock = myLegal.some((m) => m.actionId === 'drawStock');
  const canDrawDiscard = myLegal.some((m) => m.actionId === 'drawDiscard');
  const isRummy = view.mode === 'rummy';
  const isWar = view.mode === 'war';
  const isClimb = view.mode === 'climb';
  const isBluff = view.mode === 'bluff';
  const isReflex = view.mode === 'reflex';
  const isPoker = view.mode === 'poker';
  const isPit = view.mode === 'pit';
  const isSet = view.mode === 'set';
  const isKent = view.mode === 'kent';
  const isLayout = view.mode === 'layout';
  const isSwap = view.mode === 'swap';
  const isMaid = view.mode === 'maid';
  const isCapture = view.mode === 'capture';
  const moonShooter = view.shotMoon ?? null;
  // Gin and an undercut are the two gin-rummy endings worth a beat of their own; an ordinary
  // knock is the unremarkable case the generic "X takes it" heading already covers.
  const ginOutcome = view.roundOutcome === 'gin' || view.roundOutcome === 'undercut' ? view.roundOutcome : null;
  const slamMade = view.roundOutcome === 'slam';
  // Groups of 2+ need a button — you can't express "these three cards" with one tap.
  const comboMoves = useMemo(
    () => myLegal.filter((m) => m.actionId === 'climbPlay' && (m.cards?.length ?? 1) > 1),
    [myLegal],
  );
  const bombMoves = useMemo(() => myLegal.filter((m) => m.actionId === 'climbBomb'), [myLegal]);
  const canDeclineBomb = myLegal.some((m) => m.actionId === 'climbNoBomb');
  const isInterrupt = isClimb && view.isYourTurn && !view.players.find((p) => p.id === me)?.isTurn;
  const rankOfId = (id: string) => view.hand.find((c) => c.id === id)?.rank ?? '?';
  const auctionMoves = useMemo(
    () => myLegal.filter((m) => m.actionId === 'orderUp' || m.actionId === 'nameTrump'),
    [myLegal],
  );
  const canPassBid = myLegal.some((m) => m.actionId === 'passBid');
  const knockMoves = useMemo(() => myLegal.filter((m) => m.actionId === 'knock'), [myLegal]);
  const layOffMoves = useMemo(() => myLegal.filter((m) => m.actionId === 'layOff'), [myLegal]);
  const discardMoves = useMemo(
    () => myLegal.filter((m) => m.actionId === 'dealerDiscard' || m.actionId === 'buryDiscard'),
    [myLegal],
  );
  // pit: which suits you hold enough of to offer, and how many of the chosen one you could put
  // up. Both come from the engine's own list of legal offers, so the form can never show a
  // combination it would then refuse.
  const pitGivable = useMemo(
    () => (['C', 'D', 'H', 'S'] as const).filter((sut) => myLegal.some((m) => m.actionId === 'pitOffer' && m.give === sut)),
    [myLegal],
  );
  const pitCounts = useMemo(
    () => [1, 2, 3].filter((n) => myLegal.some((m) => m.actionId === 'pitOffer' && m.give === pitGive && m.cards?.[0] === String(n))),
    [myLegal, pitGive],
  );
  useEffect(() => {
    if (!isPit || pitGivable.length === 0) return;
    if (!pitGivable.includes(pitGive)) { setPitGive(pitGivable[0]); return; }
    if (pitWant === pitGive) {
      setPitWant((['C', 'D', 'H', 'S'] as const).find((sut) => sut !== pitGive) ?? 'D');
      return;
    }
    if (pitCounts.length && !pitCounts.includes(pitCount)) setPitCount(pitCounts[0]);
  }, [isPit, pitGivable, pitCounts, pitGive, pitWant, pitCount]);

  const canFlip = myLegal.some((m) => m.actionId === 'warFlip');
  const myPile = view.players.find((p) => p.id === me)?.handCount ?? 0;
  const playActionId = view.needsPassChoice ? 'choosePass'
    : discardMoves.length > 0 ? discardMoves[0].actionId
    : view.mode === 'trick' ? 'playToTrick' : view.mode === 'climb' ? 'climbPlay' : isRummy ? 'rummyDiscard' : 'playCard';

  // Bot loop, paced by the user's bot-speed setting. Bots move inside the service — the client
  // asks it to advance one seat and gets back its own view, so a bot's hand never crosses the
  // boundary just to be played. A simultaneous pass can leave several bots waiting at once;
  // one per tick cascades through all of them.
  useEffect(() => {
    if (view.phase !== 'playing') return;
    // Online, the host runs the bots. A guest stepping them would be a second referee.
    if (clientRef.current.remote) return;
    const waiting = clientRef.current.pending().some((p) => !localSeats.includes(p));
    if (!waiting) return;
    // A floor for the games with no turn order.
    //
    // "Instant" means "don't make me wait for a bot to take its turn", which is a turn-based
    // idea. Pit, Trio and Slapjack have no turns: every seat is live at once, so forty
    // milliseconds a move is not speed, it is the bots finishing the entire game between the
    // deal and your first look at the table. Pit ended before a single offer could be read.
    const noTurnOrder = isPit || isSet || isReflex || isKent;
    // Spotting a set is not a turn, it is a race — so the bot's delay IS its skill, and the
    // difficulty setting has to spend itself there rather than on the miss chance alone. At half
    // a second a go, two bots between them called a set roughly every second: faster than anyone
    // can scan twelve cards, and a person finished a whole game on nought while the bots split
    // seven between them. These are how long a bot looks before it says anything.
    const SET_THINK: Record<string, number> = {
      easy: 9000, normal: 5500, hard: 3000, smart: 3000, random: 9000,
    };
    // Slapjack is the same argument at a shorter scale. The bot always slaps the moment it is
    // allowed to, with no hesitation and nothing the difficulty setting touches — so a tier a
    // player had chosen made no difference whatever to the only game in the catalogue that is
    // purely about reflexes. This is how long a hand takes to come down.
    const SLAP_THINK: Record<string, number> = {
      easy: 1700, normal: 900, hard: 430, smart: 430, random: 2100,
    };
    // In a race the delay is not pacing, it is the opponent's skill, so the bot-speed setting
    // does not get a vote — it is about how long you wait for somebody else's turn, and these
    // games have no turns. Taking the larger of the two put every tier at the 950ms of "normal
    // speed" and a person beat the sharpest bot to every single slap.
    // Kent is two games at once: a slow one where everybody trades with the table, and a fast
    // one that starts the instant somebody signals. Only the second is a race, so only the
    // second is paced by how sharp the opponents are.
    // And the slow half of Kent is paced by difficulty as well. Sharp opponents trading at the
    // speed of the loop assembled four of a kind and called it inside five seconds, which is
    // before anybody has read their own hand: the first round of every game was over before the
    // player had made a move. How fast the other three trade is most of how hard the game is.
    const KENT_THINK: Record<string, number> = {
      easy: 1700, normal: 1050, hard: 620, smart: 620, random: 1900,
    };
    const tellUp = !!view.kentTell;
    const delay = isSet ? (SET_THINK[settings.botDiff] ?? 5500)
      : isReflex ? (SLAP_THINK[settings.botDiff] ?? 900)
      : isKent && tellUp ? (SLAP_THINK[settings.botDiff] ?? 900) * 1.5
      : isKent ? (KENT_THINK[settings.botDiff] ?? 1050)
      : Math.max(BOT_SPEED_MS[settings.botSpeed] ?? 950, noTurnOrder ? 420 : 0);
    // Everybody at once, where everybody is at once.
    //
    // A tick steps one bot, which is right at a table with a turn order because only one seat
    // can act. Pit and Kent have no turn order — every seat is live the whole time — so
    // stepping them in rotation runs the table at a third or a fifth of its real speed, and a
    // game that takes two hundred moves takes two minutes to get going. They move together
    // now, except while a tell is up: that part IS a race, and a race the other side gets to
    // run all at once is not one.
    const together = (isPit || isKent) && !view.kentTell
      ? Math.max(1, clientRef.current.pending().filter((p) => !localSeats.includes(p)).length)
      : 1;
    const timer = setTimeout(() => {
      let any = false;
      for (let i = 0; i < together; i++) {
        const step = clientRef.current.botStep(localSeats, settings.botDiff);
        if (!step.moved) break;
        any = true;
      }
      const r = { moved: any };
      if (r.moved) { botRetries.current = 0; setBoard(clientRef.current.read(me)); return; }
      // The referee refused to guess: it picked a seat and that seat's chosen move was not on
      // its own legal list, so nothing happened. Nothing happening also means the position did
      // not change, and this effect is keyed on the position — so without a nudge the table
      // would sit there forever waiting for a bot that never gets asked again. Try the next
      // seat, a few times, then stop rather than spin.
      if (botRetries.current < 8) { botRetries.current += 1; setBotTick((n) => n + 1); }
    }, delay);
    return () => clearTimeout(timer);
  }, [board, botTick, matchId, me, localSeats, view.phase, view.kentTell, settings.botSpeed, settings.botDiff, isPit, isSet, isReflex, isKent, clientRef]);

  // A fresh position means a fresh allowance of retries.
  useEffect(() => { botRetries.current = 0; }, [board]);

  // Pass-and-play: when the table is waiting on a different local seat, put a hand-off screen up
  // rather than swapping the cards under the person still looking at them.
  useEffect(() => {
    if (!passAndPlay || view.phase !== 'playing' || handoff) return;
    const waiting = clientRef.current.pending().filter((p) => localSeats.includes(p));
    if (waiting.length === 0 || waiting.includes(me)) return;
    setHandoff(waiting[0]);
  }, [board, passAndPlay, view.phase, handoff, matchId, me, localSeats, clientRef]);

  function takeSeat(seat: string) {
    setHandoff(null);
    setSelected(null);
    setAskRank(null);
    setMe(seat);
    setBoard(clientRef.current.read(seat));
  }

  // A beginner hint asks the service what it would do. It is the same advisor the bots use, so
  // it can only suggest something this player is actually allowed to play.
  function showHint() {
    const m = clientRef.current.hint(me);
    if (!m) { setToast({ text: 'No legal move to suggest right now.', tone: 'info' }); return; }
    setHint(m.cardId ?? m.cards?.[0] ?? null);
    // A hint that is not about a card has to say what to do in words. Naming the raw action
    // — Try "rummyDraw" — is the engine's vocabulary, not anything a player has been shown.
    setToast({
      text: m.cardId || m.cards?.length ? 'Try the glowing card.' : describeHint(m, nameOf),
      tone: 'info',
    });
  }

  // Worklist #64: a rough count of likely tricks, asked for rather than shown unprompted — the
  // same estimate a bidding bot already makes of its own hand.
  function showHandStrength() {
    const n = clientRef.current.handStrength(me);
    if (n === null) { setToast({ text: 'No estimate to make right now.', tone: 'info' }); return; }
    setToast({ text: `Rough read: about ${n} trick${n === 1 ? '' : 's'} in this hand.`, tone: 'info' });
  }

  function openHistory() {
    setHistory(clientRef.current.history());
    setShowHistory(true);
  }

  /** Worklist #90: "seed plus move list replays a match exactly. There is no file, no import,
   *  no way to send somebody a game." serverSeed/handSeeds are only ever included once the
   *  engine itself has revealed them (see MatchService.reveal) — an in-progress match exports
   *  everything except the one thing the fairness scheme deliberately still keeps secret. */
  function exportMatch() {
    const fair = clientRef.current.fairness();
    const payload = {
      decky: 'match-export', version: 1,
      exportedAt: new Date().toISOString(),
      gameId: def.meta.id,
      gameName: def.meta.name,
      seats: clientRef.current.seats(),
      fair: fair ?? null,
      moves: clientRef.current.history(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `decky-match-${def.meta.id}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function askTakeback() {
    // requestTakeback answers null both for "done, nobody's permission needed" and for
    // "there was nothing to take back", so on a table where no move has been made yet this
    // cheerfully reported taking one back. Ask first.
    if (clientRef.current.history().length === 0) {
      setToast({ text: 'Nothing to take back yet.', tone: 'info' });
      return;
    }
    const req = clientRef.current.requestTakeback(me);
    setBoard(clientRef.current.read(me));
    setToast(req
      ? { text: `Asked the table to take that back — waiting on ${req.needed.length}.`, tone: 'info' }
      : { text: 'Move taken back.', tone: 'info' });
  }

  const takeback = view.phase === 'playing' ? clientRef.current.pendingTakeback() : null;
  /*
    A seat's name wherever one is needed outside the felt — the history list, the hand-off
    screen, a take-back request. Without a seating plan this fell through to the raw id, so
    the history panel listed "P1", "P2" while every seat at the table said "You" and "Bot 2".
    `logName` is the same answer for the same question, so it is the one used.
  */
  const nameOfSeat = (id: string) => logName(id);

  useEffect(() => { setHint(null); }, [board]);

  // ---------- taking back a misclick ----------

  // Only offered where it is honest: a table of bots, with the window still open. Against a
  // person the takeback above is the right instrument, because they have already seen it.
  const soloTable = !plan || plan.every((s) => s.kind !== 'remote');
  const canQuickUndo = undoable && soloTable && view.phase === 'playing'
    && (practice || settings.undoGraceMs > 0);

  // The window closes on its own. Restarting the timer on every move means the clock always
  // measures from the most recent one.
  useEffect(() => {
    // In practice the window never shuts — taking a move back is the point of practising.
    if (!undoable || practice || settings.undoGraceMs <= 0) return;
    const t = setTimeout(() => setUndoable(false), settings.undoGraceMs);
    return () => clearTimeout(t);
  }, [undoable, practice, settings.undoGraceMs]);

  function quickUndo() {
    const res = clientRef.current.quickUndo(me);
    setUndoable(false);
    if (!res.ok) { setToast({ text: res.reason ?? 'Nothing to take back.', tone: 'bad' }); return; }
    playSound('ui', settings);
    setSelected(null);
    setAskRank(null);
    setBluffSelected([]);
    setBluffRank(null);
    setBoard(clientRef.current.read(me));
    setToast({ text: 'Taken back.', tone: 'info' });
  }

  // ---------- online connection dot ----------

  // Polled rather than pushed: the socket has no "reconnecting" event of its own, only a
  // readyState a moment can ask about. A live table barely re-renders on this — the state
  // only actually flips on a drop or a reconnect.
  const [conn, setConn] = useState<'live' | 'reconnecting'>('live');
  useEffect(() => {
    if (!clientRef.current.remote) return;
    setConn(clientRef.current.connectionState());
    const tick = setInterval(() => setConn(clientRef.current.connectionState()), 1000);
    return () => clearInterval(tick);
  }, [matchId, clientRef]);

  // ---------- the clock ----------

  // Counts only while you are actually owed a move. Running out plays a legal move rather than
  // forfeiting the hand — a clock should hurry somebody along, not decide the game.
  useEffect(() => {
    if (settings.turnSeconds <= 0 || view.phase !== 'playing' || !view.isYourTurn) {
      setSecsLeft(null);
      return;
    }
    setSecsLeft(settings.turnSeconds);
    const tick = setInterval(() => {
      setSecsLeft((n) => {
        if (n === null) return null;
        if (n > 1) return n - 1;
        // Out of time: take the advisor's move, or the first legal one.
        const m = clientRef.current.hint(me) ?? board.legal[0];
        if (m) {
          clientRef.current.submit(me, m);
          setBoard(clientRef.current.read(me));
          setToast({ text: 'Out of time — a move was played for you.', tone: 'info' });
        }
        return null;
      });
    }, 1000);
    return () => clearInterval(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board, settings.turnSeconds, view.phase, view.isYourTurn, matchId, me]);

  // ---------- saying what happened ----------

  const lastLine = view.log[view.log.length - 1]?.text ?? '';

  // A one-time gold sweep the first time anybody reaches match point — one hand-win short of
  // the race target every match-target scored game already carries in the redacted view, so
  // this reads off data every one of those families already exposes rather than a per-family
  // notion of "about to win" that would have to be taught to each one separately.
  const [showMatchPoint, setShowMatchPoint] = useState(false);
  const matchPointShown = useRef(false);
  useEffect(() => { matchPointShown.current = false; }, [matchId]);
  useEffect(() => {
    if (view.matchTarget == null || matchPointShown.current) return;
    const scores = view.matchScores ?? view.scores;
    if (!scores) return;
    if (Object.values(scores).some((v) => v === view.matchTarget! - 1)) {
      matchPointShown.current = true;
      setShowMatchPoint(true);
      const t = setTimeout(() => setShowMatchPoint(false), 1200);
      return () => clearTimeout(t);
    }
  }, [view.matchTarget, view.matchScores, view.scores, matchId]);

  // A warm flash behind the melds pile the moment it grows — sized to how many cards just
  // landed rather than the same puff for a pair or a full run.
  const [meldFlash, setMeldFlash] = useState(0);
  const prevMeldCount = useRef(view.zones.melds?.cards.length ?? 0);
  useEffect(() => {
    const n = view.zones.melds?.cards.length ?? 0;
    if (n > prevMeldCount.current) {
      setMeldFlash(n - prevMeldCount.current);
      const t = setTimeout(() => setMeldFlash(0), 560);
      prevMeldCount.current = n;
      return () => clearTimeout(t);
    }
    prevMeldCount.current = n;
  }, [view.zones.melds?.cards.length]);

  // A contract that just failed outright gets one honest tremor through the felt — not a card
  // shaking (that already means "you tried something the rules refuse"), the whole table taking
  // the news. Read off the log line rather than a dedicated engine flag, so no scoring code has
  // to know the UI wants to react to it.
  const [shaking, setShaking] = useState(false);
  const shookLine = useRef('');
  useEffect(() => {
    if (!lastLine || lastLine === shookLine.current || !/\bwent down\b/i.test(lastLine)) return;
    shookLine.current = lastLine;
    setShaking(true);
    const t = setTimeout(() => setShaking(false), 420);
    return () => clearTimeout(t);
  }, [lastLine]);

  // Read the table aloud, when asked. The screen-reader region below is separate and always on.
  useEffect(() => {
    speak(lastLine, settings.speak);
  }, [lastLine, settings.speak]);

  useEffect(() => { if (!settings.speak) stopSpeaking(); }, [settings.speak]);
  useEffect(() => () => stopSpeaking(), []);

  // Mark the tab when somebody is waiting on you and looking somewhere else.
  useTurnAlert(view.phase === 'playing' && !!view.isYourTurn);

  // Worklist #96: a short buzz for your turn starting — a phone in a pocket can feel this where
  // a tab-title flash goes unseen. Pit, Kent and Set have no turn order, so "you could always
  // act" is never the same event as "your turn began"; excluded for the same reason
  // autoPlayForced excludes them below.
  const prevYourTurn = useRef(view.isYourTurn);
  useEffect(() => {
    if (!isPit && !isKent && !isSet && view.phase === 'playing' && view.isYourTurn && !prevYourTurn.current) {
      haptic('turn', settings.haptics);
    }
    prevYourTurn.current = view.isYourTurn;
  }, [view.isYourTurn, view.phase, isPit, isKent, isSet, settings.haptics]);

  // A ring crossing the felt when your turn begins — decoration only, the badges above already
  // say whose turn it is. Centred on the felt rather than aimed from the seat that just
  // finished: a redacted view only ever knows that it is your turn now, not whose it just was.
  const [rippleKey, setRippleKey] = useState(0);
  useEffect(() => {
    if (!isPit && !isKent && !isSet && view.phase === 'playing' && view.isYourTurn && !prevYourTurn.current) {
      setRippleKey((n) => n + 1);
    }
  }, [view.isYourTurn, view.phase, isPit, isKent, isSet]);

  // An online table changes because somebody else moved, not because we did. The client tells
  // us the cached position moved; we re-read it for our own seat and render.
  useEffect(() => {
    const c = clientRef.current;
    return c.onChange(() => {
      setBoard(c.read(me));
      // Whatever just landed is the round trip settling — accepted, refused, or simply
      // overtaken by somebody else's move — so the echoed card has done its job either way.
      setOptimisticPlay(null);
      // A refusal from a networked referee lands after we have already told the player their
      // move went through. Surface it when it arrives rather than letting it disappear.
      const late = (c as { lastRefusal?: string | null }).lastRefusal;
      if (late) {
        setToast({ text: late, tone: 'bad' });
        (c as { lastRefusal?: string | null }).lastRefusal = null;
      }
    });
  }, [me, clientRef]);

  // Closing the tab on an online table should hang up, not leave a socket open.
  useEffect(() => {
    const c = clientRef.current;
    return () => { if (c.remote) c.end(); };
  }, [clientRef]);


  // ---------- playing without a mouse ----------
  //
  // Cards are already real buttons, so tabbing reaches them. What was missing is the part that
  // makes a hand feel like a hand: arrows to run along it, Enter to play, and a cursor that
  // remembers where it was. The roving tabindex keeps the hand a single tab stop rather than
  // fifty-two, which is the difference between usable and exhausting.
  // Shared with the gamepad hook below: moves the roving cursor to an index (wrapped into
  // range) and moves real focus with it, so a screen reader announces the card it lands on
  // whether the cursor got there from an arrow key or a D-pad.
  function moveCursor(ids: string[], next: number) {
    if (ids.length === 0) return;
    const wrapped = ((next % ids.length) + ids.length) % ids.length;
    setCursor(wrapped);
    const el = document.querySelector<HTMLElement>(`[data-cardkey="${CSS.escape(ids[wrapped])}"]`);
    el?.focus();
  }

  function handKeys(e: React.KeyboardEvent, ids: string[], play: (id: string) => void) {
    if (ids.length === 0) return;
    const at = cursor === null ? -1 : Math.min(cursor, ids.length - 1);
    if (e.key === 'ArrowRight') { e.preventDefault(); moveCursor(ids, at + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); moveCursor(ids, at <= 0 ? ids.length - 1 : at - 1); }
    else if (e.key === 'Home') { e.preventDefault(); moveCursor(ids, 0); }
    else if (e.key === 'End') { e.preventDefault(); moveCursor(ids, ids.length - 1); }
    else if (e.key === 'Enter' || e.key === ' ') {
      if (at >= 0) { e.preventDefault(); play(ids[at]); }
    }
  }

  /** Why a dimmed card cannot be played — the same reasons the service would give on a
   *  refused submit, worked out here from what the client already has so a card can say why
   *  before it is ever tapped, not only after. Mirrors matchService's explainIllegal, minus
   *  the cases that need state the client is never handed (see redact()). */
  function dimReason(c: Card): string {
    if (myLegal.length === 0) return 'You have no legal moves right now';
    if (def.trick) {
      if (view.lead && c.suit !== view.lead && hand.some((h) => h.suit === view.lead)) {
        return `must follow ${SUIT_NAMES[view.lead]} — you still hold one`;
      }
      if (def.trick.leadCard && myLegal.length === 1 && myLegal[0].cardId) return 'the opening lead is forced';
      if (def.trick.brokenSuit && !view.brokenSuitPlayed && c.suit === def.trick.brokenSuit) {
        return `${SUIT_NAMES[def.trick.brokenSuit]} have not been broken yet`;
      }
    }
    if (def.climb && view.climbPile && view.climbPile.length > 0) {
      const shape = SHAPE_NAME[view.climbPile.length] ?? `${view.climbPile.length} of a kind`;
      return `needs a ${shape} beating the ${view.climbPile[0].rank} on the pile`;
    }
    return 'not a legal move right now';
  }
  function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }

  /** What a card should be called out loud, plus why it cannot be played if it cannot. */
  function cardLabel(c: Card, playable: boolean, extra?: string): string {
    const name = spokenCard(c.rank, c.suit);
    if (extra) return `${name}, ${extra}`;
    return playable ? name : `${name}, ${dimReason(c)}`;
  }

  // A trick landing is its own small event, not silence until the whole hand ends. Keyed to
  // the hand number too — a fresh hand's tricksWon restarts at 0, which is lower than
  // wherever the last hand left off, so without the reset the first trick of every hand but
  // the first would silently compare against the previous hand's count and stay quiet.
  const prevTrickCount = useRef<{ hand: number; total: number } | null>(null);
  useEffect(() => {
    if (!view.tricksWon) return;
    const total = Object.values(view.tricksWon).reduce((a, n) => a + n, 0);
    const prev = prevTrickCount.current;
    if (prev && prev.hand === view.handNumber && total > prev.total) {
      playSound('trick', settings);
      haptic('trick', settings.haptics);
    }
    prevTrickCount.current = { hand: view.handNumber, total };
  }, [view.tricksWon, view.handNumber, settings]);

  // Pit has no turns, so a trade can land at any moment — a market chime for the whole table,
  // not just whoever clicked accept. One hand per match here, so unlike tricksWon there is no
  // hand-number reset to guard against.
  const prevTrades = useRef<number | null>(null);
  useEffect(() => {
    if (!view.tradesCompleted) return;
    const total = Object.values(view.tradesCompleted).reduce((a, n) => a + n, 0);
    if (prevTrades.current !== null && total > prevTrades.current) playSound('trade', settings);
    prevTrades.current = total;
  }, [view.tradesCompleted, settings]);

  // A war is the one moment in War with any drama to it — worth its own sound rather than
  // sounding exactly like every other flip.
  const prevWars = useRef<number | null>(null);
  useEffect(() => {
    if (view.warsCount === undefined) return;
    if (prevWars.current !== null && view.warsCount > prevWars.current) playSound('war', settings);
    prevWars.current = view.warsCount;
  }, [view.warsCount, settings]);

  // Win sound, and the result that feeds the leaderboards.
  const prevPhase = useRef(view.phase);
  useEffect(() => {
    if (prevPhase.current !== 'roundOver' && view.phase === 'roundOver') {
      playSound('win', settings);
      // Kent is scored in letters and won by a pair, and fewer letters is better. Recording it
      // like every other game filed the round's one-nil under "lowest wins" and put the pair
      // that had just LOST the round at the top of the table.
      const scores = isKent ? {} : view.matchTarget != null ? (view.matchScores ?? view.scores) : view.scores;
      const highWins = view.matchTarget != null;
      const standings = isKent
        ? (['A', 'B'] as const)
            .map((pair) => ({
              name: `Pair ${pair}`,
              score: view.kentLetters?.[pair] ?? 0,
              isYou: view.players.some((p, i) => localSeats.includes(p.id) && (i % 2 === 0 ? 'A' : 'B') === pair),
            }))
            .sort((a, b) => a.score - b.score)
        : view.players
            .map((p) => ({ name: nameOf(p.id), score: scores[p.id] ?? 0, isYou: localSeats.includes(p.id) }))
            .sort((a, b) => (highWins ? b.score - a.score : a.score - b.score));
      const winner = view.matchWinner ?? view.winner;
      recordResult({
        gameId: def.meta.id,
        gameName: def.meta.name,
        at: Date.now(),
        seats: view.players.length,
        standings,
        youWon: isKent
          ? !!winner && teamOf(winner) === teamOf(me)
          : !!winner && localSeats.includes(winner),
        highlight: highlightOf(view, me, def),
        practice,
      });
    }
    prevPhase.current = view.phase;
    // def, me, localSeats, practice, isKent, teamOf and nameOf are all fixed for the life of a
    // match — the seats you're in, who you are, whether it's practice, and the game's own shape
    // don't change hand to hand, so the render that schedules this effect always has the same
    // values a later one would. view is deliberately not listed either: this is meant to be an
    // edge-triggered effect (prevPhase.current is the actual trigger, checked above), and view
    // is a new object on every move — depending on it would fire the sound and leaderboard
    // write on every move instead of once per hand, relying on the same ref guard to no-op the
    // ones that aren't the real transition rather than not scheduling them at all.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.phase, settings]);

  // Item 38: a tournament table cares about the MATCH being over, not just a hand of it — a
  // points-target game runs several hands, each one flipping phase to 'roundOver' and back,
  // before matchOver ever turns true. Same edge-triggered shape as the effect above, watching a
  // different flag, so a callback prop that never fires more than once for a match already in
  // progress before this component mounted.
  const prevMatchOver = useRef(view.matchOver);
  useEffect(() => {
    if (!prevMatchOver.current && view.matchOver) onMatchOver?.(view.matchWinner ?? view.winner);
    prevMatchOver.current = view.matchOver;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.matchOver]);

  function playNextHand() {
    // Guarded because the button can be hit twice before the modal unmounts; the second call
    // finds the hand already dealt and would otherwise throw out of an event handler.
    try { clientRef.current.nextHand(); } catch { /* already dealt */ }
    setBoard(clientRef.current.read(me));
    setSelected(null);
    setAskRank(null);
    setToast(null);
  }

  function submit(move: Move) {
    if (move.cardId) markFirstCardSeen();
    // Worklist: a networked referee answers a play a full round trip later than a local one
    // does, and the trick area used to just sit empty for it — the honest fix touches
    // RemoteTableClient's cache, which stays server-truth-only (see its own comment on why),
    // so this stays a purely visual echo, on top of that cache rather than inside it. Scoped to
    // trick-mode's one play action, the only one with a trick area to echo into — a plain
    // 'playCard' game has nowhere for a pile-side echo to land, only the dimmed hand card, which
    // reads as a stuck button rather than a move in flight.
    if (clientRef.current.remote && move.actionId === 'playToTrick' && move.cardId) {
      const card = view.hand.find((c) => c.id === move.cardId);
      if (card) setOptimisticPlay({ cardId: move.cardId, card });
    }
    const res = clientRef.current.submit(me, move);
    if (!res.ok) {
      // The rules said no. Say why, instead of letting the tap disappear.
      setToast({ text: res.reason ?? 'That move is not legal here.', tone: 'bad' });
      playSound('ui', settings);
      haptic('refusal', settings.haptics);
      setSelected(null);
      setOptimisticPlay(null);
      if (move.cardId) setShakeCard(move.cardId);
      return;
    }
    if (move.actionId === 'playCard' || move.actionId === 'playToTrick' || move.actionId === 'climbPlay' || move.actionId === 'climbBomb') playSound('play', settings);
    if (move.actionId === 'drawCard' || move.actionId === 'fishDraw') playSound('draw', settings);
    if (move.actionId === 'ask') playSound('ui', settings);
    if (move.actionId === 'bluffClaim' || move.actionId === 'bluffChallenge') playSound('play', settings);
    if (move.actionId === 'reflexSlap') playSound('slap', settings);
    if (move.actionId === 'reflexFlip') playSound('play', settings);
    // Kings Corner, Dutch, and Old Maid — the three families added most recently — had no card
    // sound of their own at all beyond the generic selection click and the fanfare at the end
    // of a round; every move that actually changed the board was silent.
    if (move.actionId === 'layoutPlay' || move.actionId === 'layoutMove') playSound('play', settings);
    if (move.actionId === 'layoutDraw') playSound('draw', settings);
    if (move.actionId === 'swapPlace' || move.actionId === 'swapThrow') playSound('play', settings);
    if (move.actionId === 'swapDrawStock' || move.actionId === 'swapTakeDiscard') playSound('draw', settings);
    if (move.actionId === 'swapBlind') playSound('trade', settings);
    if (move.actionId === 'maidDraw') playSound('draw', settings);
    // Worklist #62: "the advisor that drives the hint and the bots could mark the moves it
    // would not have made. In practice mode that is free coaching, and it is not wired up."
    // matchService already computes this on every move a real person makes (see #59) — practice
    // mode is the one place it is worth surfacing immediately rather than saving for the end,
    // since a practice result was never going anywhere but the moment itself.
    if (practice) {
      const last = clientRef.current.history().slice(-1)[0];
      if (last && last.seat === me && last.advisorMove && labelMove(last.move) !== labelMove(last.advisorMove)) {
        setToast({ text: `Coach: the advisor would have played ${labelMove(last.advisorMove)} instead.`, tone: 'info' });
      } else {
        setToast(null);
      }
    } else {
      setToast(null);
    }
    setSelected(null);
    setAskRank(null);
    setBluffSelected([]);
    setBluffRank(null);
    setSetPicked([]);
    setUndoable(true);
    setBoard(clientRef.current.read(me));
  }

  // Bluff: clicking a card either starts a new group or, if it matches the real rank already
  // staged, adds to it (up to four) — a second click on an already-staged card removes it.
  // This is deliberately real-rank-only: the LIE lives entirely in the rank you claim next, not
  // in which physical cards you hand over, which is also the only shape the engine will accept.
  function toggleBluffCard(id: string) {
    const card = view.hand.find((c) => c.id === id);
    if (!card) return;
    if (bluffSelected.includes(id)) { setBluffSelected(bluffSelected.filter((x) => x !== id)); return; }
    const first = view.hand.find((c) => c.id === bluffSelected[0]);
    if (bluffSelected.length > 0 && first && first.rank !== card.rank) { setBluffSelected([id]); return; }
    if (bluffSelected.length >= 4) return;
    setBluffSelected([...bluffSelected, id]);
  }
  const bluffClaimMove = useMemo(
    () => myLegal.find((m) => m.actionId === 'bluffClaim' && m.claimedRank === bluffRank
      && m.cards?.length === bluffSelected.length && m.cards?.every((id) => bluffSelected.includes(id))),
    [myLegal, bluffRank, bluffSelected],
  );

  // A toast is a nudge, not a state to live in.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3600);
    return () => clearTimeout(t);
  }, [toast]);

  function clickCard(id: string) {
    if (wasDrag()) return; // the tail end of a drag firing its own synthetic click
    if (!playableCardIds.has(id)) return;
    if (isFish) { const c = view.hand.find((x) => x.id === id); if (c) setAskRank(c.rank); playSound('ui', settings); return; }
    // Kent has nowhere to play a card TO: a card leaves your hand only by being traded for one
    // on the table, so a click picks rather than plays.
    if (isKent) { setSelected(selected === id ? null : id); playSound('ui', settings); return; }
    // A shared layout has EIGHT places a card could go, and which one is the decision — so a
    // click picks the card up and the piles light up to be chosen between. Submitting here
    // would be submitting a move with no destination, which is no move at all.
    if (isLayout) { setSelPile(null); setSelected(selected === id ? null : id); playSound('ui', settings); return; }
    if (settings.confirmPlays && selected !== id) { setSelected(id); playSound('ui', settings); return; }
    if (playActionId === 'climbPlay') { submit({ actionId: 'climbPlay', cards: [id] }); return; }
    submit({ actionId: playActionId, cardId: id });
  }

  // Worklist #53: a card can also be played by dragging it toward the table, not only by
  // tapping it. Disabled for Fish (a tap there picks a rank to ask for, not a card to play) and
  // Kent (a tap picks a card to trade for one on the table — there is nowhere "up" to drag it
  // to). Confirms the exact move a tap on the same card would have — deliberately skipping the
  // confirmPlays double-tap setting, since finishing a drag already took a deliberate motion a
  // misclick could never produce by accident.
  const { ghost: dragGhost, startDrag, wasDrag } = useCardDrag(
    !isFish && !isKent && !isLayout,
    (id) => {
      if (!playableCardIds.has(id)) return;
      if (playActionId === 'climbPlay') { submit({ actionId: 'climbPlay', cards: [id] }); return; }
      submit({ actionId: playActionId, cardId: id });
    },
  );

  // Worklist: a long-press (or a mouse held down) enlarges a card where it sits, before either
  // of the above ever gets a say. Enabled for the same cards a click can play, entirely so
  // there's something to look closely at — it never submits anything itself.
  const { preview: cardPreview, startPreview } = useCardPreview(!isFish && !isKent && !isLayout);

  // Left-handed layout (item 26): the reverse happens in the actual card order, not just on
  // screen — a CSS-only mirror would leave arrow-key navigation moving through the DOM order
  // while the fan reads backwards, so "next" would visually jump to the wrong end of the hand.
  const hand = useMemo(() => {
    const sorted = sortHand(view.hand, def, settings.sort);
    return settings.handedness === 'left' ? [...sorted].reverse() : sorted;
  }, [view.hand, def, settings.sort, settings.handedness]);

  // The echo shows only until the referee's own copy of this trick catches up with it — once it
  // does, the confirmed card takes over the same spot and there is nothing left to echo.
  const ghostPlay = optimisticPlay && !view.trick?.some((t) => t.card.id === optimisticPlay.cardId)
    ? optimisticPlay : null;

  // The one card this glow is ever for: the first one this player, on this device, is ever
  // offered a legal move on. Gone the instant they play any card at all — see markFirstCardSeen.
  const firstGlowCardId = !firstCardSeen && !dealing && view.isYourTurn
    ? hand.find((c) => playableCardIds.has(c.id))?.id ?? null
    : null;

  // How close the hand is to running out, as a fraction — the vignette at the table's edge
  // warms toward it. Tracked against the fullest the hand has been *this* deal rather than a
  // fixed number, so it reads the same whether seven cards were dealt or thirteen.
  const maxHandSize = useRef(0);
  useEffect(() => { maxHandSize.current = 0; }, [view.handNumber]);
  useEffect(() => { maxHandSize.current = Math.max(maxHandSize.current, hand.length); }, [hand.length]);
  const tension = view.mode === 'trick' && maxHandSize.current > 1
    ? Math.max(0, 1 - hand.length / maxHandSize.current)
    : 0;

  // A card that was tapped and refused shakes where it sits, rather than only saying so down
  // in the toast — the toast can be missed if you are looking at your hand, which is exactly
  // where this puts the answer.
  const [shakeCard, setShakeCard] = useState<string | null>(null);
  useEffect(() => {
    if (!shakeCard) return;
    const t = setTimeout(() => setShakeCard(null), 460);
    return () => clearTimeout(t);
  }, [shakeCard]);

  // Worklist #56: you can already see whose turn it is; the thing missing was who is after
  // them, which is what planning a discard actually needs. Pit, Kent, Set and Reflex have no
  // turn order at all — everyone is live at once — so there is no "next" to name there. A
  // shedding player who has emptied their hand is out for the rest of the hand and skipped;
  // predicting a future skip card (a played 2, an ace) is not something planning ahead could
  // ever promise, so this walks seats, not the moves still to come.
  const upNext = useMemo(() => {
    // A simultaneous pass — everybody picks 3 cards at once — has no live "turn" to be after;
    // isTurn during it is whatever it last was, not a real position in an order.
    if (isPit || isKent || isSet || isReflex || view.phase !== 'playing'
      || view.needsPassChoice || view.passDirection) return [];
    const n = view.players.length;
    if (n <= 1) return [];
    const curIdx = view.players.findIndex((p) => p.isTurn);
    if (curIdx < 0) return [];
    const order: string[] = [];
    let i = curIdx;
    for (let steps = 0; steps < n - 1 && order.length < 2; steps++) {
      i = ((i + view.direction) % n + n) % n;
      const p = view.players[i];
      if (p.handCount > 0 || view.mode !== 'shedding') order.push(p.id);
    }
    return order;
  }, [view.players, view.direction, view.mode, view.phase, view.needsPassChoice, view.passDirection,
    isPit, isKent, isSet, isReflex]);

  // Worklist #59: naming a card from a MoveRecord logged earlier in the match, once it may no
  // longer be in view.hand at all. The definition's own deck is a pure function of def, so a
  // lookup built from it names any card the match ever dealt, not just the ones still in play.
  const deckById = useMemo(() => new Map(buildDeck(def).map((c) => [c.id, c])), [def]);
  function labelCard(id: string): string {
    const c = deckById.get(id);
    if (!c) return id;
    return c.rank === 'JOKER' ? 'Joker' : `${c.rank}${SUIT_SYMBOLS[c.suit] ?? ''}`;
  }
  // Only these action ids put real card ids in cardId/cards — pitOffer, for one, reuses `cards`
  // to hold a stringified quantity ("1", "2", "3"), which labelCard would otherwise happily
  // "look up" and print back verbatim as a card name that doesn't exist.
  const CARD_MOVE_ACTIONS = new Set([
    'playCard', 'playToTrick', 'climbPlay', 'climbBomb', 'rummyDiscard', 'dealerDiscard', 'buryDiscard', 'layOff', 'meld', 'bluffClaim',
  ]);
  function labelMove(m: Move): string {
    if (CARD_MOVE_ACTIONS.has(m.actionId)) {
      if (m.cardId) return labelCard(m.cardId);
      if (m.cards && m.cards.length > 0) return m.cards.map(labelCard).join(' ');
    }
    return describeHint(m, nameOf);
  }

  // Worklist #94: the same cursor-and-Enter model full keyboard play already drives (see
  // handKeys and moveCursor below), fed by a gamepad's D-pad or left stick and its bottom face
  // button instead. Gated the same way drag is — Fish and Kent don't play a card by picking one
  // off this list, so there is nothing here for a gamepad to move a cursor along either.
  const gamepadIds = useMemo(
    () => hand.filter((c) => playableCardIds.has(c.id)).map((c) => c.id),
    [hand, playableCardIds],
  );
  useGamepad(
    !isFish && !isKent,
    (dir) => {
      if (gamepadIds.length === 0) return;
      const at = cursor === null ? -1 : Math.min(cursor, gamepadIds.length - 1);
      moveCursor(gamepadIds, dir === 1 ? at + 1 : (at <= 0 ? gamepadIds.length - 1 : at - 1));
    },
    () => {
      if (gamepadIds.length === 0) return;
      const at = cursor === null ? -1 : Math.min(cursor, gamepadIds.length - 1);
      if (at >= 0) clickCard(gamepadIds[at]);
    },
  );

  const top = view.zones.discard?.cards[0];
  // Shared piles this game's author added that the standard layout knows nothing about.
  const extraPiles = useMemo(
    () => Object.entries(view.zones).filter(([id, z]) => z.count > 0 && !STANDARD_PILES.has(id) && !id.startsWith('hand:')),
    [view.zones],
  );
  const activeSuit = view.vars.activeSuit;
  const suitPickerOpen = !!view.pendingChoice && view.pendingChoice.player === me;
  // ---------- overlays ----------
  //
  // Every overlay traps focus, so a keyboard cannot wander behind it. Only the history panel
  // takes Escape: the others are asking for a decision the game cannot continue without, and
  // dismissing them would leave somebody looking at a table that will not move.
  const historyRef = useDismissable(showHistory, () => setShowHistory(false));
  const menuRef = useDismissable(tableMenu, () => setTableMenu(false));
  const suitRef = useDismissable(suitPickerOpen, () => { /* a suit must be chosen */ });
  const roundRef = useDismissable(view.phase === 'roundOver' && !view.matchOver, () => { /* pick next hand */ });
  const handoffRef = useDismissable(!!handoff, () => { /* the device has to change hands */ });

  /*
    A hand with exactly one legal move is not a decision, it is a formality — and making
    someone find and tap the one card they were always going to play is friction with nothing
    behind it. `legal` is already scoped to whoever's turn it actually is (see tableClient.ts),
    so a single entry here means this player, right now, could not have done anything else.

    Pit, Kent and Trio are turnless — everyone can always act, so "the only thing you could
    legally do" is never the same as "the only thing on offer this turn", and playing it for
    someone would take away the timing decision that is the entire game. Excluded on purpose.
  */
  useEffect(() => {
    if (!settings.autoPlayForced) return;
    if (isPit || isKent || isSet) return;
    if (view.phase !== 'playing') return;
    if (dealing || suitPickerOpen || handoff || takeback) return;
    if (myLegal.length !== 1) return;
    const only = myLegal[0];
    const t = window.setTimeout(() => submit(only), 480);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLegal, isPit, isKent, isSet, dealing, suitPickerOpen, handoff, takeback, view.phase, settings.autoPlayForced]);

  const botLabel = (id: string) =>
    settings.botNaming === 'named' ? botNameFor(matchId, id)
      : settings.botNaming === 'bot' ? `Bot ${id.slice(1)}`
      : id;
  const nameOf = (id: string) => {
    const seat = plan?.find((s) => s.id === id);
    if (seat) return seat.id === me ? `${seat.name} (you)` : seat.name;
    return id === me ? settings.playerName : botLabel(id);
  };
  // A running trick, book or set count — the same number, drawn as a seven-segment readout
  // instead of ticking type when the setting asks for it. Snaps rather than counting up: a real
  // digital display changes instantly, it doesn't animate through the numbers in between.
  const seatNum = (n: number) => (settings.digitalScore ? <SevenSegmentNumber value={n} /> : <CountUp value={n} />);
  /*
    The engine writes its log with raw seat ids — "P4 played 9♣" — because naming players is
    none of its business. The table is where names live, so it puts them back before anyone
    reads the line; otherwise the log talks about P4 while the seat above it says Bot 4.
    Only ids that are actually seats at this table are substituted.
  */
  const logName = (id: string) => {
    if (id === me) return 'You';
    const seat = plan?.find((s) => s.id === id);
    return seat ? seat.name : botLabel(id);
  };
  const humanise = (text: string) => {
    const named = text.replace(/\bP(\d+)\b/g, (m, n) =>
      view.players.some((p) => p.id === `P${n}`) ? logName(`P${n}`) : m);
    // The engine writes about a seat in the third person, so once P1 becomes "You" the verbs
    // have to follow: "You wins the showdown and takes the pot" is not a sentence anybody
    // would write. Done a sentence at a time, and only where you are the subject, so the
    // second half of "You post the blind. Bot 2 posts the big blind." is left alone. Verbs
    // are corrected where a subject can actually reach them — at the start, after "and",
    // after a dash — rather than anywhere in the line, which would catch nouns too.
    const perSentence = named
      .split(/(?<=\.)\s+/)
      .map((sentence) => (/^You\b/.test(sentence)
        ? sentence.replace(/(^You\s+|\band\s+|—\s+)([a-z]+)/g,
            (m, pre, v) => (YOU_VERB[v] ? `${pre}${YOU_VERB[v]}` : m))
        : sentence))
      .join(' ');
    // And wherever "You" is the subject mid-sentence — "Round over — You goes out."
    const agreed = perSentence.replace(/\bYou\s+([a-z]+)/g,
      (m, v) => (YOU_VERB[v] ? `You ${YOU_VERB[v]}` : m));
    // The possessive too: a seat id takes "'s", but "You" takes "Your", so a partnership
    // game announced "Round over — You's team wins".
    return agreed.replace(/\bYou's\b/g, 'Your');
  };
  const teamOf = (id: string): string | null => {
    // Kent has partners but no `teams` config: partners sit opposite, so the pairs are the odd
    // seats against the even ones — the same rule the engine uses to decide who may call whose
    // signal. Knowing which side of the table you are on is most of playing it.
    if (isKent) {
      const i = view.players.findIndex((p) => p.id === id);
      return i < 0 ? null : `Pair ${i % 2 === 0 ? 'A' : 'B'}`;
    }
    if (!view.teams) return null;
    const i = view.teams.findIndex((t) => t.includes(id));
    return i >= 0 ? `Team ${i === 0 ? 'A' : 'B'}` : null;
  };
  const backCls = `card back style-${settings.cardBack}`;
  // The others, in the order they sit round the table from your left — not raw seat order,
  // which would put the player after you in a different place depending on where you sit.
  const opponents = useMemo(() => {
    const all = view.players;
    const mine = all.findIndex((p) => p.id === me);
    if (mine < 0) return all.filter((p) => p.id !== me);
    return [...all.slice(mine + 1), ...all.slice(0, mine)];
  }, [view.players, me]);

  // Which edge of the table a player sits on, so a card they play can come from where they are
  // rather than fading into existence in the middle of the felt.
  const seatSideOf = (id: string) => {
    if (id === me) return 'me';
    const i = opponents.findIndex((p) => p.id === id);
    if (i < 0) return 't';
    return SEAT_RING[opponents.length]?.[i] ?? 't';
  };

  /*
    Where a card goes when it leaves your hand and turns up nowhere you can see.

    Most cards do not need this: you play one and it lands in the trick, so the flying-card
    layer can see both ends and throw it there. The two that vanish are a pass — three cards
    into the hand of whoever sits in the passing direction — and Go Fish, where the player who
    asked takes them off you. The pass target is remembered rather than read off the current
    view, because by the render where the cards actually leave your hand the engine has already
    cleared the pass and there is nothing left to read.
  */
  const [passTarget, setPassTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!view.passDirection) return;
    const n = view.players.length;
    const i = view.players.findIndex((p) => p.id === me);
    if (i < 0) return;
    const offset = view.passDirection === 'left' ? 1
      : view.passDirection === 'right' ? -1
      : Math.floor(n / 2);
    setPassTarget(view.players[((i + offset) % n + n) % n]?.id ?? null);
  }, [view.passDirection, view.players, me]);

  const passSink = isFish
    ? (() => {
        const asker = view.players.find((p) => p.isTurn && p.id !== me);
        return asker ? `seat:${asker.id}` : undefined;
      })()
    : passTarget && passTarget !== me ? `seat:${passTarget}` : undefined;

  // Cards move. Every container below carries a data-slot and every card a data-flight, and
  // this watches the two between renders: anything that changed slot is thrown across the felt
  // rather than disappearing from one place and reappearing in another. The deal has its own
  // animation, so flights are held off while it runs.
  //
  // The layer hangs off .table rather than the wrapper around it because .table isolates: a
  // dialog inside it cannot out-stack anything outside it, so a card in flight drew straight
  // over the top of the wild-card suit picker.
  const tableRef = useRef<HTMLDivElement | null>(null);
  useCardFlights(tableRef, board, settings.motion !== 'reduced' && !dealing);

  return (
    <div className="table-wrap">
    <div className="table" data-felt={settings.tableFelt} ref={tableRef} style={{ '--tension': tension } as React.CSSProperties}>
      <TableRail felt={settings.tableFelt} />
      <div className={`felt ${dealing ? 'dealing' : ''} ${shaking ? 'felt-shake' : ''}`}>
        {rippleKey > 0 && <span key={rippleKey} className="turn-ripple" aria-hidden="true" />}
      <TableDressing felt={settings.tableFelt} title={def.meta.name} />
      <FeltDust />
      {settings.seasonalFx !== 'off' && <SeasonalDrift kind={settings.seasonalFx} />}
      {/* Nothing is dealt to anybody in a set game — the cards go face up on a shared board —
          so a deal animation would be showing something that does not happen. */}
      {!isSet && <DealMotion
        seats={view.players.length}
        aim={['.opponents .seat', '.hand']}
        round={`${matchId}:${view.handNumber}`}
        onStart={() => { setDealing(true); playSound('shuffle', settings); }}
        onDone={() => setDealing(false)}
      />}
      <div className="felt-content">
      {/*
        What just happened, on the table.

        The log lives under the felt, and on a laptop that is below the fold: to find out what
        the player before you did you had to scroll away from the game. This is the last line
        of that same log, in the corner of the cloth where nothing else ever sits — the dealer
        saying it once, quietly, rather than a panel you have to go and read. Keyed by the
        line so a new one fades in and an unchanged one stays still.
      */}
      {lastLine && (
        <div className="felt-say" key={lastLine} aria-hidden="true">
          <i /><span>{humanise(lastLine)}</span>
        </div>
      )}
      <div className={`opponents ring-${opponents.length}`}>
        {opponents.map((p, i) => {
          const askable = isFish && view.isYourTurn && !!askRank && p.handCount > 0;
          // How many backs to draw. A neat, readable fan beats a dozen slivers; the exact
          // number is on the chip below, which is where anyone actually reads it.
          const backs = Math.max(1, Math.min(p.handCount, 6));
          return (
            // A keyboard player can pick a rank but had no way to complete the ask — the seat
            // itself was a click-only target with no role, tabIndex, or key handler. It's a real
            // control only while askable; the conditional spread below applies role/tabIndex/
            // keydown for that case, which the linter's static check can't see.
            // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
            <div key={p.id}
              data-slot={`seat:${p.id}`}
              className={`seat at-${SEAT_RING[opponents.length]?.[i] ?? 't'} ${p.isTurn ? 'active' : ''} ${askable ? 'askable' : ''}`}
              onClick={() => { if (askable) submit({ actionId: 'ask', target: p.id, rank: askRank! }); }}
              {...(askable ? {
                role: 'button' as const,
                tabIndex: 0,
                'aria-label': `Ask ${nameOf(p.id)} for ${askRank}s`,
                onKeyDown: (e: React.KeyboardEvent) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); submit({ actionId: 'ask', target: p.id, rank: askRank! }); }
                },
              } : {})}>
              <div className="seat-head">
                <span className="seat-name">{nameOf(p.id)}</span>
                {teamOf(p.id) && <span className="team-tag">{teamOf(p.id)}</span>}
              </div>
              {/* Nobody holds cards in a spotting game — everything is face up on the board —
                  so a fan of backs and the word "out" under it said the player had been knocked
                  out of a game they were in fact winning. Show what they have actually got. */}
              {p.handCount > 0 && !isLayout && !isSwap && (
                <div className="fanned" aria-hidden="true">
                  {Array.from({ length: backs }).map((_, k) => (<div key={k} className={backCls} />))}
                </div>
              )}
              <div className="seat-stats">
                {isSet ? (
                  <span className="seat-stat">{seatNum(view.scores?.[p.id] ?? 0)}<i>{(view.scores?.[p.id] ?? 0) === 1 ? 'set' : 'sets'}</i></span>
                ) : isLayout || isSwap ? (
                  // Both families sit somebody's whole holding on the table for the length of
                  // the round — a shared layout, or a face-down row everyone can see the BACKS
                  // of — so "0 in hand, must be out" is simply the wrong reading of the number.
                  null
                ) : (
                  <span className="count-chip" title={`${p.handCount} cards in hand`}>
                    {p.handCount === 0 ? 'out' : `${p.handCount}`}
                  </span>
                )}
                {view.mode === 'trick' && view.bids?.[p.id] !== undefined && (
                  <span className="seat-stat">{seatNum(view.tricksWon?.[p.id] ?? 0)}/{view.bids[p.id]}<i>tricks</i></span>
                )}
                {view.mode === 'trick' && view.bids?.[p.id] === undefined && (view.tricksWon?.[p.id] ?? 0) > 0 && (
                  <span className="seat-stat">{seatNum(view.tricksWon?.[p.id] ?? 0)}<i>won</i></span>
                )}
                {isFish && <span className="seat-stat">{seatNum(view.booksWon?.[p.id] ?? 0)}<i>books</i></span>}
                {view.mode === 'bluff' && (view.bluffCaught?.[p.id] ?? 0) > 0 && (
                  <span className="seat-stat">{view.bluffCaught![p.id]}<i>caught</i></span>
                )}
                {isPit && (view.tradesCompleted?.[p.id] ?? 0) > 0 && (
                  <span className="seat-stat">{view.tradesCompleted![p.id]}<i>trades</i></span>
                )}
                {view.mode === 'climb' && view.finished?.includes(p.id) && (
                  <span className="seat-stat">#{view.finished.indexOf(p.id) + 1}<i>out</i></span>
                )}
              </div>
              {p.isTurn && !isKent && <div className="seat-turn" aria-label="their turn" />}
              {/* The tell. It is meant to be seen — spotting it is the game. */}
              {view.kentTell?.player === p.id && (
                <div className="kent-tell" aria-label={`${nameOf(p.id)} is signalling`}>signalling</div>
              )}
              {askable && <div className="ask-hint">Ask for {askRank}s</div>}
            </div>
          );
        })}
      </div>

      {view.contractAuction ? (
        /*
          A contract auction. Every bid must beat the last, so the grid only shows what is still
          available — the levels that are gone simply are not there, which is easier to read than
          a wall of disabled buttons.
        */
        <div className="center bid-area">
          <div className="bid-panel contract-panel">
            <span className="bid-kicker">
              The auction
              <button className="ghost sm estimate-btn" onClick={showHandStrength}>Estimate</button>
            </span>
            <p className="bid-line">
              {view.highBid
                ? view.highBid.strain
                  ? <>Standing bid <b>{view.highBid.level}{view.highBid.strain === 'NT' ? 'NT' : SUIT_SYMBOLS[view.highBid.strain]}</b> by {nameOf(view.highBid.player)}</>
                  // Trump isn't named until the auction closes — the standing bid is just a number.
                  : <>Standing bid <b>{view.highBid.level}</b> by {nameOf(view.highBid.player)} — trump named once the auction closes</>
                : 'Nobody has bid yet.'}
            </p>
            {view.isYourTurn ? (
              <>
                <div className="contract-grid">
                  {Array.from(new Set(myLegal.filter((m) => m.actionId === 'contractBid').map((m) => m.level!)))
                    .sort((a, b) => a - b)
                    .map((level) => (
                      <div key={level} className="contract-row">
                        <span className="cr-level">{level}</span>
                        {myLegal
                          .filter((m) => m.actionId === 'contractBid' && m.level === level)
                          .map((m) => m.strain === undefined ? (
                            // A level-only auction: one bid per level, trump comes later.
                            <button key={level} className="cr-bid cr-bid-level" aria-label={`Bid ${level}`} onClick={() => submit(m)}>
                              {level}
                            </button>
                          ) : (
                            <button key={`${level}-${m.strain}`} className={`cr-bid s-${m.strain}`}
                              aria-label={`Bid ${level} ${m.strain === 'NT' ? 'no trump' : SUIT_NAMES[m.strain as string] ?? m.strain}`}
                              onClick={() => submit(m)}>
                              {m.strain === 'NT' ? 'NT' : SUIT_SYMBOLS[m.strain as string]}
                            </button>
                          ))}
                      </div>
                    ))}
                </div>
                <button className="ghost" onClick={() => submit({ actionId: 'passBid' })}>Pass</button>
              </>
            ) : (
              <p className="muted">Waiting for the next bid…</p>
            )}
          </div>
        </div>
      ) : view.mode === 'trick' && (view.auctionRound ?? 0) > 0 ? (
        <div className="center bid-area">
          {view.upcard && (
            <div className="pile" data-slot="upcard">
              <CardFace card={view.upcard} />
              <div className="pile-label">Turned up</div>
            </div>
          )}
          {view.isYourTurn ? (
            <div className="bid-panel">
              <div className="bid-title">
                {view.auctionRound === 1
                  ? <>Trump {view.upcard ? SUIT_SYMBOLS[view.upcard.suit] : ''}?</>
                  : 'Name trump'}
              </div>
              <div className="bid-buttons">
                {auctionMoves.filter((m) => !m.alone).map((m, i) => (
                  <button key={`a${i}`} className={`bid-btn s-${m.choice}`} onClick={() => submit(m)}
                    aria-label={m.actionId === 'orderUp' ? 'Order up' : `Name ${SUIT_NAMES[m.choice as string] ?? m.choice} trump`}>
                    {m.actionId === 'orderUp' ? 'Order up' : SUIT_SYMBOLS[m.choice!] ?? m.choice}
                  </button>
                ))}
              </div>
              {auctionMoves.some((m) => m.alone) && (
                <div className="bid-buttons">
                  {auctionMoves.filter((m) => m.alone).map((m, i) => (
                    <button key={`s${i}`} className="bid-btn alone" onClick={() => submit(m)}>
                      Alone {m.actionId === 'orderUp' ? '' : SUIT_SYMBOLS[m.choice!] ?? m.choice}
                    </button>
                  ))}
                </div>
              )}
              {canPassBid
                ? <button className="draw-btn" onClick={() => submit({ actionId: 'passBid' })}>Pass</button>
                : <span className="mini-label">Dealer must call.</span>}
            </div>
          ) : <div className="trick-empty">Bidding…</div>}
        </div>
      ) : view.mode === 'trick' && view.bidding ? (
        <div className="center bid-area">
          {view.isYourTurn ? (
            <div className="bid-panel">
              <div className="bid-title">
                Your bid
                {/* Worklist #64: "bidding is the hardest thing in the catalogue and the hardest
                    to guess at. A rough count of likely tricks, on request." */}
                <button className="ghost sm estimate-btn" onClick={showHandStrength}>Estimate</button>
              </div>
              <div className="bid-buttons">
                {Array.from({ length: view.hand.length + 1 }, (_, n) => (
                  <button key={n} className="bid-btn" onClick={() => submit({ actionId: 'bid', choice: String(n) })}>
                    {n === 0 ? 'Nil' : n}
                  </button>
                ))}
              </div>
            </div>
          ) : <div className="trick-empty">Bidding…</div>}
        </div>
      ) : view.mode === 'trick' ? (
        <div className="center trick-area" data-slot="trick">
          {(view.trick && view.trick.length > 0) || ghostPlay ? (
            <>
              {view.trick?.map((t, i) => (
                <div key={`${t.player}:${t.card.id}`} className={`trick-card ${i === 0 ? 'led' : ''}`}
                  data-from={seatSideOf(t.player)}
                  /* Where this card came from, for the flying-card layer: your own plays are
                     already tracked out of your hand, but an opponent's card has never been on
                     screen before, so it has to be told which seat to fly out of. */
                  data-origin={t.player === me ? 'hand' : `seat:${t.player}`}>
                  <CardFace card={t.card} />
                  <div className="pile-label">{nameOf(t.player)}</div>
                </div>
              ))}
              {/* Worklist: what this seat just sent a networked referee, before it has come back
                  confirmed — dashed and half there, gone the moment the round trip settles (see
                  optimisticPlay above), one way or the other. The real card of the same id is
                  still sitting, dimmed, in the hand below (the referee hasn't taken it yet) — so
                  this one is drawn under a decoy id, `#echo` appended, purely so the flying-card
                  layer's data-flight tracking never sees the same card in two slots at once. The
                  confirmed trick-card, under the real id, arrives and flies from the hand exactly
                  as it always has the instant the referee agrees; this is only what fills the
                  wait beforehand. */}
              {ghostPlay && (
                <div className={`trick-card ghost-pending ${!view.trick || view.trick.length === 0 ? 'led' : ''}`}
                  data-from="me">
                  <CardFace card={{ ...ghostPlay.card, id: `${ghostPlay.card.id}#echo` }} />
                  <div className="pile-label">{nameOf(me)}</div>
                </div>
              )}
            </>
          ) : view.lastTrick ? (
            /* The trick that was just taken. It used to blink out the moment the fourth card
               landed, so you never saw what beat what — now it stays until the next lead and
               slides away towards whoever won it. */
            <div className={`trick-taken to-${seatSideOf(view.lastTrick.winner)}`}>
              {view.lastTrick.plays.map((t) => (
                <div key={`${t.player}:${t.card.id}`}
                  className={`trick-card ${t.player === view.lastTrick!.winner ? 'took-it' : ''}`}>
                  <CardFace card={t.card} />
                  <div className="pile-label">{nameOf(t.player)}</div>
                </div>
              ))}
              <div className="trick-won">
                {view.lastTrick.winner === me ? 'You take it' : `${nameOf(view.lastTrick.winner)} takes it`}
              </div>
            </div>
          ) : (
            <div className="trick-empty">{view.isYourTurn ? 'Your lead' : '…'}</div>
          )}
          {/* Trump decides every trick, so it is a badge you can find at a glance rather
              than a line of grey mono text under the cards. */}
          <div className="trick-meta">
            <span className={`trump-badge ${view.trumpSuit && view.trumpSuit !== 'none' ? `suit-${view.trumpSuit}` : 'none'}`}>
              <i>trump</i>
              <b>{view.trumpSuit && view.trumpSuit !== 'none' ? SUIT_SYMBOLS[view.trumpSuit] : 'none'}</b>
            </span>
            {view.lead && (
              <span className={`lead-badge suit-${view.lead}`}><i>led</i><b>{SUIT_SYMBOLS[view.lead]}</b></span>
            )}
            {view.maker && (
              <span className="trick-note">{nameOf(view.maker)} called it{view.alone ? ' alone' : ''}</span>
            )}
          </div>
        </div>
      ) : isFish ? (
        <div className="center">
          <div className="pile" data-slot="draw">
            <div className={`${backCls} big`} />
            <div className="pile-label">Ocean · {view.oceanCount ?? 0}</div>
          </div>
          <div className="fish-prompt">
            {view.isYourTurn
              ? (askRank ? `Ask who for ${askRank}s?` : 'Pick a rank')
              : '…'}
          </div>
        </div>
      ) : isWar ? (
        <div className="center war-center" data-slot="trick">
          {view.battle && view.battle.length > 0
            ? view.battle.map((c, i) => (
                <div key={c.id} className="trick-card"
                  data-from={i % 2 === 0 ? 'me' : 't'}
                  data-origin={i % 2 === 0 ? 'hand' : `seat:${view.players[1]?.id ?? ''}`}>
                  <CardFace card={c} />
                  <div className="pile-label">{i % 2 === 0 ? nameOf(view.players[0].id) : nameOf(view.players[1].id)}</div>
                </div>
              ))
            : <div className="trick-empty">Flip</div>}
        </div>
      ) : isRummy ? (
        <div className="center rummy-center">
          <div className="pile" data-slot="draw">
            <div className={`${backCls} big`} />
            <div className="pile-label">Stock · {view.zones.draw?.count ?? 0}</div>
          </div>
          <div className="pile" data-slot="discard">
            {/* Keyed by the card, so a new top card is a new element and lands rather than
                cross-fading in place. */}
            {top ? <div key={top.id} className="landed"><CardFace card={top} /></div>
                 : <div className="card big empty" />}
            <div className="pile-label">Discard</div>
          </div>
          {view.zones.melds && view.zones.melds.cards.length > 0 && (
            <div className="melds-box" data-slot="melds">
              <div className="pile-label">Melds</div>
              <div className="melds-row" style={{ ['--flash-scale' as string]: String(Math.max(1, meldFlash)) }}>
                {meldFlash > 0 && <div className="score-flash" aria-hidden="true" />}
                {view.zones.melds.cards.map((c) => <div key={c.id} className="meld-mini"><CardFace card={c} /></div>)}
              </div>
            </div>
          )}
        </div>
      ) : isClimb ? (
        <div className="center">
          <div className="pile" data-slot="trick">
            {view.climbPile && view.climbPile.length > 0 ? (
              /* Keyed by the whole play, so a pair or a triple lands together rather than
                 replacing the last one in place with no motion at all. */
              <div className="climb-group landed" key={view.climbPile.map((c) => c.id).join('|')}>
                {view.climbPile.map((c) => <CardFace key={c.id} card={c} />)}
              </div>
            ) : <div className="card big empty" />}
            <div className="pile-label">
              {!view.climbPile || view.climbPile.length === 0
                ? 'Lead anything'
                : SHAPE_NAME[view.climbPile.length] ?? `${view.climbPile.length} cards`}
            </div>
          </div>
        </div>
      ) : isBluff ? (
        /*
          The pile everybody is lying about belongs in the middle of the table.
          It used to be a small grey chip wedged in beside your name, which left the whole top
          half of the felt empty and put the one thing every player is watching — how big the
          pile has grown, and what was just claimed — nowhere near where anybody was looking.
        */
        <div className="center bluff-center">
          <div className="pile" data-slot="center">
            {(view.centerCount ?? 0) > 0
              ? <div className={`${backCls} big`} />
              : <div className="card big empty" />}
            <div className="pile-label">
              {(view.centerCount ?? 0)} card{(view.centerCount ?? 0) === 1 ? '' : 's'} down
            </div>
          </div>
          {view.pendingClaim && (
            <div className={`bluff-claimed ${view.pendingClaim.player === me ? 'mine' : ''}`}>
              <b>{view.pendingClaim.player === me ? 'You' : nameOf(view.pendingClaim.player)}</b>
              {view.pendingClaim.player === me ? ' claim ' : ' claims '}
              <b>{view.pendingClaim.count} × {view.pendingClaim.claimedRank}</b>
            </div>
          )}
          {/* The moment the log line couldn't carry: the actual cards, face up, and the verdict.
              The wrapper itself is NOT keyed on ply — it used to be, and at a fast enough bot
              pace (two challenges inside 220ms) that tore the cards' DOM nodes down mid-flight,
              leaving the flying-card layer's settle() animating an element already detached and
              the reveal permanently invisible. The cards are real cards (data-flight) and the
              flight layer already knows how to animate a genuinely new one arriving — keying
              only the verdict text on ply is enough to replay its own pop each time. */}
          {view.lastReveal && (
            <div className={`bluff-reveal ${view.lastReveal.wasTrue ? 'true' : 'lie'}`}>
              <div className="bluff-reveal-cards">
                {view.lastReveal.cards.map((c) => (<CardFace key={c.id} card={c} />))}
              </div>
              <div key={view.lastReveal.ply} className="bluff-reveal-verdict">
                <b>{view.lastReveal.wasTrue ? 'True' : 'Lie'}</b>
                {' — '}
                {view.lastReveal.claimant === me ? 'you' : nameOf(view.lastReveal.claimant)} claimed {view.lastReveal.claimedRank}
              </div>
            </div>
          )}
          {myLegal.some((m) => m.actionId === 'bluffChallenge') && (
            <button className="primary bluff-challenge" onClick={() => submit({ actionId: 'bluffChallenge' })}>
              🤨 Call bluff!
            </button>
          )}
        </div>
      ) : isSwap ? (
        /*
          The middle of a Dutch table: everyone's row, the stock and pile, and — because this is
          the one family where two people looking at the same card see different things — every
          slot drawn from THIS viewer's own `view.grids`, not from a single shared board.

          A slot is a face if this viewer has ever been shown it, and a back otherwise, and that
          is exactly as true of the viewer's own row as anyone else's: forgetting your own cards
          is the whole game.
        */
        <div className="center swap-center">
          <div className="swap-rows">
            {(view.grids ?? []).map((row) => (
              <div key={row.player} className={`swap-row ${row.player === me ? 'mine' : ''} ${view.players.find((p) => p.id === row.player)?.isTurn ? 'active' : ''}`}>
                <span className="swap-row-name">{row.player === me ? 'You' : row.player}</span>
                <div className="swap-slots">
                  {row.slots.map((c, i) => {
                    const peekSelf = myLegal.find((m) => m.actionId === 'swapPeekSelf' && m.slot === i && row.player === me);
                    const peekOther = myLegal.find((m) => m.actionId === 'swapPeekOther' && m.target === row.player && m.slot === i);
                    const place = myLegal.find((m) => m.actionId === 'swapPlace' && m.slot === i && row.player === me);
                    const blindMine = myLegal.find((m) => m.actionId === 'swapBlind' && m.slot === i && row.player === me);
                    const blindTheirs = myLegal.find((m) => m.actionId === 'swapBlind' && m.target === row.player && m.targetSlot === i);
                    const live = peekSelf || peekOther || place || blindMine || blindTheirs;
                    return (
                      <button
                        key={i}
                        className={`swap-slot ${live ? 'live' : ''} ${c ? 'known' : ''}`}
                        disabled={!live}
                        aria-label={c ? spokenCard(c.rank, c.suit) : `Face down, slot ${i + 1}`}
                        onClick={() => live && submit(live)}
                      >
                        {c ? <CardFace card={c} /> : <div className={backCls} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="swap-middle">
            {/*
              The pile graphic is a `.card.back.big`, and every "big" pile in this app carries a
              permanent rotateX(14deg) — the tilted-stack look every draw pile has. Elsewhere
              that div is decoration next to a separate flat "Draw" button; here the pile IS the
              button, and putting the click handler on the rotated element itself turned out to
              be a real hit-testing bug, not just a test one: a 3D-rotated quad under a
              `perspective` ancestor does not reliably fill its own axis-aligned bounding box, so
              a click aimed at the geometric centre can land on whatever is behind it instead.
              The fix already exists elsewhere in the app — keep the control flat, and make the
              tilted card purely decorative (`pointer-events: none`) inside it.
            */}
            <button
              className={`swap-pile-btn ${myLegal.some((m) => m.actionId === 'swapDrawStock') ? 'live' : 'dim'}`}
              disabled={!myLegal.some((m) => m.actionId === 'swapDrawStock')}
              aria-label="Draw from the stock"
              onClick={() => submit({ actionId: 'swapDrawStock' })}
            >
              <div className={`${backCls} big`} />
            </button>
            {(() => {
              const top = (view.zones?.discard?.cards ?? []).slice(-1)[0];
              const canTake = myLegal.some((m) => m.actionId === 'swapTakeDiscard');
              return (
                <button
                  className={`swap-pile-btn ${canTake ? 'live' : ''}`}
                  disabled={!canTake}
                  aria-label={top ? `Take ${spokenCard(top.rank, top.suit)} from the pile` : 'Nothing in the pile'}
                  onClick={() => submit({ actionId: 'swapTakeDiscard' })}
                >
                  {top ? <div className="card face big"><CardFace card={top} /></div> : <div className="card empty big" />}
                </button>
              );
            })()}
            {view.held && (
              <div className="swap-held">
                <span className="lay-note">Holding</span>
                <div className="card face big"><CardFace card={view.held} /></div>
                {myLegal.some((m) => m.actionId === 'swapThrow') && (
                  <button className="ghost sm" onClick={() => submit({ actionId: 'swapThrow' })}>
                    Throw it away
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="swap-actions">
            {!view.isYourTurn ? (
              <span className="lay-note">Waiting for the others…</span>
            ) : view.power ? (
              <span className="lay-note">
                {view.power === 'peekSelf' ? 'Pick one of your own to look at.'
                  : view.power === 'peekOther' ? "Pick a card on the table to look at."
                    : 'Pick one of yours, then one of theirs — swapped sight unseen.'}
              </span>
            ) : view.held ? (
              <span className="lay-note">Slide it into your row, or throw it away.</span>
            ) : (
              <>
                <span className="lay-note">Draw from the stock, or take the top of the pile.</span>
                {myLegal.some((m) => m.actionId === 'swapCall') && (
                  <button className="primary" onClick={() => submit({ actionId: 'swapCall' })}>
                    Call {def.swap?.callName ?? 'Dutch'}!
                  </button>
                )}
              </>
            )}
            {view.caller && <span className="lay-note swap-called">{view.caller === me ? 'You called' : `${view.caller} called`} — one turn each left.</span>}
          </div>
        </div>
      ) : isMaid ? (
        /*
          The middle of an Old Maid table: whoever draws next after you, as a fan of cards with
          nothing on their faces — the point is that neither of you knows which is which. Each
          back is one legal move, keyed to the position it sits in, not to a card.
        */
        <div className="center maid-center">
          {(() => {
            const targetId = myLegal[0]?.target;
            const target = view.players.find((p) => p.id === targetId);
            if (!target) {
              return <span className="lay-note">Waiting for the others…</span>;
            }
            return (
              <>
                <div className="maid-fan-label">{target.id === me ? 'You' : target.id}'s hand — pick one</div>
                <div className="maid-fan" role="group" aria-label={`${target.id}'s hand, face down`}>
                  {myLegal.map((m, i) => (
                    <button
                      key={i}
                      className="maid-card"
                      style={{ '--i': i, '--n': myLegal.length } as React.CSSProperties}
                      aria-label={`Draw the card in position ${i + 1} of ${myLegal.length}`}
                      onClick={() => submit(m)}
                    >
                      <div className={backCls} />
                    </button>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      ) : isLayout ? (
        /*
          The middle of a Kings Corner table.

          Eight places: the cross on top, the corners beneath. A corner that is still shut says
          what it is waiting for rather than sitting there blank, because "you need a King" is
          the single most useful thing the board can tell a new player, and a blank square tells
          them nothing at all.

          A pile lights up when the card you have picked up can go on it. Picking a pile instead
          of a card is how you move the whole thing somewhere else.
        */
        <div className="center lay-center">
          <div className="lay-grid">
            {(view.layoutPiles ?? []).map((pile) => {
              const play = myLegal.find((m) => m.actionId === 'layoutPlay'
                && m.cardId === selected && m.to === pile.id);
              const move = myLegal.find((m) => m.actionId === 'layoutMove'
                && m.from === selPile && m.to === pile.id);
              const canLift = !!selected === false && (view.layoutPiles ?? []).some(
                (q) => myLegal.some((m) => m.actionId === 'layoutMove' && m.from === pile.id && q.id === m.to));
              const live = play || move;
              const top = pile.cards[pile.cards.length - 1];
              return (
                <button
                  key={pile.id}
                  className={`lay-pile ${live ? 'live' : ''} ${selPile === pile.id ? 'picked' : ''}`}
                  data-slot={pile.id}
                  aria-label={
                    top ? `${spokenCard(top.rank, top.suit)}, ${pile.cards.length} card${pile.cards.length === 1 ? '' : 's'}`
                      : pile.opensOn ? `Empty corner — needs a ${pile.opensOn}`
                        : 'Empty space — takes any card'
                  }
                  onClick={() => {
                    if (play) { submit(play); setSelected(null); return; }
                    if (move) { submit(move); setSelPile(null); return; }
                    if (canLift) { setSelPile(selPile === pile.id ? null : pile.id); setSelected(null); }
                  }}
                >
                  {top ? <CardFace card={top} />
                    : <span className="lay-empty">{pile.opensOn ? pile.opensOn : '+'}</span>}
                  {pile.cards.length > 1 && <i className="lay-depth">{pile.cards.length}</i>}
                </button>
              );
            })}
          </div>
          <div className="lay-actions">
            {myLegal.some((m) => m.actionId === 'layoutDraw') ? (
              <button className="primary" onClick={() => submit({ actionId: 'layoutDraw' })}>
                Draw a card
              </button>
            ) : !view.isYourTurn ? (
              // The panel used to say "pick a card" to somebody who could not pick anything,
              // because it renders on every seat's screen and only checked what was legal.
              <span className="lay-note">Waiting for the others…</span>
            ) : (
              <>
                <span className="lay-note">
                  {selPile ? 'Now pick where that pile goes.'
                    : selected ? 'Now pick a pile for it.'
                      : 'Pick a card, or lift a whole pile.'}
                </span>
                {myLegal.some((m) => m.actionId === 'layoutDone') && (
                  <button className="ghost sm" onClick={() => { setSelected(null); setSelPile(null); submit({ actionId: 'layoutDone' }); }}>
                    Done — next player
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      ) : isCapture ? (
        /*
          The middle of a Scopa-style table: whatever is currently face up, free for the next
          play to claim. Nothing here is clickable — a capture is worked out from the card
          played, not chosen by tapping the table — so this is a display, the same shape Kent's
          own pool is, minus the buttons.
        */
        <div className="center capture-center">
          <div className="pile" data-slot="draw">
            <div className={`${backCls} big`} />
            <div className="pile-label">Stock · {view.zones.draw?.count ?? 0}</div>
          </div>
          <div className="capture-table" role="group" aria-label="The table">
            {(view.zones.table?.cards ?? []).length === 0
              ? <div className="card big empty" />
              : (view.zones.table?.cards ?? []).map((c) => (
                <div key={c.id} className="capture-tablecard"><CardFace card={c} /></div>
              ))}
          </div>
          <span className="seat-stat">{seatNum(view.zones.captured?.count ?? 0)}<i>captured</i></span>
        </div>
      ) : isKent ? (
        /*
          The middle of a Kent table: four cards face up that anybody may take at any moment,
          the letters each pair has spelt, and — when somebody signals — the one button that
          decides the round.
        */
        <div className="center kent-center">
          <div className="kent-letters">
            {(['A', 'B'] as const).map((team) => (
              <span key={team} className={`kent-pair ${teamOf(me) === `Pair ${team}` ? 'mine' : ''}`}>
                <i>Pair {team}</i>
                <b>{(view.kentWord ?? 'KENT').split('').map((ch, i) => (
                  <em key={i} className={i < (view.kentLetters?.[team] ?? 0) ? 'got' : ''}>{ch}</em>
                ))}</b>
              </span>
            ))}
          </div>
          <div className="kent-pool" data-slot="pool" role="group" aria-label="The four cards on the table">
            {(view.kentPool ?? []).map((c) => {
              const swap = myLegal.find((m) => m.actionId === 'kentSwap'
                && m.cardId === selected && m.poolId === c.id);
              return (
                <button key={c.id} className={`kent-poolcard ${swap ? 'live' : ''}`}
                  disabled={!swap}
                  aria-label={`Take ${spokenCard(c.rank, c.suit)}${selected ? '' : ' — pick one of your own first'}`}
                  title={swap ? 'Swap your picked card for this one' : 'Pick a card of your own first'}
                  onClick={() => swap && submit(swap)}>
                  <CardFace card={c} />
                </button>
              );
            })}
          </div>
          <div className="kent-actions">
            {view.kentTell ? (
              view.kentTell.player === me ? (
                <span className="kent-note mine">You signalled — hope somebody is watching…</span>
              ) : myLegal.some((m) => m.actionId === 'kentCall') ? (
                <button className="primary kent-go" onClick={() => submit({ actionId: 'kentCall' })}>
                  ✋ Kent!
                </button>
              ) : myLegal.some((m) => m.actionId === 'kentStop') ? (
                <button className="primary kent-go stop" onClick={() => submit({ actionId: 'kentStop' })}>
                  ✋ Call it off!
                </button>
              ) : null
            ) : (
              <>
                {view.kentReady && (
                  <button className="primary kent-go signal" onClick={() => submit({ actionId: 'kentSignal' })}>
                    Signal your partner
                  </button>
                )}
                {myLegal.some((m) => m.actionId === 'kentRefresh') && (
                  <button className="ghost sm" onClick={() => submit({ actionId: 'kentRefresh' })}>
                    Nobody wants these — turn them over
                  </button>
                )}
                <span className="kent-note">
                  {selected ? 'Now take one from the table.' : 'Pick one of yours to trade away.'}
                </span>
              </>
            )}
          </div>
        </div>
      ) : isSet || isReflex || isPoker || isPit ? (
        /* Each of these has its own dedicated center-area UI rendered below (Reflex's slap pile,
           Poker's pot, Pit's market) — none has a real draw/discard zone, so falling through to
           the generic piles here would just be furniture on top of the real thing, or (Set)
           furniture for a game that has neither at all. */
        null
      ) : (
        <div className="center dd-center">
          <div className="pile" data-slot="draw">
            <div className={`${backCls} big`} />
            <div className="pile-label">Draw · {view.zones.draw?.count ?? 0}</div>
          </div>
          <div className="pile" data-slot="discard">
            {/* Keyed by the card, so a new top card is a new element and lands rather than
                cross-fading in place. */}
            {top ? <div key={top.id} className="landed"><CardFace card={top} /></div>
                 : <div className="card big empty" />}
            <div className="pile-label">Discard{activeSuit ? ` · suit ${SUIT_SYMBOLS[activeSuit] ?? activeSuit}` : ''}</div>
          </div>
          {/* Piles the game's author named. A pile the table never draws is cards disappearing
              as far as anyone playing is concerned, so each one gets a slot — its top card if
              the author made it face up, a back and a count if not. */}
          {extraPiles.map(([id, z]) => (
            <div key={id} className="pile" data-slot="extra">
              {z.cards[0] ? <div key={z.cards[0].id} className="landed"><CardFace card={z.cards[0]} /></div>
                : z.count > 0 ? <div className={`${backCls} big`} />
                : <div className="card big empty" />}
              <div className="pile-label">{id} · {z.count}</div>
            </div>
          ))}
        </div>
      )}

      <div className={`you ${view.isYourTurn ? 'your-turn' : ''}`}>
        <div className="you-head">
          {/*
            Your own name, then your own numbers as chips.

            It used to be one sentence — "Your hand · 1 won · bid 2 · Team A" — which read as
            a caption rather than a scoreboard, and which grew until the buttons after it
            wrapped onto a second line and pushed the cards further down the felt. Every
            opponent already shows the same figures as chips on their seat; these are yours,
            in the same shape.
          */}
          <span>{isSet
            ? 'The board'
            : settings.playerName === 'You' ? 'Your hand' : `${settings.playerName}’s hand`}</span>
          {clientRef.current.remote && (
            <span className={`conn-dot ${conn}`} role="status"
              aria-label={conn === 'live' ? 'Connected' : 'Reconnecting'}
              title={conn === 'live' ? 'Connected' : 'Reconnecting…'} />
          )}
          {teamOf(me) && <span className="team-tag">{teamOf(me)}</span>}
          {view.mode === 'trick' && view.bids?.[me] !== undefined && (
            <span className="seat-stat">{seatNum(view.tricksWon?.[me] ?? 0)}/{view.bids[me]}<i>tricks</i></span>
          )}
          {view.mode === 'trick' && view.bids?.[me] === undefined && (view.tricksWon?.[me] ?? 0) > 0 && (
            <span className="seat-stat">{seatNum(view.tricksWon?.[me] ?? 0)}<i>won</i></span>
          )}
          {isFish && <span className="seat-stat">{seatNum(view.booksWon?.[me] ?? 0)}<i>books</i></span>}
          {view.needsPassChoice && (
            <span className="turn-badge">
              {/* "Pass 0/3 left" read as three remaining rather than as the direction to pass
                  in. The direction leads now, and the count says what it counts. */}
              {view.passCount > 1
                ? `Passing ${view.passDirection} · ${view.passStaged.length} of ${view.passCount} chosen`
                : `Pass ${view.passDirection}`}
            </span>
          )}
          {isInterrupt && <span className="bomb-badge">💣 Bomb?</span>}
          {discardMoves.length > 0 && <span className="turn-badge">Discard one</span>}
          {/* "Your turn" is meaningless where there are no turns — everybody is always in. */}
          {!view.passDirection && view.isYourTurn && !suitPickerOpen && !isInterrupt && !isSet && !isPit && !isKent
            && <span className="turn-badge">Your turn</span>}
          {isSet && view.isYourTurn && <span className="turn-badge">Find a set</span>}
          {!view.needsPassChoice && view.passDirection && <span className="waiting-badge">Waiting on {view.passWaitingOn}…</span>}
          {upNext.length > 0 && (
            <span className="upnext-badge" title="Turn order from here">
              Up next: {upNext.map((id) => nameOf(id)).join(' → ')}
            </span>
          )}
          {canDraw && <button className="draw-btn" onClick={() => submit({ actionId: 'drawCard' })}>Draw</button>}
          {canPass && <button className="draw-btn" onClick={() => submit({ actionId: 'climbPass' })}>Pass</button>}
          {canFishDraw && <button className="draw-btn" onClick={() => submit({ actionId: 'fishDraw' })}>Draw</button>}
          {/* With nothing left in the stock this move does not draw a card — in Gin it ends
              the hand as a wash, and elsewhere it turns the discards back over. A button
              still labelled "Stock" gives no warning of either. */}
          {canDrawStock && (
            <button className="draw-btn" onClick={() => submit({ actionId: 'drawStock' })}
              title={(view.zones.draw?.count ?? 0) > 0 ? 'Draw the top card of the stock'
                : def.rummy?.knock !== undefined ? 'The stock is out — this ends the hand as a wash'
                : 'The stock is out — this turns the discards back over'}>
              {(view.zones.draw?.count ?? 0) > 0 ? 'Stock'
                : def.rummy?.knock !== undefined ? 'Wash the hand' : 'Turn the discards over'}
            </button>
          )}
          {canDrawDiscard && <button className="draw-btn" onClick={() => submit({ actionId: 'drawDiscard' })}>Take</button>}
          {isRummy && view.rummyPhase === 'play' && view.meldMoves?.map((m, i) => (
            <button key={i} className="meld-btn" onClick={() => submit({ actionId: 'meld', cards: m.cards })}>Meld {m.label}</button>
          ))}
          {comboMoves.map((m, i) => (
            <button key={`combo${i}`} className="meld-btn" onClick={() => submit({ actionId: 'climbPlay', cards: m.cards })}>
              Play {SHAPE_NAME[m.cards!.length] ?? `${m.cards!.length}`} of {rankOfId(m.cards![0])}
            </button>
          ))}
          {bombMoves.map((m, i) => (
            <button key={`bomb${i}`} className="bomb-btn" onClick={() => submit({ actionId: 'climbBomb', cards: m.cards })}>
              💣 Bomb · {m.cards!.length}×{rankOfId(m.cards![0])}
            </button>
          ))}
          {canDeclineBomb && <button className="draw-btn" onClick={() => submit({ actionId: 'climbNoBomb' })}>Hold</button>}
          {layOffMoves.map((m, i) => (
            <button key={`lay${i}`} className="meld-btn" onClick={() => submit(m)}>
              Lay off {rankOfId(m.cardId!)}
            </button>
          ))}
          {view.deadwood != null && <span className="rummy-hint">deadwood {view.deadwood}</span>}
          {knockMoves.map((m, i) => (
            <button key={`knock${i}`} className="knock-btn" onClick={() => submit(m)}>
              Knock — throw {rankOfId(m.cardId!)}
            </button>
          ))}
          {isRummy && view.rummyPhase === 'play' && view.isYourTurn && <span className="rummy-hint">discard</span>}
          {/* The clock, only when there is one. The ring drains gold to amber to red as it goes;
              the last five seconds also turn the pill itself urgent. */}
          {secsLeft !== null && (
            <span className={`turn-clock ${secsLeft <= 5 ? 'urgent' : secsLeft / settings.turnSeconds <= 0.5 ? 'warn' : ''}`}
              style={{ ['--pct' as string]: String(settings.turnSeconds > 0 ? secsLeft / settings.turnSeconds : 1) }}
              role="timer" aria-live="off">
              {secsLeft}s
            </span>
          )}
          {view.isYourTurn && <button className="restart-btn" onClick={showHint} title="Suggest a move">Hint</button>}
          {/* Taking back a misclick. Sits next to Hint because that is where the eye already is. */}
          {canQuickUndo && (
            <button className="restart-btn undo-btn" onClick={quickUndo} title="Take back the move you just made">
              ↶ Undo
            </button>
          )}
          {/*
            Everything above this line is a move you can make right now. Everything below it is
            about the match rather than the hand — worth reaching for once or twice a game, and
            not worth three permanent buttons on the one row that decides how far up the felt
            your cards sit. On a 1280px screen the row wrapped, and the cards dropped a line.
          */}
          <div className="table-menu">
            <button className="restart-btn menu-btn" aria-haspopup="menu" aria-expanded={tableMenu}
              onClick={() => setTableMenu((v) => !v)} title="History, take back, restart">
              ⋯<span className="sr-only"> Table menu</span>
            </button>
            {tableMenu && (
              <>
                <div className="menu-scrim" onClick={() => setTableMenu(false)} aria-hidden="true" />
                <div className="menu-pop" ref={menuRef} role="menu" aria-label="Table">
                  <button role="menuitem" onClick={() => { setTableMenu(false); openHistory(); }}>
                    History<i>every move so far</i>
                  </button>
                  {view.phase === 'playing' && !takeback && (
                    <button role="menuitem" onClick={() => { setTableMenu(false); askTakeback(); }}>
                      Take back<i>ask the table to undo your last move</i>
                    </button>
                  )}
                  <button role="menuitem" onClick={() => {
                    setTableMenu(false);
                    // Rematch/Play again only ever appear once a hand is actually over — this is
                    // the one way to throw away a match still in progress, so it's the one that
                    // needs to ask first.
                    if (view.phase === 'playing') setConfirmingRestart(true); else restart();
                  }}>
                    Restart<i>deal a fresh game</i>
                  </button>
                  {typeof clientRef.current.replaySameDeal === 'function' && (
                    <button role="menuitem" onClick={() => { setTableMenu(false); replayDeal(); }}>
                      Replay this deal<i>the exact same hand, from the start</i>
                    </button>
                  )}
                  {fullscreenSupported && (
                    <button role="menuitem" onClick={() => { setTableMenu(false); toggleFullscreen(); }}>
                      {isFullscreen ? 'Exit full screen' : 'Full screen'}
                      <i>{isFullscreen ? 'bring back the browser bar' : 'hide the browser bar, keep the felt'}</i>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
        {confirmingRestart && (
          <Confirm
            title="Restart this game?"
            body="This throws away the hand in progress and deals a brand new one. Nobody's moves so far can be recovered."
            confirmLabel="Restart"
            onConfirm={() => { setConfirmingRestart(false); restart(); }}
            onCancel={() => setConfirmingRestart(false)}
          />
        )}
        {isSet ? (
          /*
            No hand and no turn: one board everybody can see. Picking the right number of cards
            submits the call immediately — hesitating to press a button is the opposite of the
            game, which is about being first.
          */
          <div className="set-controls">
            {/* Everyone else's score is on their seat now, so this row is about the board and
                about you — the same line repeated in two places just made both harder to read. */}
            <div className="set-info">
              <span className="chip">{view.setDeckLeft ?? 0} left in the deck</span>
              <span className="chip">Pick {view.setSize ?? 3} that match</span>
              {/* The count alone, not which ones — Set is notorious for a board that genuinely
                  has none on it, and a stuck player deserves to know that's what's happening. */}
              <span className="chip" title="How many valid trios are on the board right now">
                {view.setsAvailable ?? 0} on the board
              </span>
              <span className="chip mine">
                You · {seatNum(view.scores?.[me] ?? 0)} {(view.scores?.[me] ?? 0) === 1 ? 'set' : 'sets'}
              </span>
            </div>
            <div className="set-board" data-slot="board" role="group" aria-label="The board">
              {(view.setBoard ?? []).map((c) => {
                const on = setPicked.includes(c.id);
                return (
                  <button
                    key={c.id}
                    className={`set-card ${on ? 'on' : ''}`}
                    aria-pressed={on}
                    aria-label={describeAttrs(c.attrs ?? {})}
                    onClick={() => {
                      const next = on ? setPicked.filter((x) => x !== c.id) : [...setPicked, c.id];
                      const want = view.setSize ?? 3;
                      if (next.length === want) {
                        // Submit as soon as the third is picked, right or wrong.
                        const move = myLegal.find((m) => m.actionId === 'callSet'
                          && m.cards?.length === want && m.cards.every((id) => next.includes(id)));
                        submit(move ?? { actionId: 'callSet', cards: next });
                        setSetPicked([]);
                      } else {
                        setSetPicked(next);
                      }
                    }}
                  >
                    <AttrCard card={c} />
                  </button>
                );
              })}
            </div>
            {setPicked.length > 0 && (
              <button className="ghost sm" onClick={() => setSetPicked([])}>Clear pick</button>
            )}
          </div>
        ) : isBluff ? (
          <div className="bluff-controls">
            {/* Your own cards stay visible even off your claim turn — you still need them to
                decide whether to call the current claim. */}
            {hand.length > 0 && (() => {
              const myClaimTurn = myLegal.some((m) => m.actionId === 'bluffClaim');
              return (
                // A group with a single delegated keydown handler for arrow-key navigation
                // between the buttons inside it — the standard roving-tabindex shape, not a
                // click/keyboard interaction of the group element itself.
                // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
                <div
                  className={`hand hl-${settings.highlight}`}
                  data-slot="hand"
                  data-sink="center"
                  role="group"
                  aria-label={`Your hand, ${hand.length} card${hand.length === 1 ? '' : 's'}`}
                  onKeyDown={myClaimTurn ? (e) => handKeys(e, hand.map((c) => c.id), toggleBluffCard) : undefined}
                >
                  {hand.map((c, i) => (
                    <button key={c.id}
                      data-cardkey={c.id}
                      style={{ '--i': i, '--n': hand.length } as React.CSSProperties}
                      tabIndex={myClaimTurn ? ((cursor === null ? i === 0 : i === Math.min(cursor, hand.length - 1)) ? 0 : -1) : -1}
                      aria-pressed={myClaimTurn ? bluffSelected.includes(c.id) : undefined}
                      aria-label={cardLabel(c, myClaimTurn, myClaimTurn && bluffSelected.includes(c.id) ? 'staged face down' : undefined)}
                      className={`card-btn ${!myClaimTurn ? 'dim' : bluffSelected.includes(c.id) ? 'selected' : 'playable'}`}
                      disabled={!myClaimTurn}
                      onFocus={myClaimTurn ? () => setCursor(i) : undefined}
                      onClick={myClaimTurn ? () => toggleBluffCard(c.id) : undefined}
                      title={!myClaimTurn ? undefined : bluffSelected.includes(c.id) ? 'Take this one back out' : 'Stage this card face down'}>
                      <CardFace card={c} />
                    </button>
                  ))}
                </div>
              );
            })()}
            {myLegal.some((m) => m.actionId === 'bluffClaim') && (
              <div className="bluff-rankpicker">
                <span className="muted">Tap up to four of the same card, then claim them as whatever you like:</span>
                {/* A wrapped grid ran to two full rows of pills — 13 ranks at a 62px floor
                    each — which on a real laptop screen was the difference between the claim
                    button living on the table and living below it. One scrolling row, the
                    same convention the kind filter and the shelf rails already use. */}
                <div className="seg rank-rail">
                  {def.deck.rankOrder.map((r) => (
                    <button key={r} className={bluffRank === r ? 'on' : ''} onClick={() => setBluffRank(r)}>{r}</button>
                  ))}
                </div>
                {/* A disabled button that says "Play 2 face down" tells you nothing about why
                    it will not, and a claim needs both halves: cards from your hand, and the
                    rank you are claiming they are. It says which half is missing. */}
                <button className="primary bluff-go" disabled={!bluffClaimMove}
                  onClick={() => bluffClaimMove && submit(bluffClaimMove)}>
                  {bluffSelected.length === 0 ? 'Pick cards to play'
                    : !bluffRank ? 'Now claim a rank'
                    : bluffClaimMove ? `Play ${bluffSelected.length} as ${bluffRank}${bluffSelected.length === 1 ? '' : 's'}`
                    : `You cannot claim ${bluffSelected.length} as ${bluffRank}s`}
                </button>
              </div>
            )}
          </div>
        ) : isReflex ? (
          <div className="reflex-controls">
            <div className="reflex-pile" data-slot="trick">
              {view.pileTop ? <div className="pile-card"><CardFace card={view.pileTop} /></div> : <div className="empty-hand">— empty —</div>}
              <span className="muted">{view.zones.pile?.count ?? 0} on the pile</span>
            </div>
            <div className="reflex-actions">
              {myLegal.some((m) => m.actionId === 'reflexSlap') && (
                <button className="primary reflex-slap" onClick={() => submit({ actionId: 'reflexSlap' })}>✋ SLAP!</button>
              )}
              {myLegal.some((m) => m.actionId === 'reflexFlip') && (
                <button className="ghost" onClick={() => submit({ actionId: 'reflexFlip' })}>Flip</button>
              )}
            </div>
            <span className="muted">Your hand · {hand.length} card{hand.length === 1 ? '' : 's'}</span>
          </div>
        ) : isPoker ? (
          <div className="poker-controls">
            <div className="poker-info">
              <span className="chip">Pot · {view.pot ?? 0}</span>
              <span className="chip">Your chips · {view.chips?.[me] ?? 0}</span>
              {(view.currentBet ?? 0) > (view.committed?.[me] ?? 0) && (
                <span className="chip">To call · {(view.currentBet ?? 0) - (view.committed?.[me] ?? 0)}</span>
              )}
            </div>
            <div className="hand hl-off poker-hand" data-slot="hand" role="group" aria-label={`Your hand, ${hand.length} cards`}>
              {hand.map((c, i) => (
                <div key={c.id} className="card-btn dim static" role="img" aria-label={spokenCard(c.rank, c.suit)}
                  style={{ '--i': i, '--n': hand.length } as React.CSSProperties}>
                  <CardFace card={c} />
                </div>
              ))}
            </div>
            {/*
              Check and call are the safe, ordinary moves, so they lead. Everything that puts
              more of your stack in is quieter, and shoving the lot is quieter still with the
              amount spelt out — every one of these was equally loud pink, which put "Call 5"
              and "Raise to 200" side by side as identical buttons.
            */}
            <div className="poker-actions">
              {myLegal.filter((m) => m.actionId?.startsWith('poker')).map((m, i) => {
                const allIn = m.actionId !== 'pokerFold' && (m.amount ?? 0) >= (view.chips?.[me] ?? 0) + (view.committed?.[me] ?? 0);
                const cls = m.actionId === 'pokerFold' ? 'ghost danger'
                  : m.actionId === 'pokerCheck' || m.actionId === 'pokerCall' ? 'primary'
                  : allIn ? 'ghost bet allin' : 'ghost bet';
                return (
                  <button key={i} className={cls} onClick={() => submit(m)}>
                    {m.actionId === 'pokerCheck' ? 'Check'
                      : m.actionId === 'pokerCall' ? `Call ${(view.currentBet ?? 0) - (view.committed?.[me] ?? 0)}`
                      : m.actionId === 'pokerFold' ? 'Fold'
                      : allIn ? `All in · ${m.amount}`
                      : `${m.actionId === 'pokerBet' ? 'Bet' : 'Raise to'} ${m.amount}`}
                  </button>
                );
              })}
            </div>
          </div>
        ) : isPit ? (
          <div className="pit-controls">
            {/* The target depends on how many people sat down, so it has to be on screen —
                a row of counts with nothing to count towards told you nothing. */}
            <div className="pit-hand-summary">
              <span className="pit-goal">Corner <b>{view.cornerSize}</b> of one suit</span>
              {(['C', 'D', 'H', 'S'] as const).map((suit) => {
                const count = hand.filter((c) => c.suit === suit).length;
                const best = Math.max(0, ...(['C', 'D', 'H', 'S'] as const).map((x) => hand.filter((c) => c.suit === x).length));
                return count > 0 ? (
                  <span key={suit} className={`chip ${count === best ? 'lead' : ''}`}>
                    {count}/{view.cornerSize} {SUIT_SYMBOLS[suit]}
                  </span>
                ) : null;
              })}
            </div>
            <div className="pit-market">
              {(view.market?.length ?? 0) === 0 && <span className="muted">No open offers.</span>}
              {view.market?.map((o) => (
                <div key={o.id} className={`pit-offer ${o.player === me ? 'mine' : ''}`}>
                  <span>{nameOf(o.player)} offers {o.count}× {SUIT_SYMBOLS[o.give]} for {SUIT_SYMBOLS[o.want]}</span>
                  {o.player === me
                    ? myLegal.some((m) => m.actionId === 'pitCancel' && m.offerId === o.id) && (
                        <button className="ghost sm" onClick={() => submit({ actionId: 'pitCancel', offerId: o.id })}>Cancel</button>
                      )
                    : myLegal.some((m) => m.actionId === 'pitAccept' && m.offerId === o.id) && (
                        <button className="primary sm" onClick={() => submit({ actionId: 'pitAccept', offerId: o.id })}>Accept</button>
                      )}
                </div>
              ))}
            </div>
            {/*
              Only what you can actually offer. The three menus used to list all four suits and
              the counts one to three whatever you held, so a hand with no clubs in it opened on
              "1 Club for Diamonds" with the button dead and nothing on screen saying why.
            */}
            <div className="pit-offer-maker">
              <span className="muted">Offer</span>
              <select value={pitCount} onChange={(e) => setPitCount(+e.target.value)} aria-label="How many">
                {pitCounts.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <select value={pitGive} onChange={(e) => setPitGive(e.target.value as typeof pitGive)} aria-label="Give this suit">
                {pitGivable.map((sut) => (
                  <option key={sut} value={sut}>{SUIT_SYMBOLS[sut]} {SUIT_NAMES[sut]}</option>
                ))}
              </select>
              <span className="muted">for</span>
              <select value={pitWant} onChange={(e) => setPitWant(e.target.value as typeof pitWant)} aria-label="Want this suit">
                {(['C', 'D', 'H', 'S'] as const).filter((sut) => sut !== pitGive).map((sut) => (
                  <option key={sut} value={sut}>{SUIT_SYMBOLS[sut]} {SUIT_NAMES[sut]}</option>
                ))}
              </select>
              <button
                className="primary sm"
                disabled={!myLegal.some((m) => m.actionId === 'pitOffer' && m.give === pitGive && m.want === pitWant && m.cards?.[0] === String(pitCount))}
                onClick={() => submit({ actionId: 'pitOffer', give: pitGive, want: pitWant, cards: [String(pitCount)] })}
              >
                Offer
              </button>
            </div>
          </div>
        ) : isWar ? (
          <div className="war-controls">
            <span className="war-pile">Your pile · <b key={myPile} className="war-pile-n">{myPile}</b> cards</span>
            {(view.warsCount ?? 0) > 0 && <span className="war-count">{view.warsCount} war{view.warsCount === 1 ? '' : 's'} fought</span>}
            {canFlip && <button className="primary" onClick={() => submit({ actionId: 'warFlip' })}>⚔ Flip</button>}
          </div>
        ) : (
        // Same roving-tabindex shape as the Bluff hand above: one delegated keydown for arrow
        // navigation between the buttons inside, not an interaction on the group itself.
        // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
        <div
          className={`hand hl-${settings.highlight}`}
          data-slot="hand"
          /* Where a card goes when it leaves your hand and is not visible anywhere else:
             cards you pass go to the player you are passing to, and cards an opponent asks
             you for go to whoever is asking. Without this they would simply blink out. */
          data-sink={passSink}
          role="group"
          aria-label={`Your hand, ${hand.length} card${hand.length === 1 ? '' : 's'}`}
          onKeyDown={(e) => handKeys(e, hand.filter((c) => playableCardIds.has(c.id)).map((c) => c.id), clickCard)}
        >
          {hand.map((c, i) => {
            const playable = playableCardIds.has(c.id);
            const staged = view.passStaged.includes(c.id);
            const playableIds = hand.filter((x) => playableCardIds.has(x.id)).map((x) => x.id);
            const idx = playableIds.indexOf(c.id);
            // One tab stop for the whole hand; the arrows move within it.
            const isCursor = playable && (cursor === null ? idx === 0 : idx === Math.min(cursor, playableIds.length - 1));
            return (
              <button
                key={c.id}
                data-cardkey={c.id}
                style={{ '--i': i, '--n': hand.length } as React.CSSProperties}
                tabIndex={playable ? (isCursor ? 0 : -1) : -1}
                aria-label={cardLabel(c, playable, staged ? 'picked to pass' : undefined)}
                className={`card-btn ${playable ? 'playable' : 'dim'} ${staged ? 'staged' : ''} ${hint === c.id ? 'hinted' : ''} ${(isFish ? c.rank === askRank : selected === c.id) ? 'selected' : ''} ${dragGhost?.cardId === c.id ? 'drag-source' : ''} ${shakeCard === c.id ? 'shake' : ''} ${ghostPlay?.cardId === c.id ? 'pending-confirm' : ''} ${firstGlowCardId === c.id ? 'first-card-glow' : ''}`}
                disabled={!playable}
                onFocus={() => { if (idx >= 0) setCursor(idx); }}
                onClick={() => clickCard(c.id)}
                onPointerDown={playable ? (e) => { startDrag(e, c.id); startPreview(e, c.id); } : undefined}
                title={firstGlowCardId === c.id ? 'Your first move — tap this card to play it' : staged ? 'Picked to pass' : playable ? (isFish ? 'Pick this rank to ask for' : view.needsPassChoice ? 'Give this card away' : settings.confirmPlays && selected !== c.id ? 'Click to select' : 'Play this card') : capitalize(dimReason(c))}
              >
                <CardFace card={c} />
              </button>
            );
          })}
          {hand.length === 0 && <div className="empty-hand">— empty —</div>}
        </div>
        )}
      </div>

      {suitPickerOpen && (
        <div className="modal">
          <div className="modal-box" ref={suitRef} role="dialog" aria-modal="true" aria-label="Choose a suit">
            <h3>{view.pendingChoice?.purpose === 'contractTrump' ? 'You won the bid — name trump' : 'Wild card — choose a suit'}</h3>
            <div className="suit-choices">
              {(['C', 'D', 'H', 'S'] as const).map((s) => (
                <button key={s} className={`suit-btn s-${s}`} aria-label={SUIT_NAMES[s]} onClick={() => submit({ actionId: 'resolveChoice', choice: s })}>{SUIT_SYMBOLS[s]}</button>
              ))}
            </div>
          </div>
        </div>
      )}

      {view.phase === 'roundOver' && !view.matchOver && (
        <div className="modal">
          {(view.winner === me || moonShooter === me) && <Confetti pieces={moonShooter ? 70 : ginOutcome === 'gin' || slamMade ? 50 : 30} />}
          <div className={`modal-box celebrate handend ${view.winner === me ? 'won' : ''} ${moonShooter ? 'moonshot' : ''} ${ginOutcome ? 'ginout' : ''} ${slamMade ? 'slammade' : ''}`} ref={roundRef} role="dialog" aria-modal="true">
            <span className="cb-kicker">{moonShooter ? '☾ Shot the moon' : ginOutcome === 'gin' ? '♦ Gin' : ginOutcome === 'undercut' ? '⚡ Undercut' : slamMade ? '♛ Slam' : `Hand ${view.handNumber}`}</span>
            {/* A round of a partnership game is taken by a pair, not by whoever pressed the
                button — "Bot 2 takes it" tells a player on Bot 2's side that they lost. */}
            <h3>{moonShooter
              ? (moonShooter === me ? 'You swept every point' : `${nameOf(moonShooter)} swept every point`)
              : ginOutcome === 'gin'
              ? (view.winner === me ? 'You went gin' : `${nameOf(view.winner || '')} went gin`)
              : ginOutcome === 'undercut'
              ? (view.winner === me ? 'You undercut the knock' : `${nameOf(view.winner || '')} undercut your knock`)
              : slamMade
              ? (view.winner === me ? 'You bid it to the top and made it' : `${nameOf(view.winner || '')} bid it to the top and made it`)
              : isKent
              ? (teamOf(view.winner ?? '') === teamOf(me)
                  ? `Your pair takes it — ${nameOf(view.winner || '')} spotted it`
                  : `${teamOf(view.winner ?? '') ?? 'The other pair'} takes it`)
              : view.winner === me ? 'You take it'
              : `${nameOf(view.winner || '')} takes it`}</h3>
            {/* What the hand did to you. In a betting game `scores` is the stack you are
                holding, not what you won, so the hand's own row is what belongs here — and a
                stack that went down wants a minus, not a plus. */}
            {isKent ? (
              <p className="scores">
                <span className={teamOf(view.winner ?? '') === teamOf(me) ? 'mine' : ''}>
                  {teamOf(view.winner ?? '') ?? 'A pair'} <b>takes the round</b>
                </span>
              </p>
            ) : (
            <p className="scores">
              {Object.entries(isPoker ? (view.handScores.slice(-1)[0] ?? view.scores) : view.scores).map(([p, s]) => (
                <span key={p} className={p === me ? 'mine' : ''}>
                  {nameOf(p)} <b>{s >= 0 ? '+' : '−'}{Math.abs(s)}</b>
                </span>
              ))}
            </p>
            )}
            <div className="match-scoreboard">
              <div className="ms-title">
                {isPoker
                  ? `Chips · hand ${view.handNumber} of ${def.poker?.hands ?? 1}`
                  : isKent
                    ? `Letters · ${view.kentWord ?? 'KENT'} and you are out`
                    : `Race to ${view.matchTarget}`}
              </div>
              {isKent
                ? (['A', 'B'] as const).map((pair) => (
                    <div key={pair} className="ms-row">
                      <span>Pair {pair}{teamOf(me) === `Pair ${pair}` ? ' (yours)' : ''}</span>
                      <b>{(view.kentWord ?? 'KENT').slice(0, view.kentLetters?.[pair] ?? 0) || '—'}</b>
                    </div>
                  ))
                : view.players
                    .slice()
                    .sort((a, b) => (view.matchScores?.[b.id] ?? 0) - (view.matchScores?.[a.id] ?? 0))
                    .map((p) => (
                      <div key={p.id} className="ms-row">
                        <span>{nameOf(p.id)}</span>
                        <b>{view.matchScores?.[p.id] ?? 0}</b>
                      </div>
                    ))}
            </div>
            <button className="primary" onClick={playNextHand}>Next hand →</button>
          </div>
        </div>
      )}

      {view.phase === 'roundOver' && view.matchOver && (() => {
        // A pair game is won by a pair. The engine names one player as the winner — whichever
        // partner sits first — so a player in the other seat of the winning pair would have been
        // told their own partner beat them.
        const iWon = isKent
          ? !!view.matchWinner && teamOf(view.matchWinner) === teamOf(me)
          : view.matchWinner === me || (view.matchWinner == null && view.winner === me);
        // Kent's standings are the two pairs and the letters they spelt, fewest first — the
        // per-player one-nil from the last round says nothing about who won the game.
        const finals: [string, string | number][] = isKent
          ? (['A', 'B'] as const)
              .map((pair) => [`Pair ${pair}`, view.kentLetters?.[pair] ?? 0] as [string, number])
              .sort((a, b) => (a[1] as number) - (b[1] as number))
              .map(([name, n]) => [name, (view.kentWord ?? 'KENT').slice(0, n as number) || '—'])
          : Object.entries(view.matchTarget != null ? (view.matchScores ?? view.scores) : view.scores);
        const lowWins = def.scoring.winner === 'lowestTotal';
        const ranked = isKent ? finals
          : finals.slice().sort((a, b) => (lowWins ? (a[1] as number) - (b[1] as number) : (b[1] as number) - (a[1] as number)));
        return (
          <div className="modal final-modal">
            {iWon && <Confetti pieces={64} spread="rain" />}
            {iWon && <Confetti pieces={40} spread="burst" />}
            {/* A shaft of light behind the box, so a win arrives rather than appears. */}
            <div className={`cb-beam ${iWon ? 'won' : ''}`} aria-hidden="true" />
            <div className={`modal-box celebrate final ${iWon ? 'won' : ''}`}>
              <span className="cb-crown" aria-hidden="true">
                <span className="cb-ring" />
                <span className="cb-mark">{iWon ? '★' : '☆'}</span>
              </span>
              {/* General sweep: "every family's big moment currently resolves into the same
                  generic match-over modal" — Pit's only way to end IS its one big moment
                  (cornering the market), so it gets a kicker that says so instead of the
                  generic "Game over" every other single-hand family also falls back to. */}
              <span className="cb-kicker">{isPit ? '📐 Cornered the market' : view.matchTarget != null ? 'Match over' : 'Game over'}</span>
              {(() => {
                const title = iWon ? (isKent ? 'Your pair wins' : 'You win')
                  : isKent ? `${teamOf(view.matchWinner ?? '') ?? 'The other pair'} wins`
                  : `${nameOf(view.matchWinner ?? view.winner ?? '')} wins`;
                return <h3 data-text={title}>{title}</h3>;
              })()}
              {/* Counted in from the bottom of the table up, so the winner's row lands last. */}
              <ol className="podium" style={{ '--rows': ranked.length - 1 } as React.CSSProperties}>
                {ranked.map(([p, sc], i) => (
                  <li key={p} className={`${isKent ? (teamOf(me) === p ? 'mine' : '') : p === me ? 'mine' : ''} ${i === 0 ? 'first' : ''}`}
                    style={{ '--r': i } as React.CSSProperties}>
                    <span className="pd-rank">{i + 1}</span>
                    <span className="pd-name">{isKent ? p : nameOf(p)}</span>
                    <b className="pd-score">{sc}</b>
                  </li>
                ))}
              </ol>
              {/* Worklist #59: a finished match is a complete record of every decision and the
                  same advisor that already drives Hint and the bots — nothing looked back and
                  said anything about it until now. Not a verdict on any one move; just where a
                  choice existed and the advisor's own pick landed somewhere else. */}
              {(() => {
                // Two different pitAccept offers, say, can read identically once described in
                // words — "Take that trade" either way — which would show the same line twice
                // and look like a typo rather than a disagreement. Filtered here rather than
                // where advisorMove is first captured, since only the rendered text can say
                // whether two moves actually read as different.
                const disagreements = clientRef.current.history()
                  .filter((h) => h.seat === me && h.advisorMove)
                  .filter((h) => labelMove(h.move) !== labelMove(h.advisorMove!));
                if (disagreements.length === 0) return null;
                return (
                  <div className="analysis">
                    <h4>Worth a second look</h4>
                    <p className="an-note muted">
                      {disagreements.length} of your move{disagreements.length === 1 ? '' : 's'} this match, the advisor
                      behind Hint would have played differently.
                    </p>
                    <ul className="movelist an-list">
                      {disagreements.slice(-5).map((h) => (
                        <li key={h.n}>
                          <span className="ml-n">{h.n}</span>
                          <span className="ml-text">
                            You played {labelMove(h.move)} · advisor would play {labelMove(h.advisorMove!)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
              <div className="final-actions">
                {/* Worklist #89/#90: the server seed is revealed exactly here — the match just
                    ended — and nowhere else, but this modal has no backdrop dismiss and Rematch
                    starts a new match, taking the table underneath (and the History button on
                    it) with it. Without this, the reveal a player could actually now check would
                    be reachable for a match that no longer exists. */}
                <button className="ghost" onClick={openHistory}>History</button>
                <button className="primary" onClick={rematch}>
                  {plan ? 'Rematch — same table' : 'Play again'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      </div>
      </div>
      {/* Where the flying copies are drawn. It belongs to React rather than being appended by
          the hook, so nothing ever hands React a child it did not create. Inside .table, which
          isolates, so a card in flight covers the felt and never a dialog over it. */}
      <div className="flight-layer" aria-hidden="true" />
      {showMatchPoint && <div className="match-point-sweep" aria-hidden="true" />}
      {/* The card actually following the pointer while a drag is in progress — see cardDrag.ts.
          Fixed to the viewport, not the felt, since it tracks clientX/clientY. */}
      {dragGhost && (
        <div
          className="drag-ghost"
          aria-hidden="true"
          style={{
            left: dragGhost.x, top: dragGhost.y,
            width: dragGhost.width, height: dragGhost.height,
          } as React.CSSProperties}
          dangerouslySetInnerHTML={{ __html: dragGhost.html }}
        />
      )}
      {/* A held card, enlarged in place — see useCardPreview in cardDrag.ts. Suppressed the
          instant a drag actually starts (dragGhost above takes over the same pointer). */}
      {cardPreview && !dragGhost && (
        <div
          className="card-preview"
          aria-hidden="true"
          style={{
            left: cardPreview.x, top: cardPreview.y,
            width: cardPreview.width, height: cardPreview.height,
          } as React.CSSProperties}
          dangerouslySetInnerHTML={{ __html: cardPreview.html }}
        />
      )}
    </div>

      {handoff && (
        <div className="modal handoff">
          <div className="modal-box" ref={handoffRef} role="dialog" aria-modal="true">
            <div className="handoff-mark">🃏</div>
            <h3>Pass the device to {nameOfSeat(handoff)}</h3>
            <p className="scores">Everyone else, look away.</p>
            <button className="primary" onClick={() => takeSeat(handoff)}>
              I'm {nameOfSeat(handoff)} — show my hand
            </button>
          </div>
        </div>
      )}

      {takeback && takeback.needed.includes(me) && (
        <div className="takeback-bar" role="alert">
          <span>{nameOfSeat(takeback.by)} wants to take their last move back.</span>
          <div className="tb-actions">
            <button className="ghost sm" onClick={() => { clientRef.current.declineTakeback(me); setBoard(clientRef.current.read(me)); }}>No</button>
            <button className="primary sm" onClick={() => { clientRef.current.agreeTakeback(me); setBoard(clientRef.current.read(me)); }}>
              Allow it ({takeback.agreed.length}/{takeback.needed.length})
            </button>
          </div>
        </div>
      )}

      {showHistory && (
        // Same backdrop pattern as the other modals in this app: click-outside is supplementary,
        // historyRef wires Escape, and there's a real close affordance inside.
        // eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
        <div className="modal" onClick={() => setShowHistory(false)}>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/click-events-have-key-events */}
          <div className="modal-box wide" ref={historyRef} role="dialog" aria-modal="true" aria-label="Move history"
            onClick={(e) => e.stopPropagation()}>
            <h3>Move history</h3>
            {/*
              Every move is already recorded, so stepping back through them costs nothing but a
              scrubber. This walks the record rather than re-simulating: it shows what was done
              and when, which is what somebody wants when they ask "how did that happen".
            */}
            {history.length > 0 && (
              <div className="replay-bar">
                <button className="ghost sm" aria-label="Step back"
                  disabled={replayAt !== null && replayAt <= 0}
                  onClick={() => setReplayAt((n) => Math.max(0, (n ?? history.length) - 1))}>◀</button>
                <input
                  type="range" min={0} max={history.length}
                  value={replayAt ?? history.length}
                  aria-label="Step through the match"
                  onChange={(e) => setReplayAt(+e.target.value)}
                />
                <button className="ghost sm" aria-label="Step forward"
                  disabled={replayAt === null || replayAt >= history.length}
                  onClick={() => setReplayAt((n) => Math.min(history.length, (n ?? 0) + 1))}>▶</button>
                <span className="replay-count">
                  {replayAt === null ? `${history.length} moves` : `${replayAt} / ${history.length}`}
                </span>
                {replayAt !== null && (
                  <button className="ghost sm" onClick={() => setReplayAt(null)}>Live</button>
                )}
              </div>
            )}
            <ol className="movelist">
              {history.length === 0 && <li className="muted">Nothing has happened yet.</li>}
              {history.map((h) => (
                <li key={h.n} className={replayAt !== null && h.n > replayAt ? 'ahead' : replayAt === h.n ? 'at' : ''}>
                  <span className="ml-n">{h.n}</span>
                  <span className="ml-seat">{nameOfSeat(h.seat)}</span>
                  {/* The row already has a column naming who moved, and the line now names
                      them too, so it read "You  You bid 0 (nil)". Drop the lead-in when it
                      is simply repeating the column beside it. */}
                  <span className="ml-text">{stripLeadingName(humanise(h.text), nameOfSeat(h.seat))}</span>
                </li>
              ))}
            </ol>
            {/* Worklist #89: "every deal publishes a hash before it is dealt and reveals the
                seed after. Nothing in the interface shows either." The hash and the player's
                own contribution are public from the moment the match starts; the seed itself
                only once the match is over, at the same point the engine allows it out. */}
            {(() => {
              const fair = clientRef.current.fairness();
              if (!fair) return null;
              return (
                <div className="fairness">
                  <h4>How this deal was fixed</h4>
                  <dl className="fairness-dl">
                    <dt>Commit</dt><dd className="mono">{fair.commit}</dd>
                    <dt>Your seed</dt><dd className="mono">{fair.clientSeed}</dd>
                    {fair.revealed ? (
                      <>
                        <dt>Server seed</dt><dd className="mono">{fair.revealed.serverSeed}</dd>
                        <dt>Check</dt>
                        <dd>{fair.revealed.verified
                          ? '✓ Every hand matches the commit.'
                          : '✕ Something does not match — this should never happen.'}</dd>
                      </>
                    ) : (
                      <>
                        <dt>Server seed</dt>
                        <dd className="muted">Revealed once the match ends.</dd>
                      </>
                    )}
                  </dl>
                </div>
              );
            })()}
            <div className="history-actions">
              <button className="ghost" onClick={exportMatch}>Export match ↓</button>
              <button className="primary" onClick={() => { setShowHistory(false); setReplayAt(null); }}>Close</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`refused ${toast.tone}`} role="alert">
          <span className="refused-mark">{toast.tone === 'bad' ? '✕' : 'i'}</span>{toast.text}
        </div>
      )}

      {/*
        The one place the table speaks to a screen reader. It carries what just happened and
        whose turn it is now, in that order, because the second is the part somebody is waiting
        to hear. Kept to one sentence: this fires on every board change, and a paragraph each
        time is unusable.
      */}
      <div className="sr-only" role="status" aria-live="polite">
        {view.phase === 'playing'
          ? `${humanise(lastLine)}${lastLine ? ' ' : ''}${view.isYourTurn ? 'Your turn.' : ''}`
          : humanise(lastLine)}
      </div>

      {/* The same line, on screen — for low vision rather than no vision, where a caption
          often matters as much read as heard. Off by default; a screen reader already gets
          the region above regardless. */}
      {settings.showCaptions && lastLine && (
        <div className="caption-bar" aria-hidden="true">{humanise(lastLine)}</div>
      )}

      {/* The pad and the log are both a record of the game, so they sit together under the
          table. On the felt the pad was clipped by the table edge and landed on whoever was
          sitting on the right. */}
      <div className="table-record">
      {view.matchTarget != null && (
        <ScorePad view={view} me={me} nameOf={nameOf}
          lowWins={def.scoring.winner === 'lowestTotal'} />
      )}
      {settings.showLog && (
        <div className="log">
          <div className="log-head">Game log</div>
          {view.log.slice().reverse().map((e) => (<div key={e.t} className="log-row">{humanise(e.text)}</div>))}
        </div>
      )}
      </div>
    </div>
  );
}

/**
 * Start (or pick up) a table refereed in this tab. Resuming is tried first so closing a tab
 * mid-game is not the same as abandoning it.
 */
function bootLocal(
  def: GameDefinition, players: string[] | Seat[], fresh: boolean, resumeMatchId?: string,
): TableClient {
  // Asked for a specific table — the one picked off the list of games in progress.
  if (!fresh && resumeMatchId) {
    try {
      service.summaryOf(resumeMatchId);
      rememberSession(resumeMatchId, def.meta.id, players.length);
      return new LocalTableClient(resumeMatchId, service);
    } catch { /* gone; fall through to the usual path */ }
  }
  if (!fresh) {
    const resume = resumableSession();
    if (resume && resume.gameId === def.meta.id && resume.seats === players.length) {
      // Only accept the saved pointer if the match record is really still there.
      try {
        service.summaryOf(resume.matchId);
        return new LocalTableClient(resume.matchId, service);
      } catch { /* record went away; deal a new one */ }
    }
  }
  const m = service.create(def, def.meta.id, players);
  rememberSession(m.matchId, def.meta.id, players.length);
  return new LocalTableClient(m.matchId, service);
}

// What "sort by rank" and "sort by suit" mean is the same everywhere, but which of the two is
// actually the natural default is not: a trick game wants its suits grouped so you can see what's
// protected in each one, a climbing game has no suits worth grouping by at all, a rummy game wants
// suit order because a run needs to read as a sequence, and so on. This is what 'auto' resolves to
// — a sensible starting point per game, not a fixed rule imposed on every game alike.
function defaultSortFor(def: GameDefinition): 'off' | 'rank' | 'suit' {
  if (def.climb) return 'rank';    // suit carries no meaning in a climbing game
  if (def.fish) return 'rank';     // you ask opponents for a rank
  if (def.bluff) return 'rank';    // a claim is a same-rank group from your hand
  if (def.poker) return 'rank';    // hand strength reads by rank (pairs, trips, straights)
  if (def.rummy) return 'suit';    // a run only reads as one in suit order
  if (def.pit) return 'suit';      // the suits ARE the commodities being traded
  if (def.trick) return 'suit';    // grouping shows what you're holding in reserve, suit by suit
  if (def.meta.family === 'shedding-matching') return 'suit'; // Crazy Eights, Switch, Trade Winds
  return 'off'; // war, reflex, solitaire, set: no hand order the game itself suggests
}

function sortHand(hand: Card[], def: GameDefinition, mode: 'auto' | 'off' | 'rank' | 'suit'): Card[] {
  const resolved = mode === 'auto' ? defaultSortFor(def) : mode;
  if (resolved === 'off') return hand;
  // Rank strength isn't always the deck's raw listing order: climbing games (President,
  // Undertow) define their own low→high order, and trick games with aceHigh treat the ace as
  // the top card rather than wherever it falls in the deck listing.
  const order = def.climb?.order ?? def.deck.rankOrder;
  const aceHigh = !!def.trick?.aceHigh;
  const rankIdx = (r: string) => {
    if (aceHigh && r === 'A') return 1000;
    const i = order.indexOf(r as never);
    return i < 0 ? 99 : i;
  };
  const copy = hand.slice();
  if (resolved === 'rank') copy.sort((a, b) => rankIdx(a.rank) - rankIdx(b.rank) || SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]);
  else copy.sort((a, b) => SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit] || rankIdx(a.rank) - rankIdx(b.rank));
  return copy;
}
