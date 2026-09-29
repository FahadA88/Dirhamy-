// Deterministic seeded RNG (mulberry32). All engine randomness flows through this,
// so a match is fully reproducible from (definition, seed, moves).

export function nextRandom(state: number): { value: number; state: number } {
  let a = state | 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: a };
}

// Fisher–Yates using a seed; returns the shuffled array and the advanced rng state.
export function seededShuffle<T>(arr: T[], rngState: number): { result: T[]; rngState: number } {
  const result = arr.slice();
  let state = rngState;
  for (let i = result.length - 1; i > 0; i--) {
    const r = nextRandom(state);
    state = r.state;
    const j = Math.floor(r.value * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return { result, rngState: state };
}
