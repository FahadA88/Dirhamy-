// App-wide customization. Every setting here is user-controllable, persisted to localStorage,
// and applied live — appearance AND gameplay, not just game rules.

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentId = 'emerald' | 'ocean' | 'violet' | 'teal' | 'rose' | 'amber' | 'slate';
/** Every back on the menu. Pure decoration — a back carries no information, so any of them
 *  is safe to ship and safe to let somebody make their own version of. */
export type CardBack =
  | 'monogram' | 'lattice' | 'ivory' | 'stripe' | 'halftone' | 'checker'
  | 'sunburst' | 'linen' | 'neongrid' | 'kraft' | 'tartan' | 'marble'
  | 'circuit' | 'damask' | 'wave' | 'mesh' | 'confetti' | 'deepsolid'
  | 'custom';
// Four table builds, each with its own rail, felt, markings and lighting.
/** The thirteen tables that survived the cut. */
export type TableFelt =
  | 'neon' | 'mahogany' | 'vegas' | 'midnight' | 'parlour' | 'concrete' | 'darkglass'
  | 'papermat' | 'velvet' | 'marble' | 'zinc' | 'litedges' | 'chalkboard' | 'studio'
  | 'custom';
export type CardSize = 's' | 'm' | 'l';
/**
 * How a card face is drawn. The first is the traditional deck; the rest exist because a deck
 * that only distinguishes suits by colour excludes about one man in twelve, and because a
 * classic face is hard to read at phone size.
 */
export type CardFace =
  | 'classic' | 'big-index' | 'four-color' | 'letters' | 'shapes'
  | 'minimal' | 'block' | 'typographic' | 'woodcut' | 'duplex'
  | 'chunky' | 'mono' | 'contrast' | 'deco' | 'handdrawn' | 'neon' | 'linen';
export type TextSize = 's' | 'm' | 'l' | 'xl';
/** Simulates the app through a colour-vision deficiency, so a player choosing the
 *  colour-safe face or checking a design decision can see it the way it is meant to help,
 *  rather than taking the "colour-safe" label on faith. */
export type ColorVisionSim = 'off' | 'protanopia' | 'deuteranopia' | 'tritanopia';

/** What somebody can change about a back they make. Deliberately a small, safe set. */
export interface CustomBack {
  pattern: 'lattice' | 'stripe' | 'dots' | 'checker' | 'wave' | 'plain';
  ink: string;      // the pattern colour
  ground: string;   // the card colour
  emblem: string;   // one glyph in the middle, or '' for none
  /**
   * A picture the player uploaded, as a data URI, covering the whole back. When set it wins over
   * the pattern. Kept small on the way in — see MAX_BACK_IMAGE — because this rides in
   * localStorage alongside everything else.
   */
  image?: string | null;
}

/** Roughly 400 KB of data URI. Big enough for a real picture, small enough not to eat the quota. */
export const MAX_BACK_IMAGE = 400_000;
export type Surface = 'soft' | 'glass' | 'plain';
export type Highlight = 'glow' | 'outline' | 'lift' | 'off';
// 'auto' resolves to whatever order actually suits the game being played (see defaultSortFor()
// in Table.tsx) — suit-grouped for a trick game, rank for a climbing game, and so on. The other
// three are an explicit override a player can pick regardless of what the game would suggest.
export type SortMode = 'auto' | 'off' | 'rank' | 'suit';
export type BotSpeed = 'slow' | 'normal' | 'fast' | 'instant';
export type BotNaming = 'bot' | 'seat' | 'named';
/**
 * How hard the opponents try. `random` is kept because old saved settings hold it and because a
 * genuinely random table is useful for testing; the three tiers are what a person picks.
 */
export type BotDiff = 'easy' | 'normal' | 'hard' | 'smart' | 'random';
/** How fast cards deal and flip, independent of how fast the bots think. */
export type AnimSpeed = 'relaxed' | 'normal' | 'brisk';
/**
 * Motion follows the operating system by default. Somebody who has asked their whole machine for
 * less movement should not have to ask this app separately — but they can still override it.
 */
