# Progress

## Phase 1 — Foundation ✅ (2026-10-13)

**Done**
- npm-workspaces monorepo, strict TypeScript (`strict`, `noUncheckedIndexedAccess`).
- `@ukbj/game-engine`: complete uk-classic-v1 engine — all required functions (`createDeck`, `shuffleDeck`,
  `createGame`, `dealCards`, `getLegalMoves`, `validateAction`, `applyAction`, `resolveCardEffect`,
  `advanceTurn`, `resolveAttack`, `declareLastCard`, `challengeLastCard`, `checkWinner`,
  `recycleDiscardPile`, `getPlayerView`) plus `findInvariantViolations`.
- `@ukbj/game-bots`: Easy bot, seeded simulation harness, `npm run simulate` CLI.
- `@ukbj/game-protocol`: client/server message types, `toGameAction`, 6-character invite codes.
- 103 tests across 8 files.

**Verified (in the build sandbox)**
- `npm run test:offline`: 103 tests, 103 pass, 0 fail.
- `npm run typecheck:offline`: clean.
- `npm run simulate`: 10,000 games (2,000 each for 2–6 players), 0 invariant violations, all finished.

**Not yet verified**
- `npm test` under real Vitest and `npm run typecheck` with `@types/node` — the sandbox could not reach
  the npm registry. Run both after `npm install`.

**Rules decisions taken (documented in RULES.md)**
- Starter card has no effect.
- Last Card penalty applies only when challenged inside the window; escaping the window is penalty-free.
- No "drawing" from an empty deck while holding a playable card.
- Turn cap (1000) as stall breaker; stalemate goes to fewest cards, ties are draws.

**Known issues / next**
- `apps/mobile` and `apps/server` are placeholders (no dependencies yet).
- Medium/Hard bots deferred until the game is stable.

## Phase 2 — First playable ⏳ next
Expo app, game table screen, local Easy-bot play through `getPlayerView`/`applyAction`.

## Phase 3 — Multiplayer (blocked until Phase 2 is playable and tested)
## Phase 4 — Polish
