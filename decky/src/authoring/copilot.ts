// AI co-pilot: translates plain-English rules into KNOB changes, and INTERVIEWS the user
// about required slots they left unspecified. It never runs the game and never edits schema
// directly — it proposes knob patches the user can accept/reject, which then compile through
// buildDefinition() and get gated by the validator. Exactly the spec's contract.
//
// The Translator interface is the seam: this file ships a deterministic OFFLINE translator so
// the feature works with no API key. A real LLM implementation (few-shot on the classics)
// implements the same interface and drops in without any UI change.

import { Knobs, RANK_CHOICES, rankLabel } from './knobs';
import { Rank, Suit } from '../engine/types';

export interface ProposedChange {
  field: keyof Knobs;
  from: unknown;
  to: unknown;
  label: string;         // human-readable "what changed"
}

export interface Question {
  id: string;
  text: string;
  options: { label: string; patch: Partial<Knobs> }[];
}

export interface TranslateResult {
  patch: Partial<Knobs>;
  changes: ProposedChange[];
  notes: string[];       // things understood / assumptions made
  questions: Question[]; // interview: unfilled required slots, 1–2 at a time
}

export interface Translator {
  translate(description: string, current: Knobs): Promise<TranslateResult>;
}

// ---------- word → rank mapping ----------

const RANK_WORDS: Record<string, Rank> = {
  ace: 'A', aces: 'A', one: 'A',
  two: '2', twos: '2', three: '3', threes: '3', four: '4', fours: '4',
  five: '5', fives: '5', six: '6', sixes: '6', seven: '7', sevens: '7',
  eight: '8', eights: '8', nine: '9', nines: '9', ten: '10', tens: '10',
  jack: 'J', jacks: 'J', queen: 'Q', queens: 'Q', king: 'K', kings: 'K',
  joker: 'JOKER', jokers: 'JOKER',
};

function findRankNear(text: string, keyword: string): Rank | null {
  // Find the rank word/number CLOSEST to the keyword (so "eights are wild, skip on aces"
  // binds wild→8 and skip→A, not whichever rank appears first in the dictionary).
  const idx = text.indexOf(keyword);
  if (idx < 0) return null;
  const anchor = idx + keyword.length / 2;

  let best: { rank: Rank; dist: number } | null = null;
  const consider = (rank: Rank, at: number) => {
    const dist = Math.abs(at - anchor);
    if (dist <= 40 && (!best || dist < best.dist)) best = { rank, dist };
  };

  for (const [word, rank] of Object.entries(RANK_WORDS)) {
    const re = new RegExp(`\\b${word}\\b`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) consider(rank, m.index + word.length / 2);
  }
  const digits = /\b(10|[2-9])s?\b/g; // also matches "2s", "7s"
  let dm: RegExpExecArray | null;
  while ((dm = digits.exec(text))) consider(dm[1] as Rank, dm.index);

  return best ? (best as { rank: Rank }).rank : null;
}

// The card that TRIGGERS an effect is usually named to the left of the effect phrase
// ("aces … draw four", "7s let you play again"). Searching left of the keyword avoids
// mistaking the count word ("four") for the card's rank.
function findRankLeftOf(text: string, keyword: string): Rank | null {
  const idx = text.indexOf(keyword);
  if (idx < 0) return null;
  let best: Rank | null = null;
  let bestPos = -1;
  const consider = (rank: Rank, at: number) => { if (at < idx && at > bestPos) { bestPos = at; best = rank; } };
  for (const [w, r] of Object.entries(RANK_WORDS)) {
    const re = new RegExp(`\\b${w}\\b`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) consider(r, m.index);
  }
  const dre = /\b(10|[2-9])s?\b/g; let d: RegExpExecArray | null;
  while ((d = dre.exec(text))) consider(d[1] as Rank, d.index);
  return best;
}

function detectLeft(text: string, keys: string[]): Rank | null {
  for (const k of keys) if (text.includes(k)) { const r = findRankLeftOf(text, k); if (r) return r; }
  return null;
}

// ---------- the offline translator ----------

