// App-wide customization. Every setting here is user-controllable, persisted to localStorage,
// and applied live — appearance AND gameplay, not just game rules.

export type ThemeMode = 'light' | 'dark' | 'system';
export type AccentId = 'emerald' | 'ocean' | 'rose' | 'amber';
/** Every back on the menu. Pure decoration — a back carries no information, so any of them
 *  is safe to ship and safe to let somebody make their own version of. */
export type CardBack =
  | 'monogram' | 'lattice' | 'ivory' | 'stripe' | 'halftone' | 'checker'
  | 'sunburst' | 'linen' | 'neongrid' | 'kraft' | 'tartan' | 'marble'
  | 'circuit' | 'damask' | 'wave' | 'mesh' | 'confetti' | 'deepsolid'
  | 'artdeco' | 'holofoil'
  | 'custom'
  // The shop's own backs (src/social/economy.ts SHOP_ITEMS) — earned, never sold as a set of
  // 21+3; these three exist only because the shop has to sell something new, not because the
  // stock 21 were short of anything.
  | 'shop-back-aurora' | 'shop-back-embercut' | 'shop-back-starfield';
// Four table builds, each with its own rail, felt, markings and lighting.
/** The fourteen tables that survived the cut. */
export type TableFelt =
  | 'neon' | 'mahogany' | 'vegas' | 'midnight' | 'parlour' | 'concrete' | 'darkglass'
  | 'papermat' | 'velvet' | 'marble' | 'zinc' | 'litedges' | 'chalkboard' | 'studio' | 'walnut'
  | 'custom';
/**
 * How a card face is drawn. The first is the traditional deck; the rest exist because a deck
 * that only distinguishes suits by colour excludes about one man in twelve, and because a
 * classic face is hard to read at phone size.
 */
export type CardFace =
  | 'classic' | 'big-index' | 'four-color' | 'letters' | 'shapes'
  | 'minimal' | 'block' | 'typographic' | 'woodcut' | 'duplex'
  | 'chunky' | 'mono' | 'contrast' | 'deco' | 'handdrawn' | 'neon' | 'linen' | 'custom';

/** What somebody can change about a face they make — the mark colour and the paper it's
 *  printed on. Deliberately as small as CustomFelt, not as wide as CustomBack: a face still has
 *  to read as a rank and a suit from across a table, so this is a recolour of the real card,
 *  not a pattern designer. */
export interface CustomFace {
  ink: string;      // pips, the corner index, court/joker linework
  ground: string;   // the card's own paper colour
}
export type TextSize = 's' | 'm' | 'l' | 'xl';
export type SeatRing = 'arc' | 'wide' | 'row';
export type ChipStyle = 'stack' | 'flat' | 'text';

/** A point on the felt, in per cent of its box, so a saved arrangement survives a different
 *  screen, a different card size and a different game. */
export interface FeltSpot { x: number; y: number }

/** Where a player has dragged things. Seats are keyed by their RING SLOT — l, tl, t, tr, r —
 *  rather than by player id, because the same arrangement should hold whoever is sitting there
 *  and whatever game is being played. Null anywhere means "wherever the chosen preset puts it". */
export interface TableArrangement {
  seats: Partial<Record<'l' | 'tl' | 't' | 'tr' | 'r', FeltSpot>>;
  piles: FeltSpot | null;
}
export type PileSpot = 'centre' | 'high' | 'low';
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
/**
 * How the home screen arranges the library. `grid` is the shipped shelf-and-carousel page;
 * everything past it is an alternate way to browse the same games, over the same actions —
 * picking one only ever changes this one screen's arrangement.
 */
