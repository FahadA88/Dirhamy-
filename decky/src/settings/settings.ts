// App-wide customization. Every setting here is user-controllable, persisted to localStorage,
// and applied live — appearance AND gameplay, not just game rules.

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentId = 'emerald' | 'ocean' | 'violet' | 'teal' | 'rose' | 'amber' | 'slate';
export type CardBack = 'stripes' | 'grid' | 'dots' | 'solid';
// Four table builds, each with its own rail, felt, markings and lighting.
export type TableFelt = 'mahogany' | 'vegas' | 'parlour' | 'midnight';
export type CardSize = 's' | 'm' | 'l';
/**
 * How a card face is drawn. The first is the traditional deck; the rest exist because a deck
 * that only distinguishes suits by colour excludes about one man in twelve, and because a
 * classic face is hard to read at phone size.
 */
export type CardFace = 'classic' | 'four-color' | 'letters' | 'big-index';
export type TextSize = 's' | 'm' | 'l' | 'xl';
export type Surface = 'soft' | 'glass' | 'plain';
export type Highlight = 'glow' | 'outline' | 'lift' | 'off';
export type SortMode = 'off' | 'rank' | 'suit';
export type BotSpeed = 'slow' | 'normal' | 'fast' | 'instant';
export type BotDiff = 'smart' | 'random';

export interface Settings {
  // appearance
  theme: ThemeMode;
  accent: AccentId;
  cardBack: CardBack;
  tableFelt: TableFelt;
  cardFace: CardFace;
  cardSize: CardSize;
  textSize: TextSize;
  /** Heavier strokes, looser letter-spacing, no italics — for low vision and dyslexia. */
  legibleText: boolean;
  surface: Surface;
  ambient3d: boolean;
  orbs: boolean;
  grid: boolean;
  floaties: boolean;
  motion: 'full' | 'reduced';
  density: 'comfortable' | 'compact';
  // gameplay / UX
  playerName: string;
  botLabels: boolean;
  defaultSeats: number;
  botSpeed: BotSpeed;
  botDiff: BotDiff;
  highlight: Highlight;
  sort: SortMode;
  confirmPlays: boolean;
  showLog: boolean;
  sound: boolean;
}

export const defaultSettings: Settings = {
  theme: 'dark',
  accent: 'emerald',
  cardBack: 'stripes',
  tableFelt: 'parlour',
  cardFace: 'classic',
  cardSize: 'm',
  textSize: 'm',
  legibleText: false,
  surface: 'soft',
  ambient3d: true,
  orbs: true,
  grid: true,
  floaties: true,
  motion: 'full',
  density: 'comfortable',
  playerName: 'You',
  botLabels: true,
  defaultSeats: 3,
  botSpeed: 'normal',
  botDiff: 'smart',
  highlight: 'glow',
  sort: 'off',
  confirmPlays: false,
  showLog: true,
  sound: false,
};

export interface AccentPreset { name: string; green: string; greenD: string; emerald: string; lime: string; }

export const ACCENTS: Record<AccentId, AccentPreset> = {
  emerald: { name: 'Emerald', green: '#16a34a', greenD: '#0e7a37', emerald: '#10b981', lime: '#4ade80' },
  ocean:   { name: 'Ocean',   green: '#2563eb', greenD: '#1d4ed8', emerald: '#3b82f6', lime: '#60a5fa' },
  violet:  { name: 'Violet',  green: '#7c3aed', greenD: '#6d28d9', emerald: '#8b5cf6', lime: '#a78bfa' },
  teal:    { name: 'Teal',    green: '#0d9488', greenD: '#0f766e', emerald: '#14b8a6', lime: '#2dd4bf' },
  rose:    { name: 'Rose',    green: '#e11d48', greenD: '#be123c', emerald: '#f43f5e', lime: '#fb7185' },
  amber:   { name: 'Amber',   green: '#d97706', greenD: '#b45309', emerald: '#f59e0b', lime: '#fbbf24' },
  slate:   { name: 'Slate',   green: '#475569', greenD: '#334155', emerald: '#64748b', lime: '#94a3b8' },
};

export interface FeltPreset { name: string; blurb: string }

export const FELTS: Record<TableFelt, FeltPreset> = {
  mahogany: { name: 'Mahogany', blurb: 'Padded leather rail, polished wood, chrome drink wells.' },
  vegas:    { name: 'Vegas',    blurb: 'Bright baize with the house rules printed across it.' },
  parlour:  { name: 'Parlour',  blurb: 'Pale cloth in an oak frame, seats marked out in chalk line.' },
  midnight: { name: 'Midnight', blurb: 'Black baize, one lit ring, nothing else in the room.' },
};

export const CARD_SIZES: Record<CardSize, { cw: number; ch: number; bw: number; bh: number }> = {
  s: { cw: 62, ch: 90, bw: 46, bh: 66 },
  m: { cw: 76, ch: 108, bw: 56, bh: 80 },
  l: { cw: 92, ch: 130, bw: 68, bh: 96 },
};

/** Multiplies every type size in the app. Cards scale separately, via Card size. */
export const TEXT_SCALE: Record<TextSize, number> = { s: 0.92, m: 1, l: 1.14, xl: 1.3 };

export const BOT_SPEED_MS: Record<BotSpeed, number> = { slow: 1100, normal: 600, fast: 280, instant: 40 };

const KEY = 'decky.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaultSettings };
    const saved = JSON.parse(raw) as Partial<Settings> & { fourColor?: boolean };
    // `fourColor` was a boolean before card faces became a choice of four. Anyone who had it on
    // keeps the deck they chose rather than being silently reset to classic.
    if (saved.cardFace === undefined && saved.fourColor !== undefined) {
      saved.cardFace = saved.fourColor ? 'four-color' : 'classic';
    }
    return { ...defaultSettings, ...saved };
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

// Push settings into the DOM: CSS custom properties + data-* attributes the stylesheet keys off.
export function applySettings(s: Settings): void {
  const root = document.documentElement;
  const a = ACCENTS[s.accent];
  root.style.setProperty('--green', a.green);
  root.style.setProperty('--green-d', a.greenD);
  root.style.setProperty('--emerald', a.emerald);
  root.style.setProperty('--lime', a.lime);

  const sz = CARD_SIZES[s.cardSize];
  root.style.setProperty('--cw', `${sz.cw}px`);
  root.style.setProperty('--ch', `${sz.ch}px`);
  root.style.setProperty('--bw', `${sz.bw}px`);
  root.style.setProperty('--bh', `${sz.bh}px`);

  const theme = s.theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : s.theme;
  root.setAttribute('data-theme', theme);
  root.setAttribute('data-motion', s.motion);
  root.setAttribute('data-density', s.density);
  root.setAttribute('data-surface', s.surface);
  root.setAttribute('data-face', s.cardFace);
  root.setAttribute('data-text', s.textSize);
  root.setAttribute('data-legible', s.legibleText ? 'on' : 'off');
  root.style.setProperty('--text-scale', String(TEXT_SCALE[s.textSize]));
}
