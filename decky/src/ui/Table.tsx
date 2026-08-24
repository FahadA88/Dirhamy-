import { MutableRefObject, useEffect, useMemo, useRef, useState } from 'react';
import { Card, GameDefinition, Move, RedactedState } from '../engine/types';
import { SUIT_SYMBOLS } from '../engine/deck';
import { CardFace } from './Card';
import { AttrCard, describeAttrs } from './AttrCard';
import { TableDressing, TableRail } from './TableDressing';
import { DealMotion } from './DealMotion';
import { ScorePad } from './ScorePad';
import { Confetti } from './Confetti';
import { useSettings } from '../settings/SettingsContext';
import { BOT_SPEED_MS } from '../settings/settings';
import { playSound } from './sound';
import { speak, stopSpeaking, spokenCard } from './speech';
import { useTurnAlert } from './useTurnAlert';
import { useDismissable } from './useEscape';
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
    case 'resolveChoice': return `Choose ${m.choice ?? 'a suit'}.`;
    case 'solDraw': case 'solDeal': return 'Turn the stock.';
    case 'solRedeal': return 'Go through the stock again.';
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
function highlightOf(view: RedactedState, me: string): { key: string; label: string; value: number } | null {
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
  const score = view.matchScores?.[me] ?? view.scores?.[me];
  if (typeof score === 'number' && score > 0) return { key: 'score', label: 'Best score', value: score };
  return null;
}