export type HomeLayout =
  | 'grid' | 'kanban' | 'feed' | 'radial' | 'pager' | 'command' | 'magazine' | 'bento'
  | 'dual' | 'iconrail' | 'drawer' | 'megaheader' | 'canvas' | 'terminal' | 'doctree'
  | 'widgets' | 'ledger';
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
  /** A slider, not a choice of three — "small, medium, large" was a guess at three people.
   *  Percent of the old "medium" preset; 100 is that preset exactly. */
  cardSize: number;
  textSize: TextSize;
  /** Heavier strokes, looser letter-spacing, no italics — for low vision and dyslexia. */
  legibleText: boolean;
  colorVisionSim: ColorVisionSim;
  /** Panels, chips and rules gain a harder edge and a flatter fill — less "material", more
   *  legible against everything around it. Independent of the high-contrast card face, which
   *  only ever touched the cards themselves. */
  highContrast: boolean;
  /** The screen-reader move announcement, shown as an on-screen caption too — for low vision
   *  rather than no vision, where the same line matters just as much read as heard. */
  showCaptions: boolean;
  /** Seasonal drift overlay on the felt. Off by default — decoration nobody asked for is still
   *  decoration somebody has to turn off. */
  seasonalFx: 'off' | 'snow' | 'leaves';
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
  /** A face the player mixed, applied when cardFace is 'custom'. */
  customFace: CustomFace | null;
  /** Shop item ids (src/social/economy.ts SHOP_ITEMS) this player has bought. Everything else
   *  cosmetic in this file is free by default and needs no entry here at all. */
  unlockedCosmetics: string[];
  // gameplay / UX
  playerName: string;
  /** One glyph shown beside your name at the table and on your profile. */
  avatar: string;
  /** Your seat colour. One of the accent presets, so it always sits in the palette. */
  playerColor: AccentId;
  /** How opponents are named: numbered seats, raw seat ids, or a name from the house pool. */
  botNaming: BotNaming;
  defaultSeats: number;
  /**
   * The seat count you last chose FOR EACH GAME, keyed by game id.
   *
   * `defaultSeats` is a single global fallback — the number offered before you have ever played
   * a given game. It was also, until this, the number offered every OTHER time too: you almost
   * always play Hearts with four and Bluff with six, and the app made you re-pick every visit.
   * A game not yet in here falls back to `defaultSeats`, same as always.
   */
  perGameSeats: Record<string, number>;
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
  /** One switch that silences both categories at once without losing the volume and the two
   *  toggles above — the same relationship reduced motion has to full motion. */
  reducedSound: boolean;
  /** Read the table out loud through the browser's own voice. Off unless asked for. */
  speak: boolean;
  /** A short buzz for your turn starting, a move being refused, and a trick or a win landing.
      Only ever fires on a device with a Vibration API — most of that is iOS Safari, where the
      setting simply does nothing rather than failing. */
  haptics: boolean;
  /** On a narrow phone, moves a bid, a bet or an offer below the hand instead of the visually
      centred middle of the felt — closer to where a thumb holding the phone actually reaches.
      Off by default: the centred middle is the right call for anyone not one-handing it. */
  oneHandedMode: boolean;
  /** Which hand the table is laid out for. 'left' mirrors the order of the hand itself (so the
   *  end you reach across first is on the near side) and swaps which side the draw and discard
   *  piles sit on. Right-handed by default, the same as the layout always was before this. */
  handedness: 'right' | 'left';
  /** A curved fan (the traditional look) or a straight row — some players find the leaning
   *  edges harder to read than a plain line of overlapping cards. */
  handFan: 'fan' | 'straight';
  /** How the opponent ring is arranged around the felt. 'arc' is the shape the table has
   *  always had; 'wide' pushes the seats out to the rails for a bigger middle; 'row' lines
   *  them along the top, which is what a phone already does and what some people prefer on a
   *  big screen too. */
  seatRing: SeatRing;
  /** Where the draw/discard cluster sits on the cloth. Some games want it up by the seats,
   *  some want it down near your hand where you are already looking. */
  pileSpot: PileSpot;
  /** How a betting game draws its money. 'stack' is chips with an edge and a rim, 'flat' the
   *  same discs without the relief, 'text' the plain number it used to be. */
  chipStyle: ChipStyle;
  /** Positions dragged by hand in "Arrange the table". Overrides the seat-ring and pile-spot
   *  presets for whatever it names, and leaves the rest to them. */
  tableArrangement: TableArrangement | null;
  /** A few seconds to take back a misclick before the table moves on. 0 turns it off. */
  undoGraceMs: number;
  /** Optional clock. 0 is no clock at all, which is the default. */
  turnSeconds: number;
  /** Looks a player mixed themselves and named, so a preset stops being the only way to
      return to a combination once you've moved on from it. */
  myLooks: MyLook[];
  /** When exactly one move is legal, play it rather than waiting to be told to. */
  autoPlayForced: boolean;
  /** How the front page presents the library — the shipped grid, or one of sixteen others. */
  homeLayout: HomeLayout;
  /** The running trick count drawn as a seven-segment digital readout instead of plain type. */
  digitalScore: boolean;
  /** Suit marks drawn in the joker's own illustrated linework instead of the plain flat glyph. */
  illustratedSuits: boolean;
}

