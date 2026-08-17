import { GameDefinition } from '../engine/types';

// Every game gets a face made of cards.
//
// A grid of paragraphs is a catalogue; a grid of dealt hands is a games shelf. So each entry
// shows a small arrangement of real cards instead of a description — fanned for a game you hold
// a hand in, spread for tricks, stacked for patience, split for war. The arrangement tells you
// what kind of game it is before you have read a single word, which is the point.
//
// The cards are picked deterministically from the game's id, so a game always wears the same
// face and you start recognising it by shape.

const SUITS = ['S', 'H', 'D', 'C'] as const;
const GLYPH: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const FACE_RANKS = ['A', 'K', 'Q', 'J', '10', '9', '8', '7', '6', '5', '4', '3', '2'];

type Shape = 'fan' | 'spread' | 'stack' | 'duel';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * The cards a game wears.
 *
 * Not random: each family gets the arrangement it actually produces at the table. Patience is a
 * descending alternating-colour run, because that is what a tableau column is. A trick is one
 * card from each of four suits. A hand is a mixed spread you would fan. War is two cards facing
 * each other. The deal is stable per game, so a game always wears the same face.
 */
function pick(id: string, n: number, shape: Shape): { rank: string; suit: string }[] {
  const h = hash(id);

  if (shape === 'stack') {
    const top = 3 + (h % 7);                       // start somewhere in the middle of the deck
    const startRed = (h >>> 5) % 2 === 0;
    return Array.from({ length: n }, (_, i) => ({
      rank: FACE_RANKS[(top + i) % FACE_RANKS.length],
      suit: (startRed === (i % 2 === 0)) ? (i % 4 < 2 ? 'H' : 'D') : (i % 4 < 2 ? 'S' : 'C'),
    }));
  }

  if (shape === 'spread') {
    const off = h % 4;
    return Array.from({ length: n }, (_, i) => ({
      rank: FACE_RANKS[hash(`${id}t${i}`) % FACE_RANKS.length],
      suit: SUITS[(off + i) % 4],                  // one from each suit, the shape of a trick
    }));
  }

  if (shape === 'duel') {
    return [
      { rank: FACE_RANKS[h % FACE_RANKS.length], suit: 'S' },
      { rank: FACE_RANKS[(h >>> 7) % FACE_RANKS.length], suit: 'H' },
    ];
  }

  // A hand: mixed, and sorted the way somebody would hold it.
  const cards = Array.from({ length: n }, (_, i) => {
    const c = hash(`${id}h${i}`);
    return { rank: FACE_RANKS[c % FACE_RANKS.length], suit: SUITS[(c >>> 9) % 4] };
  });
  return cards.sort((a, b) => FACE_RANKS.indexOf(a.rank) - FACE_RANKS.indexOf(b.rank));
}

function shapeOf(def: GameDefinition): Shape {
  if (def.solitaire) return 'stack';
  if (def.war) return 'duel';
  if (def.trick) return 'spread';
  return 'fan';
}

export function GameArt({ def, id }: { def: GameDefinition; id: string }) {
  const shape = shapeOf(def);
  const cards = pick(id, shape === 'duel' ? 2 : shape === 'stack' ? 4 : 5, shape);

  return (
    <div className={`gameart shape-${shape}`} aria-hidden>
      <div className="ga-felt" />
      {cards.map((c, i) => {
        const n = cards.length;
        // Fanned hands rotate around a centre; everything else steps sideways or down.
        const mid = (n - 1) / 2;
        const style: React.CSSProperties =
          shape === 'fan'
            ? { transform: `rotate(${(i - mid) * 10}deg) translateY(${Math.abs(i - mid) * 5}px)`, marginLeft: i === 0 ? 0 : -14 }
            : shape === 'spread'
              // Tricks land in a row, each one just clear of the last so every pip shows.
              ? { transform: `translateY(${(i % 2) * -9}px) rotate(${(i - mid) * 3}deg)`, marginLeft: i === 0 ? 0 : -8 }
              : shape === 'stack'
                // Patience steps down and across, the way a real tableau does.
                ? { transform: `translate(${i * 9}px, ${i * 10 - 14}px)`, marginLeft: i === 0 ? 0 : -34, zIndex: i }
                : { transform: `rotate(${i === 0 ? -8 : 8}deg)`, marginLeft: i === 0 ? 0 : 10 };

        return (
          <div key={i} className={`ga-card ${c.suit === 'H' || c.suit === 'D' ? 'red' : 'black'}`} style={style}>
            <span className="ga-corner">
              <b>{c.rank}</b>
              <em>{GLYPH[c.suit]}</em>
            </span>
            <span className="ga-pip">{GLYPH[c.suit]}</span>
          </div>
        );
      })}
    </div>
  );
}
