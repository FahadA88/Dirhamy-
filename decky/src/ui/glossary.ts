import { GameDefinition } from '../engine/types';
import { kindOf } from '../library/library';

// The words the log and the rules text use without ever explaining. Split in two: terms
// belonging to a whole family (every trick-taking game has a "trick"), and terms belonging to
// one specific game whose rules coined them (Euchre's bowers, Gin's undercut). A game's own
// glossary is its family's list plus whatever its own id adds — never the whole dictionary,
// which would hand a Go Fish player four unrelated definitions of "trump".

const FAMILY_TERMS: Record<string, [string, string][]> = {
  trick: [
    ['Trick', 'One card from each player, played in turn. Whoever wins it leads the next one.'],
    ['Follow suit', 'Play a card in the same suit as the first card played to the trick, if you hold one.'],
    ['Trump', 'A suit that beats every other suit for the hand, regardless of what was led.'],
    ['Void', 'Holding no cards of a suit — the one time you may play anything at all.'],
  ],
  climb: [
    ['Combo', 'A group of cards played together — a pair, a triple, or more, depending on the game.'],
    ['Bomb', 'A combo strong enough to beat any single card or ordinary combo, played out of turn in some games.'],
  ],
  fish: [
    ['Book', 'All four cards of one rank, collected in a single hand.'],
    ['Ask', 'Name a rank you already hold at least one of, and ask a specific opponent for the rest.'],
  ],
  rummy: [
    ['Meld', 'A set (three or more of a rank) or a run (three or more in sequence, one suit) laid down as a group.'],
    ['Deadwood', 'Cards left over that belong to no meld — the number that counts against you.'],
    ['Knock', 'End the hand by showing your melds once your deadwood is low enough.'],
  ],
  war: [
    ['War', 'What happens on a tie: three cards face down each, then a fourth flipped to break it.'],
  ],
  bluff: [
    ['Claim', 'Say what rank a face-down card is — true or not — as you play it.'],
    ['Challenge', 'Call a claim out. Wrong, and the pile is yours; right, and it is the challenger\'s.'],
  ],
  poker: [
    ['Pot', 'Everything bet so far in the hand, won by whoever takes the showdown.'],
    ['Showdown', 'Revealing hands to see who actually wins, once betting is done.'],
  ],
  solitaire: [
    ['Foundation', 'Where a suit is built up from the ace — the four piles you are trying to fill.'],
    ['Tableau', 'The main columns of cards you deal and build down on, the board itself.'],
  ],
};

const GAME_TERMS: Record<string, [string, string][]> = {
  'classic-euchre': [
    ['Bower', 'The jack of trump (right bower) and the same-colour jack (left bower) — the two strongest cards in the hand, above even the ace of trump.'],
    ['Kitty', 'The four cards set aside at the deal, one of which is turned up to start the auction.'],
    ['Going alone', 'Playing a hand without your partner\'s help, for a bigger reward if it works.'],
  ],
  'classic-contract-whist': [
    ['Book', 'Tricks already accounted for before the bid starts counting — some contract games start the promise at book plus a number.'],
    ['Slam', 'Bidding to the very top of the ladder and making it — the biggest single hand available.'],
  ],
  'classic-gin-rummy': [
    ['Gin', 'Knocking with zero deadwood — the biggest win, and the one hand an opponent cannot lay off against.'],
    ['Undercut', 'Beating the knocker\'s own deadwood count with yours — the win flips to you instead.'],
    ['Lay off', 'Adding your own spare cards onto the knocker\'s melds once they knock, lowering your deadwood.'],
  ],
  'classic-hearts': [
    ['Shoot the moon', 'Taking every single penalty card in the hand — instead of scoring the points, you score nothing and everyone else takes them all.'],
    ['Broken', 'Once a heart has been played to a trick, hearts may be led from then on.'],
  ],
  'classic-spades': [
    ['Nil', 'A bid of zero — promising to take no tricks at all, for a large bonus or a large penalty.'],
    ['Bag', 'A trick taken beyond what was bid — harmless alone, but too many add up to a penalty.'],
  ],
  'classic-pit': [
    ['Corner', 'Holding every card of one suit at once — the win condition, with no turns and no waiting for it.'],
  ],
  'classic-kent': [
    ['Signal', 'The private, wordless way a pair agrees to tell each other something the rest of the table cannot read.'],
  ],
};

export function termsFor(def: GameDefinition): { term: string; def: string }[] {
  const family = FAMILY_TERMS[kindOf(def)] ?? [];
  const own = GAME_TERMS[def.meta.id] ?? [];
  return [...family, ...own].map(([term, d]) => ({ term, def: d }));
}
