import { CustomRule, Effect, GameDefinition, HandQuery, Predicate, RuleHook, RuleValue } from '../engine/types';
import { SUIT_SYMBOLS } from '../engine/deck';

// Rules are data, which means they can be read back to the person who wrote them. Everything a
// builder can express has a sentence here, so nobody has to interpret a tree of JSON to know
// what their game does — and so a player can be shown the same sentence in the rules panel.
//
// The contract: explainRule() never throws and never returns an empty string. An author who
// half-finishes a rule gets a half-sentence, not a blank.

const SUIT_WORDS: Record<string, string> = { C: 'clubs', D: 'diamonds', H: 'hearts', S: 'spades' };

const HOOK_WORDS: Record<RuleHook, string> = {
  handStart: 'When a hand is dealt',
  turnStart: 'At the start of a turn',
  turnEnd: 'After a player finishes their turn',
  cardPlayed: 'When a card is played',
  cardDrawn: 'When a player draws',
  trickWon: 'When a trick is won',
  drawPileEmpty: 'When the draw pile runs out',
  trickLed: 'When a trick is led',
  handEnd: 'When the hand ends',
  matchEnd: 'When the match is decided',
  meldLaid: 'When a meld goes down',
  bidMade: 'When a player bids',
  playerOut: 'When a player goes out',
};

const WHO: Record<string, string> = {
  $me: 'the player',
  $next: 'the next player',
  $prev: 'the previous player',
  $all: 'everyone',
  $others: 'every other player',
};

const OPS: Record<string, string> = {
  '==': 'is', '!=': 'is not', '>': 'is more than',
  '>=': 'is at least', '<': 'is less than', '<=': 'is at most',
};

export function suitWord(s: string): string {
  return SUIT_WORDS[s] ?? s;
}

// ---------- values ----------

export function explainValue(v: RuleValue): string {
  if (!v || typeof v !== 'object') return 'something';
  if ('lit' in v) return typeof v.lit === 'string' && SUIT_WORDS[v.lit] ? suitWord(v.lit) : String(v.lit);
  if ('stateVar' in v) return `${v.per ? `${WHO[v.per] ?? v.per}'s ` : 'the '}${spaced(v.stateVar)}`;
  if ('count' in v) return v.count === '$hand' ? 'the number of cards in their hand' : `the number of cards in ${spaced(v.count)}`;
  if ('cardProp' in v) {
    return v.cardProp === 'value' ? "the card's value" : `the card's ${v.cardProp}`;
  }
  if ('score' in v) return `${WHO[v.score] ?? v.score}'s points this hand`;
  if ('matchScore' in v) return `${WHO[v.matchScore] ?? v.matchScore}'s match score`;
  if ('tricksWon' in v) return `${WHO[v.tricksWon] ?? v.tricksWon}'s tricks won`;
  if ('handNumber' in v) return 'the hand number';
  if ('playerCount' in v) return 'the number of players';
  if ('add' in v) return `${explainValue(v.add[0])} plus ${explainValue(v.add[1])}`;
  if ('sub' in v) return `${explainValue(v.sub[0])} minus ${explainValue(v.sub[1])}`;
  if ('mul' in v) return `${explainValue(v.mul[0])} times ${explainValue(v.mul[1])}`;
  if ('min' in v) return `the smaller of ${explainValue(v.min[0])} and ${explainValue(v.min[1])}`;
  if ('max' in v) return `the larger of ${explainValue(v.max[0])} and ${explainValue(v.max[1])}`;
  return 'something';
}

/** A suit clause plus a rank clause, in either order, is a single card. */
function oneNamedCard(parts: Predicate[]): string | null {
  if (parts.length !== 2) return null;
  const suit = parts.find((x) => 'suitIn' in x && x.suitIn.length === 1) as { suitIn: string[] } | undefined;
  const rank = parts.find((x) => 'rankIn' in x && x.rankIn.length === 1) as { rankIn: string[] } | undefined;
  if (!suit || !rank) return null;
  // rankWord carries its own article ("a Queen"), which reads wrong after "the".
  return `${bareRank(rank.rankIn[0])} of ${suitWord(suit.suitIn[0])}`;
}