export type MotionMode = 'system' | 'full' | 'reduced';

/** A felt somebody mixed themselves, applied when tableFelt is 'custom'. */
export interface CustomFelt {
  /** The cloth colour. */
  cloth: string;
  /** The rail around it. */
  rail: string;
}

export interface Settings {
  // appearance
  theme: ThemeMode;
  accent: AccentId;
  cardBack: CardBack;
  tableFelt: TableFelt;
  cardFace: CardFace;
  /** A back the player designed themselves, applied when cardBack is 'custom'. */
  customBack: CustomBack | null;
  cardSize: CardSize;
  textSize: TextSize;
  /** Heavier strokes, looser letter-spacing, no italics — for low vision and dyslexia. */
  legibleText: boolean;
  colorVisionSim: ColorVisionSim;
  surface: Surface;
  ambient3d: boolean;
  orbs: boolean;
  grid: boolean;
  floaties: boolean;
  motion: MotionMode;
  /** How quickly cards deal and flip. Separate from motion, which is on/off. */
  animSpeed: AnimSpeed;
  density: 'comfortable' | 'compact';
  /** A felt the player mixed, applied when tableFelt is 'custom'. */
  customFelt: CustomFelt | null;
  // gameplay / UX
  playerName: string;
  /** One glyph shown beside your name at the table and on your profile. */
  avatar: string;
  /** Your seat colour. One of the accent presets, so it always sits in the palette. */
  playerColor: AccentId;
  /** How opponents are named: numbered seats, raw seat ids, or a name from the house pool. */
  botNaming: BotNaming;
  defaultSeats: number;
  botSpeed: BotSpeed;
  botDiff: BotDiff;
  highlight: Highlight;
  sort: SortMode;
  confirmPlays: boolean;
  showLog: boolean;
  /** Cards landing, drawing, winning — the sounds a hand of cards makes. */
  cardSounds: boolean;
  /** Clicks, selections, refusals — the sounds the interface makes, separate from the cards. */
  uiSounds: boolean;
  /** 0-100. Applies to both categories above; muting either still mutes at 0. */
  soundVolume: number;
  /** Read the table out loud through the browser's own voice. Off unless asked for. */
  speak: boolean;
  /** A short buzz for your turn starting, a move being refused, and a trick or a win landing.
      Only ever fires on a device with a Vibration API — most of that is iOS Safari, where the
      setting simply does nothing rather than failing. */
  haptics: boolean;
  /** A few seconds to take back a misclick before the table moves on. 0 turns it off. */
  undoGraceMs: number;
  /** Optional clock. 0 is no clock at all, which is the default. */
  turnSeconds: number;
  /** Looks a player mixed themselves and named, so a preset stops being the only way to
      return to a combination once you've moved on from it. */
  myLooks: MyLook[];
  /** When exactly one move is legal, play it rather than waiting to be told to. */
  autoPlayForced: boolean;
}

export const defaultSettings: Settings = {
  // Neon Table is the house look, and a card room after midnight is dark. Daylight is a choice.
  theme: 'dark',
  accent: 'amber',
  cardBack: 'lattice',
  tableFelt: 'mahogany',
  cardFace: 'classic',
  customBack: null,
  cardSize: 'm',
  textSize: 'm',
  legibleText: false,
  colorVisionSim: 'off',
  surface: 'soft',
  ambient3d: true,
  orbs: true,
  grid: true,
  floaties: true,
  // Follow the machine. Somebody who asked their OS for less movement has already answered this.
  motion: 'system',
  animSpeed: 'normal',
  density: 'comfortable',
  customFelt: null,
  playerName: 'You',
  avatar: '🂡',
  playerColor: 'emerald',
  botNaming: 'bot',
  myLooks: [],
  autoPlayForced: true,
  defaultSeats: 3,
  botSpeed: 'normal',
  botDiff: 'normal',
  highlight: 'glow',
  sort: 'auto',
  confirmPlays: false,
  showLog: true,
  cardSounds: false,
  uiSounds: false,
  soundVolume: 70,
  speak: false,
  haptics: false,
  // Long enough to catch a misclick, short enough that nobody waits on it.
  undoGraceMs: 3000,
  turnSeconds: 0,
};

