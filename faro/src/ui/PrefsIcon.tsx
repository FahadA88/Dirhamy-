// The Preferences rail's own marks — one drawn diagram per category, replacing a shelf of
// Unicode symbols (◐ ▤ 🂠 ☺ ▶ ☻ ♪ ◎ ⓘ) that never agreed with each other on weight or style
// and rendered differently across platforms. Same contract as LayoutIcon and Suit: stroke paths
// on a fixed 24x24 box, drawn once.

import type { SectionId } from './SettingsPanel';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function PrefsShape({ id }: { id: SectionId }) {
  switch (id) {
    case 'look':
      return (
        <g {...S}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 3.5a8.5 8.5 0 0 1 0 17z" fill="currentColor" stroke="none" />
        </g>
      );
    case 'table':
      return (
        <g {...S}>
          <rect x="3" y="5.5" width="18" height="13" rx="3" />
          <rect x="9.3" y="8.7" width="5.4" height="7.6" rx="0.9" />
        </g>
      );
    case 'cards':
      return (
        <g {...S}>
          <rect x="4" y="5.3" width="10" height="14" rx="1.4" transform="rotate(-9 9 12.3)" />
          <rect x="10" y="5.3" width="10" height="14" rx="1.4" transform="rotate(9 15 12.3)" />
        </g>
      );
    case 'you':
      return (
        <g {...S}>
          <circle cx="12" cy="8.4" r="3.6" />
          <path d="M4.4 20c1.2-4.2 4.6-6.4 7.6-6.4s6.4 2.2 7.6 6.4" />
        </g>
      );
    case 'play':
      return (
        <g {...S}>
          <path d="M7 4.2 19 12 7 19.8z" strokeLinejoin="round" />
        </g>
      );
    case 'opponents':
      return (
        <g {...S}>
          <circle cx="8.3" cy="9.3" r="3.1" />
          <circle cx="17.1" cy="10.6" r="2.5" />
          <path d="M3 20c0.9-3.5 2.9-5.4 5.3-5.4s4.4 1.9 5.3 5.4" />
          <path d="M14.4 20c0.6-2.5 2-4 3.8-4 1.6 0 3 1.1 3.7 3.1" />
        </g>
      );
    case 'motion':
      return (
        <g {...S}>
          <path d="M4 9.3v5.4h3.3l4.8 3.7V5.6l-4.8 3.7z" strokeLinejoin="round" />
          <path d="M15.6 9.2a4.6 4.6 0 0 1 0 5.6M18.2 6.7a8.4 8.4 0 0 1 0 10.6" />
        </g>
      );
    case 'access':
      return (
        <g {...S}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="4.3" />
          <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
        </g>
      );
    case 'about':
    default:
      return (
        <g {...S}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="7.9" r="1" fill="currentColor" stroke="none" />
          <path d="M12 11.2v5.6" strokeWidth="2" />
        </g>
      );
  }
}

/** A Preferences category mark on its own, sized by CSS — same contract as LayoutIcon. */
export function PrefsIcon({ id, className }: { id: SectionId; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <PrefsShape id={id} />
    </svg>
  );
}