export function Table({ def, seats = 3, plan, practice = false, client: injected, mySeat, resumeMatchId }: {
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
  const [askRank, setAskRank] = useState<string | null>(null);
  // True while the dealer's hands are working. The cards are already in the view by then —
  // this only holds them back on screen so they appear to arrive rather than to have been
  // there all along.
  const [dealing, setDealing] = useState(false);
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
  const discardMoves = useMemo(() => myLegal.filter((m) => m.actionId === 'dealerDiscard'), [myLegal]);
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
    : discardMoves.length > 0 ? 'dealerDiscard'
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
    const noTurnOrder = isPit || isSet || isReflex;
    const delay = Math.max(BOT_SPEED_MS[settings.botSpeed] ?? 950, noTurnOrder ? 500 : 0);
    const timer = setTimeout(() => {
      const r = clientRef.current.botStep(localSeats, settings.botDiff);
      if (r.moved) setBoard(clientRef.current.read(me));
    }, delay);
    return () => clearTimeout(timer);
  }, [board, matchId, me, localSeats, view.phase, settings.botSpeed, settings.botDiff, isPit, isSet, isReflex]);

  // Pass-and-play: when the table is waiting on a different local seat, put a hand-off screen up
  // rather than swapping the cards under the person still looking at them.
  useEffect(() => {
    if (!passAndPlay || view.phase !== 'playing' || handoff) return;
    const waiting = clientRef.current.pending().filter((p) => localSeats.includes(p));
    if (waiting.length === 0 || waiting.includes(me)) return;
    setHandoff(waiting[0]);
  }, [board, passAndPlay, view.phase, handoff, matchId, me, localSeats]);

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

  function openHistory() {
    setHistory(clientRef.current.history());
    setShowHistory(true);
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
    playSound('ui', settings.sound);
    setSelected(null);
    setAskRank(null);
    setBluffSelected([]);
    setBluffRank(null);
    setBoard(clientRef.current.read(me));
    setToast({ text: 'Taken back.', tone: 'info' });
  }

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

  // Read the table aloud, when asked. The screen-reader region below is separate and always on.
  useEffect(() => {
    speak(lastLine, settings.speak);
  }, [lastLine, settings.speak]);

  useEffect(() => { if (!settings.speak) stopSpeaking(); }, [settings.speak]);
  useEffect(() => () => stopSpeaking(), []);

  // Mark the tab when somebody is waiting on you and looking somewhere else.
  useTurnAlert(view.phase === 'playing' && !!view.isYourTurn);

  // An online table changes because somebody else moved, not because we did. The client tells
  // us the cached position moved; we re-read it for our own seat and render.
  useEffect(() => {
    const c = clientRef.current;
    return c.onChange(() => {
      setBoard(c.read(me));
      // A refusal from a networked referee lands after we have already told the player their
      // move went through. Surface it when it arrives rather than letting it disappear.
      const late = (c as { lastRefusal?: string | null }).lastRefusal;
      if (late) {
        setToast({ text: late, tone: 'bad' });
        (c as { lastRefusal?: string | null }).lastRefusal = null;
      }
    });
  }, [me]);

  // Closing the tab on an online table should hang up, not leave a socket open.
  useEffect(() => {
    const c = clientRef.current;
    return () => { if (c.remote) c.end(); };
  }, []);


  // ---------- playing without a mouse ----------
  //
  // Cards are already real buttons, so tabbing reaches them. What was missing is the part that
  // makes a hand feel like a hand: arrows to run along it, Enter to play, and a cursor that
  // remembers where it was. The roving tabindex keeps the hand a single tab stop rather than
  // fifty-two, which is the difference between usable and exhausting.
  function handKeys(e: React.KeyboardEvent, ids: string[], play: (id: string) => void) {
    if (ids.length === 0) return;
    const at = cursor === null ? -1 : Math.min(cursor, ids.length - 1);
    const go = (i: number) => {
      e.preventDefault();
      const next = (i + ids.length) % ids.length;
      setCursor(next);
      // Move real focus too, so a screen reader announces the card the cursor lands on.
      const el = document.querySelector<HTMLElement>(`[data-cardkey="${CSS.escape(ids[next])}"]`);
      el?.focus();
    };
    if (e.key === 'ArrowRight') go(at + 1);
    else if (e.key === 'ArrowLeft') go(at <= 0 ? ids.length - 1 : at - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(ids.length - 1);
    else if (e.key === 'Enter' || e.key === ' ') {
      if (at >= 0) { e.preventDefault(); play(ids[at]); }
    }
  }

  /** What a card should be called out loud, plus why it cannot be played if it cannot. */
  function cardLabel(c: Card, playable: boolean, extra?: string): string {
    const name = spokenCard(c.rank, c.suit);
    if (extra) return `${name}, ${extra}`;
    return playable ? name : `${name}, not playable`;
  }

  // Win sound, and the result that feeds the leaderboards.
  const prevPhase = useRef(view.phase);
  useEffect(() => {
    if (prevPhase.current !== 'roundOver' && view.phase === 'roundOver') {
      playSound('win', settings.sound);
      const scores = view.matchTarget != null ? (view.matchScores ?? view.scores) : view.scores;
      const highWins = view.matchTarget != null;
      const standings = view.players
        .map((p) => ({ name: nameOf(p.id), score: scores[p.id] ?? 0, isYou: localSeats.includes(p.id) }))
        .sort((a, b) => (highWins ? b.score - a.score : a.score - b.score));
      const winner = view.matchWinner ?? view.winner;
      recordResult({
        gameId: def.meta.id,
        gameName: def.meta.name,
        at: Date.now(),
        seats: view.players.length,
        standings,
        youWon: !!winner && localSeats.includes(winner),
        highlight: highlightOf(view, me),
        practice,
      });
    }
    prevPhase.current = view.phase;
  }, [view.phase, settings.sound]);

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
    const res = clientRef.current.submit(me, move);
    if (!res.ok) {
      // The rules said no. Say why, instead of letting the tap disappear.
      setToast({ text: res.reason ?? 'That move is not legal here.', tone: 'bad' });
      playSound('ui', settings.sound);
      setSelected(null);
      return;
    }
    if (move.actionId === 'playCard' || move.actionId === 'playToTrick' || move.actionId === 'climbPlay' || move.actionId === 'climbBomb') playSound('play', settings.sound);
    if (move.actionId === 'drawCard' || move.actionId === 'fishDraw') playSound('draw', settings.sound);
    if (move.actionId === 'ask') playSound('ui', settings.sound);
    if (move.actionId === 'bluffClaim' || move.actionId === 'bluffChallenge') playSound('play', settings.sound);
    if (move.actionId === 'reflexSlap') playSound('win', settings.sound);
    if (move.actionId === 'reflexFlip') playSound('play', settings.sound);
    setToast(null);
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
    if (!playableCardIds.has(id)) return;
    if (isFish) { const c = view.hand.find((x) => x.id === id); if (c) setAskRank(c.rank); playSound('ui', settings.sound); return; }
    if (settings.confirmPlays && selected !== id) { setSelected(id); playSound('ui', settings.sound); return; }
    if (playActionId === 'climbPlay') { submit({ actionId: 'climbPlay', cards: [id] }); return; }
    submit({ actionId: playActionId, cardId: id });
  }

  const hand = useMemo(() => sortHand(view.hand, def, settings.sort), [view.hand, def, settings.sort]);
  const top = view.zones.discard?.cards[0];
  const activeSuit = view.vars.activeSuit;
  const suitPickerOpen = !!view.pendingChoice && view.pendingChoice.player === me;
  // ---------- overlays ----------
  //
  // Every overlay traps focus, so a keyboard cannot wander behind it. Only the history panel
  // takes Escape: the others are asking for a decision the game cannot continue without, and
  // dismissing them would leave somebody looking at a table that will not move.
  const historyRef = useDismissable(showHistory, () => setShowHistory(false));
  const suitRef = useDismissable(suitPickerOpen, () => { /* a suit must be chosen */ });
  const roundRef = useDismissable(view.phase === 'roundOver' && !view.matchOver, () => { /* pick next hand */ });
  const handoffRef = useDismissable(!!handoff, () => { /* the device has to change hands */ });

  const nameOf = (id: string) => {
    const seat = plan?.find((s) => s.id === id);
    if (seat) return seat.id === me ? `${seat.name} (you)` : seat.name;
    return id === me ? settings.playerName : settings.botLabels ? `Bot ${id.slice(1)}` : id;
  };
  /*
    The engine writes its log with raw seat ids — "P4 played 9♣" — because naming players is
    none of its business. The table is where names live, so it puts them back before anyone
    reads the line; otherwise the log talks about P4 while the seat above it says Bot 4.
    Only ids that are actually seats at this table are substituted.
  */
  const logName = (id: string) => {
    if (id === me) return 'You';
    const seat = plan?.find((s) => s.id === id);
    return seat ? seat.name : settings.botLabels ? `Bot ${id.slice(1)}` : id;
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

  return (
    <div className="table-wrap">
    <div className="table" data-felt={settings.tableFelt}>
      <TableRail felt={settings.tableFelt} />
      <div className={`felt ${dealing ? 'dealing' : ''}`}>
      <TableDressing felt={settings.tableFelt} title={def.meta.name} />
      {/* Nothing is dealt to anybody in a set game — the cards go face up on a shared board —
          so a deal animation would be showing something that does not happen. */}
      {!isSet && <DealMotion
        seats={view.players.length}
        aim={['.opponents .seat', '.hand']}
        round={`${matchId}:${view.handNumber}`}
        onStart={() => setDealing(true)}
        onDone={() => setDealing(false)}
      />}
      <div className="felt-content">
      <div className={`opponents ring-${opponents.length}`}>
        {opponents.map((p, i) => {
          const askable = isFish && view.isYourTurn && !!askRank && p.handCount > 0;
          // How many backs to draw. A neat, readable fan beats a dozen slivers; the exact
          // number is on the chip below, which is where anyone actually reads it.
          const backs = Math.max(1, Math.min(p.handCount, 6));
          return (
            <div key={p.id}
              className={`seat at-${SEAT_RING[opponents.length]?.[i] ?? 't'} ${p.isTurn ? 'active' : ''} ${askable ? 'askable' : ''}`}
              onClick={() => { if (askable) submit({ actionId: 'ask', target: p.id, rank: askRank! }); }}>
              <div className="seat-head">
                <span className="seat-name">{nameOf(p.id)}</span>
                {teamOf(p.id) && <span className="team-tag">{teamOf(p.id)}</span>}
              </div>
              <div className="fanned" aria-hidden="true">
                {Array.from({ length: backs }).map((_, k) => (<div key={k} className={backCls} />))}
              </div>
              <div className="seat-stats">
                <span className="count-chip" title={`${p.handCount} cards in hand`}>
                  {p.handCount === 0 ? 'out' : `${p.handCount}`}
                </span>
                {view.mode === 'trick' && view.bids?.[p.id] !== undefined && (
                  <span className="stat">{view.tricksWon?.[p.id] ?? 0}/{view.bids[p.id]}<i>tricks</i></span>
                )}
                {view.mode === 'trick' && view.bids?.[p.id] === undefined && (view.tricksWon?.[p.id] ?? 0) > 0 && (
                  <span className="stat">{view.tricksWon?.[p.id]}<i>won</i></span>
                )}
                {isFish && <span className="stat">{view.booksWon?.[p.id] ?? 0}<i>books</i></span>}
                {view.mode === 'climb' && view.finished?.includes(p.id) && (
                  <span className="stat">#{view.finished.indexOf(p.id) + 1}<i>out</i></span>
                )}
              </div>
              {p.isTurn && <div className="seat-turn" aria-label="their turn" />}
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
            <span className="bid-kicker">The auction</span>
            <p className="bid-line">
              {view.highBid
                ? <>Standing bid <b>{view.highBid.level}{view.highBid.strain === 'NT' ? 'NT' : SUIT_SYMBOLS[view.highBid.strain]}</b> by {nameOf(view.highBid.player)}</>
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
                          .map((m) => (
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
            <div className="pile">
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
                  <button key={`a${i}`} className={`bid-btn s-${m.choice}`} onClick={() => submit(m)}>
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
              <div className="bid-title">Your bid</div>
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
        <div className="center trick-area">
          {view.trick && view.trick.length > 0 ? (
            view.trick.map((t) => (
              <div key={`${t.player}:${t.card.id}`} className="trick-card" data-from={seatSideOf(t.player)}>
                <CardFace card={t.card} />
                <div className="pile-label">{nameOf(t.player)}</div>
              </div>
            ))
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
          <div className="pile">
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
        <div className="center war-center">
          {view.battle && view.battle.length > 0
            ? view.battle.map((c, i) => (
                <div key={c.id} className="trick-card" data-from={i % 2 === 0 ? 'me' : 't'}>
                  <CardFace card={c} />
                  <div className="pile-label">{i % 2 === 0 ? nameOf(view.players[0].id) : nameOf(view.players[1].id)}</div>
                </div>
              ))
            : <div className="trick-empty">Flip</div>}
        </div>
      ) : isRummy ? (
        <div className="center rummy-center">
          <div className="pile">
            <div className={`${backCls} big`} />
            <div className="pile-label">Stock · {view.zones.draw?.count ?? 0}</div>
          </div>
          <div className="pile">
            {/* Keyed by the card, so a new top card is a new element and lands rather than
                cross-fading in place. */}
            {top ? <div key={top.id} className="landed"><CardFace card={top} /></div>
                 : <div className="card big empty" />}
            <div className="pile-label">Discard</div>
          </div>
          {view.zones.melds && view.zones.melds.cards.length > 0 && (
            <div className="melds-box">
              <div className="pile-label">Melds</div>
              <div className="melds-row">
                {view.zones.melds.cards.map((c) => <div key={c.id} className="meld-mini"><CardFace card={c} /></div>)}
              </div>
            </div>
          )}
        </div>
      ) : isClimb ? (
        <div className="center">
          <div className="pile">
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
      ) : isSet || isBluff || isReflex || isPoker || isPit ? (
        /* Each of these has its own dedicated center-area UI rendered below (Bluff's center-pile
           count, Reflex's slap pile, Poker's pot, Pit's market) — none has a real draw/discard
           zone, so falling through to the generic piles here would just be furniture on top of
           the real thing, or (Set) furniture for a game that has neither at all. */
        null
      ) : (
        <div className="center">
          <div className="pile">
            <div className={`${backCls} big`} />
            <div className="pile-label">Draw · {view.zones.draw?.count ?? 0}</div>
          </div>
          <div className="pile">
            {/* Keyed by the card, so a new top card is a new element and lands rather than
                cross-fading in place. */}
            {top ? <div key={top.id} className="landed"><CardFace card={top} /></div>
                 : <div className="card big empty" />}
            <div className="pile-label">Discard{activeSuit ? ` · suit ${SUIT_SYMBOLS[activeSuit] ?? activeSuit}` : ''}</div>
          </div>
        </div>
      )}

      <div className={`you ${view.isYourTurn ? 'your-turn' : ''}`}>
        <div className="you-head">
          <span>{isSet
            ? 'The board'
            : settings.playerName === 'You' ? 'Your hand' : `${settings.playerName}’s hand`}{view.mode === 'trick' && (view.tricksWon?.[me] ?? 0) > 0 ? ` · ${view.tricksWon?.[me]} won` : ''}{view.mode === 'trick' && view.bids?.[me] !== undefined ? ` · bid ${view.bids[me]}` : ''}{isFish ? ` · ${view.booksWon?.[me] ?? 0} books` : ''}{teamOf(me) ? ` · ${teamOf(me)}` : ''}</span>
          {view.needsPassChoice && (
            <span className="turn-badge">
              {view.passCount > 1
                ? `Pass ${view.passStaged.length}/${view.passCount} ${view.passDirection}`
                : `Pass ${view.passDirection}`}
            </span>
          )}
          {isInterrupt && <span className="bomb-badge">💣 Bomb?</span>}
          {discardMoves.length > 0 && <span className="turn-badge">Discard one</span>}
          {/* "Your turn" is meaningless where there are no turns — everybody is always in. */}
          {!view.passDirection && view.isYourTurn && !suitPickerOpen && !isInterrupt && !isSet && <span className="turn-badge">Your turn</span>}
          {isSet && view.isYourTurn && <span className="turn-badge">Find a set</span>}
          {!view.needsPassChoice && view.passDirection && <span className="waiting-badge">Waiting on {view.passWaitingOn}…</span>}
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
          {/* The clock, only when there is one. Turns urgent in the last five seconds. */}
          {secsLeft !== null && (
            <span className={`turn-clock ${secsLeft <= 5 ? 'urgent' : ''}`} role="timer" aria-live="off">
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
          <button className="restart-btn" onClick={openHistory} title="Every move so far">History</button>
          {view.phase === 'playing' && !takeback && (
            <button className="restart-btn" onClick={askTakeback} title="Ask the table to take your last move back">Take back</button>
          )}
          <button className="restart-btn" onClick={restart} title="Deal a fresh game">Restart</button>
        </div>
        {isSet ? (
          /*
            No hand and no turn: one board everybody can see. Picking the right number of cards
            submits the call immediately — hesitating to press a button is the opposite of the
            game, which is about being first.
          */
          <div className="set-controls">
            <div className="set-info">
              <span className="chip">{view.setDeckLeft ?? 0} left in the deck</span>
              <span className="chip">Pick {view.setSize ?? 3}</span>
              {Object.entries(view.scores).map(([p, sc]) => (
                <span key={p} className={`chip ${p === me ? 'mine' : ''}`}>{nameOf(p)} {sc}</span>
              ))}
            </div>
            <div className="set-board" role="group" aria-label="The board">
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
            <div className="bluff-info">
              <span className="bluff-pile">Center pile · {view.centerCount ?? 0} card{(view.centerCount ?? 0) === 1 ? '' : 's'}</span>
              {view.pendingClaim && (
                <span className={`bluff-claim ${view.pendingClaim.player === me ? 'mine' : ''}`}>
                  {nameOf(view.pendingClaim.player)} claim{view.pendingClaim.player === me ? '' : 's'} {view.pendingClaim.count}× {view.pendingClaim.claimedRank}
                </span>
              )}
            </div>
            {myLegal.some((m) => m.actionId === 'bluffChallenge') && (
              <button className="primary bluff-challenge" onClick={() => submit({ actionId: 'bluffChallenge' })}>
                🤨 Call bluff!
              </button>
            )}
            {/* Your own cards stay visible even off your claim turn — you still need them to
                decide whether to call the current claim. */}
            {hand.length > 0 && (() => {
              const myClaimTurn = myLegal.some((m) => m.actionId === 'bluffClaim');
              return (
                <div
                  className={`hand hl-${settings.highlight}`}
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
                <div className="seg wrap">
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
            <div className="reflex-pile">
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
            <div className="hand hl-off poker-hand" role="group" aria-label={`Your hand, ${hand.length} cards`}>
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
            <span className="war-pile">Your pile · {myPile} cards</span>
            {canFlip && <button className="primary" onClick={() => submit({ actionId: 'warFlip' })}>⚔ Flip</button>}
          </div>
        ) : (
        <div
          className={`hand hl-${settings.highlight}`}
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
                className={`card-btn ${playable ? 'playable' : 'dim'} ${staged ? 'staged' : ''} ${hint === c.id ? 'hinted' : ''} ${(isFish ? c.rank === askRank : selected === c.id) ? 'selected' : ''}`}
                disabled={!playable}
                onFocus={() => { if (idx >= 0) setCursor(idx); }}
                onClick={() => clickCard(c.id)}
                title={staged ? 'Picked to pass' : playable ? (isFish ? 'Pick this rank to ask for' : view.needsPassChoice ? 'Give this card away' : settings.confirmPlays && selected !== c.id ? 'Click to select' : 'Play this card') : 'Not a legal move right now'}
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
            <h3>Wild card — choose a suit</h3>
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
          {view.winner === me && <Confetti pieces={30} />}
          <div className={`modal-box celebrate handend ${view.winner === me ? 'won' : ''}`} ref={roundRef} role="dialog" aria-modal="true">
            <span className="cb-kicker">Hand {view.handNumber}</span>
            <h3>{view.winner === me ? 'You take it' : `${nameOf(view.winner || '')} takes it`}</h3>
            {/* What the hand did to you. In a betting game `scores` is the stack you are
                holding, not what you won, so the hand's own row is what belongs here — and a
                stack that went down wants a minus, not a plus. */}
            <p className="scores">
              {Object.entries(isPoker ? (view.handScores.slice(-1)[0] ?? view.scores) : view.scores).map(([p, s]) => (
                <span key={p} className={p === me ? 'mine' : ''}>
                  {nameOf(p)} <b>{s >= 0 ? '+' : '−'}{Math.abs(s)}</b>
                </span>
              ))}
            </p>
            <div className="match-scoreboard">
              <div className="ms-title">
                {isPoker
                  ? `Chips · hand ${view.handNumber} of ${def.poker?.hands ?? 1}`
                  : `Race to ${view.matchTarget}`}
              </div>
              {view.players
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
        const iWon = view.matchWinner === me || (view.matchWinner == null && view.winner === me);
        const finals = Object.entries(view.matchTarget != null ? (view.matchScores ?? view.scores) : view.scores);
        const lowWins = def.scoring.winner === 'lowestTotal';
        const ranked = finals.slice().sort((a, b) => (lowWins ? a[1] - b[1] : b[1] - a[1]));
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
              <span className="cb-kicker">{view.matchTarget != null ? 'Match over' : 'Game over'}</span>
              <h3 data-text={iWon ? 'You win' : `${nameOf(view.matchWinner ?? view.winner ?? '')} wins`}>
                {iWon ? 'You win' : `${nameOf(view.matchWinner ?? view.winner ?? '')} wins`}
              </h3>
              {/* Counted in from the bottom of the table up, so the winner's row lands last. */}
              <ol className="podium" style={{ '--rows': ranked.length - 1 } as React.CSSProperties}>
                {ranked.map(([p, sc], i) => (
                  <li key={p} className={`${p === me ? 'mine' : ''} ${i === 0 ? 'first' : ''}`}
                    style={{ '--r': i } as React.CSSProperties}>
                    <span className="pd-rank">{i + 1}</span>
                    <span className="pd-name">{nameOf(p)}</span>
                    <b className="pd-score">{sc}</b>
                  </li>
                ))}
              </ol>
              <div className="final-actions">
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
        <div className="modal" onClick={() => setShowHistory(false)}>
          <div className="modal-box wide" ref={historyRef} role="dialog" aria-modal="true" aria-label="Move history" onClick={(e) => e.stopPropagation()}>
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
            <button className="primary" onClick={() => { setShowHistory(false); setReplayAt(null); }}>Close</button>
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
