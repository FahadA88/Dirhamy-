# Decky

A data-driven web card-game engine. One deterministic interpreter reads a
`GameDefinition` (pure data). No per-game code.

## Writing style for replies to the user

Short, quick sentences. Straight to the point. No long paragraphs.

## Architecture rules

- The engine is the referee. `MatchService` is the only holder of unredacted
  `MatchState`; callers get a `RedactedState`.
- Rules are data, never `eval`'d. `CustomRule` = when / if / then.
- Definitions are pinned into a match on creation, so a later edit cannot
  change a game in progress.
- Fairness is commit-reveal: `sha256(serverSeed)` is published before dealing.
- No real-money gambling.
- Flag any refactor of working code before doing it.

## Commands

- `npm test` — engine, validator, mechanics, phase 1/2/3/5 acceptance, bundle-size budget, contrast, lint
- `npm run lint` — eslint-plugin-jsx-a11y over the .tsx UI (accessibility regressions fail here)
- `npm run contrast` — WCAG AA contrast ratios for the core theme tokens, both themes
- `npm run typecheck`
- `npm run build`
- `npm run verify:all` — all five browser suites (needs `npm run preview` up on :4173)
