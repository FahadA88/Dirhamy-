// Worklist #96: a phone can buzz for your turn, an illegal move, and taking a trick — a short,
// physical confirmation that costs nothing to look at because it isn't on the screen at all.
//
// navigator.vibrate is Android/Chrome territory; iOS Safari has never implemented the Vibration
// API, so this is a silent no-op there rather than a broken toggle. Some browsers also throw
// when vibrate() is called outside a direct user gesture — the try/catch is for that, not for
// unsupported browsers, which just have no navigator.vibrate to call.

export type HapticEvent = 'turn' | 'refusal' | 'trick';

const PATTERNS: Record<HapticEvent, number | number[]> = {
  turn: 12,
  refusal: [10, 40, 10],
  trick: 16,
};

export function haptic(event: HapticEvent, enabled: boolean): void {
  if (!enabled) return;
  try { navigator.vibrate?.(PATTERNS[event]); } catch { /* not supported, or blocked */ }
}