/** The glyphs offered as an avatar. Fixed set, so nothing needs screening. */
export const AVATARS = ['🂡', '♠', '♥', '♦', '♣', '🎩', '🦊', '🐙', '🌙', '⭐', '🔥', '🎲', '🍀', '👑', '🤖', '🎯'];

/*
  The house pool. A short, cosmopolitan set of names that all read cleanly in the small type a
  seat label gets — nothing longer than seven letters, nothing that collides with a suit, a
  rank or a game term already in use around the table (no "Jack", no "King").
*/
export const BOT_NAMES = [
  'Mara', 'Théo', 'Ines', 'Rune', 'Sable', 'Priya', 'Otto', 'Wren',
  'Nadia', 'Cass', 'Iker', 'Yuki', 'Enzo', 'Lior', 'Petra', 'Amos',
  'Suri', 'Diego', 'Noor', 'Finn',
];

/**
 * Which house name a seat gets. Deterministic, so a name a player has seen once is the name
 * they see all match — no state to keep, just a hash of the two things that identify a seat:
 * the match it belongs to, and its id within that match.
 */
export function botNameFor(matchId: string, seatId: string): string {
  const key = `${matchId}:${seatId}`;
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return BOT_NAMES[Math.abs(h) % BOT_NAMES.length];
}

/** How long a deal or flip takes, as a multiplier on the stylesheet's own timings. */
export const ANIM_SCALE: Record<AnimSpeed, number> = { relaxed: 1.6, normal: 1, brisk: 0.45 };

/**
 * A whole look in one click — accent, felt, back and face chosen to go together. Picking one
 * writes the four settings; they stay individually editable afterwards.
 */
export interface ThemePack {
  id: string;
  name: string;
  blurb: string;
  accent: AccentId;
  tableFelt: TableFelt;
  cardBack: CardBack;
  cardFace: CardFace;
}

/** A look somebody mixed themselves and gave a name to. Same shape as a built-in pack, minus
    the blurb — nobody is writing house copy for their own three-word combination. */
export type MyLook = Omit<ThemePack, 'blurb'>;

