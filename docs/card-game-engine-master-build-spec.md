# Master Build Spec — Player-Built Card Game Platform (working title: **Decky**)

> **Purpose of this document.** This is the single, authoritative build prompt for a product where people play card games and create their own using a standard 54-card deck (52 + 2 jokers). Hand it to a coding assistant or a small team and start building. Every locked architectural decision below is a constraint, not a suggestion — do not re-open them.

**Delivery decisions (resolved with the client):**
- **Platform:** Responsive **web app** (desktop + mobile browsers). One codebase, link-shareable games, real-time multiplayer over the web.
- **Stack:** **TypeScript full-stack** (recommended default — justified in §4). One language for engine, server, and client; the engine is portable and runs identically on both sides.
- **Team & timeline:** **Lean** — 1–3 people, **~3–4 months** to V1. Milestones in §6 are sized accordingly.
- **Monetization:** **Freemium, cosmetics later.** Nothing paid ships in V1, but the data model must not foreclose card backs / table themes later. No monetization code in V1.

---

## 1. Product overview & goals

**One-liner.** A web app where the *engine is the referee*: it deals, enforces every rule, hides what should be hidden, tracks score, and decides the winner. Players play classic card games, remix them by turning knobs, or assemble new ones from skeletons — with an AI co-pilot that turns plain-English rules into a structured game definition the engine can run. Creations can be published, discovered, forked, and played by anyone, solo-vs-bots or in real-time multiplayer.

**Why it can exist.** Because *a game is data, not code*. One deterministic engine reads a structured **game definition** and runs any game expressible in the schema. Adding a game = adding data, never shipping engine code. That single decision is what makes user-generated games, instant solo bots, and safe sharing all possible at once.

**Goals (V1).**
1. Ship 10–15 fully-enforced classic games that are genuinely fun and prove the schema is expressive enough.
2. Let a non-programmer create a playable, publishable game in one sitting via **remix** (turn knobs on a classic) or **family skeleton** (start from a shedding/matching template), with an AI co-pilot that interviews them about missing rules.
3. Every game is instantly playable **solo vs bots** and in **real-time multiplayer**, with reconnect/resume, legal-move highlighting, and auto-generated "how to play."
4. A safe public commons: discovery (ratings/trending/most-played), fork-with-credit, versioning, and moderation/reporting.

**Non-goals (V1), explicitly out:**
- The **bare-seed "from 0" rung** (rung 4 of the authoring ladder).
- Mechanic families **beyond shedding/matching** (no trick-taking-only engines, no rummy-melding as a *creation* family — Hearts/Spades/Rummy still ship as hand-authored classics, just not as user-buildable families).
- Friends/invites, in-game chat/emotes, cosmetics.

**The five locked decisions (restated as law):**
1. **The engine is an authoritative referee.** It is the single source of truth. Clients render state and submit *intended* moves; the server validates and applies them. Clients never compute outcomes.
2. **A game is data, not code.** Every game is a JSON game definition the engine interprets. Same engine, all games.
3. **The AI writes rules; the engine runs them — never the reverse.** The AI translates description → definition. The deterministic engine executes. The AI is never in the runtime loop and never adjudicates.
4. **The AI is a co-pilot, not the headline.** It lives inside the visual editor as a helper. Users always see and can hand-edit everything it produces.
5. **One editor; a template is just how much is pre-filled.** Authoring is a ladder — (1) play, (2) remix a classic, (3) start from a family skeleton, (4) bare seed — and users can climb mid-build. V1 ships rungs 1–3.

---

## 2. Core user flows

### 2.1 Play a game (solo or multiplayer)
1. User opens a game (classic or community) → sees auto-generated **How to Play** and a **Play solo / Play with others** choice.
2. **Solo:** server spins up a match with generic bots filling the other seats. **Multiplayer:** user creates a room (shareable link/code) or joins a matchmaking queue; missing seats can be filled with bots on request.
3. Server deals per the definition. Each client receives a **redacted state** (own hand + public zones only).
4. On each of the player's turns, the client shows **legal moves highlighted** (server-provided). Player picks one → client sends intended move → server validates, applies effects, advances turn, pushes new redacted states + an event log ("Alice played 8♥, changed suit to spades").
5. Match ends when a win/scoring condition fires; server computes result, shows winner + final scores, offers rematch.
6. At any point a player can disconnect; state persists server-side and **resumes on reconnect** (see §5).

