// Reading the table out loud.
//
// This is not the screen-reader path — that one runs through real markup and an aria-live
// region, and works whether or not anything here is switched on. This is for somebody who
// wants the game narrated without running a screen reader at all, so it is opt-in, and it
// speaks in plain words rather than reading the interface out.
//
// Everything is wrapped, because speech synthesis is missing or mute in more browsers than you
// would expect and a silent failure is the correct one.

let lastSpoken = '';

function synth(): SpeechSynthesis | null {
  try {
    return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  } catch { return null; }
}

/** True when this browser can speak at all. Lets the setting hide itself when it cannot work. */
export function canSpeak(): boolean {
  return synth() !== null;
}

/**
 * Say something, if speech is on. Repeats are dropped: the log re-renders on every board
 * change, and hearing the same line four times is worse than not hearing it.
 */
export function speak(text: string, on: boolean): void {
  if (!on || !text) return;
  const s = synth();
  if (!s) return;
  if (text === lastSpoken) return;
  lastSpoken = text;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05;
    u.volume = 0.9;
    s.speak(u);
  } catch { /* a browser that says it can speak and then cannot */ }
}

/** Stop mid-sentence — on leaving the table, or when the setting goes off. */
export function stopSpeaking(): void {
  const s = synth();
  if (!s) return;
  try { s.cancel(); } catch { /* ignore */ }
  lastSpoken = '';
}

/** "seven of hearts" — how a card should sound, rather than how it is spelled. */
export function spokenCard(rank: string, suit: string): string {
  const RANKS: Record<string, string> = {
    A: 'ace', J: 'jack', Q: 'queen', K: 'king', '10': 'ten',
  };
  const SUITS: Record<string, string> = {
    C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades', JOKER: '',
  };
  if (suit === 'JOKER') return 'joker';
  return `${RANKS[rank] ?? rank} of ${SUITS[suit] ?? suit}`;
}
