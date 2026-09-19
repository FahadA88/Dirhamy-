import { sha256 } from './hash';

// Provably-fair dealing, the commit–reveal scheme used by licensed card rooms.
//
// The problem it solves: if the dealer picks the shuffle, players must take on faith that it
// wasn't chosen to suit the house. If players pick it, they can grind seeds until they like the
// deal. Commit–reveal removes both.
//
//   1. Before dealing, the server picks a secret serverSeed and publishes its hash (the commit).
//      Publishing the hash pins the seed: it cannot be changed afterwards without the hash
//      changing, and the hash reveals nothing about the seed.
//   2. The client contributes a clientSeed of its own. The server cannot have anticipated it.
//   3. The shuffle seed is derived from BOTH, plus a nonce that increments per hand.
//   4. When the match ends the server reveals serverSeed. Anyone can re-hash it to check it
//      matches the commit, then re-derive every deal and replay the shuffle.
//
// Neither side can steer the outcome: the server is committed before it sees the client's
// contribution, and the client's contribution is mixed into a value it cannot predict.

export interface FairCommit {
  commit: string;        // sha256(serverSeed) — published before the first deal
  clientSeed: string;    // the player's contribution, freely chosen
  nonce: number;         // increments per hand, so each deal in a match differs
}

export interface FairReveal extends FairCommit {
  serverSeed: string;    // published when the match ends
}

/** Derive the 32-bit shuffle seed for one hand. Deterministic and identical on both sides. */
export function deriveSeed(serverSeed: string, clientSeed: string, nonce: number): number {
  const digest = sha256(`${serverSeed}:${clientSeed}:${nonce}`);
  // Take the top 32 bits of the digest. `>>> 0` keeps it an unsigned int for the RNG.
  return parseInt(digest.slice(0, 8), 16) >>> 0;
}

export function commitTo(serverSeed: string): string {
  return sha256(serverSeed);
}

/**
 * Check a revealed match: does the seed match what was committed, and does each hand's seed
 * follow from it? Returns per-hand results so a UI can show the whole chain.
 */
export function verifyReveal(
  reveal: FairReveal,
  handSeeds: number[],
): { ok: boolean; commitOk: boolean; hands: { nonce: number; expected: number; actual: number; ok: boolean }[] } {
  const commitOk = commitTo(reveal.serverSeed) === reveal.commit;
  const hands = handSeeds.map((actual, i) => {
    const nonce = reveal.nonce + i;
    const expected = deriveSeed(reveal.serverSeed, reveal.clientSeed, nonce);
    return { nonce, expected, actual, ok: expected === actual };
  });
  return { ok: commitOk && hands.every((h) => h.ok), commitOk, hands };
}

/**
 * A fresh secret. On a real server this must come from a CSPRNG; in-process it uses the
 * platform's crypto when available and falls back to Math.random, which is fine for a local
 * game but is NOT sufficient for a hosted table — see the note in matchService.
 */
export function newServerSeed(): string {
  const g = globalThis as { crypto?: { getRandomValues?: (a: Uint8Array) => Uint8Array } };
  if (g.crypto?.getRandomValues) {
    const bytes = g.crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  }
  let s = '';
  for (let i = 0; i < 64; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}

/** A default client contribution; the player may replace it with anything they like. */
export function newClientSeed(): string {
  return newServerSeed().slice(0, 16);
}