### 2.2 Remix a game (rung 2)
1. From any classic (or forkable community game), user hits **Remix**. Editor opens loaded with that definition; original creator is recorded for credit.
2. User turns **knobs** — surfaced as friendly controls, not raw JSON (e.g. hand size, whether 2s stack as "draw two," wild ranks, direction-reversal card, win = empty hand vs lowest score).
3. Live **Validator** runs on every change (green/amber/red): flags unreachable win conditions, references to missing zones, dead ends.
4. **Test** button runs the **bot-simulator** (a few hundred fast games) → reports terminates? / winnable? / rough balance & average length. User can also **playtest solo** immediately.
5. Save as draft → **Publish**. Fork lineage + credit is attached automatically.

### 2.3 Create with the AI co-pilot (rungs 2–3)
1. User picks **Start from a family skeleton** (V1: *Shedding/Matching* — the Crazy-Eights / Uno-like family) → editor opens with a minimal valid definition.
2. User types plain English into the co-pilot ("players match rank or suit; 8s are wild; if you can't play, draw one; first to empty their hand wins").
3. AI proposes edits to the definition; the editor shows the **diff visually** (added a wild rank, set win condition). User accepts/rejects per change.
4. The co-pilot **interviews** on unfilled *required* slots, 1–2 questions at a time, only what matters: *"What happens when the draw pile runs out — reshuffle the discard, or is the round over?"* Minor gaps get sensible defaults (silently, but visible/editable).
5. Validator + simulator gate publishing exactly as in remix. User can hand-edit any field the AI touched at any time.

### 2.4 Publish
1. Draft must pass Validator (no red) and Simulator (**terminates + winnable**) to publish. Wildly-unbalanced is a **warning**, not a block.
2. User sets name, short description, min/max players, tags. Auto-generated How-to-Play is shown and can be lightly edited.
3. On publish: content passes automated moderation (name/description screening), a **version** is minted (immutable), and the game enters the public commons. Live matches and saved copies always pin the exact version they started with (see §5 versioning).

### 2.5 Discover
1. Home surfaces **Classics**, **Trending**, **Most-played**, **Top-rated**, and tag/family filters.
2. Game page: How-to-Play, player counts, rating, play/fork counts, credit lineage, **Play** and **Fork** buttons.
3. Report button on every community game (see moderation, §5).

---

## 3. The game-definition schema (first-draft spec)

**Format:** JSON, versioned (`schemaVersion`). Designed so a deterministic interpreter can run it and a validator can statically check it. **Determinism is mandatory:** all randomness flows through a single seeded RNG stored in match state; given the same definition, seed, and move sequence, the engine reproduces identical states (critical for the bot-simulator, replays, and dispute resolution).

### 3.1 Top-level shape
```jsonc
{
  "schemaVersion": "1.0",
  "meta": {
    "id": "uuid",
    "name": "Crazy Eights",
    "description": "Match the top card by rank or suit. Eights are wild.",
    "players": { "min": 2, "max": 6 },
    "family": "shedding-matching",
    "forkedFrom": null,            // { gameId, versionId, creator } if a fork
    "createdBy": "userId"
  },
  "deck": { ... },                 // what cards exist & their semantic tags
  "zones": [ ... ],                // piles/areas and their visibility + ordering
  "setup": [ ... ],                // deterministic steps run once at match start
  "turnFlow": { ... },             // whose turn, order, how it advances
  "actions": [ ... ],              // legal moves: conditions + effects
  "triggers": [ ... ],             // event-driven effects (onPlay, onEmptyDraw…)
  "endConditions": [ ... ],        // when a round/match ends
  "scoring": { ... }               // how score is computed & winner chosen
}
```

