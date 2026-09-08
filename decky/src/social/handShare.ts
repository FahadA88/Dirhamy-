// Punch-list item 73: "The deal is a seed and the play is a list. That is a shareable link and
// a shareable picture, and neither exists."
//
// The link half. A finished hand's own seed is already exposed once the match is over — the
// same commit-reveal fairness data the History panel already shows (see MatchService.reveal,
// client.fairness()) — so sharing it is just encoding that seed plus enough context to redeal
// it identically: which game, and how many seats it was dealt for (the shuffle depends on
// player count). Same short-code pattern as house rules (library/houseRules.ts): a base64 blob
// in a query param, decoded on load.

export interface SharedHand {
  gameId: string;
  seed: number;
  seats: number;
}

export function encodeSharedHand(hand: SharedHand): string {
  return btoa(JSON.stringify({ id: hand.gameId, seed: hand.seed, seats: hand.seats }));
}

export function decodeSharedHand(code: string): SharedHand | null {
  try {
    const parsed = JSON.parse(atob(code)) as { id?: unknown; seed?: unknown; seats?: unknown };
    if (typeof parsed.id !== 'string' || !parsed.id) return null;
    if (typeof parsed.seed !== 'number' || !Number.isFinite(parsed.seed)) return null;
    if (typeof parsed.seats !== 'number' || !Number.isInteger(parsed.seats) || parsed.seats < 1) return null;
    return { gameId: parsed.id, seed: parsed.seed, seats: parsed.seats };
  } catch { return null; }
}