// ---------- conditions ----------

export function explainPredicate(p: Predicate | undefined): string {
  if (!p) return 'always';
  if ('always' in p) return 'always';
  if ('any' in p) return p.any.map(explainPredicate).join(' or ');
  if ('all' in p) {
    // "a spade AND a queen" is how the builder has to SAY one card, but not how anybody reads
    // one. Spotting that exact pair back out lets the sentence name the card instead.
    const named = oneNamedCard(p.all);
    if (named) return `the card is the ${named}`;
    return p.all.map(explainPredicate).join(' and ');
  }
  if ('not' in p) return `it is not the case that ${explainPredicate(p.not)}`;
  if ('cardHasTag' in p) return `the card is ${aOrAn(p.cardHasTag)} card`;
  if ('existsLegal' in p) return `the player could legally ${spaced(p.existsLegal)}`;
  if ('rankIn' in p) return `the card is ${listOf(p.rankIn.map(rankWord))}`;
  if ('suitIn' in p) return `the card is ${listOf(p.suitIn.map(suitWord))}`;
  if ('colorIs' in p) return `the card is ${p.colorIs}`;
  if ('isFirstTurn' in p) return 'it is the first play of the hand';
  if ('listHas' in p) return `${spaced(p.listHas.var)} already contains ${explainValue(p.listHas.value)}`;
  if ('handHas' in p) return explainHandQuery(p.handHas);
  if ('cmp' in p) return `${explainValue(p.cmp.left)} ${OPS[p.cmp.op] ?? p.cmp.op} ${explainValue(p.cmp.right)}`;
  if ('matches' in p) {
    const m = p.matches;
    const what = m.cardProp === 'color' ? 'colour' : m.cardProp;
    return `the card's ${what} matches the pile`;
  }
  return 'a condition';
}

function explainHandQuery(q: HandQuery): string {
  const n = q.minCount ?? 1;
  const bits: string[] = [];
  if (q.rank) bits.push(rankWord(q.rank));
  if (q.suit) bits.push(suitWord(q.suit));
  if (q.color) bits.push(q.color);
  const what = bits.length ? bits.join(' ') : 'card';
  return `the player holds at least ${n} ${what}${n === 1 ? '' : 's'}`;
}

// ---------- effects ----------

export function explainEffect(e: Effect): string {
  switch (e.op) {
    case 'move':
      return e.card === '$target' ? `move the card to ${spaced(e.to)}`
        : `move ${e.count ?? 1} card${(e.count ?? 1) === 1 ? '' : 's'} from ${spaced(e.from ?? 'the pile')} to ${spaced(e.to)}`;
    case 'setState': return `set ${spaced(e.var)} to ${e.value}`;
    case 'if': {
      const t = e.then.map(explainEffect).join(', then ');
      const f = e.else?.length ? `; otherwise ${e.else.map(explainEffect).join(', then ')}` : '';
      return `if ${explainPredicate(e.cond)}, ${t}${f}`;
    }
    case 'chooseSuit': return 'let the player name a suit';
    case 'reverseOrder': return 'reverse the direction of play';
    case 'skipNext': return 'skip the next player';
    case 'forceDraw': return `make the next player draw ${e.count}`;
    case 'reshuffleDiscardInto': return 'shuffle the discards back into the draw pile';
    case 'extraTurn': return 'give the player another turn';
    case 'drawUntilPlayable': return 'draw until a playable card turns up';
    case 'passCards': return `everyone passes a card ${e.direction}`;
    case 'addScore': return `give ${WHO[e.player] ?? e.player} ${explainValue(e.amount)} point${isOne(e.amount) ? '' : 's'}`;
    case 'setVarNum': {
      const whose = e.per ? ` (${WHO[e.per] ?? e.per}'s own)` : '';
      const lasts = e.keep ? ', kept for the whole match' : '';
      return `set ${spaced(e.var)}${whose} to ${explainValue(e.value)}${lasts}`;
    }
    case 'announce': return `announce “${e.text}”`;
    case 'endHand':
      return e.winner === undefined ? 'end the hand'
        : e.winner === 'highestScore' ? 'end the hand, highest score wins'
        : e.winner === 'lowestScore' ? 'end the hand, lowest score wins'
        : `end the hand, ${WHO[e.winner] ?? e.winner} wins`;
    case 'swapHands': return `swap hands with the ${e.withPlayer} player`;
    case 'moveMany': return `move ${explainValue(e.count)} cards from ${spaced(e.from)} to ${spaced(e.to)}`;
    case 'drawTo': return `${WHO[e.player] ?? e.player} draws ${explainValue(e.count)}`;
    case 'revealHand': return `${WHO[e.player] ?? e.player} reveals their hand`;
    case 'skipTo': return `play passes straight to the ${e.player} player`;
    case 'stopRules': return 'stop — no rule below this one runs';
    case 'runRule': return `also run the rule called ${e.rule}`;
    case 'appendVar': return `add ${explainValue(e.value)} to the ${spaced(e.var)} list`;
    default: return 'do something';
  }
}