### 3.2 Deck
Describes the standard 54-card deck and *semantic tags* the rules reference (so rules speak in meaning, not magic numbers).
```jsonc
"deck": {
  "base": "standard54",            // 52 + 2 jokers; engine knows ranks/suits
  "includeJokers": false,
  "rankOrder": ["A","2","3","4","5","6","7","8","9","10","J","Q","K"],
  "tags": {                         // named card sets rules can reference
    "wild": { "ranks": ["8"] },
    "reverse": { "ranks": [] },
    "skip": { "ranks": [] },
    "drawTwo": { "ranks": [] }
  }
}
```

### 3.3 Zones
Every pile/area a card can live in, with **visibility** (who sees it — the hidden-information contract) and ordering.
```jsonc
"zones": [
  { "id": "draw",    "type": "pile", "ordered": true,  "faceDown": true,  "visibility": "none",     "shared": true },
  { "id": "discard", "type": "pile", "ordered": true,  "faceDown": false, "visibility": "top-public", "shared": true },
  { "id": "hand",    "type": "hand", "ordered": false, "faceDown": true,  "visibility": "owner",     "perPlayer": true }
]
```
`visibility`: `none` (nobody, e.g. face-down draw), `owner` (only the owning player — hands), `top-public` (top card public, rest hidden), `all` (fully public). This field is the **single mechanism** for hidden information — the redactor (§4) derives each player's view from it.

### 3.4 Setup
Deterministic ordered steps at match start.
```jsonc
"setup": [
  { "op": "shuffle", "zone": "draw" },
  { "op": "deal", "from": "draw", "to": "hand", "countPerPlayer": 5 },
  { "op": "move", "from": "draw", "to": "discard", "count": 1 }   // starter card
]
```

### 3.5 Turn flow
```jsonc
"turnFlow": {
  "order": "clockwise",            // or "counter-clockwise"; mutable by effects
  "startPlayer": "dealerLeft",
  "advance": "afterAction",        // turn passes after a completed action (unless an effect says otherwise)
  "actionsPerTurn": { "min": 1, "max": 1 }
}
```

### 3.6 Actions (legal moves = conditions + effects)
The heart of the engine. Each action has a `when` (predicate deciding legality *for the current player, current state*) and an `effects` list. **The engine enumerates every action whose `when` is satisfiable → that set IS the legal-move highlight AND the bot's option list.** One mechanism powers referee, UI highlighting, and bots.
```jsonc
"actions": [
  {
    "id": "playCard",
    "target": { "from": "hand", "select": "one" },
    "when": {
      "any": [
        { "matches": { "cardProp": "suit", "equalsTopOf": "discard" } },
        { "matches": { "cardProp": "rank", "equalsTopOf": "discard" } },
        { "cardHasTag": "wild" }
      ]
    },
    "effects": [
      { "op": "move", "card": "$target", "to": "discard" },
      { "op": "if", "cond": { "cardHasTag": "wild" },
        "then": [ { "op": "chooseSuit", "by": "currentPlayer", "setState": "activeSuit" } ] }
    ]
  },
  {
    "id": "drawCard",
    "when": { "not": { "existsLegal": "playCard" } },   // can only draw if nothing playable (a knob)
    "effects": [ { "op": "move", "from": "draw", "to": "hand", "count": 1 } ]
  }
]
```
Effect ops (V1 minimum): `move`, `deal`, `shuffle`, `if/then/else`, `chooseSuit`/`chooseValue` (player choice into a state var), `setState`, `skipNext`, `reverseOrder`, `forceDraw` (target player draws N), `endTurn`, `endRound`.

### 3.7 Triggers (event-driven)
Effects that fire on engine events rather than as chosen moves — where "what happens when the draw pile runs out?" lives.
```jsonc
"triggers": [
  { "on": "drawPileEmpty",
    "do": [ { "op": "reshuffleDiscardInto", "zone": "draw", "keepTop": true } ] },
  { "on": "cardPlayed", "cardHasTag": "reverse",
    "do": [ { "op": "reverseOrder" } ] }
]
```

### 3.8 End conditions & scoring
```jsonc
"endConditions": [
  { "id": "handEmpty", "when": { "zoneCount": { "zone": "hand", "of": "anyPlayer", "eq": 0 } },
    "result": "roundOver" }
],
"scoring": {
  "mode": "firstToEmptyWins",     // or "lowestPoints", "highestPoints", "pointsTarget"
  "cardPoints": { "8": 50, "K": 10, "Q": 10, "J": 10, "default": "rankValue", "A": 1 },
  "target": null,                  // e.g. play to 100 points across rounds
  "winner": "lowestTotal"          // how the winner is chosen from accumulated scores
}
```

