// Punch-list item 66: "Bot 2, Bot 3 and Bot 4 run the same advisor with the same weights. Three
// names on one player." botNameFor (settings.ts) already gives every bot seat a distinct house
// name, deterministic from the match and the seat — nothing to keep, just a hash of the two
// things that identify a seat. This does the same thing for how the seat actually PLAYS: a
// small, honest bias on the handful of decisions in randomBot.ts that are already a matter of
// degree (how much hand does it take to open a bid, how often does a strong hand raise) rather
// than a rewrite of the strategy itself. Two seats at the same difficulty tier still play by the
// same rules; they no longer play the identical hand the identical way.

export type PersonalityId = 'steady' | 'aggressive' | 'cautious' | 'wild';

export interface Personality {
  id: PersonalityId;
  /** Shown next to the seat's name, e.g. "Mara plays it safe". */
  label: string;
  /**
   * -1 (cautious) .. +1 (aggressive), with 'wild' pushed further out than 'aggressive' alone —
   * a bolder bid, a lower bar to open the bidding, a strong hand pushed harder. Applied as a
   * small nudge to existing thresholds, never as a new decision path of its own.
   */
  aggression: number;
}

const PERSONALITIES: Personality[] = [
  { id: 'steady', label: 'plays it straight', aggression: 0 },
  { id: 'aggressive', label: 'pushes for more', aggression: 1 },
  { id: 'cautious', label: 'plays it safe', aggression: -1 },
  { id: 'wild', label: 'takes big swings', aggression: 1.6 },
];

/** Same hashing approach as botNameFor, on purpose — a different salt on the same key so the
 *  two never happen to land on the same index and read as one choice instead of two. */
export function personalityFor(matchId: string, seatId: string): Personality {
  const key = `${matchId}:${seatId}:personality`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return PERSONALITIES[Math.abs(h) % PERSONALITIES.length];
}
