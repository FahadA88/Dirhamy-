// Tiny WebAudio blips — no assets. Guarded so it's a no-op until enabled and after a gesture.
import { SoundPrefs } from '../settings/settings';

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return ctx;
  } catch { return null; }
}

type Kind = 'play' | 'draw' | 'win' | 'ui';

// 'ui' is the interface talking — a selection, a refusal. Everything else is a card doing
// something. Two categories, so a player who wants to hear cards land without every click
// chirping back at them can have exactly that.
const CARD_KINDS: Kind[] = ['play', 'draw', 'win'];

export function playSound(kind: Kind, prefs: SoundPrefs): void {
  const on = CARD_KINDS.includes(kind) ? prefs.cardSounds : prefs.uiSounds;
  if (!on || prefs.soundVolume <= 0) return;
  const a = ac();
  if (!a) return;
  const peak = 0.14 * (prefs.soundVolume / 100);
  const now = a.currentTime;
  const notes: Record<Kind, number[]> = {
    play: [523], draw: [330], ui: [440], win: [523, 659, 784],
  };
  notes[kind].forEach((freq, i) => {
    const osc = a.createOscillator();
    const gain = a.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const t = now + i * 0.09;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  });
}
