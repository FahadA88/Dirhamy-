import { Knobs } from './knobs';
import { RuleDraft } from './ruleKit';
import { SimReport } from '../engine/simulator';

// What you asked for, and what came back.
//
// An attempt that failed used to vanish the moment you typed something else, which is the worst
// time to lose it: a description that nearly worked is the most useful thing you have. So every
// attempt is kept — the ones that worked, so you can go back to a version you liked, and the
// ones that did not, so you can edit the sentence rather than write it again from nothing.

export interface Draft {
  id: string;
  at: number;
  /** What was typed. */
  description: string;
  ok: boolean;
  /** Present when it worked — enough to reopen it in the editor without asking the model again. */
  name?: string;
  knobs?: Partial<Knobs>;
  rules?: RuleDraft[];
  report?: SimReport;
  notes?: string[];
  /** Present when it did not. */
  error?: string;
}

const KEY = 'decky.drafts.v1';
const LIMIT = 25;

function read(): Draft[] {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]') as Draft[]; } catch { return []; }
}

function write(ds: Draft[]): void {
  // Newest first, capped. A playtest report is small, but twenty-five of them is plenty of
  // history and localStorage is shared with everything else.
  try { localStorage.setItem(KEY, JSON.stringify(ds.slice(0, LIMIT))); } catch { /* quota */ }
}

export function saveDraft(d: Omit<Draft, 'id' | 'at'>): Draft {
  const draft: Draft = { ...d, id: `d${Date.now().toString(36)}`, at: Date.now() };
  write([draft, ...read()]);
  return draft;
}

/** Newest first. */
export function allDrafts(): Draft[] { return read(); }

export function forgetDraft(id: string): void {
  write(read().filter((d) => d.id !== id));
}
