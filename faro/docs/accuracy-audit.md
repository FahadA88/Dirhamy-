# Accuracy audit: 55 shipped games

Phase 6 wrote the divergence table below, **before** anything was changed. Phase 7 fixed
everything it marked wrong; what was done is recorded under "What was done about them".

The table itself is left as it was written, in the present tense, because it is the argument
the fixes answer — rewriting it to say "used to" would lose the reason any of this happened.

## How this was done

`npm run rulesheet` (scripts/rulesheet.ts) prints what every game in the catalog actually
implements — deck, deal, flow, scoring and its family config — read straight out of the shipped
`GameDefinition`. Auditing from memory of what the code does is an audit of the memory, so every
line below is written against that dump rather than against an impression of the source.

Each game is then checked against reference rules. pagat.com is blocked by this environment's
network egress policy, so where a check needed a source it was made through web search against
Pagat's own pages plus Bicycle, Wikipedia and Britannica; the specific claims that turned into
findings are cited at the bottom.

## Verdicts

- **OK** — matches the reference rules as far as the definition expresses them.
- **SIMPLIFIED** — knowingly narrower than the real game, and defensible: the engine has no way
  to say it, or the real rule needs a mechanic no other game would use. These are not bugs, but
  they should be admitted in the game's own description, and several are not.
- **WRONG** — the game states a rule it does not implement, or implements one the reference
  rules contradict. These are the fixing list.

| Game | Verdict | Note |
|---|---|---|
| Crazy Eights | OK | 5 each, 7 for two; 8 wild; 8=50, court=10, A=1, rest face value. |
| Switch | OK | A recognised UK variant set: 8 skips, Q reverses, 2 draws two, joker wild. |
| Spades | **WRONG** · fixed | No sandbag penalty. See S1. |
| Hearts | OK | Pass 3 left/right/across/hold, 2♣ leads, no points on trick one, hearts break, shoot the moon. |
| Euchre | OK | 24 cards, 5 each, 4 to the kitty, bowers, go alone, to 10. |
| President | SIMPLIFIED · fixed | No card exchange between President and Scum between hands — the rule the game is named for. See S2. |
| Go Fish | OK | Books of four; 7 cards, 5 at five or more players. |
| Rummy | SIMPLIFIED | Target 30 is a short game rather than the usual 100+. Deliberate pacing. |
| Gin Rummy | OK | Knock at 10, gin 25, undercut 25, to 100. |
| War | OK | Ace high; a round cap so a shuffle-less deck cannot loop forever. |
| Trade Winds | OK | House game, not a classic — nothing to diverge from. |
| Undertow | OK | House game. |
| Solitaire (Klondike) | OK | Draw three, unlimited redeals, kings to empty columns. |
| FreeCell | OK | 8 columns, 4 cells, any card to an empty column. |
| Spider / One Suit / Two Suits | OK | 10 columns, same-suit runs, 8 foundations; the one- and two-suit versions strip the pack rather than faking it. |
| Scorpion | OK | 7×7, same-suit building, 3 in stock. |
| Forty Thieves | OK | 2 decks, 10×4, same-suit, one card at a time, one pass of the stock. |
| Tri Peaks | OK | Up-or-down with the ace wrapping. |
| Whist | OK | 13 each, trump turned, game is 5. |
| Briscola | **WRONG** · fixed | Deals the whole pack instead of 3 with a stock, and fixes trump to diamonds instead of turning it up. See S3. |
| Napoleon | OK | 5 each, bids 3–5, declarer alone. |
| Sixty-Six | **WRONG** · fixed | Deals 10 each of a 24-card pack with no stock, and fixes trump to hearts. See S4. |
| Snap | OK | Slap on a match. |
| Palace | OK | House game. |
| Three Thirteen | OK | Deal grows 3→13, wild climbs with it, eleven hands. |
| Hand and Foot | SIMPLIFIED | No runs (`allowRuns: false`) — real Hand and Foot melds sets only, so this is right; target 300 is short against the usual thousands. |
| Kings Corner | OK | Four piles, four corners for kings, alternate colours. |
| Dutch | OK | House rules game (Cabo family). |
| Old Maid | OK | One queen removed. |
| Bluff | OK | Cheat/I Doubt It. |
| Slapjack | OK | Slap the jacks. |
| Showdown Poker | SIMPLIFIED | One betting round, no community cards — a showdown game, and named as one. |
| Pit | OK | Corner on ten. |
| Contract Whist | OK | Bid a level and a strain, 1–7. |
| Trio | OK | Set-matching, not a card classic. |
| Kent | OK | Four-card pool, signalling, K-E-N-T letters. |
| Five Hundred | OK | 43 cards with the joker, bids 6–10, kitty of 3, bowers. |
| Oh Hell | **WRONG** · fixed | Fixed hand size, fixed spade trump, and no hook on the dealer's bid. See S5. |
| Black Maria | OK | 3–4 players, Q♠ 13, K♠ 10, A♠ 7, passing. |
| Big Two | OK | 3–2 ranking, combinations, bombs. |
| Egyptian Ratscrew | SIMPLIFIED | Slaps on jacks and doubles; no sandwiches and no face-card challenge. |
| Canasta | SIMPLIFIED | Sets only, wilds capped at two — correct. Target 300 against the real 5000 is pacing, and the file says so. |
| Yukon | OK | Any card moves with its tail, kings to empty. |
| Golf (solitaire) | SIMPLIFIED | Builds with the ace wrapping K→A, which is a common variant rather than the base game. |
| Bridge | SIMPLIFIED | Contract scoring without vulnerability, doubling or rubbers — a large simplification, and the description should say so plainly. |
| Continental Rummy | OK | Runs of four, two decks plus jokers. |
| Canfield | OK | Reserve of 13, four columns, draw three, unlimited redeals. |
| Pinochle | OK | Double pack, 12 each, the full meld table including a run in trumps. |
| Skat | **WRONG** · fixed | The two-card skat is never dealt. See S6. |
| Hokm | OK | House variant with the two jokers on a timing clock — its own rules, stated. |
| Ninety-Nine | OK | Three lives, to 5. |
| Scopa | OK | 40 cards, 3 each, 4 on the table, sweeps, last capture takes the rest. |
| Contract Rummy | OK | Seven escalating contracts. |

