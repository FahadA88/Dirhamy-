import { Card, GameDefinition, Rank, Suit } from './types';

const SUITS: Suit[] = ['C', 'D', 'H', 'S'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export function buildDeck(def: GameDefinition): Card[] {
  // A deck built from properties rather than ranks and suits: every combination, once each.
  // The synthetic rank and suit exist so the rest of the engine — sorting, logging, redaction —
  // keeps working without a second card type running through all of it.
  if (def.deck.base === 'attributes') {
    const attrs = def.deck.attributes ?? [];
    if (attrs.length === 0) return [];
    let combos: Record<string, string>[] = [{}];
    for (const a of attrs) {
      combos = combos.flatMap((c) => a.values.map((v) => ({ ...c, [a.name]: v })));
    }
    return combos.map((attrs2, i) => ({
      id: `A${i}`,
      rank: String(i + 1) as Card['rank'],
      suit: 'JOKER' as Card['suit'],
      attrs: attrs2,
    }));
  }

  const copies = Math.max(1, def.deck.deckCount ?? 1);
  const excluded = new Set(def.deck.excludeRanks ?? []);
  // Whole suits struck out. A pack of one suit is not a quarter of a game — it is a game where
  // every card of a rank is interchangeable, which changes what the rules mean.
  const excludedSuits = new Set(def.deck.excludeSuits ?? []);
  // Individual cards struck out of the pack, by the same suit+rank key the rest of the engine
  // uses to name one card. Removing a rank takes all four; this takes exactly the one.
  const excludedCards = new Set(def.deck.excludeCards ?? []);
  const jokers = def.deck.includeJokers ? Math.max(0, Math.round(def.deck.jokerCount ?? 2)) : 0;
  const cards: Card[] = [];
  for (let c = 0; c < copies; c++) {
    const sfx = c === 0 ? '' : `#${c}`;
    for (const suit of SUITS) {
      if (excludedSuits.has(suit)) continue;
      for (const rank of RANKS) {
        if (excluded.has(rank)) continue;
        if (excludedCards.has(`${suit}${rank}`)) continue;
        cards.push({ id: `${suit}${rank}${sfx}`, rank, suit });
      }
    }
    for (let j = 0; j < jokers; j++) {
      cards.push({ id: `JOKER${j + 1}${sfx}`, rank: 'JOKER', suit: 'JOKER' });
    }
  }
  return cards;
}

/** The suit+rank key that names one card across the engine: "SQ", "H10", "C2". */
export function cardKey(card: Card): string {
  return `${card.suit}${card.rank}`;
}

// Red (hearts/diamonds) vs black (clubs/spades); jokers are their own colorless class.
export function cardColor(card: Card): 'red' | 'black' | 'none' {
  if (card.suit === 'H' || card.suit === 'D') return 'red';
  if (card.suit === 'C' || card.suit === 'S') return 'black';
  return 'none';
}

// Which tags apply to a card, per the definition's deck.tags. A tag can name whole ranks
// ("every 8 is wild") or individual cards ("only the queen of spades"); either match counts.
export function cardTags(def: GameDefinition, card: Card): string[] {
  const tags: string[] = [];
  const key = cardKey(card);
  for (const [tag, spec] of Object.entries(def.deck.tags)) {
    // `cards` mostly names a suit+rank so every physical copy across a multi-deck shoe gets the
    // tag together — but two jokers share that same suit+rank and have nothing else to tell
    // them apart by, so a tag naming a card's own unique id reaches the one copy, not the pair.
    if (spec.ranks.includes(card.rank) || spec.cards?.includes(key) || spec.cards?.includes(card.id)) tags.push(tag);
  }
  return tags;
}

export const SUIT_SYMBOLS: Record<string, string> = {
  C: '♣', D: '♦', H: '♥', S: '♠', JOKER: '★',
};