### 3.9 Worked example — Crazy Eights, complete
```jsonc
{
  "schemaVersion": "1.0",
  "meta": {
    "id": "classic-crazy-eights",
    "name": "Crazy Eights",
    "description": "Shed your hand by matching the top discard's rank or suit. Eights are wild — play one and name any suit.",
    "players": { "min": 2, "max": 6 },
    "family": "shedding-matching",
    "forkedFrom": null,
    "createdBy": "system"
  },
  "deck": {
    "base": "standard54", "includeJokers": false,
    "rankOrder": ["A","2","3","4","5","6","7","8","9","10","J","Q","K"],
    "tags": { "wild": { "ranks": ["8"] } }
  },
  "zones": [
    { "id": "draw",    "type": "pile", "ordered": true, "faceDown": true,  "visibility": "none",       "shared": true },
    { "id": "discard", "type": "pile", "ordered": true, "faceDown": false, "visibility": "top-public", "shared": true },
    { "id": "hand",    "type": "hand", "ordered": false, "faceDown": true, "visibility": "owner",      "perPlayer": true }
  ],
  "setup": [
    { "op": "shuffle", "zone": "draw" },
    { "op": "deal", "from": "draw", "to": "hand", "countPerPlayer": 5 },
    { "op": "move", "from": "draw", "to": "discard", "count": 1 }
  ],
  "turnFlow": {
    "order": "clockwise", "startPlayer": "dealerLeft",
    "advance": "afterAction", "actionsPerTurn": { "min": 1, "max": 1 }
  },
  "actions": [
    {
      "id": "playCard",
      "target": { "from": "hand", "select": "one" },
      "when": { "any": [
        { "matches": { "cardProp": "suit", "equalsStateOrTopOf": ["activeSuit","discard"] } },
        { "matches": { "cardProp": "rank", "equalsTopOf": "discard" } },
        { "cardHasTag": "wild" }
      ] },
      "effects": [
        { "op": "move", "card": "$target", "to": "discard" },
        { "op": "setState", "var": "activeSuit", "value": "$target.suit" },
        { "op": "if", "cond": { "cardHasTag": "wild" },
          "then": [ { "op": "chooseSuit", "by": "currentPlayer", "setState": "activeSuit" } ] }
      ]
    },
    {
      "id": "drawCard",
      "when": { "not": { "existsLegal": "playCard" } },
      "effects": [ { "op": "move", "from": "draw", "to": "hand", "count": 1 } ]
    }
  ],
  "triggers": [
    { "on": "drawPileEmpty",
      "do": [ { "op": "reshuffleDiscardInto", "zone": "draw", "keepTop": true } ] }
  ],
  "endConditions": [
    { "id": "handEmpty",
      "when": { "zoneCount": { "zone": "hand", "of": "anyPlayer", "eq": 0 } },
      "result": "roundOver" }
  ],
  "scoring": {
    "mode": "firstToEmptyWins",
    "cardPoints": { "8": 50, "K": 10, "Q": 10, "J": 10, "10": 10, "default": "rankValue", "A": 1 },
    "target": 100,
    "winner": "lowestTotal"
  }
}
```
> This example is also the schema's **first acceptance test**: the interpreter must run it, the validator must pass it clean, and the simulator must confirm it terminates and is winnable.

---

## 4. System architecture

```
┌─────────────┐    intended move (validated action id + target)     ┌──────────────────────┐
│  Web client │ ─────────────────────────────────────────────────▶ │  Authoritative server │
│ (React)     │ ◀───────────────────────────────────────────────── │                       │
│ renders     │    redacted state + legal moves + event log         │  ┌─────────────────┐  │
│ redacted    │              (WebSocket)                            │  │  Game Engine    │  │
│ state       │                                                     │  │  (interpreter)  │  │
└─────────────┘                                                     │  └─────────────────┘  │
                                                                    │  Validator          │
   The SAME engine module (TS) also runs client-side in read-only   │  Bot-simulator      │
   "preview" mode for instant local feedback in the editor, but     │  Redactor           │
   the server's engine is always the source of truth.               │  Persistence (PG)   │
                                                                    └──────────────────────┘
```