export const offlineTranslator: Translator = {
  async translate(description, current): Promise<TranslateResult> {
    const text = ` ${description.toLowerCase()} `;
    const patch: Partial<Knobs> = {};
    const notes: string[] = [];

    // climbing family detection
    if (/\bclimbing\b|\bpresident\b|\bscum\b|\bbig two\b|\bbeat the (previous|last|pile|card)\b|\bplay(ing)? (a )?higher\b|\bhigher card or pass\b|\bpass or play\b/.test(text)) {
      patch.family = 'climb';
      notes.push('Climbing game (beat or pass).');
      if (/\b2s? (are|is)? ?high|twos high|president\b/.test(text)) patch.climbTwosHigh = true;
      if (/\bace(s)? high\b/.test(text) && !/president/.test(text)) patch.climbTwosHigh = false;
    }

    // trick-taking family detection (before the shedding rules)
    if (/\btrick(-|\s)?taking\b|\bfollow(s|ing)? suit\b|\btakes? the trick\b|\bwins? the trick\b|\btrump\b|\bmost tricks\b|\bfewest tricks\b/.test(text)) {
      patch.family = 'trick';
      notes.push('Trick-taking game.');
      if (/\bfollow(s|ing)? suit\b/.test(text)) patch.mustFollowSuit = true;
      const t = detectTrumpSuit(text);
      if (t) { patch.trump = t; notes.push(`${t} is trump.`); }
      if (/\bno trump\b/.test(text)) patch.trump = 'none';
      if (/\bfewest tricks\b|\bavoid tricks\b|\bavoid taking\b/.test(text)) patch.trickScoreBy = 'fewestTricks';
      else if (/\bmost tricks\b/.test(text)) patch.trickScoreBy = 'mostTricks';
    }

    // name: "call it X" / "named X" / quoted
    const quoted = description.match(/["“”']([^"“”']{2,40})["“”']/);
    const called = description.match(/\b(?:call(?:ed)? it|named?)\s+([A-Z][\w' ]{1,30})/i);
    if (quoted) { patch.name = quoted[1]; notes.push(`Named the game "${quoted[1]}".`); }
    else if (called) { patch.name = called[1].trim(); notes.push(`Named the game "${called[1].trim()}".`); }

    // hand size: "deal N", "N cards each", "N-card"
    const dealt = text.match(/\b(?:deal|dealt|start with|hand of)\s+(\d{1,2})\b/) ||
                  text.match(/\b(\d{1,2})\s+cards?\s+(?:each|per player|to start|hand)\b/);
    if (dealt) { patch.handSize = clamp(parseInt(dealt[1], 10), 1, 13); notes.push(`Deal ${patch.handSize} cards each.`); }

    // wild
    if (/\bwild\b/.test(text)) {
      const r = findRankNear(text, 'wild');
      if (r) { patch.wildRanks = [r]; notes.push(`${rankLabel(r)}s are wild.`); }
    }
    if (/\bjokers?\s+(?:are\s+)?wild\b/.test(text)) {
      patch.wildRanks = ['JOKER']; patch.includeJokers = true;
      notes.push('Jokers are wild (and added to the deck).');
    }

    // action cards
    const skip = detect(text, ['skip', 'skips', 'miss a turn', 'misses a turn']);
    if (skip) { patch.skipRanks = [skip]; notes.push(`${rankLabel(skip)}s skip the next player.`); }
    const reverse = detect(text, ['reverse', 'reverses', 'change direction', 'switch direction']);
    if (reverse) { patch.reverseRanks = [reverse]; notes.push(`${rankLabel(reverse)}s reverse direction.`); }
    const drawTwo = detectDrawTwo(text);
    if (drawTwo) { patch.drawRanks = [drawTwo]; notes.push(`${rankLabel(drawTwo)}s make the next player draw two.`); }

    // extra turn / wild-draw (trigger card named to the left of the effect phrase)
    const again = detectLeft(text, ['play again', 'go again', 'extra turn', 'another turn', 'plays again']);
    if (again) { patch.extraTurnRanks = [again]; notes.push(`${rankLabel(again)}s let you play again.`); }
    const wildDraw = detectWildDraw(text);
    if (wildDraw) { patch.wildDrawRanks = [wildDraw]; patch.wildDrawCount = 4; notes.push(`${rankLabel(wildDraw)}s are wild and force a draw of four.`); }

    // decks / short deck
    if (/\b(two|2|double|second)\s+(full\s+)?decks?\b|\btwo decks?\b/.test(text)) { patch.deckCount = 2; notes.push('Two decks shuffled together.'); }
    const removed = detectRemovedRanks(description);
    if (removed.length) { patch.excludeRanks = removed; notes.push(`Removed from the deck: ${removed.map(rankLabel).join(', ')}.`); }

    // matching criteria
    if (/\b(match|same)[^.]*colou?r\b|\bby colou?r\b/.test(text)) { patch.matchColor = true; notes.push('Cards may also match by color.'); }
    if (/\bsuit only\b|\bmatch(?:es|ing)? (?:the )?suit only\b/.test(text)) { patch.matchRank = false; patch.matchSuit = true; }

    // drawing
    if (/\bkeep drawing\b|\bdraw until\b|\buntil you can play\b|\buntil playable\b/.test(text)) { patch.drawUntilCanPlay = true; notes.push('If you can’t play, keep drawing until you can.'); }

    // direction / win mode
    if (/\bcounter.?clock|anti.?clock/.test(text)) { patch.direction = 'counter-clockwise'; notes.push('Play goes counter-clockwise.'); }
    if (/\blowest (points|score|hand|total) wins\b|\bfewest points\b/.test(text)) { patch.winMode = 'lowestTotal'; notes.push('Lowest points wins.'); }
    if (/\bhighest (points|score|total) wins\b|\bmost points wins\b/.test(text)) { patch.winMode = 'highestTotal'; notes.push('Highest points wins.'); }

    // keep a rank out of the plain-wild set if it's a wild-draw card
    if (patch.wildDrawRanks && patch.wildDrawRanks.length) {
      const wd = new Set(patch.wildDrawRanks);
      const baseWild = (patch.wildRanks ?? current.wildRanks).filter((r) => !wd.has(r));
      patch.wildRanks = baseWild;
    }

    // jokers include
    if (/\b(?:with|include|add)\s+jokers?\b/.test(text)) { patch.includeJokers = true; notes.push('Jokers included in the deck.'); }
    if (/\bno jokers?\b|\bwithout jokers?\b/.test(text)) { patch.includeJokers = false; notes.push('No jokers.'); }

    // draw-pile-empty behaviour
    if (/\breshuffle\b|\bshuffle the discard\b|\breshuffle the discard\b/.test(text)) {
      patch.reshuffleWhenEmpty = true; notes.push('Reshuffle the discard when the draw pile runs out.');
    }
    if (/\bround (?:is )?over\b.*\bdraw\b|\bgame ends when the deck\b|\bno reshuffle\b/.test(text)) {
      patch.reshuffleWhenEmpty = false; notes.push('Round ends when the draw pile runs out.');
    }

    const changes = diffKnobs(current, { ...current, ...patch });

    // ---------- interview: ask about required slots the user didn't specify ----------
    const merged = { ...current, ...patch };
    const questions: Question[] = [];

    const isTrick = (patch.family ?? current.family) !== 'shedding';

    // 1) draw-pile-empty is a genuinely load-bearing rule people forget (shedding only).
    const mentionedDrawEmpty = /reshuffle|run(s)? out|deck (is )?empty|draw pile/.test(text);
    if (!isTrick && !mentionedDrawEmpty && changes.length > 0) {
      questions.push({
        id: 'drawEmpty',
        text: 'What happens when the draw pile runs out?',
        options: [
          { label: 'Reshuffle the discard into a new draw pile', patch: { reshuffleWhenEmpty: true } },
          { label: 'The round ends and lowest hand wins', patch: { reshuffleWhenEmpty: false } },
        ],
      });
    }

    // 2) if nothing set a wild and the user didn't mention wilds at all, offer the common default.
    if (!isTrick && merged.wildRanks.length === 0 && !/wild/.test(text)) {
      questions.push({
        id: 'wild',
        text: 'Do you want a wild card that can be played anytime?',
        options: [
          { label: 'Yes — 8s are wild (classic)', patch: { wildRanks: ['8' as Rank] } },
          { label: 'No wild cards', patch: { wildRanks: [] } },
        ],
      });
    }

    return { patch, changes, notes, questions: questions.slice(0, 2) };
  },
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function detect(text: string, keywords: string[]): Rank | null {
  for (const k of keywords) {
    if (text.includes(k)) {
      const r = findRankNear(text, k);
      if (r) return r;
    }
  }
  return null;
}

function detectDrawTwo(text: string): Rank | null {
  return detectLeft(text, ['draw two', 'draw 2', 'pick up two', 'pick up 2', 'draws two', 'draws 2', '+2']);
}

function detectWildDraw(text: string): Rank | null {
  return detectLeft(text, ['draw four', 'draw 4', 'draws four', 'draws 4', 'pick up four', 'pick up 4', 'wild draw', '+4']);
}

function detectTrumpSuit(text: string): Suit | null {
  const suits: Record<string, Suit> = { spade: 'S', spades: 'S', heart: 'H', hearts: 'H', diamond: 'D', diamonds: 'D', club: 'C', clubs: 'C' };
  const idx = text.indexOf('trump');
  const win = idx >= 0 ? text.slice(Math.max(0, idx - 30), idx + 30) : text;
  for (const [w, s] of Object.entries(suits)) if (new RegExp(`\\b${w}\\b`).test(win)) return s;
  return null;
}

// Ranks a "remove/strip/without" clause takes out of the deck.
function detectRemovedRanks(description: string): Rank[] {
  const text = ` ${description.toLowerCase()} `;
  const m = /\b(remove|strip|without|take out|exclude|no)\b([^.!?]*)/.exec(text);
  if (!m) return [];
  const clause = m[2];
  const found = new Set<Rank>();
  const words: Record<string, Rank> = {
    ace: 'A', aces: 'A', two: '2', twos: '2', three: '3', threes: '3', four: '4', fours: '4',
    five: '5', fives: '5', six: '6', sixes: '6', seven: '7', sevens: '7', eight: '8', eights: '8',
    nine: '9', nines: '9', ten: '10', tens: '10', jack: 'J', jacks: 'J', queen: 'Q', queens: 'Q', king: 'K', kings: 'K',
  };
  for (const [w, r] of Object.entries(words)) if (new RegExp(`\\b${w}\\b`).test(clause)) found.add(r);
  const digitRe = /\b(10|[2-9])s?\b/g; let d: RegExpExecArray | null;
  while ((d = digitRe.exec(clause))) found.add(d[1] as Rank);
  return [...found];
}

function diffKnobs(from: Knobs, to: Knobs): ProposedChange[] {
  const out: ProposedChange[] = [];
  const keys = Object.keys(from) as (keyof Knobs)[];
  for (const key of keys) {
    const a = JSON.stringify(from[key]);
    const b = JSON.stringify(to[key]);
    if (a !== b) out.push({ field: key, from: from[key], to: to[key], label: describeChange(key, to[key]) });
  }
  return out;
}

function describeChange(field: keyof Knobs, value: unknown): string {
  const ranks = (v: unknown) => (v as Rank[]).map(rankLabel).join(', ');
  switch (field) {
    case 'name': return `Name → "${value}"`;
    case 'handSize': return `Deal ${value} cards each`;
    case 'wildRanks': return (value as Rank[]).length ? `Wild: ${ranks(value)}` : 'No wild cards';
    case 'skipRanks': return (value as Rank[]).length ? `Skip on ${ranks(value)}` : 'No skip card';
    case 'reverseRanks': return (value as Rank[]).length ? `Reverse on ${ranks(value)}` : 'No reverse card';
    case 'drawRanks': return (value as Rank[]).length ? `Draw-two on ${ranks(value)}` : 'No draw-two card';
    case 'extraTurnRanks': return (value as Rank[]).length ? `Play again on ${ranks(value)}` : 'No play-again card';
    case 'wildDrawRanks': return (value as Rank[]).length ? `Wild-draw on ${ranks(value)}` : 'No wild-draw card';
    case 'excludeRanks': return (value as Rank[]).length ? `Remove ${ranks(value)} from the deck` : 'Full deck';
    case 'deckCount': return `${value} deck${(value as number) > 1 ? 's' : ''}`;
    case 'matchColor': return value ? 'Also match by color' : 'No color matching';
    case 'matchSuit': return value ? 'Match by suit' : 'No suit matching';
    case 'matchRank': return value ? 'Match by rank' : 'No rank matching';
    case 'drawUntilCanPlay': return value ? 'Draw until you can play' : 'Draw one card';
    case 'family': return value === 'trick' ? 'Trick-taking game' : value === 'climb' ? 'Climbing game' : 'Shedding/matching game';
    case 'climbTwosHigh': return value ? 'Ranks: 3 low … 2 high' : 'Ranks: 2 low … Ace high';
    case 'trump': return value === 'none' ? 'No trump' : `Trump: ${value}`;
    case 'mustFollowSuit': return value ? 'Must follow suit' : 'Follow suit not required';
    case 'trickScoreBy': return value === 'mostTricks' ? 'Win: most tricks' : 'Win: fewest tricks';
    case 'direction': return `Direction → ${value}`;
    case 'winMode': return value === 'firstOut' ? 'Win: first to empty' : value === 'highestTotal' ? 'Win: highest points' : 'Win: lowest points';
    case 'includeJokers': return value ? 'Include jokers' : 'No jokers';
    case 'reshuffleWhenEmpty': return value ? 'Reshuffle discard when draw runs out' : 'Round ends when draw runs out';
    default: return String(field);
  }
}

export { RANK_CHOICES };
