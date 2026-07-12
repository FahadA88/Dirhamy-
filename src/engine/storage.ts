// Per-account persistence in localStorage. This stands in for the hosted
// database the spec assumes — all state in Part 20 persists per account.

import type { Account, GameState } from "./types";

const ACCOUNTS_KEY = "dirhamy.accounts";
const SESSION_KEY = "dirhamy.session";
const stateKey = (accountId: string) => `dirhamy.state.${accountId}`;

export function loadAccounts(): Account[] {
  try {
    return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

export function saveAccounts(accounts: Account[]) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

export function currentSession(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function setSession(accountId: string | null) {
  if (accountId) localStorage.setItem(SESSION_KEY, accountId);
  else localStorage.removeItem(SESSION_KEY);
}

export function loadState(accountId: string): GameState | null {
  try {
    const raw = localStorage.getItem(stateKey(accountId));
    return raw ? (JSON.parse(raw) as GameState) : null;
  } catch {
    return null;
  }
}

export function saveState(accountId: string, state: GameState) {
  localStorage.setItem(stateKey(accountId), JSON.stringify(state));
}

export function clearState(accountId: string) {
  localStorage.removeItem(stateKey(accountId));
}

// Not real security — client-side demo hashing only.
export async function hashPassword(pw: string): Promise<string> {
  const data = new TextEncoder().encode(`dirhamy:${pw}`);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