// ---------- whole rules ----------

/** One sentence for one author-written rule. Never empty, never throws. */
export function explainRule(rule: CustomRule): string {
  try {
    const when = HOOK_WORDS[rule.when] ?? 'When something happens';
    const tag = rule.cardHasTag ? ` that is ${aOrAn(rule.cardHasTag)} card` : '';
    const cond = rule.if && !('always' in rule.if) ? `, and ${explainPredicate(rule.if)}` : '';
    const does = rule.then.length ? rule.then.map(explainEffect).join(', then ') : 'nothing happens';
    return capitalize(`${when}${tag}${cond}: ${does}.`);
  } catch {
    return 'This rule could not be described.';
  }
}

/** The whole game, in sentences — what the builder shows and the rules panel prints. */
export function explainGame(def: GameDefinition): string[] {
  const out: string[] = [];
  const p = def.meta.players;
  out.push(`${def.meta.name} is for ${p.min === p.max ? p.min : `${p.min}–${p.max}`} players.`);

  if (def.solitaire) {
    const s = def.solitaire;
    out.push(`Deal ${s.columns} columns and build ${describeBuild(s.build)}.`);
    out.push(s.foundations > 0 ? `Win by filling all ${s.foundations} foundations.` : 'Win by clearing every column.');
  } else if (def.trick) {
    out.push(def.trick.mustFollowSuit ? 'Follow the suit that was led if you can.' : 'Play any card you like to a trick.');
    if (def.trick.auction) out.push('Trump is decided by bidding at the start of each hand.');
    else if (def.trick.trump && def.trick.trump !== 'none') out.push(`${capitalize(suitWord(def.trick.trump))} are trump.`);
    out.push(def.trick.scoreBy === 'penalty' ? 'Points are bad — take as few as you can.'
      : def.trick.scoreBy === 'fewestTricks' ? 'Take as few tricks as possible.' : 'Take as many tricks as possible.');
  } else if (def.climb) {
    out.push('Beat the last play or pass. When everyone passes, the pile clears.');
    out.push('First player out of cards wins.');
  } else if (def.fish) {
    out.push(`Ask an opponent for a rank you already hold. Collect ${def.fish.bookSize} of a kind to make a book.`);
  } else if (def.rummy) {
    out.push(`Make sets of ${def.rummy.setMin}+ and runs of ${def.rummy.runMin}+.`);
    if (def.rummy.knock) out.push('Melds stay hidden; end the hand by knocking.');
  } else if (def.war) {
    out.push('Both players flip. Higher card takes both. Ties mean war.');
  } else if (def.bluff) {
    out.push('Play 1-4 cards face down, claiming a rank — true or not. Anyone else may call it a lie.');
    out.push('Whoever is wrong takes the whole center pile. First to empty their hand, unclaimed, wins.');
  } else if (def.reflex) {
    const ranks = def.reflex.slapRanks.join(', ') || 'nothing by rank';
    out.push(`Flip a card each turn onto the shared pile. When the top card is a ${ranks}${def.reflex.slapMatch ? ', or the top two match,' : ''}, anyone may slap to take it.`);
    out.push('Last player still holding cards wins.');
  } else if (def.layout) {
    const cfg = def.layout;
    out.push(`${cfg.handSize} cards each, and ${cfg.piles + cfg.cornerPiles} piles in the middle that everybody plays into.`);
    out.push(`Draw one card at the start of your turn, then place as many as you can. Build down ${cfg.build === 'alt-color' ? 'in alternating colours' : cfg.build === 'same-suit' ? 'in suit' : 'by rank, any suit'}.`);
    out.push(`${cfg.cornerPiles} of the piles start empty and only a ${cfg.cornerRank} may open one — which is why holding a ${cfg.cornerRank} is worth more than the card itself.`);
    if (cfg.movePiles) out.push('You can also lift a whole pile onto another it continues, which frees a space for whoever gets there first.');
    out.push('First to empty their hand wins.');
  } else if (def.kent) {
    out.push(`${def.kent.handSize} cards each and ${def.kent.poolSize} face up in the middle. There are no turns: swap one of yours for one of the table's whenever you like, and turn the middle over when nobody wants it.`);
    out.push('Partners sit opposite. Collect four of a kind and a tell goes up at your seat for the whole table to see — if your partner reads it first your pair takes the round.');
    out.push(`An opponent who spots the signal first calls it off and the letter goes to you. ${def.kent.letters.split('').join('-')} and that pair is out.`);
  } else if (def.poker) {
    out.push(`${def.poker.handSize} cards each. Check, bet, call, raise or fold in one round of betting, then a showdown.`);
    if (def.poker.smallBlind || def.poker.bigBlind) out.push(`Blinds: ${def.poker.smallBlind}/${def.poker.bigBlind}.`);
    out.push((def.poker.hands ?? 1) > 1
      ? `Everyone starts on ${def.poker.startingChips} chips and keeps their stack between hands. ${def.poker.hands} hands, and the biggest stack takes the table — run out before then and it ends there.`
      : `Everyone starts on ${def.poker.startingChips} chips.`);
    out.push('No side pots — going short on chips means folding, not a partial call.');
  } else if (def.pit) {
    out.push('No turns. Offer to trade cards of one suit for another, or accept anyone else\'s open offer, at any time.');
    out.push(`Corner the market — ${def.pit.cornerSize} cards of one suit — and you win. At a table too crowded to hold that many, a whole hand of one suit does it; the target is shown above your cards either way.`);
  } else {
    out.push('Play a card that matches the pile, or draw. First to empty their hand wins.');
  }

  if (def.scoring.target) out.push(`Play to ${def.scoring.target} points.`);

  for (const rule of def.rules ?? []) {
    if (rule.enabled === false) continue;
    out.push(explainRule(rule));
  }
  return out;
}

function describeBuild(b: string): string {
  return b === 'alt-color' ? 'down in alternating colours'
    : b === 'same-suit' ? 'down in suit'
    : b === 'any-suit' ? 'down, any suit'
    : 'down';
}

// ---------- small helpers ----------

function spaced(id: string): string {
  return id.replace(/[:_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase();
}
function capitalize(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1); }
function aOrAn(w: string): string { return /^[aeiou]/i.test(w) ? `an ${w}` : `a ${w}`; }
function listOf(items: string[]): string {
  if (items.length === 0) return 'anything';
  if (items.length === 1) return `${items[0]}`;
  return `${items.slice(0, -1).join(', ')} or ${items[items.length - 1]}`;
}
function rankWord(r: string): string {
  return { A: 'an Ace', J: 'a Jack', Q: 'a Queen', K: 'a King' }[r] ?? `a ${r}`;
}
/** The rank on its own, for sentences that supply their own article. */
function bareRank(r: string): string {
  return { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King', JOKER: 'Joker' }[r] ?? r;
}
function isOne(v: RuleValue): boolean { return 'lit' in v && v.lit === 1; }

/** Suit glyphs for anywhere a sentence wants the symbol instead of the word. */
export const SUIT_GLYPH = SUIT_SYMBOLS;
