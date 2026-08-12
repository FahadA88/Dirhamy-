# Decky

A web app where people play card games and create their own, using a standard 54-card deck.
**The engine is the referee** — it deals, enforces every rule, hides what should be hidden,
tracks score, and decides the winner. Clients only render state and submit intended moves.

This is the **V1 engine slice** (Milestone M1 from the master build spec): the pure,
deterministic engine plus a playable web UI for Crazy Eights, solo vs bots.

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
  simulator.ts   # bot-simulator: proves a game terminates, is winnable, and roughly balanced
src/games/
  crazyEights.ts # a classic, as pure data
src/bots/
  randomBot.ts   # legal-move bot (works for ANY game for free — engine enumerates moves)
src/ui/
  App.tsx        # the table: renders the REDACTED view, highlights legal moves, drives bots
scripts/
  selftest.ts    # headless 1000-game self-play — the engine's acceptance test
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
npm run selftest   # headless proof: 1000 Crazy Eights games all terminate with a winner
npm run dev        # play it in the browser, solo vs 2 bots
npm run build      # production build
```

## Verified

`npm run selftest` runs 1000 four-player games: **all terminate**, **winnable**, avg ~29 moves,
seat win-rates ~20–30% (mild first-player edge, expected for a shedding game), zero move-cap hits.

## Next (per the master build spec)

M2 hand-author more classics (each one stress-tests the schema) → M3 static validator +
richer simulator reports → M4 visual editor (remix / family skeletons) → M5 AI co-pilot →
authoritative multiplayer server + reconnect. See `docs/card-game-engine-master-build-spec.md`.
