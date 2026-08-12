// AI co-pilot: translates plain-English rules into KNOB changes, and INTERVIEWS the user
// about required slots they left unspecified. It never runs the game and never edits schema
// directly — it proposes knob patches the user can accept/reject, which then compile through
// buildDefinition() and get gated by the validator. Exactly the spec's contract.
//
// The Translator interface is the seam: this file ships a deterministic OFFLINE translator so
// the feature works with no API key. A real LLM implementation (few-shot on the classics)
// implements the same interface and drops in without any UI change.

import { Knobs, RANK_CHOICES, rankLabel } from './knobs';
import { Rank } from '../engine/types';

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
  const digits = /\b(10|[2-9])\b/g;
  let dm: RegExpExecArray | null;
  while ((dm = digits.exec(text))) consider(dm[1] as Rank, dm.index);

  return best ? (best as { rank: Rank }).rank : null;
}

// ---------- the offline translator ----------

export const offlineTranslator: Translator = {
  async translate(description, current): Promise<TranslateResult> {
    const text = ` ${description.toLowerCase()} `;
    const patch: Partial<Knobs> = {};
    const notes: string[] = [];

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
    if (skip) { patch.skipRank = skip; notes.push(`${rankLabel(skip)}s skip the next player.`); }
    const reverse = detect(text, ['reverse', 'reverses', 'change direction', 'switch direction']);
    if (reverse) { patch.reverseRank = reverse; notes.push(`${rankLabel(reverse)}s reverse direction.`); }
    const drawTwo = detectDrawTwo(text);
    if (drawTwo) { patch.drawTwoRank = drawTwo; notes.push(`${rankLabel(drawTwo)}s make the next player draw two.`); }

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

    // 1) draw-pile-empty is a genuinely load-bearing rule people forget.
    const mentionedDrawEmpty = /reshuffle|run(s)? out|deck (is )?empty|draw pile/.test(text);
    if (!mentionedDrawEmpty && changes.length > 0) {
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
    if (merged.wildRanks.length === 0 && !/wild/.test(text)) {
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
  const keys = ['draw two', 'draw 2', 'pick up two', 'pick up 2', 'draws two', 'draws 2', '+2'];
  for (const k of keys) {
    if (text.includes(k)) {
      const r = findRankNear(text, k);
      if (r) return r;
    }
  }
  return null;
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
  switch (field) {
    case 'name': return `Name → "${value}"`;
    case 'handSize': return `Deal ${value} cards each`;
    case 'wildRanks': return (value as Rank[]).length ? `Wild: ${(value as Rank[]).map(rankLabel).join(', ')}` : 'No wild cards';
    case 'skipRank': return value ? `Skip on ${rankLabel(value as Rank)}` : 'No skip card';
    case 'reverseRank': return value ? `Reverse on ${rankLabel(value as Rank)}` : 'No reverse card';
    case 'drawTwoRank': return value ? `Draw-two on ${rankLabel(value as Rank)}` : 'No draw-two card';
    case 'includeJokers': return value ? 'Include jokers' : 'No jokers';
    case 'reshuffleWhenEmpty': return value ? 'Reshuffle discard when draw runs out' : 'Round ends when draw runs out';
    default: return String(field);
  }
}

export { RANK_CHOICES };
