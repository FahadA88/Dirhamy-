// Tiny WebAudio blips — no assets. Guarded so it's a no-op until enabled and after a gesture.
import { SoundPrefs } from '../settings/settings';

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return ctx;
  } catch { return null; }
}

type Kind = 'play' | 'draw' | 'win' | 'ui' | 'trick' | 'slap' | 'shuffle' | 'trade' | 'war';

// 'ui' is the interface talking — a selection, a refusal. Everything else is a card doing
// something. Two categories, so a player who wants to hear cards land without every click
// chirping back at them can have exactly that.
const CARD_KINDS: Kind[] = ['play', 'draw', 'win', 'trick', 'slap', 'shuffle', 'trade', 'war'];

const NOTES: Record<Kind, number[]> = {
  play: [523], draw: [330], ui: [440], win: [523, 659, 784],
  // A trick swept up: two quick notes falling, distinct from win's climbing three so a
  // trick landing and a hand ending don't read as the same event.
  trick: [659, 494],
  // A deal closing: two notes rising a fourth, brisk rather than triumphant — Pit's trades
  // happen constantly, so this has to read as "done" without competing with win's fanfare.
  trade: [392, 523],
  // A tie escalating into a war: three low notes climbing, register kept well under win's
  // bright triad so a standoff and an actual victory never sound like the same thing.
  war: [196, 233, 277],
  // Percussive rather than musical — see the shorter envelope below. One low thud, the way a
  // hand actually lands on a pile.
  slap: [140],
  // A soft rise and fall under everything else — texture, not a note anyone is meant to name.
  shuffle: [220, 260, 300, 260],
};
// Most kinds ring like a struck bell (attack in ~10ms, decay over ~160ms). Slap and shuffle
// want a shorter, drier hit so they read as an object, not a chime.
const DECAY_MS: Partial<Record<Kind, number>> = { slap: 55, shuffle: 70 };

export function playSound(kind: Kind, prefs: SoundPrefs): void {
  const on = CARD_KINDS.includes(kind) ? prefs.cardSounds : prefs.uiSounds;
  if (!on || prefs.soundVolume <= 0) return;
  const a = ac();
  if (!a) return;
  const peak = 0.14 * (prefs.soundVolume / 100);
  const now = a.currentTime;
  const decay = (DECAY_MS[kind] ?? 160) / 1000;
  NOTES[kind].forEach((freq, i) => {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = kind === 'slap' ? 'triangle' : 'sine';
    osc.frequency.value = freq;
    const t = now + i * (kind === 'shuffle' ? 0.05 : 0.09);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + decay + 0.02);
  });
}
