import { useState } from 'react';
import { Card, GameDefinition } from '../engine/types';
import { CardFace } from './Card';

// Showing a turn instead of describing one.
//
// Rules text is the thing people skip. A worked example is not: three cards and an arrow say
// "the seven of hearts is on the pile, either of these two can go on it, that one cannot" faster
// and more exactly than a paragraph can.
//
// Everything here is derived from the GameDefinition rather than written per game, so a game
// somebody built this morning — or one the writer produced from a sentence — gets the same
// explanation as a classic. Where a family has no honest example, nothing is drawn: a made-up
// diagram would teach the wrong game.

/** A card that exists only to be looked at. Real Card shape so CardFace renders it properly. */
function c(rank: string, suit: string): Card {
  return { id: `demo-${rank}${suit}`, rank: rank as Card['rank'], suit: suit as Card['suit'] };
}

interface Panel {
  caption: string;
  /** Cards on the table side of the example. */
  board: { card: Card; label?: string }[];
  /** Cards in the hand side, each marked as allowed or not. */
  choices?: { card: Card; ok: boolean; why: string }[];
}

function panelsFor(def: GameDefinition): Panel[] {
  const fam = def.meta.family;

  if (def.trick || fam === 'trick-taking') {
    const trumpNamed = !!def.trick?.auction || !!def.trick?.numericAuction;
    const trump = def.trick?.trump && def.trick.trump !== 'none' ? def.trick.trump : null;
    return [
      {
        caption: 'A heart was led, so play a heart if you hold one.',
        board: [{ card: c('9', 'H'), label: 'led' }],
        choices: [
          { card: c('K', 'H'), ok: true, why: 'follows suit, and beats the nine' },
          { card: c('3', 'H'), ok: true, why: 'follows suit, but loses' },
          { card: c('A', 'S'), ok: false, why: 'you still hold a heart' },
        ],
      },
      {
        caption: trump
          ? `With no hearts left you may play anything — and ${suitWord(trump)} beats every other suit.`
          : trumpNamed
            ? 'With no hearts left you may play anything. Whatever the auction named as trump beats every other suit.'
            : 'With no hearts left you may play anything, but only a heart can win this trick.',
        board: [{ card: c('9', 'H'), label: 'led' }],
        choices: [
          { card: c('2', trump ?? 'S'), ok: true, why: trump ? 'trump — takes the trick' : 'legal, but cannot win' },
          { card: c('A', 'C'), ok: true, why: 'legal, but cannot win' },
        ],
      },
    ];
  }

  if (def.climb) {
    return [{
      caption: 'Beat the group on the pile with the same number of cards, or pass.',
      board: [{ card: c('7', 'C') }, { card: c('7', 'D') }, { card: c('7', 'H'), label: 'on the pile' }],
      choices: [
        { card: c('9', 'S'), ok: true, why: 'part of a higher triple' },
        { card: c('K', 'H'), ok: false, why: 'a single cannot beat a triple' },
      ],
    }];
  }

  if (def.fish) {
    return [{
      caption: 'Ask for a rank you already hold. Guess right and you take every one they have.',
      board: [{ card: c('Q', 'S'), label: 'in your hand' }],
      choices: [
        { card: c('Q', 'H'), ok: true, why: 'you may ask for queens' },
        { card: c('4', 'D'), ok: false, why: 'you hold no fours' },
      ],
    }];
  }

  if (def.rummy) {
    return [
      {
        caption: 'A set is three or more of the same rank.',
        board: [{ card: c('8', 'C') }, { card: c('8', 'H') }, { card: c('8', 'S') }],
      },
      {
        caption: 'A run is three or more in order, all one suit.',
        board: [{ card: c('4', 'D') }, { card: c('5', 'D') }, { card: c('6', 'D') }],
      },
    ];
  }

  if (def.war) {
    return [{
      caption: 'Both flip. The higher card takes the pair. Equal ranks mean war.',
      board: [{ card: c('J', 'D'), label: 'yours' }, { card: c('7', 'C'), label: 'theirs' }],
    }];
  }

  if (def.bluff) {
    return [{
      caption: 'Say a rank as you play face down. It need not be true — but anyone may call it.',
      board: [{ card: c('K', 'S'), label: 'you say “two kings”' }, { card: c('3', 'C'), label: 'what you played' }],
      choices: [
        { card: c('K', 'H'), ok: true, why: 'a true claim is safe if challenged' },
        { card: c('3', 'C'), ok: true, why: 'a lie wins the tempo — if nobody calls it' },
      ],
    }];
  }

  if (def.reflex) {
    const ranks = def.reflex.slapRanks ?? [];
    return [{
      caption: ranks.length
        ? `Cards turn over one at a time. Slap the pile the moment ${ranks.join(' or ')} appears — first hand wins it.`
        : 'Cards turn over one at a time. Slap the pile the moment the trigger appears — first hand wins it.',
      board: [{ card: c(ranks[0] ?? 'J', 'H'), label: 'slap!' }, { card: c('6', 'C'), label: 'do not' }],
    }];
  }

  if (def.poker) {
    return [{
      caption: 'Bet on the hand you were dealt, then show it. Best hand takes the pot.',
      board: [{ card: c('Q', 'H') }, { card: c('Q', 'S') }, { card: c('Q', 'D'), label: 'three of a kind' }],
      choices: [
        { card: c('A', 'C'), ok: true, why: 'raise, call or fold — the cards do not change' },
      ],
    }];
  }

  if (def.pit) {
    return [{
      caption: 'No turns. Offer a number of one suit for another, and anyone holding it may take it.',
      board: [{ card: c('5', 'C') }, { card: c('9', 'C'), label: 'two clubs offered' }],
      choices: [
        { card: c('K', 'D'), ok: true, why: 'holding diamonds, you can accept' },
        { card: c('2', 'C'), ok: false, why: 'they are offering clubs, not asking for them' },
      ],
    }];
  }

  // A set game's cards are not playing cards, so its example cannot be drawn with them. The
  // rules panel shows the board itself instead, which is a better teacher anyway.
  if (def.set) return [];

  if (def.solitaire) {
    return [
      {
        caption: 'Columns build downward, alternating colour.',
        board: [{ card: c('9', 'S') }, { card: c('8', 'H') }, { card: c('7', 'C') }],
      },
      {
        caption: 'Foundations build upward from the ace, one suit each.',
        board: [{ card: c('A', 'D') }, { card: c('2', 'D') }, { card: c('3', 'D') }],
      },
    ];
  }

  // The shedding family, and anything built from it.
  const matchSuit = def.actions.some((a) => JSON.stringify(a).includes('suitMatches'))
    || fam === 'shedding-matching';
  if (matchSuit || fam === 'shedding-matching') {
    return [{
      caption: 'Play a card that matches the top of the pile — by rank or by suit.',
      board: [{ card: c('7', 'H'), label: 'on the pile' }],
      choices: [
        { card: c('7', 'S'), ok: true, why: 'same rank' },
        { card: c('K', 'H'), ok: true, why: 'same suit' },
        { card: c('3', 'C'), ok: false, why: 'matches neither' },
      ],
    }];
  }

  return [];
}

