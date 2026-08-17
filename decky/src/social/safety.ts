// Trust and safety, at the size this app actually is.
//
// Two honest limits stated up front. First, blocking and muting are per-device: with no accounts
// there is nobody to block globally, so this hides content here and the same functions become
// server calls the day there are accounts. Second, name screening is a filter, not moderation —
// it catches the obvious and the impersonating, and a human still has to look at the rest.
//
// What it does do properly: a published game cannot be named to look like it came from us, and
// anything reported is recorded with a reason rather than silently hidden.

export type ReportReason = 'broken' | 'offensive' | 'stolen' | 'impersonation' | 'other';

export interface Report {
  targetType: 'game' | 'creator';
  targetId: string;
  reason: ReportReason;
  note: string;
  at: number;
}

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'broken', label: "It doesn't work" },
  { value: 'offensive', label: 'Offensive content' },
  { value: 'stolen', label: 'Copied without credit' },
  { value: 'impersonation', label: 'Pretending to be someone else' },
  { value: 'other', label: 'Something else' },
];

const REPORTS = 'decky.reports.v1';
const BLOCKED = 'decky.blocked.v1';
const MUTED = 'decky.muted.v1';

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}
function write(key: string, v: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* quota */ }
}

// ---------- reporting ----------

export function report(targetType: Report['targetType'], targetId: string, reason: ReportReason, note = ''): void {
  write(REPORTS, [...read<Report[]>(REPORTS, []), { targetType, targetId, reason, note: note.trim(), at: Date.now() }]);
}

export function reports(): Report[] { return read<Report[]>(REPORTS, []); }
export function hasReported(targetId: string): boolean {
  return reports().some((r) => r.targetId === targetId);
}

// ---------- blocking and muting ----------

export function blocked(): string[] { return read<string[]>(BLOCKED, []); }
export function isBlocked(creator: string): boolean { return blocked().includes(creator); }

/** Blocking a creator hides their games from every shelf on this device. */
export function toggleBlock(creator: string): boolean {
  const cur = blocked();
  const on = cur.includes(creator);
  write(BLOCKED, on ? cur.filter((c) => c !== creator) : [...cur, creator]);
  return !on;
}

export function muted(): string[] { return read<string[]>(MUTED, []); }
export function isMuted(name: string): boolean { return muted().includes(name); }

/** Muting hides someone's chat and reviews without hiding their games. */
export function toggleMute(name: string): boolean {
  const cur = muted();
  const on = cur.includes(name);
  write(MUTED, on ? cur.filter((c) => c !== name) : [...cur, name]);
  return !on;
}

// ---------- name screening ----------

// Deliberately short and deliberately about the two things a filter can actually decide:
// slurs-by-substring, and names that claim to be official. Everything else is a human's job.
const BANNED = ['fuck', 'shit', 'cunt', 'nigger', 'faggot', 'rape', 'nazi'];
const RESERVED = ['decky', 'official', 'admin', 'moderator', 'staff', 'support'];

export interface NameCheck {
  ok: boolean;
  reason?: string;
}

/** Normalise the tricks people use to slip a word past a substring check. */
function fold(s: string): string {
  return s.toLowerCase()
    .replace(/[013457$@!|]/g, (c) => ({ '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', $: 's', '@': 'a', '!': 'i', '|': 'i' }[c] ?? c))
    .replace(/[^a-z]/g, '');
}

export function checkName(name: string): NameCheck {
  const trimmed = name.trim();
  if (trimmed.length < 2) return { ok: false, reason: 'Give it a name of at least two characters.' };
  if (trimmed.length > 48) return { ok: false, reason: 'That name is too long — 48 characters at most.' };

  const folded = fold(trimmed);
  for (const word of BANNED) {
    if (folded.includes(word)) return { ok: false, reason: 'That name contains language we do not publish.' };
  }
  for (const word of RESERVED) {
    if (folded === word || folded.startsWith(word)) {
      return { ok: false, reason: `Names starting with "${word}" are reserved, so nothing can pretend to be official.` };
    }
  }
  if (/(https?:|www\.|\.com|\.net)/i.test(trimmed)) {
    return { ok: false, reason: 'Names cannot contain links.' };
  }
  return { ok: true };
}

/** The same screen for a description or a review. Returns the text, or null if it should not post. */
export function checkText(text: string): NameCheck {
  const folded = fold(text);
  for (const word of BANNED) {
    if (folded.includes(word)) return { ok: false, reason: 'That contains language we do not publish.' };
  }
  return { ok: true };
}