export const defaultSettings: Settings = {
  // The Card Room is the house look, and a card room is dark. Daylight is a choice.
  // These four have to agree with the 'club' pack in THEME_PACKS or the app opens showing a
  // look it is not actually wearing.
  theme: 'dark',
  accent: 'ocean',
  cardBack: 'lattice',
  tableFelt: 'mahogany',
  cardFace: 'classic',
  customBack: null,
  cardSize: 100,
  textSize: 'm',
  legibleText: false,
  colorVisionSim: 'off',
  highContrast: false,
  showCaptions: false,
  seasonalFx: 'off',
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
  customFace: null,
  unlockedCosmetics: [],
  playerName: 'You',
  avatar: '🂡',
  playerColor: 'emerald',
  botNaming: 'bot',
  myLooks: [],
  autoPlayForced: true,
  defaultSeats: 3,
  perGameSeats: {},
  botSpeed: 'normal',
  botDiff: 'normal',
  highlight: 'glow',
  sort: 'auto',
  confirmPlays: false,
  showLog: true,
  cardSounds: false,
  uiSounds: false,
  soundVolume: 70,
  reducedSound: false,
  speak: false,
  haptics: false,
  oneHandedMode: false,
  handedness: 'right',
  handFan: 'fan',
  seatRing: 'arc',
  pileSpot: 'centre',
  chipStyle: 'stack',
  tableArrangement: null,
  // Long enough to catch a misclick, short enough that nobody waits on it.
  undoGraceMs: 3000,
  turnSeconds: 0,
  homeLayout: 'grid',
  digitalScore: false,
  illustratedSuits: false,
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
  /*
    Three whole colourways lead the list, because a colourway is the thing people actually
    choose — not an accent on its own. Each one is a complete answer to "what room is this":
    what the cloth is made of, what the cards are printed on, and what colour the interface
    round them is allowed to be.

    They are deliberately different arguments rather than three shades of the same one:
    a room with pigment in it, a room with no hue at all, and a cold room with a single
    warm thing in it.
  */

  /* The house look, and what the app opens on: cyan on near-black, the wordmark's own colour,
     not a felt table's. */
  { id: 'club', name: 'The Card Room', blurb: 'Cyan under the sign outside. The house look.', accent: 'ocean', tableFelt: 'mahogany', cardBack: 'lattice', cardFace: 'classic' },

  /* No hue in the furniture at all: graphite, pewter and one brass accent for what has been
     won. Every colour on the screen belongs to the cards. The strictest reading of quiet. */
  { id: 'inkmetal', name: 'High Roller', blurb: 'Oxblood velvet, gold inlay, and nothing cheap in the room.', accent: 'amber', tableFelt: 'velvet', cardBack: 'artdeco', cardFace: 'deco' },

  /* Cold everywhere, warm once. Sapphire through the interface and a magenta sign on the
     one thing that matters — which is also how the table already marks what you have won. */
  { id: 'coldmodern', name: 'After Midnight', blurb: 'Indigo cloth under the sign outside. The room at 3am.', accent: 'ocean', tableFelt: 'neon', cardBack: 'neongrid', cardFace: 'big-index' },

  { id: 'neon', name: 'Neon Table', blurb: 'A card room after midnight, lit by the sign outside.', accent: 'ocean', tableFelt: 'neon', cardBack: 'monogram', cardFace: 'classic' },
  { id: 'parlour', name: 'Sunlit Parlour', blurb: 'Afternoon light on a quiet table.', accent: 'amber', tableFelt: 'parlour', cardBack: 'ivory', cardFace: 'typographic' },
  { id: 'midnight', name: 'Midnight Blue', blurb: 'Deep and cool, easy on the eyes.', accent: 'ocean', tableFelt: 'midnight', cardBack: 'neongrid', cardFace: 'big-index' },
  { id: 'autumn', name: 'Autumn Study', blurb: 'Mahogany, brass and old paper.', accent: 'amber', tableFelt: 'mahogany', cardBack: 'kraft', cardFace: 'woodcut' },
  { id: 'frost', name: 'Winter Frost', blurb: 'Cold marble and pale ink.', accent: 'ocean', tableFelt: 'marble', cardBack: 'linen', cardFace: 'minimal' },
  { id: 'spring', name: 'Spring Green', blurb: 'Fresh felt, bright cards.', accent: 'emerald', tableFelt: 'vegas', cardBack: 'lattice', cardFace: 'four-color' },
  { id: 'noir', name: 'Chalk & Noir', blurb: 'Blackboard green, chalk-white pips.', accent: 'ocean', tableFelt: 'chalkboard', cardBack: 'halftone', cardFace: 'mono' },
  { id: 'vegas', name: 'Vegas Red', blurb: 'Oxblood velvet and gold trim.', accent: 'rose', tableFelt: 'velvet', cardBack: 'sunburst', cardFace: 'deco' },
  { id: 'study', name: 'The Study', blurb: 'Damson cloth, walnut rail, and a lamp on one corner.', accent: 'rose', tableFelt: 'walnut', cardBack: 'damask', cardFace: 'typographic' },
  { id: 'signal', name: 'Copper Signal', blurb: 'A concrete table with one hot metal edge.', accent: 'amber', tableFelt: 'concrete', cardBack: 'kraft', cardFace: 'big-index' },
];

