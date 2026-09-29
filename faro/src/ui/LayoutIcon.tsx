// The home-layout picker's own marks — one wireframe diagram per layout, not a bag of Unicode
// symbols borrowed from math and typography (▦ ⌘ 𝔸 ⬡ ❯ ≡) that never agreed with each other on
// weight, style or what they were even trying to show. Suit.tsx solved the same problem for the
// suits the same way: paths on a fixed box, drawn once, instead of hoping a system font's glyph
// coverage lines up. These are stroke diagrams of the actual layout shape — a grid draws a grid
// — rather than an abstract mark standing in for a word.

import type { HomeLayout } from '../settings/settings';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

function LayoutShape({ id }: { id: HomeLayout }) {
  switch (id) {
    case 'grid':
      return (
        <g {...S}>
          <rect x="3" y="3" width="8" height="8" rx="1.2" />
          <rect x="13" y="3" width="8" height="8" rx="1.2" />
          <rect x="3" y="13" width="8" height="8" rx="1.2" />
          <rect x="13" y="13" width="8" height="8" rx="1.2" />
        </g>
      );
    case 'kanban':
      return (
        <g {...S}>
          <rect x="3" y="4" width="5.3" height="16" rx="1" />
          <rect x="9.4" y="4" width="5.3" height="10" rx="1" />
          <rect x="15.7" y="4" width="5.3" height="13" rx="1" />
        </g>
      );
    case 'feed':
      return (
        <g {...S}>
          <rect x="3" y="4" width="18" height="4.5" rx="1" />
          <rect x="3" y="10" width="18" height="4.5" rx="1" />
          <rect x="3" y="16" width="18" height="4.5" rx="1" />
        </g>
      );
    case 'radial':
      return (
        <g {...S}>
          <circle cx="12" cy="12" r="3" />
          <circle cx="12" cy="4" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="19.3" cy="8.5" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="19.3" cy="15.5" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="12" cy="20" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="4.7" cy="15.5" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="4.7" cy="8.5" r="1.6" fill="currentColor" stroke="none" />
        </g>
      );
    case 'pager':
      return (
        <g {...S}>
          <rect x="6" y="3" width="12" height="18" rx="1.5" />
          <path d="M2.4 12h2.4M3.4 10l-1.6 2 1.6 2" />
          <path d="M21.6 12h-2.4M20.6 10l1.6 2-1.6 2" />
        </g>
      );
    case 'command':
      return (
        <g {...S}>
          <rect x="3" y="7" width="18" height="10" rx="2" />
          <path d="M6.5 12h1.2M6.5 12v0" strokeWidth="2" />
          <path d="M9.5 12h7" />
        </g>
      );
    case 'magazine':
      return (
        <g {...S}>
          <rect x="3" y="3" width="10.5" height="18" rx="1.2" />
          <rect x="15" y="3" width="6" height="8" rx="1" />
          <rect x="15" y="12.5" width="6" height="8" rx="1" />
        </g>
      );
    case 'bento':
      return (
        <g {...S}>
          <rect x="3" y="3" width="11" height="11" rx="1.2" />
          <rect x="15.5" y="3" width="5.5" height="5" rx="1" />
          <rect x="15.5" y="9" width="5.5" height="5" rx="1" />
          <rect x="3" y="15.5" width="8" height="5.5" rx="1" />
          <rect x="12" y="15.5" width="9" height="5.5" rx="1" />
        </g>
      );
    case 'dual':
      return (
        <g {...S}>
          <rect x="3" y="3" width="18" height="18" rx="1.5" />
          <path d="M11 3v18" />
        </g>
      );
    case 'iconrail':
      return (
        <g {...S}>
          <rect x="3" y="3" width="5" height="18" rx="1.2" />
          <rect x="4.5" y="6" width="2" height="2" rx="0.5" fill="currentColor" stroke="none" />
          <rect x="4.5" y="10" width="2" height="2" rx="0.5" fill="currentColor" stroke="none" />
          <rect x="4.5" y="14" width="2" height="2" rx="0.5" fill="currentColor" stroke="none" />
          <path d="M11 6h10M11 12h10M11 18h7" />
        </g>
      );
    case 'drawer':
      return (
        <g {...S}>
          <rect x="3" y="3" width="14" height="18" rx="1.2" />
          <path d="M20 8v8M17.5 8l3 4-3 4" />
        </g>
      );
    case 'megaheader':
      return (
        <g {...S}>
          <rect x="3" y="3" width="18" height="7" rx="1.2" />
          <path d="M6 15h5M6 18h9" />
        </g>
      );
    case 'canvas':
      return (
        <g {...S}>
          <path d="M6 7l6 4M12 11l6-3M6 7l6 10M18 4l-6 7" />
          <circle cx="6" cy="7" r="1.8" fill="currentColor" stroke="none" />
          <circle cx="18" cy="4" r="1.8" fill="currentColor" stroke="none" />
          <circle cx="12" cy="11" r="1.8" fill="currentColor" stroke="none" />
          <circle cx="6" cy="17" r="1.8" fill="currentColor" stroke="none" />
        </g>
      );
    case 'terminal':
      return (
        <g {...S}>
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <path d="M6.5 9.5l3 2.5-3 2.5M11.5 15.5h5" />
        </g>
      );
    case 'doctree':
      return (
        <g {...S}>
          <path d="M5 4v16M5 8h4M5 14h4M9 8h6M9 14h6" />
        </g>
      );
    case 'widgets':
      return (
        <g {...S}>
          <rect x="3" y="3" width="7" height="7" rx="1.2" />
          <rect x="14" y="3" width="7" height="4" rx="1" />
          <rect x="14" y="9" width="7" height="4" rx="1" />
          <rect x="3" y="13" width="18" height="8" rx="1.2" />
        </g>
      );
    case 'ledger':
    default:
      return (
        <g {...S}>
          <path d="M4 5h16M4 9.5h16M4 14h16M4 18.5h16" />
          <path d="M14 3v18" strokeWidth="1" opacity=".55" />
        </g>
      );
  }
}

/** A home-layout mark on its own, sized by CSS — same contract as Suit's own component. */
export function LayoutIcon({ id, className }: { id: HomeLayout; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <LayoutShape id={id} />
    </svg>
  );
}