function suitWord(s: string): string {
  return ({ C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' } as Record<string, string>)[s] ?? s;
}

/*
  Worklist #61: "Rules are read, never played... None has a scripted three-card position you can
  actually play, which is how anybody has ever learnt a trick game." The panel below already had
  everything a real teaching moment needs — a scripted position and, per card, whether it is
  legal and why — it just showed the answer before anyone had made a choice. Now it asks first: a
  choice is a real button, the verdict stays hidden until one is tapped, and only the card tapped
  is marked right there — same as a real trick, where you find out what you played before you see
  what everyone else did.
*/
function DiagramPanel({ p }: { p: Panel }) {
  const [picked, setPicked] = useState<number | null>(null);
  const answer = picked !== null ? p.choices?.[picked] : undefined;

  return (
    <figure className="dg-panel">
      <div className="dg-row">
        <div className="dg-board">
          {p.board.map((b, j) => (
            <span key={j} className="dg-card">
              <CardFace card={b.card} />
              {b.label && <em>{b.label}</em>}
            </span>
          ))}
        </div>
        {p.choices && (
          <>
            <span className="dg-arrow" aria-hidden="true">↓</span>
            <div className="dg-choices">
              {p.choices.map((ch, j) => {
                const isPicked = picked === j;
                return (
                  <button
                    key={j}
                    type="button"
                    className={`dg-card dg-choice ${isPicked ? (ch.ok ? 'yes' : 'no') : ''}`}
                    aria-label={`Play ${ch.card.rank} of ${ch.card.suit}`}
                    aria-pressed={isPicked}
                    onClick={() => setPicked(j)}
                  >
                    <CardFace card={ch.card} />
                    {isPicked && <b aria-hidden="true">{ch.ok ? '✓' : '✕'}</b>}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
      <figcaption>
        {p.caption}
        {answer && (
          <span className={`dg-verdict ${answer.ok ? 'yes' : 'no'}`}>
            {' '}{answer.ok ? 'Right' : 'Not quite'} — {answer.why}.
          </span>
        )}
      </figcaption>
      {picked !== null && (
        <button type="button" className="ghost sm dg-again" onClick={() => setPicked(null)}>Try again</button>
      )}
    </figure>
  );
}

export function GameDiagram({ def }: { def: GameDefinition }) {
  const panels = panelsFor(def);
  if (panels.length === 0) return null;

  return (
    <div className="diagram">
      {panels.map((p, i) => <DiagramPanel key={i} p={p} />)}
    </div>
  );
}