**Components.**
- **Game Engine (interpreter):** pure, deterministic TS module. `applyMove(state, move) → newState`, `legalMoves(state, playerId) → Move[]`, `isTerminal(state)`, `score(state)`. No I/O, no clock, no network — everything random goes through `state.rng` (seeded). This purity is what lets it run in the browser for editor previews *and* on the server as referee from one codebase.
- **Authoritative server:** owns full match state, applies moves through the engine, persists after every move, and pushes redacted states. Rejects illegal/out-of-turn moves. **Never trusts the client** for anything but the *intent* (which action, which target).
- **Redactor:** given full state + a `playerId`, returns the view that player is allowed to see, derived purely from each zone's `visibility`. This is the one place hidden information is enforced — a hand with `visibility: "owner"` is stripped to counts for everyone else; `top-public` sends only the top card. Legal-move computation for player P uses full state server-side, so highlighting never leaks info.
- **Validator:** static checks on a definition (see §5). Runs in editor (live) and as a publish gate.
- **Bot-simulator:** runs the engine headless for N games using generic bots. Reports: *terminates* (no infinite loop — enforced via a max-move cap), *winnable* (not a forced draw/stalemate), *balance* (win-rate spread by seat), *avg length*. Also powers solo play and pre-publish playtesting. **Because the engine enumerates legal moves, a bot is just "pick from `legalMoves()`"** — random baseline for V1, with a light heuristic (prefer shedding, dump high-value cards) so solo play isn't dumb. Bots work for *any* valid game for free.
- **Clients:** React web app. Render redacted state + highlight server-provided legal moves + show event log. Optimistic UI is allowed for responsiveness but the server's state always wins.

**Data flow (one move):** client sends `{matchId, actionId, target}` → server loads state → `legalMoves()` includes it? if not, reject → `applyMove()` → persist → for each player, `redact()` + `legalMoves()` → push over WebSocket → clients render.

