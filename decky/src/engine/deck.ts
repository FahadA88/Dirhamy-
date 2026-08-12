import { Card, GameDefinition, Rank, Suit } from './types';

const SUITS: Suit[] = ['C', 'D', 'H', 'S'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function buildDeck(def: GameDefinition): Card[] {
  const copies = Math.max(1, def.deck.deckCount ?? 1);
  const excluded = new Set(def.deck.excludeRanks ?? []);
  const cards: Card[] = [];
  for (let c = 0; c < copies; c++) {
    const sfx = c === 0 ? '' : `#${c}`;
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        if (excluded.has(rank)) continue;
        cards.push({ id: `${suit}${rank}${sfx}`, rank, suit });
      }
    }
    if (def.deck.includeJokers) {
      cards.push({ id: `JOKER1${sfx}`, rank: 'JOKER', suit: 'JOKER' });
      cards.push({ id: `JOKER2${sfx}`, rank: 'JOKER', suit: 'JOKER' });
    }
  }
  return cards;
}

// Red (hearts/diamonds) vs black (clubs/spades); jokers are their own colorless class.
export function cardColor(card: Card): 'red' | 'black' | 'none' {
  if (card.suit === 'H' || card.suit === 'D') return 'red';
  if (card.suit === 'C' || card.suit === 'S') return 'black';
  return 'none';
}

// Which tags apply to a card, per the definition's deck.tags.
export function cardTags(def: GameDefinition, card: Card): string[] {
  const tags: string[] = [];
  for (const [tag, spec] of Object.entries(def.deck.tags)) {
    if (spec.ranks.includes(card.rank)) tags.push(tag);
  }
  return tags;
}

export const SUIT_NAMES: Record<string, string> = {
  C: 'Clubs', D: 'Diamonds', H: 'Hearts', S: 'Spades', JOKER: 'Joker',
};

export const SUIT_SYMBOLS: Record<string, string> = {
  C: '♣', D: '♦', H: '♥', S: '♠', JOKER: '★',
};