export const THEME_PACKS: ThemePack[] = [
  // The house look leads the list, and it is the one the app opens on — so it is the one that
  // shows as chosen until somebody changes something.
  { id: 'club', name: 'The Card Room', blurb: 'The house look — mahogany, brass and green baize.', accent: 'amber', tableFelt: 'mahogany', cardBack: 'lattice', cardFace: 'classic' },
  { id: 'neon', name: 'Neon Table', blurb: 'A card room after midnight, lit by the sign outside.', accent: 'emerald', tableFelt: 'neon', cardBack: 'monogram', cardFace: 'classic' },
  { id: 'parlour', name: 'Sunlit Parlour', blurb: 'Afternoon light on a quiet table.', accent: 'amber', tableFelt: 'parlour', cardBack: 'ivory', cardFace: 'typographic' },
  { id: 'midnight', name: 'Midnight Blue', blurb: 'Deep and cool, easy on the eyes.', accent: 'ocean', tableFelt: 'midnight', cardBack: 'neongrid', cardFace: 'big-index' },
  { id: 'autumn', name: 'Autumn Study', blurb: 'Mahogany, brass and old paper.', accent: 'amber', tableFelt: 'mahogany', cardBack: 'kraft', cardFace: 'woodcut' },
  { id: 'frost', name: 'Winter Frost', blurb: 'Cold marble and pale ink.', accent: 'teal', tableFelt: 'marble', cardBack: 'linen', cardFace: 'minimal' },
  { id: 'spring', name: 'Spring Green', blurb: 'Fresh felt, bright cards.', accent: 'emerald', tableFelt: 'vegas', cardBack: 'lattice', cardFace: 'four-color' },
  { id: 'noir', name: 'Chalk & Noir', blurb: 'Blackboard green, chalk-white pips.', accent: 'slate', tableFelt: 'chalkboard', cardBack: 'halftone', cardFace: 'mono' },
  { id: 'vegas', name: 'Vegas Red', blurb: 'Oxblood velvet and gold trim.', accent: 'rose', tableFelt: 'velvet', cardBack: 'sunburst', cardFace: 'deco' },
];

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
  neon:       { name: 'Neon',       blurb: 'Indigo cloth under a magenta sign, seams lit from beneath.' },
  parlour:    { name: 'Parlour',    blurb: 'Pale cloth in an oak frame. Quiet, domestic, daylight.' },
  mahogany:   { name: 'Mahogany',   blurb: 'Padded leather rail, polished wood, chrome drink wells.' },
  vegas:      { name: 'Vegas',      blurb: 'Bright baize with the betting line printed across it.' },
  midnight:   { name: 'Midnight',   blurb: 'Black baize, one lit ring, nothing else in the room.' },
  concrete:   { name: 'Concrete',   blurb: 'A grey slab with the seats chalked out. Brutalist.' },
  darkglass:  { name: 'Dark Glass', blurb: 'Smoked glass with reflections under the cards.' },
  papermat:   { name: 'Paper Mat',  blurb: 'A flat printed mat. No depth, no shadow, no wood.' },
  velvet:     { name: 'Velvet',     blurb: 'Deep burgundy velvet with a gold inlay.' },
  marble:     { name: 'Marble',     blurb: 'Cool veined stone. Hard surface, sharp shadows.' },
  zinc:       { name: 'Zinc Bar',   blurb: 'A dented metal bar top. Cards in a pub.' },
  litedges:   { name: 'Lit Edges',  blurb: 'Black surface, glowing seams.' },
  chalkboard: { name: 'Chalkboard', blurb: 'Matte slate with chalk seat markings.' },
  studio:     { name: 'Studio',     blurb: 'Pure white, one soft shadow. Cards as a product shot.' },
  custom:     { name: 'Yours',      blurb: 'Your own cloth and rail.' },
};

export interface BackPreset { name: string }

/** Order here is the order they appear in the picker. */
export const BACKS: Record<Exclude<CardBack, 'custom'>, BackPreset> = {
  monogram:  { name: 'Monogram' },
  lattice:   { name: 'Brass Lattice' },
  ivory:     { name: 'Ivory Border' },
  stripe:    { name: 'Diagonal Stripe' },
  halftone:  { name: 'Halftone' },
  checker:   { name: 'Checkerboard' },
  sunburst:  { name: 'Sunburst' },
  linen:     { name: 'Woven Linen' },
  neongrid:  { name: 'Neon Grid' },
  kraft:     { name: 'Blank Kraft' },
  tartan:    { name: 'Tartan' },
  marble:    { name: 'Marble' },
  circuit:   { name: 'Circuit' },
  damask:    { name: 'Damask' },
  wave:      { name: 'Wave' },
  mesh:      { name: 'Gradient Mesh' },
  confetti:  { name: 'Confetti' },
  deepsolid: { name: 'Deep Solid' },
};

export interface FacePreset { name: string; note: string }