**Recommended stack (the "you choose" default), with rationale:**
- **Engine + shared types:** TypeScript, published as an internal package imported by both server and client. *Rationale: the engine must run in two places; one language avoids porting it and keeps the schema types single-sourced.*
- **Server:** Node + TypeScript, WebSocket (e.g. `ws`/Socket.IO) for real-time, REST/tRPC for CRUD (games, users, discovery).
- **DB:** Postgres — relational for users/games/versions/ratings/reports; `jsonb` columns for the game definitions and match state snapshots (queryable + flexible).
- **Client:** React + Vite (matches this repo's existing tooling), WebSocket client, a rendering layer for cards/zones driven entirely by redacted state.
- **AI co-pilot:** server-side calls to Claude (latest model). Few-shot prompt seeded with the hand-authored classics as canonical schema examples; output is **always** a game-definition diff that must pass the Validator before it's shown as "applied." The LLM never touches match state.

*If the bot-simulator becomes a perf bottleneck at scale, the pure TS engine can later be compiled/ported to a faster runtime for headless simulation only — but that is an optimization, not a V1 need. Do not prematurely split languages.*

---

## 5. Feature specifications (grouped)

### Must-have

**Auto-generated "How to Play."**
- *Given* any valid definition, the system produces readable plain-English rules (objective, setup, turn options, special cards, how the game ends, scoring).
- **Acceptance:** every classic and every publishable game has non-empty, accurate how-to-play; regenerates on version change; author may lightly edit the prose without altering rules.

**Legal-move highlighting.**
- *Given* it's a player's turn, the client highlights exactly the moves `legalMoves()` returns — no more, no less.
- **Acceptance:** highlighted moves always apply successfully; a move never highlighted is always rejected by the server; highlighting reveals no hidden information (computed from redacted-safe outputs).

**Reconnect / save + resume.**
- Match state is persisted after every applied move. A disconnected player rejoins to the exact current state; a fully-abandoned match can be resumed later (within a retention window).
- **Acceptance:** killing a client mid-match and reconnecting restores the correct redacted view and turn; server restart loses no committed match; resumed match continues deterministically.

**Moderation + reporting.**
- Every public creation can be reported (offensive/junk/broken). Names/descriptions pass automated screening at publish. A moderation queue lets a reviewer unpublish/remove; removed games don't break existing saved copies' *playability* but are pulled from discovery.
- **Acceptance:** report button on every community game; publishing a slur-laden name is blocked or auto-flagged; unpublish removes from discovery within one refresh; reporter gets confirmation.

### Makes it thrive

**Discovery (ratings, trending, most-played).**
- Games are rated (thumbs or 1–5), ranked by trending (recent play velocity) and all-time plays; filterable by family/tag/player-count.
- **Acceptance:** rating persists per user (one vote, changeable); trending reflects recent plays; lists paginate and load fast.

**Fork + credit.**
- Any forkable game can be copied into the editor; lineage (`forkedFrom`) and original creator credit travel with it and display on the game page.
- **Acceptance:** forking never mutates the original; credit chain is visible; a creator can see games forked from theirs.

**Versioning.**
- Publishing mints an immutable version. Live matches and saved copies pin the version they started with; editing a published game creates a new version and never alters in-flight matches or others' saved copies.
- **Acceptance:** editing a published game mid-match doesn't change that match; a saved copy always replays against its pinned version; discovery shows the latest version while old matches keep theirs.

### Nice, not urgent (design-forward, don't build in V1)
- Friends/invites, in-game chat/emotes, player stats/history, cosmetic card backs & table themes. **Requirement on V1:** the data model reserves seams for cosmetics (a `themeId`/`cardBackId` slot on match/render config, unused in V1) so the future revenue path isn't a migration. No cosmetic logic, UI, or payments in V1.

---

## 6. V1 milestones (sequenced per build order; each shippable)

> Build order is locked: **schema → interpreter → hand-author classics → validator + bot-simulator → editor → AI co-pilot.** Sized for 1–3 people over ~3–4 months. Each milestone ends in something demonstrable.

**M0 — Foundations (½ wk).** Repo/CI, shared types package, Postgres schema for users/games/versions/matches, WebSocket skeleton. *Ship:* an empty match room two browsers can join.

**M1 — Schema + Interpreter (2.5 wks).** Finalize the §3 schema as TS types. Build the pure deterministic engine: `applyMove`, `legalMoves`, `isTerminal`, `score`, seeded RNG, redactor. *Ship:* Crazy Eights (§3.9) plays end-to-end **solo with a random bot** through the engine, hidden hands enforced. This is the make-or-break milestone — everything rests on it.

**M2 — Hand-author the classics (2.5 wks).** Encode 10–15 classics in the schema — Crazy Eights, Hearts, Spades, Rummy, President, Go Fish, Cheat, War, plus a few more. Each new game that *doesn't* fit forces a schema fix — that's the point (schema stress-test). *Ship:* a Classics library, all playable solo-vs-bots and in multiplayer, with reconnect/resume and legal-move highlighting.

**M3 — Validator + Bot-simulator (2 wks).** Static validator (every referenced zone/tag/state exists; win condition reachable; no dead ends). Headless simulator with move-cap termination check, winnability, balance, avg-length. *Ship:* run validator+simulator over all classics (must pass), plus solo play and better heuristic bots for the whole library.

**M4 — Editor (rungs 2–3) (3 wks).** Visual authoring: remix knobs on classics, family-skeleton start (shedding/matching), live validator (green/amber/red), Test = run simulator, playtest-solo, draft/publish flow, auto how-to-play, versioning + fork/credit. **No raw code ever exposed.** *Ship:* a non-programmer can remix Crazy Eights and publish a working variant; discovery lists classics + community games with ratings/trending.

**M5 — AI Co-pilot (2 wks).** In-editor describe→definition translator (Claude, few-shot on the classics), visual diffs of proposed changes, and the **interview** behavior for unfilled required slots (1–2 questions, sensible defaults for minor gaps). Every AI output is validator-gated and hand-editable. *Ship:* type a rules paragraph → get a valid, playable, publishable game; co-pilot asks about the draw-pile-empty case when omitted.

**M6 — Moderation + hardening (1 wk).** Report flow, name/description screening, moderation queue/unpublish, retention windows, load-test the WebSocket path. *Ship:* the public commons is safe to open.

*Total ≈ 13–14 weeks with buffer, matching the ~3–4-month lean target. If time slips, cut the count of classics (10 not 15) and the AI interview polish before cutting the validator/simulator — those are load-bearing.*

---

## 7. Technical considerations & risks

- **Authoring UX is the hardest problem, not the engine.** Turning schema slots into controls a non-programmer enjoys is where products like this die. Mitigation: the authoring *ladder* (remix before skeleton before scratch) means most users never face a blank canvas; knobs are framed as game concepts ("Eights are wild") not fields; the validator gives instant, friendly feedback; the simulator gives confidence before publish.
- **LLM reliability has hard boundaries — respect decision #3.** The co-pilot may produce invalid or subtly-wrong definitions. It is *never* trusted: every output is Validator-gated before it counts as applied, shown as an editable diff, and simulator-checked before publish. The LLM is a drafting aid over a deterministic system; a bad suggestion is a rejected diff, never a broken game. Keep the few-shot examples (the classics) current as the schema evolves.
- **Liquidity / cold-start.** A social play app with no players is empty. Mitigation (already architectural): **every game is instantly playable solo vs bots** because the engine enumerates legal moves — no game ever lacks opponents. Bots fill empty multiplayer seats on request. Launch on the polished classics so there's day-one fun before UGC exists.
- **Moderation of an open commons.** UGC names/descriptions and volume of junk/offensive games. Mitigation: automated screening at publish + report button everywhere + a reviewer queue + versioning so removals don't corrupt saved copies. Rate-limit publishing per new account.
- **Determinism & fairness.** Any nondeterminism (unseeded shuffle, clock/network in the engine) breaks the simulator, replays, and trust. Mitigation: engine is a pure function of `(state, move)`; all randomness via `state.rng`; the engine module has zero I/O by construction (enforced in review/lint).
- **Schema expressiveness vs. simplicity.** Too thin and classics don't fit; too rich and the editor/validator explode. Mitigation: the build order deliberately hand-authors classics *before* the editor — the classics *are* the expressiveness spec, and V1 constrains creation to the shedding/matching family so the editor scope stays tractable.
- **Cheating.** Solved by decision #1: clients hold only redacted state and send intent; the server recomputes legality. A hacked client can request illegal moves and simply gets rejected; it can't see hidden cards it was never sent.

---

## 8. Open questions to resolve before build

1. **Schema predicate depth.** How rich should `when`/effect expressions be for V1? Proposal: exactly enough to encode all shipped classics and the shedding/matching family — freeze it after M2, resist generality creep.
2. **Multi-round matches & scoring targets.** Some classics are single-round, others play to a point target across hands. Confirm the `scoring.target` / round-loop model in §3.8 covers all shipped classics before M2 locks.
3. **Bot quality bar for solo play.** Random-legal is enough to prove the engine; is a light heuristic (shed early, dump high cards) required for solo play to feel fun at launch, or a fast-follow? (Affects M3 scope.)
4. **Moderation ownership.** Who reviews the queue at launch (founder-in-the-loop vs. trusted-user flags vs. purely automated), and what's the SLA? Affects whether M6 needs an admin UI or just a DB-backed queue.
5. **AI co-pilot cost & latency budget.** Per-edit LLM calls have cost/latency; cache aggressively and debounce. Confirm acceptable round-trip and a monthly cost ceiling before M5.
6. **Community game longevity vs. schema evolution.** When the schema version bumps, how are old published definitions migrated or pinned? Proposal: definitions are immutable per version and the interpreter stays backward-compatible across `schemaVersion` — confirm the compatibility policy before opening the commons.
7. **Naming/brand.** "Decky" is a placeholder; lock the name before public launch (affects domain, moderation of impersonation, etc.).
8. **Card-game IP.** Confirm the shipped classics are used under their generic/public-domain rules and names (Uno-like ≠ "Uno"); the family is "shedding/matching," not a branded product.

---

*End of master build spec. A competent lean team can start at M0 without re-deciding anything above.*
