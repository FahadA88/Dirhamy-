# Decky

A web app where people play card games and create their own, using a standard 54-card deck.
**The engine is the referee** — it deals, enforces every rule, hides what should be hidden,
tracks score, and decides the winner. Clients only render state and submit intended moves.

This covers **Milestones M1–M5** from the master build spec: the pure deterministic engine,
a classics library, a static validator, a bot-simulator, a visual editor (remix + family
skeleton), and an AI co-pilot with interview behavior — all in a playable web app.

## The core idea: a game is data, not code

Every game is a `GameDefinition` (structured JSON) that the one engine reads and runs.
`src/games/crazyEights.ts` is Crazy Eights expressed entirely as data — there is no
Crazy-Eights logic anywhere in the engine. Add a game = add data, never engine code.

## What's here

```
src/engine/
  types.ts       # the game-definition schema + runtime types
  rng.ts         # seeded deterministic RNG (mulberry32 + Fisher–Yates)
  deck.ts        # standard-54 deck build, card tags
  engine.ts      # the interpreter: createMatch, legalMoves, applyMove, isTerminal, redact
  validator.ts   # M3: static well-formedness checks (missing zones/tags, unreachable win…)
  simulator.ts   # M3: bot-simulator — proves a game terminates, is winnable, roughly balanced
src/games/
  crazyEights.ts # a classic, as pure data
  switch.ts      # M2: a second classic (action cards) — ran with ZERO engine changes
  catalog.ts     # the classics library
src/authoring/
  knobs.ts       # M4: the authoring model — knobs compile to a full GameDefinition
  copilot.ts     # M5: describe→knobs translator + interview (offline; LLM-swap seam)
src/settings/
  settings.ts    # user customization: theme/accent/cards/motion/gameplay, persisted
  SettingsContext.tsx # provider that applies settings to the DOM live
src/bots/
  randomBot.ts   # legal-move bot (works for ANY game for free — engine enumerates moves)
src/ui/
  App.tsx        # Play / Create router
  Table.tsx      # renders the REDACTED view, highlights legal moves, drives bots
  PlayView.tsx   # the classics library + discovery
  CreateView.tsx # M4/M5: the visual editor + AI co-pilot + live validation + test/playtest
scripts/
  selftest.ts    # headless self-play over every classic — the engine's acceptance test
  validate.ts    # proves the validator passes classics and catches broken definitions
```

## Architecture (mirrors the authoritative-server model)

The engine is a **pure function of `(state, move)`** — no I/O, no clock, no network; all
randomness flows through the seeded RNG in state. That purity is what lets the *same* engine
run headless in the simulator, in the browser today, and on an authoritative server later.

- `legalMoves(state, player)` is the single source of truth for **both** the UI's
  legal-move highlighting **and** the bots' option list.
- `redact(state, player)` derives each player's allowed view from each zone's `visibility` —
  the one place hidden information is enforced (you never receive cards you can't see).
- The UI holds full state locally for this solo slice, but only ever renders the redacted
  view, exactly as a thin client would against a real server.

## Run it

```bash
npm install
npm run test       # selftest (bot self-play over all classics) + validator checks
npm run dev        # the web app: Play the classics, or Create your own
npm run build      # production build
```

In the app: **Play** a classic solo vs bots, or **Create** — start from a blank skeleton or
remix a classic, turn knobs, describe rules to the co-pilot, watch it interview you about
gaps, run the simulator, and playtest. The **⚙ Customize** drawer controls appearance and
gameplay: light/dark/system theme, 7 accent colors, card backs, card size, four-color deck,
table surface, ambient-3D toggles, motion, density — plus your name, bot labels/speed/
difficulty, legal-move highlight style, hand sorting, confirm-to-play, log, and sound. All
persisted to localStorage.

## Verified

- **Engine (`npm run selftest`):** 1000 four-player games each of Crazy Eights and Switch —
  all terminate, all winnable, no move-cap hits. Crazy Eights ~29 moves, Switch ~52.
- **Validator (`npm run validate`):** classics validate clean; deliberately broken defs
  (missing tag, unreachable win, over-deal, missing zone) are all caught.
- **Co-pilot:** parses e.g. *"Deal 7 each, jokers wild, queens reverse, 2s draw two"* into the
  right knobs and asks about the unspecified draw-pile-empty rule.

## Next (per the master build spec)

The remaining V1 pieces: an **authoritative multiplayer server** (the UI already renders only
the redacted view, so this is a lift-and-shift), **reconnect/resume**, **publish + discovery +
moderation** for community games, and swapping the offline co-pilot translator for a live LLM
behind the existing `Translator` seam. See `docs/card-game-engine-master-build-spec.md`.