export interface AccentPreset { name: string; green: string; greenD: string; emerald: string; lime: string; }

/*
  Four neon tubes, not four casino chips.

  Gold and Crimson read as a casino's palette — brass and oxblood, warm against a felt table.
  The room they are picked from is not that room any more: cyan into violet into pink, on a
  near-black ground lit by its own two colours. A warm gold or a red-orange crimson sitting in
  that same picker looked like it had wandered in from a different site, because it had — this
  is the same clash the room itself had before it was repainted, just moved one level down into
  the one part of it that hadn't been touched yet.

  Four now, sampled straight from the wordmark's own five-stop gradient rather than picked to
  merely "go with" it: Cyan (the first stop, and the default), Violet (the middle), Magenta and
  Pink (the last two) — a hue wheel that stays inside the same soft, sky-to-rose family the room
  is lit in instead of fighting it.

  The ids that survive are unchanged, as before — they are written into saved settings on every
  device that has ever opened this, so `amber`/`rose`/`emerald`/`ocean` keep meaning "the first
  swatch, the second, the third, the fourth" even though none of their names still say what the
  id says. An id that no longer exists here (`violet`, `teal`, `slate`, `copper`) falls back to
  the default the same way any other invalid saved value does — see the `ALLOWED` re-validation
  in `loadSettings`.

  Four steps, darkest first: greenD, green, emerald, lime. A dark room takes the brighter pair
  and a light room the deeper pair — see applySettings.
*/
export const ACCENTS: Record<AccentId, AccentPreset> = {
  /** The wordmark's middle colour. */
  amber:   { name: 'Violet',  green: '#4B2F94', greenD: '#33206A', emerald: '#8E68ED', lime: '#C6B3F7' },
  /** The wordmark's fourth stop. */
  rose:    { name: 'Magenta', green: '#7A2F8C', greenD: '#551F61', emerald: '#BE68D3', lime: '#E3B3EE' },
  /** The wordmark's last colour, where the gradient lands. */
  emerald: { name: 'Pink',    green: '#93386E', greenD: '#66264C', emerald: '#E078B7', lime: '#F5BFDC' },
  /** The wordmark's own first colour, spelled out as its own swatch too — this is the site's
   *  default light, not a "cool option" among warm ones any more. */
  ocean:   { name: 'Cyan',    green: '#1B5A73', greenD: '#123E50', emerald: '#64CEEB', lime: '#BFF0FB' },
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
  walnut:     { name: 'Walnut',     blurb: 'A real wood-grain rail round a burgundy cloth. Grandpa’s table.' },
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
  artdeco:   { name: 'Art Deco' },
  holofoil:  { name: 'Holo Foil' },
  'shop-back-aurora':    { name: 'Aurora' },
  'shop-back-embercut':  { name: 'Embercut' },
  'shop-back-starfield': { name: 'Starfield' },
};

