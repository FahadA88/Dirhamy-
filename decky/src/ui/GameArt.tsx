import { GameDefinition } from '../engine/types';

// Every game gets a face, and no two of them are the same face.
//
// The first version of this gave each *family* an arrangement — a fan, a spread, a stack, a
// duel — which meant Crazy Eights, Switch, Trade Winds, Go Fish, Rummy and President all wore
// an identical fan of five cards on an identical green, and a shelf of them read as wallpaper.
// A shelf should read like a row of boxed games: you should be able to point at one across the
// room and know which it is.
//
// So a game's face is now a little scene of its own — the moment that game is about, on cloth
// of its own colour. Hearts is the queen everybody is trying not to take. War is two cards
// going head to head. Go Fish is a card being pulled out of somebody's hand. The scenes are
// data: positions, rotations and depths in a table, drawn by one renderer. A game nobody has
// seen before falls back to the scene for its family, so a game built this morning still gets
// a face rather than a blank.

type Suit = 'S' | 'H' | 'D' | 'C';
const GLYPH: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

/** One card in a scene. x/y are percentages of the tile, measured to the card's centre. */
interface Placed {
  r: string;
  s: Suit;
  x: number;
  y: number;
  rot: number;
  /** Depth in the stack. Higher paints later and sits nearer the viewer. */
  z?: number;
  /** Face down — the back of the card, not a rank. */
  back?: boolean;
  /** Held back in the shade: a card that is context rather than subject. */
  dim?: boolean;
  scale?: number;
}

interface Scene {
  /** The cloth this game is played on. One hue per game is what breaks up the shelf. */
  cloth: string;
  cards: Placed[];
  /** An oversized suit or rank behind the cards — the game's monogram. */
  mark?: { glyph: string; x: number; y: number; size: number; turn?: number };
  /** A second mark, for games whose signature is a pair of things. */
  mark2?: { glyph: string; x: number; y: number; size: number; turn?: number };
}

// ---------- the scenes ----------
//
// Coordinates are percentages of the tile and rotations are degrees. A card is about 26% wide
// and 38% tall, so a card at x: 50 fills the middle third.

// Ten cloths. Pigment, not light.
//
// These were fluorescent — a shelf of them glowed like a row of energy drinks, which is the
// wrong thing for a boxed game to look like. A shelf still has to be readable across the room,
// so the ten hues are unchanged and every one still has a lamp on it at the top left; what
// changed is that the lamp lights a dyed cloth instead of being the cloth.
const CLOTH = {
  claret: 'radial-gradient(120% 100% at 22% 8%, #b8324f 0%, #7a1730 42%, #2e0912 100%)',
  forest: 'radial-gradient(120% 100% at 22% 8%, #2f9b6a 0%, #14603f 44%, #06251a 100%)',
  midnight: 'radial-gradient(120% 100% at 22% 8%, #4a6ec8 0%, #22357f 42%, #0a1030 100%)',
  amber: 'radial-gradient(120% 100% at 22% 8%, #d9a43c 0%, #9c5f16 44%, #331a06 100%)',
  plum: 'radial-gradient(120% 100% at 22% 8%, #8f5bbf 0%, #542a86 42%, #1d0b33 100%)',
  slate: 'radial-gradient(120% 100% at 22% 8%, #7a8a99 0%, #3a4652 44%, #10151b 100%)',
  teal: 'radial-gradient(120% 100% at 22% 8%, #2f9bb0 0%, #14606f 44%, #052229 100%)',
  rust: 'radial-gradient(120% 100% at 22% 8%, #c9743f 0%, #8c3a15 44%, #2b0e05 100%)',
  moss: 'radial-gradient(120% 100% at 22% 8%, #7fa63c 0%, #416b18 44%, #16240a 100%)',
  ink: 'radial-gradient(120% 100% at 22% 8%, #a24070 0%, #4a2059 46%, #0f0a1e 100%)',
};

/** Four cards thrown into the middle, the winner on top. What a trick looks like. */
function trick(cloth: string, top: Placed, rest: [Suit, string][]): Scene {
  const spots = [
    { x: 34, y: 40, rot: -16 },
    { x: 63, y: 36, rot: 13 },
    { x: 40, y: 62, rot: 7 },
  ];
  return {
    cloth,
    cards: [
      ...rest.slice(0, 3).map((c, i) => ({
        r: c[1], s: c[0], ...spots[i], z: i, dim: true,
      })),
      { ...top, z: 9 },
    ],
  };
}

