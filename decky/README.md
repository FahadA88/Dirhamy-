# Decky

A web app where people play card games and build their own, using a standard 54-card deck.
**The engine is the referee** — it deals, enforces every rule, hides what should be hidden,
tracks score, and decides the winner. Clients only render state and submit intended moves; a
tampered client cannot make an illegal move or see a card it shouldn't.

## The core idea: a game is data, not code

Every game is a `GameDefinition` (structured JSON) that one engine reads and runs. Adding a
game means adding data, never engine code — `src/games/crazyEights.ts` is Crazy Eights
expressed entirely as data, and there is no Crazy-Eights-specific logic anywhere in the engine.

## What's here

Over 50 classic games ship today, across every major card-game family: trick-taking (Hearts,
Spades, Euchre, Whist, Bridge, Skat, Pinochle, Napoleon, Sixty-Six…), shedding (Crazy Eights,
Switch, Palace…), climbing (Big Two, President, Undertow…), rummy (Gin Rummy, Canasta, Hand &
Foot, Continental…), fishing (Go Fish), comparing/war, bluffing (Bluff, Slapjack), betting
(Showdown Poker), trading (Pit), signalling (Kent), spotting (Trio), and solitaire (Klondike,
FreeCell, Spider, Yukon, Golf, Canfield, and more).

```
src/engine/
  types.ts       # the game-definition schema + runtime types
  rng.ts         # seeded deterministic RNG (mulberry32 + Fisher–Yates)
  deck.ts        # standard-54 deck build, card tags
  engine.ts      # the interpreter: createMatch, legalMoves, applyMove, isTerminal, redact
  validator.ts   # static well-formedness checks (missing zones/tags, unreachable win…)
  simulator.ts   # bot-simulator — proves a game terminates, is winnable, roughly balanced
src/games/       # every classic, as pure data — 50+ definitions, no per-game engine code
src/authoring/
  knobs.ts       # the guided-builder authoring model — knobs compile to a full GameDefinition
  ruleKit.ts     # the near-programmable custom-rule layer: when / if / then, never eval'd
  copilot.ts     # describe→knobs translator + interview (offline; LLM-swap seam)
src/server/
  matchService.ts # the sole holder of unredacted MatchState; callers only ever get redact()'d views
  local.ts        # in-process transport for solo/pass-and-play
src/net/
  wsServer.ts    # WebSocket host: per-seat auth tokens, invite-code tables, quick-play
  wsClient.ts    # WebSocket client transport, same protocol as the local one
src/settings/
  settings.ts    # user customization: theme/accent/cards/motion/gameplay, persisted
  SettingsContext.tsx # provider that applies settings to the DOM live
src/library/
  library.ts     # publish, discovery, ratings, follows, collections, community moderation
src/social/
  daily.ts       # the daily deal — one seeded Klondike hand, the same for everyone each day
  safety.ts      # name/description screening, reporting, blocks/mutes, cross-device sync
src/bots/
  randomBot.ts   # legal-move bot (works for ANY game for free — engine enumerates moves)
src/ui/
  App.tsx        # Play / Create / You router
  Table.tsx      # renders the REDACTED view, highlights legal moves, drives bots
  SolitaireTable.tsx # the patience-family table
  PlayView.tsx   # the classics library + discovery + resumable/in-progress games
  CreateView.tsx # the visual editor + AI co-pilot + RuleBuilder + live validation + playtest
  ProfileView.tsx # achievements, stats, streaks
scripts/
  selftest.ts, mechanics.ts, phase1-5.ts, families.ts, author.ts # headless correctness proofs
  browser/       # real Playwright suites against a running build
```

## Architecture (authoritative-server model)

The engine is a **pure function of `(state, move)`** — no I/O, no clock, no network; all
randomness flows through the seeded RNG in state. That purity is what lets the *same* engine
run headless in the simulator, in a solo browser tab, and behind a real WebSocket host.

- `legalMoves(state, player)` is the single source of truth for **both** the UI's
  legal-move highlighting **and** the bots' option list.
- `redact(state, player)` derives each player's allowed view from each zone's `visibility` —
  the one place hidden information is enforced (you never receive cards you can't see).
- `MatchService` is the only place unredacted `MatchState` lives; every client — local,
  pass-and-play, or over the wire — only ever sees `redact()`'d state.
- Real-time multiplayer runs over WebSocket with a per-seat authentication token: joining or
  opening a seat hands back a token that must be presented on every request for that seat, so
  one browser tab cannot read another player's hand or move as them.
- Fairness is commit-reveal: `sha256(serverSeed)` is published before dealing, so a shuffle can
  be verified after the fact rather than taken on trust.
- Definitions are pinned into a match on creation, so editing a game in the builder can never
  change the rules of a match already in progress.
- No real-money gambling.

## Beyond the engine

- **Near-programmable custom rules** — a guided when/if/then builder (never `eval`'d) for
  twists no preset covers, with an offline AI co-pilot that turns a plain-English description
  into knobs and asks about whatever it left ambiguous.
- **Play with people** — real-time WebSocket tables (invite code or quick-play matchmaking),
  local pass-and-play, and async play with turn notifications, multiple concurrent games, and
  reconnect/resume.
- **Publish and discover** — community games with ratings, tags, search, staff picks, a daily
  featured rotation, creator follows, and reporting/moderation.
- **Progression** — achievements, per-game stats, and a daily deal with a streak.
- **Accessibility** — full keyboard play, screen-reader move announcements, a colour-vision
  simulator, honoured `prefers-reduced-motion`, and an `eslint-plugin-jsx-a11y` gate in `npm
  test` so a regression here fails the build, not a screen reader.
- **Installable PWA** — works offline once cached, with safe-area-inset support for notched
  phones running it standalone.
- **Deep customization** — themes, accents, table felts, card backs (including a from-scratch
  designer and image upload), avatars, animation speed, and more, all persisted locally.

## Run it

```bash
npm install
npm test           # engine, validator, mechanics, acceptance, bundle-size budget, lint
npm run dev         # the web app: Play the classics, Create your own, or watch You
npm run build       # production build
npm run host         # the WebSocket multiplayer host, for real-time tables
npm run verify:all  # the full Playwright browser suite (needs `npm run preview` on :4173)
```

See `CLAUDE.md` for the architecture rules this project holds itself to, and the full command
list.