export interface HomeLayoutPreset { name: string; blurb: string; mark: string }

/** Order here is the order the picker offers them in. The house grid leads. */
export const HOME_LAYOUTS: Record<HomeLayout, HomeLayoutPreset> = {
  grid:       { name: 'Grid',           blurb: 'The house front page — a carousel, kind tabs, and shelves under that.', mark: '▦' },
  kanban:     { name: 'Kanban Board',   blurb: 'One column per kind of game, each game a card in its column.', mark: '▥' },
  feed:       { name: 'Vertical Feed',  blurb: 'A scrolling feed of picks, recent plays and new arrivals.', mark: '☰' },
  radial:     { name: 'Radial Menu',    blurb: 'Kinds arranged around a hub — spin to the one you want.', mark: '◎' },
  pager:      { name: 'Full-Screen Pager', blurb: 'One game at a time, edge to edge. Step through with the arrows.', mark: '▭' },
  command:    { name: 'Command Palette', blurb: 'Type to filter the whole library, Enter opens the top match.', mark: '⌘' },
  magazine:   { name: 'Magazine',       blurb: 'One game given the cover story, the rest set as a reading list.', mark: '𝔸' },
  bento:      { name: 'Bento Grid',     blurb: 'A mix of tile sizes — one big pick, small stats, the rest of the shelf.', mark: '▣' },
  dual:       { name: 'Split Pane',     blurb: 'A scannable list on the left, a live preview on the right.', mark: '◫' },
  iconrail:   { name: 'Icon Rail',      blurb: 'A narrow rail of kind icons instead of a row of tabs.', mark: '▤' },
  drawer:     { name: 'Slide-Out Drawer', blurb: 'Filters tuck into a drawer; the shelf gets the full width.', mark: '⇥' },
  megaheader: { name: 'Mega-Header',    blurb: 'A tall header that opens into a full menu of kinds.', mark: '▔' },
  canvas:     { name: 'Infinite Canvas', blurb: 'Games as nodes on a pannable board, clustered by kind.', mark: '⬡' },
  terminal:   { name: 'Terminal',       blurb: 'A command line — type a name, or `list --family`, to browse.', mark: '❯' },
  doctree:    { name: 'Doc Tree',       blurb: 'Kinds expand into games like folders into files, in a sidebar.', mark: '⌸' },
  widgets:    { name: 'Widget Dashboard', blurb: 'Small real widgets — jump back in, staff picks, your stats.', mark: '⊞' },
  ledger:     { name: 'Newsprint Ledger', blurb: 'Dense columns and hairline rules, built for scanning names fast.', mark: '≡' },
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
  custom:      { name: 'Your Own',     note: 'Pick the ink and the paper yourself.' },
};

// The old "medium" preset, still the anchor a card-size percentage scales from — 100 means
// exactly this. The old "small" and "large" presets weren't quite proportional to it (about
// 82% and 121% respectively across cw/ch/bw/bh), which is exactly the kind of three-guesses
// unevenness a slider replaces.
export const CARD_SIZE_BASE = { cw: 76, ch: 108, bw: 56, bh: 80 };
export const CARD_SIZE_MIN = 70;
export const CARD_SIZE_MAX = 140;

/** Multiplies every type size in the app. Cards scale separately, via Card size. */
export const TEXT_SCALE: Record<TextSize, number> = { s: 0.92, m: 1, l: 1.14, xl: 1.3 };

// A bot that moves the instant it's able to reads as rushed, not skilled — these are paced to
// feel like someone actually looking at their hand. 'instant' stays near-zero on purpose: it's
// the one tier meant for testing a game you built, not for playing against.
export const BOT_SPEED_MS: Record<BotSpeed, number> = { slow: 1800, normal: 950, fast: 450, instant: 40 };