## What was done about them (phase 7)

All six are fixed, and `scripts/accuracy.ts` (`npm run accuracy`, and part of `npm test`) holds
a check for each. Every one of those checks was written to fail against the definitions as they
shipped, and they deal, bid and play rather than reading a flag back off the definition — a test
that only reads the definition proves the definition was edited, not that the rule works.

| Finding | Fix | New engine surface |
|---|---|---|
| S1 Spades | Bags carry across the match; every tenth costs 100 and the count resets. | `trick.bagPenalty` |
| S2 President | Five hands, and from the second on the Scum pays the President their two best cards for the President's two worst. The Vice pair swap one. | `climb.exchange` |
| S3 Briscola | Three each, trump turned off the stock and drawn last, everyone draws back up after each trick. Two or four players — three needs a stripped pack. | `trick.stockDraw`, `trick.turnedTrumpFrom` |
| S4 Sixty-Six | Six each of the twenty-four, twelve in the stock, trump turned, last trick worth 10. | `trick.lastTrickBonus` |
| S5 Oh Hell | Seven cards down to one, a fresh trump turned each deal, and the dealer hooked off the bid that would make the bids add up. | `trick.hookDealer`, negative `growPerHand` |
| S6 Skat | Two cards to the skat, picked up and buried by the declarer, and what is buried still counts toward their 61. | `numericAuction.kittyScoresToDeclarer` |

Every one of those is a knob in the guided builder too, not just a field in a file — the
buildability check would fail otherwise, and did until they were wired up. So a game anybody
builds here can have a stock, a turned trump, a last-trick bonus, sandbags, the hook, a scoring
kitty or an exchange between hands.

## The findings

### S1 · Spades has no sandbag penalty
**What it does.** `teamTricks >= teamBid ? teamBid * 10 + (teamTricks - teamBid) : -teamBid * 10`,
and nil bids score ±100. Bags are counted as a point each and never punished.

**What the reference says.** A team that accumulates ten bags over the match loses 100 points and
the bag count resets. Some tables play without it, but it is the standard rule and it is the
reason a Spades player avoids overtricks at all.

**Why it matters.** Without it, overtricks are pure upside. A bot — or a person — that bids low
and takes everything is strictly better off, which is the exact strategy the rule exists to
punish. This changes how the game is played, not just how it is scored.

### S2 · President never exchanges cards
**What it does.** Ranks 3 low to 2 high, combinations, and nothing between hands.

**What the reference says.** At the start of every hand after the first, the Scum gives the
President their best cards and receives the President's worst. That exchange is the whole engine
of the game: it is what makes being President compounding and being Scum a hole to climb out of.

**Why it matters.** Without it, every hand is independent and the title is decoration.