const SCENES: Record<string, Scene> = {
  // The card nobody wants, sitting on top of the trick that just went wrong.
  'classic-hearts': trick(CLOTH.claret, { r: 'Q', s: 'S', x: 50, y: 54, rot: -4, scale: 1.16 },
    [['H', '9'], ['H', 'K'], ['H', '4']]),

  // A bid made and a spade laid on it.
  'classic-spades': { ...trick(CLOTH.midnight, { r: 'A', s: 'S', x: 52, y: 50, rot: -4 },
    [['D', 'K'], ['C', '10'], ['D', '7']]),
    mark: { glyph: '♠', x: 17, y: 74, size: 52, turn: -12 } },

  // The two bowers, crossed. Euchre is the only game where the jacks outrank the ace.
  'classic-euchre': {
    cloth: CLOTH.moss,
    cards: [
      { r: '9', s: 'H', x: 22, y: 64, rot: -14, z: 1, dim: true },
      { r: 'A', s: 'D', x: 78, y: 64, rot: 14, z: 1, dim: true },
      { r: 'J', s: 'S', x: 45, y: 50, rot: -38, z: 4, scale: 1.08 },
      { r: 'J', s: 'C', x: 56, y: 52, rot: 38, z: 5, scale: 1.08 },
    ],
  },

  // The wild card, and the suit it turns the game into.
  'classic-crazy-eights': {
    cloth: CLOTH.plum,
    mark: { glyph: '8', x: 79, y: 62, size: 76, turn: -8 },
    cards: [
      { r: '8', s: 'H', x: 40, y: 50, rot: -7, z: 4 },
      { r: '5', s: 'C', x: 25, y: 60, rot: -18, z: 2, dim: true },
      { r: 'Q', s: 'D', x: 55, y: 62, rot: 9, z: 3, dim: true },
    ],
  },

  // Switch is Crazy Eights' cousin: the same wild, turned the other way.
  'classic-switch': {
    cloth: CLOTH.teal,
    mark: { glyph: '⇄', x: 74, y: 40, size: 60, turn: 6 },
    cards: [
      { r: '2', s: 'S', x: 38, y: 46, rot: -12, z: 3 },
      { r: '8', s: 'D', x: 52, y: 56, rot: 8, z: 4 },
      { r: 'J', s: 'H', x: 24, y: 60, rot: -22, z: 2, dim: true },
    ],
  },

  // A card being pulled out of somebody else's hand.
  'classic-go-fish': {
    cloth: CLOTH.teal,
    mark: { glyph: '?', x: 62, y: 26, size: 40, turn: 8 },
    cards: [
      { r: '7', s: 'C', x: 22, y: 62, rot: -22, z: 1, back: true },
      { r: '7', s: 'D', x: 34, y: 60, rot: -11, z: 2, back: true },
      { r: '7', s: 'S', x: 46, y: 62, rot: 0, z: 3, back: true },
      { r: '7', s: 'H', x: 70, y: 44, rot: 15, z: 8, scale: 1.12 },
    ],
  },

  // Three of a kind and a run — the two things a meld can be.
  'classic-rummy': {
    cloth: CLOTH.amber,
    cards: [
      { r: '9', s: 'H', x: 20, y: 32, rot: -7, z: 3, scale: .84 },
      { r: '9', s: 'S', x: 31, y: 30, rot: -2, z: 4, scale: .84 },
      { r: '9', s: 'D', x: 42, y: 32, rot: 3, z: 5, scale: .84 },
      { r: '5', s: 'C', x: 56, y: 72, rot: -4, z: 2, scale: .84, dim: true },
      { r: '6', s: 'C', x: 67, y: 70, rot: 1, z: 3, scale: .84, dim: true },
      { r: '7', s: 'C', x: 78, y: 72, rot: 6, z: 4, scale: .84, dim: true },
    ],
  },

  // The knock: one card turned down across the meld to end the hand.
  'classic-gin-rummy': {
    cloth: CLOTH.rust,
    cards: [
      { r: 'K', s: 'H', x: 32, y: 46, rot: -5, z: 2 },
      { r: 'K', s: 'S', x: 44, y: 46, rot: -1, z: 3 },
      { r: 'K', s: 'C', x: 56, y: 46, rot: 3, z: 4 },
      { r: '3', s: 'D', x: 56, y: 66, rot: 84, z: 7 },
    ],
  },

  // Two cards, face to face, nothing else on the table.
  'classic-war': {
    cloth: CLOTH.slate,
    mark: { glyph: '⚔', x: 50, y: 48, size: 52 },
    cards: [
      { r: 'K', s: 'S', x: 28, y: 50, rot: -13, z: 3 },
      { r: 'K', s: 'H', x: 72, y: 50, rot: 13, z: 3 },
      { r: 'A', s: 'D', x: 20, y: 66, rot: -20, z: 1, back: true },
      { r: 'A', s: 'C', x: 80, y: 66, rot: 20, z: 1, back: true },
    ],
  },

  // Climbing: each play has to beat the last, so the cards go up a staircase.
  'classic-president': {
    cloth: CLOTH.ink,
    cards: [
      { r: '5', s: 'C', x: 22, y: 70, rot: -8, z: 1, dim: true },
      { r: '9', s: 'D', x: 38, y: 60, rot: -3, z: 2, dim: true },
      { r: 'J', s: 'H', x: 54, y: 48, rot: 3, z: 3 },
      { r: '2', s: 'S', x: 71, y: 34, rot: 9, z: 5, scale: 1.06 },
    ],
  },

  'classic-undertow': {
    cloth: CLOTH.midnight,
    cards: [
      { r: '4', s: 'H', x: 24, y: 36, rot: 8, z: 1, dim: true },
      { r: '8', s: 'S', x: 40, y: 46, rot: 3, z: 2, dim: true },
      { r: '10', s: 'D', x: 56, y: 58, rot: -3, z: 3 },
      { r: 'A', s: 'C', x: 73, y: 70, rot: -9, z: 5, scale: 1.06 },
    ],
  },

  'classic-trade-winds': {
    cloth: CLOTH.teal,
    mark: { glyph: '⚓', x: 76, y: 32, size: 42, turn: -10 },
    cards: [
      { r: '7', s: 'D', x: 34, y: 48, rot: -14, z: 3 },
      { r: '7', s: 'S', x: 48, y: 56, rot: 4, z: 4 },
      { r: '3', s: 'H', x: 22, y: 64, rot: -24, z: 2, dim: true },
    ],
  },

  // Patience: a column running down in alternating colours, and an ace gone home.
  'classic-klondike': {
    cloth: CLOTH.forest,
    cards: [
      { r: 'A', s: 'S', x: 76, y: 46, rot: 5, z: 6, scale: 1.06 },
      { r: 'K', s: 'H', x: 32, y: 30, rot: -2, z: 1 },
      { r: 'Q', s: 'S', x: 35, y: 45, rot: -1, z: 2 },
      { r: 'J', s: 'D', x: 38, y: 60, rot: 1, z: 3 },
      { r: '10', s: 'C', x: 41, y: 75, rot: 2, z: 4 },
    ],
  },

  // FreeCell: the four cells along the top are the whole game.
  'classic-freecell': {
    cloth: CLOTH.forest,
    cards: [
      { r: 'A', s: 'H', x: 20, y: 24, rot: -3, z: 4, scale: 0.72 },
      { r: '4', s: 'S', x: 40, y: 24, rot: 2, z: 4, scale: 0.72 },
      { r: 'A', s: 'D', x: 62, y: 24, rot: -1, z: 4, scale: 0.72, back: true },
      { r: '9', s: 'C', x: 82, y: 24, rot: 3, z: 4, scale: 0.72, back: true },
      { r: 'Q', s: 'D', x: 40, y: 62, rot: -2, z: 2 },
      { r: 'J', s: 'S', x: 44, y: 76, rot: 1, z: 3 },
    ],
  },

  // Spider: eight columns, and the run you are trying to complete.
  'classic-spider': {
    cloth: CLOTH.ink,
    cards: [
      { r: 'K', s: 'S', x: 22, y: 42, rot: -4, z: 1, back: true, scale: 0.8 },
      { r: 'Q', s: 'S', x: 36, y: 46, rot: -2, z: 2, scale: 0.86 },
      { r: 'J', s: 'S', x: 50, y: 52, rot: 0, z: 3, scale: 0.92 },
      { r: '10', s: 'S', x: 64, y: 58, rot: 2, z: 4, scale: 0.98 },
      { r: '9', s: 'S', x: 78, y: 64, rot: 4, z: 5, scale: 1.04 },
    ],
  },
};

