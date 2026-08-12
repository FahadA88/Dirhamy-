import { Card, GameDefinition, Rank, Suit } from './types';

const SUITS: Suit[] = ['C', 'D', 'H', 'S'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function buildDeck(def: GameDefinition): Card[] {
  const cards: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      cards.push({ id: `${suit}${rank}`, rank, suit });
    }
  }
  if (def.deck.includeJokers) {
    cards.push({ id: 'JOKER1', rank: 'JOKER', suit: 'JOKER' });
    cards.push({ id: 'JOKER2', rank: 'JOKER', suit: 'JOKER' });
  }
  return cards;
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