const KEY = 'faro.settings.v1';

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
  seasonalFx: ['off', 'snow', 'leaves'],
  homeLayout: Object.keys(HOME_LAYOUTS),
  handedness: ['right', 'left'],
  handFan: ['fan', 'straight'],
  seatRing: ['arc', 'wide', 'row'],
  pileSpot: ['centre', 'high', 'low'],
  chipStyle: ['stack', 'flat', 'text'],
} as const;

/** How loud, and which categories are on — the shape `playSound` actually needs. */
export type SoundPrefs = Pick<Settings, 'cardSounds' | 'uiSounds' | 'soundVolume' | 'reducedSound'>;

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
    // `cardSize` was a choice of three ('s' | 'm' | 'l') before it became a slider. Map each
    // old step to the percentage nearest what it actually rendered at, so nobody who picked
    // Large wakes up back at Medium.
    if (typeof (saved as unknown as { cardSize?: unknown }).cardSize === 'string') {
      const old = (saved as unknown as { cardSize: string }).cardSize;
      (saved as unknown as { cardSize: number }).cardSize = old === 's' ? 80 : old === 'l' ? 120 : 100;
    }
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
    // A record from local storage is attacker-shaped data from the player's own browser, not
    // from anywhere untrusted — but it can still be hand-edited or just stale from an older
    // schema, so every entry is re-validated the same way defaultSeats itself is, and anything
    // that fails becomes absent rather than crashing the settings load.
    if (merged.perGameSeats && typeof merged.perGameSeats === 'object') {
      const clean: Record<string, number> = {};
      for (const [id, n] of Object.entries(merged.perGameSeats as Record<string, unknown>)) {
        if (typeof id === 'string' && id && typeof n === 'number' && Number.isFinite(n) && n >= 1 && n <= 8) {
          clean[id] = n;
        }
      }
      merged.perGameSeats = clean;
    } else {
      merged.perGameSeats = {};
    }
    merged.undoGraceMs = num(merged.undoGraceMs, 0, 60000, defaultSettings.undoGraceMs);
    merged.turnSeconds = num(merged.turnSeconds, 0, 3600, defaultSettings.turnSeconds);
    if (typeof merged.playerName !== 'string' || !merged.playerName.trim()) {
      merged.playerName = defaultSettings.playerName;
    }
    if (!Array.isArray(merged.myLooks)) merged.myLooks = [];
    merged.soundVolume = num(merged.soundVolume, 0, 100, defaultSettings.soundVolume);
    merged.cardSize = num(merged.cardSize, CARD_SIZE_MIN, CARD_SIZE_MAX, defaultSettings.cardSize);
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

/**
 * Black or white, whichever can actually be read on this colour.
 *
 * WCAG relative luminance, with the usual 0.179 crossover — the point at which white text and
 * black text contrast equally against a background. Off-black and off-white rather than the
 * extremes, because pure #000 on a saturated fill reads as a hole.
 */
function readableInkOn(hex: string): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16);
  const chan = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * chan((n >> 16) & 255) + 0.7152 * chan((n >> 8) & 255) + 0.0722 * chan(n & 255);
  return lum > 0.179 ? '#141210' : '#FFFFFF';
}