/** A scene for a game nobody has seen before, chosen by what kind of game it is. */
function fallback(def: GameDefinition, id: string): Scene {
  const h = hash(id);
  const cloths = Object.values(CLOTH);
  const cloth = cloths[h % cloths.length];
  const rank = (k: number) => RANKS[hash(`${id}#${k}`) % RANKS.length];
  const suit = (k: number) => (['S', 'H', 'D', 'C'] as Suit[])[(hash(`${id}s${k}`) >>> 3) % 4];

  if (def.solitaire) {
    return { cloth, cards: [0, 1, 2, 3].map((i) => ({
      r: rank(i), s: suit(i), x: 32 + i * 5, y: 30 + i * 15, rot: i - 1.5, z: i,
    })) };
  }
  if (def.war) {
    return { cloth, mark: { glyph: '⚔', x: 50, y: 50, size: 40 }, cards: [
      { r: rank(0), s: suit(0), x: 28, y: 50, rot: -13, z: 3 },
      { r: rank(1), s: suit(1), x: 72, y: 50, rot: 13, z: 3 },
    ] };
  }
  if (def.trick) {
    return trick(cloth, { r: rank(0), s: suit(0), x: 51, y: 50, rot: -3 },
      [[suit(1), rank(1)], [suit(2), rank(2)], [suit(3), rank(3)]]);
  }
  if (def.rummy) {
    return { cloth, cards: [0, 1, 2].map((i) => ({
      r: rank(0), s: (['S', 'H', 'D'] as Suit[])[i], x: 33 + i * 13, y: 50, rot: (i - 1) * 4, z: i + 2,
    })) };
  }
  // A hand, fanned — the shape of everything that is left.
  return { cloth, cards: [0, 1, 2, 3, 4].map((i) => ({
    r: rank(i), s: suit(i), x: 28 + i * 11, y: 52 + Math.abs(i - 2) * 4, rot: (i - 2) * 9, z: i,
  })) };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function GameArt({ def, id }: { def: GameDefinition; id: string }) {
  const scene = SCENES[def.meta.id] ?? SCENES[id] ?? fallback(def, id);

  return (
    <div className="gameart" aria-hidden style={{ ['--cloth' as string]: scene.cloth }}>
      <div className="ga-felt" />
      {scene.mark && (
        <span className="ga-mark" style={markStyle(scene.mark)}>{scene.mark.glyph}</span>
      )}
      {scene.mark2 && (
        <span className="ga-mark" style={markStyle(scene.mark2)}>{scene.mark2.glyph}</span>
      )}
      <div className="ga-stage">
        {scene.cards.map((c, i) => (
          <div
            key={i}
            className={[
              'ga-card',
              c.back ? 'back' : (c.s === 'H' || c.s === 'D' ? 'red' : 'black'),
              c.dim ? 'dim' : '',
            ].join(' ')}
            style={{
              left: `${c.x}%`,
              top: `${c.y}%`,
              zIndex: c.z ?? 0,
              transform: `translate(-50%, -50%) rotate(${c.rot}deg) scale(${c.scale ?? 1})`,
            }}
          >
            {!c.back && (
              <>
                <span className="ga-corner"><b>{c.r}</b><em>{GLYPH[c.s]}</em></span>
                <span className="ga-pip">{GLYPH[c.s]}</span>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="ga-vignette" />
    </div>
  );
}

function markStyle(m: { x: number; y: number; size: number; turn?: number }): React.CSSProperties {
  return {
    left: `${m.x}%`,
    top: `${m.y}%`,
    fontSize: `${m.size}px`,
    transform: `translate(-50%, -50%) rotate(${m.turn ?? 0}deg)`,
  };
}
