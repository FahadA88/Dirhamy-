import { useEffect, useRef } from 'react';

// Escape closes, and focus stays inside while it's open — the two things every overlay needs
// and neither of which the modals or the drawer had.
export function useDismissable(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previously = document.activeElement as HTMLElement | null;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      const focusable = ref.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };

    document.addEventListener('keydown', onKey, true);
    // Move focus in, so a keyboard user isn't left behind the overlay.
    const t = window.setTimeout(() => {
      ref.current?.querySelector<HTMLElement>('button:not([disabled]), input, textarea')?.focus();
    }, 20);

    return () => {
      document.removeEventListener('keydown', onKey, true);
      window.clearTimeout(t);
      previously?.focus?.();
    };
  }, [open, onClose]);

  return ref;
}