export const FACES: Record<CardFace, FacePreset> = {
  classic:     { name: 'Classic',      note: 'The traditional deck — two colours, full pips.' },
  'big-index': { name: 'Big Index',    note: 'One large rank in the corner. Easiest to read on a phone.' },
  'four-color':{ name: 'Four Colours', note: 'A colour per suit, so hearts and diamonds never look alike.' },
  letters:     { name: 'Suit Letters', note: 'Each suit spelled out. Readable without telling colours apart.' },
  shapes:      { name: 'Shape Coded',  note: 'Suit becomes a distinct shape plus a letter.' },
  minimal:     { name: 'Minimal Line', note: 'Hairline outline suits, light type, lots of white.' },
  block:       { name: 'Solid Block',  note: 'The card is the suit colour, rank knocked out in white.' },
  typographic: { name: 'Typographic',  note: 'The rank fills the card; the suit is a small mark above it.' },
  woodcut:     { name: 'Woodcut',      note: 'Heavy ink on rag paper, square corners, antique weight.' },
  duplex:      { name: 'Duplex',       note: 'Rank in both corners, nothing in the middle. Very quiet.' },
  chunky:      { name: 'Chunky',       note: 'Thick rounded shapes, fat type. Reads across a room.' },
  mono:        { name: 'Monospaced',   note: 'Typewriter rank, tiny suit. Data, not decoration.' },
  contrast:    { name: 'High Contrast',note: 'Pure black on white, maximum size. Low-vision first.' },
  deco:        { name: 'Deco',         note: 'Geometric courts, gold rules, ivory stock.' },
  handdrawn:   { name: 'Hand Drawn',   note: 'Wobbly ink lines, off-register. Looks homemade.' },
  neon:        { name: 'Neon Outline', note: 'Dark cards, glowing suit outlines.' },
  linen:       { name: 'Linen Stock',  note: 'Visible paper grain, warm white, softened ink.' },
};

export const CARD_SIZES: Record<CardSize, { cw: number; ch: number; bw: number; bh: number }> = {
  s: { cw: 62, ch: 90, bw: 46, bh: 66 },
  m: { cw: 76, ch: 108, bw: 56, bh: 80 },
  l: { cw: 92, ch: 130, bw: 68, bh: 96 },
};

/** Multiplies every type size in the app. Cards scale separately, via Card size. */
export const TEXT_SCALE: Record<TextSize, number> = { s: 0.92, m: 1, l: 1.14, xl: 1.3 };

// A bot that moves the instant it's able to reads as rushed, not skilled — these are paced to
// feel like someone actually looking at their hand. 'instant' stays near-zero on purpose: it's
// the one tier meant for testing a game you built, not for playing against.
export const BOT_SPEED_MS: Record<BotSpeed, number> = { slow: 1800, normal: 950, fast: 450, instant: 40 };

const KEY = 'decky.settings.v1';

// What each of the choice-shaped settings is allowed to be. Spreading whatever was in
// localStorage over the defaults trusted it completely: a value this build no longer has — a
// blob written by an older version, another tab, or a hand-edited key — silently became the
// live setting. A bot speed that isn't one of the four reads back as undefined and paces the
// bots at nought milliseconds, so the whole game plays itself out before the first card is on
// screen; a card size that isn't one of the three throws on boot and the app never renders.
const ALLOWED = {
  theme: ['light', 'dark', 'system'],
  accent: Object.keys(ACCENTS),
  playerColor: Object.keys(ACCENTS),
  cardSize: Object.keys(CARD_SIZES),
  textSize: ['s', 'm', 'l', 'xl'],
  surface: ['soft', 'glass', 'plain'],
  highlight: ['glow', 'outline', 'lift', 'off'],
  sort: ['auto', 'off', 'rank', 'suit'],
  botSpeed: Object.keys(BOT_SPEED_MS),
  botDiff: ['easy', 'normal', 'hard', 'smart', 'random'],
  animSpeed: Object.keys(ANIM_SCALE),
  motion: ['system', 'full', 'reduced'],
  density: ['comfortable', 'compact'],
  botNaming: ['bot', 'seat', 'named'],
  colorVisionSim: ['off', 'protanopia', 'deuteranopia', 'tritanopia'],
} as const;