### S3 · Briscola deals the whole pack
**What it does.** Deals all 40 cards out — 20 each at two players, 13 at three, 10 at four — and
fixes the trump suit to diamonds.

**What the reference says.** Three cards each. The next card is turned face up beside the stock
and its suit is the *briscola* — the trump — for that hand. After each trick every player draws
one, the trick winner first, and the last player to draw takes the turned-up trump card itself.

**Why it matters.** A hand of three with a stock behind it is a game of memory and timing. A hand
of twenty with everything visible from the first trick is a different game wearing the name.

### S4 · Sixty-Six deals ten of twenty-four
**What it does.** Deals 10 cards each from the 24-card pack, leaving four cards that are never
used, and fixes trump to hearts. A source comment in the file calls it "the whole twenty-card
pack", which is wrong twice: the pack is 24, and it is not dealt whole.

**What the reference says.** Six cards each, dealt in batches of three. The thirteenth card is
turned for trump and sits beside the stock; players draw after each trick. The winner of the last
trick scores 10.

**Why it matters.** Same shape of error as Briscola — the stock and the turned trump are the
game. The last-trick 10 is also missing, which is a scoring rule, not a flourish.

### S5 · Oh Hell has none of its three defining rules
**What it does.** A fixed hand size (10, or by seat count), a fixed spade trump, and a free bid
for everyone including the dealer.

**What the reference says.** Three things, all missing:
1. The hand size changes every deal — typically counting down to one and sometimes back up.
2. The next card is turned for trump each hand.
3. The hook: the dealer may not bid the number that would make the bids add up to the number of
   tricks, so at least one player must fail every hand.

**Why it matters.** The hook is the joke the game is named for. Without the changing deal and the
turned trump, what is left is Contract Whist with a fixed trump.

### S6 · Skat never deals the skat
**What it does.** A 32-card pack, 10 cards to each of three players. That is 30 cards; the
remaining two are left in the draw pile and nothing ever touches them.

**What the reference says.** Those two cards are the *skat*. The declarer picks them up and
discards two face down, and those two count toward their card points at the end.

**Why it matters.** The game is named after them. The builder can now express a kitty — the knob
went in during phase 5 for Five Hundred — so this one is reachable without new engine work.

## What is not on the list

Eleven solitaires, the five house games (Trade Winds, Undertow, Palace, Dutch, Kent, Trio) and
Hokm's joker variant have no external reference to diverge from; they are audited against their
own descriptions and match them.

Every SIMPLIFIED entry now says so in its own rules panel, under "Not quite the whole game" —
`meta.simplifications`, one plain sentence per divergence, written for a player. A short target
on purpose is a design decision; leaving it unsaid is a player concluding the game is broken.
`scripts/accuracy.ts` fails if any of the seven stops admitting it.

Writing those sentences turned up a real one. Canasta and Hand & Foot set `allowRuns: false` —
the engine rejects a run — while the rules panel said "Make sets of 3+ and runs of 3+", drew a
run in cards as an example of a legal meld, listed runs in the shape of a turn, and defined the
word "meld" using them. Four places promising a move the game does not have. All four now read
the flag, and there is a check for it.

Four entries are marked SIMPLIFIED on scoring targets alone — Rummy at 30, Canasta and Hand and
Foot at 300, Bridge at 100. Those are pacing decisions for a game played against bots in a
browser, and the Canasta file already explains its reasoning. The one thing worth doing there is
making sure each game's own description admits it, which is a copy change rather than a rules
change.

## Sources

- 66: [Pagat](https://www.pagat.com/marriage/66.html), [Bicycle](https://bicyclecards.com/how-to-play/sixty-six/), [Wikipedia](https://en.wikipedia.org/wiki/Sixty-six_(card_game))
- Briscola: [Pagat](https://www.pagat.com/aceten/briscola.html), [Wikipedia](https://en.wikipedia.org/wiki/Briscola)
- Spades: [Pagat](https://www.pagat.com/auctionwhist/spades.html), [VIP Spades on the bag penalty](https://vipspades.com/blog/what-is-a-bag-penalty-in-spades/)
- Oh Hell: [Pagat](https://www.pagat.com/exact/ohhell.html), [Trickster Cards](https://www.trickstercards.com/help/oh-hell/)
- Skat: [Pagat](https://www.pagat.com/schafkopf/skat.html), [Wikipedia](https://en.wikipedia.org/wiki/Skat_(card_game))
- President: [Pagat](https://www.pagat.com/climbing/president.html), [Wikipedia](https://en.wikipedia.org/wiki/President_(card_game))
