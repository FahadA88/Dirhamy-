import { useEffect, useRef } from 'react';

// Worklist #94: full keyboard play already models a cursor moving along the hand, with Enter
// to play whatever it is on (see handKeys in Table.tsx). A gamepad's D-pad or left stick and a
// single face button are the same model, so this polls for exactly those two gestures and
// calls back into the same move/activate primitives keyboard already drives. There is no
// Gamepad API event for "the stick tilted" the way keydown exists for a key press — the API is
// poll-only — so this reads gamepad state once a frame while enabled, and edge-detects both the
// direction and the button press itself so a held stick or a held button doesn't fire every
// single frame.

const STICK_THRESHOLD = 0.5;
const FIRST_REPEAT_MS = 420; // how long a fresh direction is held before it starts repeating
const REPEAT_MS = 180;       // the pace of repeats after that

export function useGamepad(enabled: boolean, onMove: (dir: -1 | 1) => void, onActivate: () => void): void {
  // Refs, not deps: onMove/onActivate close over `cursor` and the current hand every render, and
  // re-subscribing the poll loop on every render would restart its repeat timing constantly.
  const onMoveRef = useRef(onMove);
  const onActivateRef = useRef(onActivate);
  onMoveRef.current = onMove;
  onActivateRef.current = onActivate;

  useEffect(() => {
    if (!enabled || typeof navigator.getGamepads !== 'function') return;
    let raf = 0;
    let heldDir: -1 | 0 | 1 = 0;
    let nextRepeatAt = 0;
    let buttonWasDown = false;

    const tick = () => {
      const pads = navigator.getGamepads();
      const pad = pads[0] ?? Array.from(pads).find((p) => p) ?? null;
      if (pad) {
        const axis = pad.axes[0] ?? 0;
        const left = pad.buttons[14]?.pressed || axis < -STICK_THRESHOLD;
        const right = pad.buttons[15]?.pressed || axis > STICK_THRESHOLD;
        const dir: -1 | 0 | 1 = left ? -1 : right ? 1 : 0;
        const now = performance.now();
        if (dir !== 0) {
          if (dir !== heldDir) {
            heldDir = dir;
            nextRepeatAt = now + FIRST_REPEAT_MS;
            onMoveRef.current(dir);
          } else if (now >= nextRepeatAt) {
            nextRepeatAt = now + REPEAT_MS;
            onMoveRef.current(dir);
          }
        } else {
          heldDir = 0;
        }
        // Button 0 is A on an Xbox pad and Cross on a PlayStation pad — the bottom face button
        // on both, and the one a thumb rests on by default.
        const buttonDown = !!pad.buttons[0]?.pressed;
        if (buttonDown && !buttonWasDown) onActivateRef.current();
        buttonWasDown = buttonDown;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);
}