// Push settings into the DOM: CSS custom properties + data-* attributes the stylesheet keys off.
export function applySettings(s: Settings): void {
  const root = document.documentElement;
  const a = ACCENTS[s.accent];
  root.style.setProperty('--green', a.green);
  root.style.setProperty('--green-d', a.greenD);
  root.style.setProperty('--emerald', a.emerald);
  root.style.setProperty('--lime', a.lime);

  const scale = s.cardSize / 100;
  root.style.setProperty('--cw', `${Math.round(CARD_SIZE_BASE.cw * scale)}px`);
  root.style.setProperty('--ch', `${Math.round(CARD_SIZE_BASE.ch * scale)}px`);
  root.style.setProperty('--bw', `${Math.round(CARD_SIZE_BASE.bw * scale)}px`);
  root.style.setProperty('--bh', `${Math.round(CARD_SIZE_BASE.bh * scale)}px`);

  const theme = s.theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : s.theme;
  root.setAttribute('data-theme', theme);

  // The stylesheet's story is that there is one accent and everything reaches for it. That was
  // only true of the stylesheet's own default: this function wrote the player's chosen accent
  // into the legacy --green family and left --accent at the built-in blue, so a player on Teal
  // got teal buttons and a blue focus ring. The accent tokens follow the choice now, and the
  // accent-at-a-strength ladder below them follows in turn. A dark room wants the brighter end
  // of the preset and a light room the deeper end, or the ring disappears into the ground.
  const accent = theme === 'dark' ? a.emerald : a.green;
  const accentHi = theme === 'dark' ? a.lime : a.emerald;
  root.style.setProperty('--accent', accent);
  root.style.setProperty('--accent-hi', accentHi);
  /*
    The ink that goes ON a filled accent.
    Every "this is the chosen one" control is a pill filled with the accent now, and whether its
    label should be black or white is a property of the colour, not of the theme: white on Gold
    or Platinum is unreadable, black on Crimson or Amethyst is worse. CSS cannot branch on
    luminance, so it is worked out here, off the lighter of the two steps the pill is actually
    painted with — the gradient's top stop is what most of the label sits on.
  */
  root.style.setProperty('--on-accent', readableInkOn(accentHi));
  // 'system' asks the machine. The stylesheet already honours the media query on its own, but
  // the app reads data-motion in JS too, so it has to resolve to a real answer here.
  root.setAttribute('data-motion', resolveMotion(s.motion));
  root.style.setProperty('--anim-scale', String(ANIM_SCALE[s.animSpeed]));
  root.setAttribute('data-density', s.density);
  root.setAttribute('data-seatring', s.seatRing);
  root.setAttribute('data-pilespot', s.pileSpot);
  root.setAttribute('data-surface', s.surface);
  root.setAttribute('data-face', s.cardFace);
  root.setAttribute('data-back', s.cardBack);
  const cb = s.customBack;
  if (cb) {
    root.style.setProperty('--cb-ink', cb.ink);
    root.style.setProperty('--cb-ground', cb.ground);
    // Only while the custom back is actually the ACTIVE back — not just designed once and
    // left sitting in storage. [data-cbpattern="X"] and [data-back="X"] match X in {lattice,
    // stripe, checker, wave} at identical specificity, cbpattern later in the cascade, so
    // leaving this attribute set after switching back to one of those four built-ins silently
    // repainted them in the custom colours. Four players hitting the designer once (its default
    // pattern IS 'lattice', the app's own default back) is not an edge case.
    if (s.cardBack === 'custom') root.setAttribute('data-cbpattern', cb.pattern);
    else root.removeAttribute('data-cbpattern');
    // An uploaded picture covers the whole back and wins over the pattern.
    root.style.setProperty('--cb-image', cb.image ? `url("${cb.image}")` : 'none');
  } else {
    root.removeAttribute('data-cbpattern');
    root.style.setProperty('--cb-image', 'none');
  }
  const cf = s.customFelt;
  if (cf) {
    root.style.setProperty('--cf-cloth', cf.cloth);
    root.style.setProperty('--cf-rail', cf.rail);
  }
  const cface = s.customFace;
  if (cface) {
    root.style.setProperty('--cface-ink', cface.ink);
    root.style.setProperty('--cface-ground', cface.ground);
  }
  // Your seat colour, so a table can tint what belongs to you.
  root.style.setProperty('--you', ACCENTS[s.playerColor]?.emerald ?? ACCENTS.emerald.emerald);
  root.setAttribute('data-text', s.textSize);
  root.setAttribute('data-legible', s.legibleText ? 'on' : 'off');
  root.style.setProperty('--text-scale', String(TEXT_SCALE[s.textSize]));
  root.setAttribute('data-colorvision', s.colorVisionSim);
  root.setAttribute('data-onehanded', s.oneHandedMode ? 'on' : 'off');
  root.setAttribute('data-hand', s.handedness);
  root.setAttribute('data-handfan', s.handFan);
  root.setAttribute('data-contrast', s.highContrast ? 'high' : 'normal');
  root.setAttribute('data-captions', s.showCaptions ? 'on' : 'off');
  root.setAttribute('data-season', s.seasonalFx);
}
