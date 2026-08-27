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

// ---------- carrying a block list to another device ----------
//
// There are no accounts here, so there is nothing to hang a synced list off. Rather than invent
// a login for a list of names, this uses a code: a long random string generated on this device,
// which the host stores a safety list against. Type the same code on another device and you get
// the same list.
//
// Be clear about what that means — the code IS the credential. Anyone who has it can read and
// change that list. It is deliberately long, and the data is a list of display names you have
// blocked rather than anything private, but it is a shared secret and it is named like one.

const SYNC = 'decky.synccode.v1';

export interface SafetyLists { blocked: string[]; muted: string[] }

/** This device's code, made on first use. */
export function syncCode(): string {
  try {
    const found = localStorage.getItem(SYNC);
    if (found) return found;
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const code = [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 20).toUpperCase();
    localStorage.setItem(SYNC, code);
    return code;
  } catch {
    return '';
  }
}

/** Point this device at somebody else's code — that is, at your own list on another device.
 *  Named adoptSyncCode, not useSyncCode: a `use`-prefixed plain function reads as a React hook
 *  to both humans and eslint-plugin-react-hooks, which flagged this exact call as a hooks-rules
 *  violation for being invoked inside an onClick — it never was one. */
export function adoptSyncCode(code: string): void {
  try { localStorage.setItem(SYNC, code.trim().toUpperCase()); } catch { /* ignore */ }
}

/** Send this device's lists up. Silent on failure: syncing is a convenience, not a requirement. */
export async function pushSafety(base: string): Promise<boolean> {
  const code = syncCode();
  if (!code || !base) return false;
  try {
    const res = await fetch(`${base}/safety`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, lists: { blocked: blocked(), muted: muted() } }),
    });
    return res.ok;
  } catch { return false; }
}

/**
 * Pull the stored lists and merge them in. A merge rather than a replace, because the two sides
 * are both things somebody meant: blocking on a phone and then syncing should not un-block
 * anybody you blocked on a laptop.
 */
export async function pullSafety(base: string): Promise<boolean> {
  const code = syncCode();
  if (!code || !base) return false;
  try {
    const res = await fetch(`${base}/safety?code=${encodeURIComponent(code)}`);
    if (!res.ok) return false;
    const body = await res.json() as { lists?: SafetyLists };
    if (!body.lists) return false;
    const mergeB = [...new Set([...blocked(), ...(body.lists.blocked ?? [])])];
    const mergeM = [...new Set([...muted(), ...(body.lists.muted ?? [])])];
    write(BLOCKED, mergeB);
    write(MUTED, mergeM);
    return true;
  } catch { return false; }
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