/** How loud, and which categories are on — the shape `playSound` actually needs. */
export type SoundPrefs = Pick<Settings, 'cardSounds' | 'uiSounds' | 'soundVolume'>;

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...defaultSettings };
    const saved = JSON.parse(raw) as Partial<Settings> & { fourColor?: boolean; botLabels?: boolean; sound?: boolean };
    // `fourColor` was a boolean before card faces became a choice of four. Anyone who had it on
    // keeps the deck they chose rather than being silently reset to classic.
    if (saved.cardFace === undefined && saved.fourColor !== undefined) {
      saved.cardFace = saved.fourColor ? 'four-color' : 'classic';
    }
    // `botLabels` was a boolean before a house pool of names became the third option. Its two
    // old states map onto the two ends of the new one; nobody's choice moves under them.
    if (saved.botNaming === undefined && saved.botLabels !== undefined) {
      saved.botNaming = saved.botLabels ? 'bot' : 'seat';
    }
    // `sound` was one switch for every noise the app made. Split into cards and interface,
    // both starting at whatever the one switch used to say, so nobody's silence gets undone.
    if (saved.cardSounds === undefined && saved.sound !== undefined) saved.cardSounds = saved.sound;
    if (saved.uiSounds === undefined && saved.sound !== undefined) saved.uiSounds = saved.sound;
    const merged = { ...defaultSettings, ...saved } as Record<string, unknown>;
    for (const [key, options] of Object.entries(ALLOWED)) {
      if (!(options as readonly string[]).includes(String(merged[key]))) {
        merged[key] = (defaultSettings as unknown as Record<string, unknown>)[key];
      }
    }
    // The numbers, too: a seat count of nought seats nobody, and a negative clock never ticks.
    const num = (v: unknown, lo: number, hi: number, fallback: number) =>
      (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback);
    merged.defaultSeats = num(merged.defaultSeats, 2, 8, defaultSettings.defaultSeats);
    merged.undoGraceMs = num(merged.undoGraceMs, 0, 60000, defaultSettings.undoGraceMs);
    merged.turnSeconds = num(merged.turnSeconds, 0, 3600, defaultSettings.turnSeconds);
    if (typeof merged.playerName !== 'string' || !merged.playerName.trim()) {
      merged.playerName = defaultSettings.playerName;
    }
    if (!Array.isArray(merged.myLooks)) merged.myLooks = [];
    merged.soundVolume = num(merged.soundVolume, 0, 100, defaultSettings.soundVolume);
    return merged as unknown as Settings;
  } catch {
    return { ...defaultSettings };
  }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignore */ }
}

/** What 'system' actually means right now. Safe to call before the DOM has a preference. */
export function prefersReducedMotion(): boolean {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}

/** Turns the three-way setting into the two-way answer the app and the stylesheet use. */
export function resolveMotion(mode: MotionMode): 'full' | 'reduced' {
  if (mode === 'system') return prefersReducedMotion() ? 'reduced' : 'full';
  return mode;
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
  // 'system' asks the machine. The stylesheet already honours the media query on its own, but
  // the app reads data-motion in JS too, so it has to resolve to a real answer here.
  root.setAttribute('data-motion', resolveMotion(s.motion));
  root.style.setProperty('--anim-scale', String(ANIM_SCALE[s.animSpeed]));
  root.setAttribute('data-density', s.density);
  root.setAttribute('data-surface', s.surface);
  root.setAttribute('data-face', s.cardFace);
  root.setAttribute('data-back', s.cardBack);
  const cb = s.customBack;
  if (cb) {
    root.style.setProperty('--cb-ink', cb.ink);
    root.style.setProperty('--cb-ground', cb.ground);
    root.setAttribute('data-cbpattern', cb.pattern);
    // An uploaded picture covers the whole back and wins over the pattern.
    root.style.setProperty('--cb-image', cb.image ? `url("${cb.image}")` : 'none');
  } else {
    root.style.setProperty('--cb-image', 'none');
  }
  const cf = s.customFelt;
  if (cf) {
    root.style.setProperty('--cf-cloth', cf.cloth);
    root.style.setProperty('--cf-rail', cf.rail);
  }
  // Your seat colour, so a table can tint what belongs to you.
  root.style.setProperty('--you', ACCENTS[s.playerColor]?.emerald ?? ACCENTS.emerald.emerald);
  root.setAttribute('data-text', s.textSize);
  root.setAttribute('data-legible', s.legibleText ? 'on' : 'off');
  root.style.setProperty('--text-scale', String(TEXT_SCALE[s.textSize]));
  root.setAttribute('data-colorvision', s.colorVisionSim);
}
