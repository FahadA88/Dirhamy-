// Tiny WebAudio blips — no assets. Guarded so it's a no-op until enabled and after a gesture.
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    return ctx;
  } catch { return null; }
}

type Kind = 'play' | 'draw' | 'win' | 'ui';

export function playSound(kind: Kind, on: boolean): void {
  if (!on) return;
  const a = ac();
  if (!a) return;
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
    gain.gain.exponentialRampToValueAtTime(0.14, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(gain).connect(a.destination);
    osc.start(t);
    osc.stop(t + 0.18);
  });
}
