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

## Phase 2 — First playable ✅ (2026-10-13)

**Done**
- `apps/mobile`: Expo SDK 57 app (React Native 0.86.3, React 19.2.3, Reanimated 4.5.1), portrait,
  dark theme, iPhone-first with Android back-button and edge-to-edge support.
- Screens: Home, Play solo (1–5 bots, name, speed), Game table, How to play, Settings.
- Table: opponents around the top with card counts and a pulsing turn ring, draw and discard piles,
  direction indicator, attack chip, status line, contextual action bar, fanned/sorted hand that folds
  into two rows when crowded, legal-card highlighting, illegal-tap shake with an explanation.
- Animations: thrown discards fly from the player's seat, hand reflow and draw-in, seat count bumps,
  power-card banners, results sheet slide-up, home-screen fan.
- Last Card: arm the brass button before your play; forget and you get a grace window to say it late
  before bots may catch you; catch forgetful bots yourself.
- Results with standings and rematch; on-device stats (played, won, win rate, best streak); haptics.
- `src/game/` controller layer drives bots through the unchanged engine (`packages/` untouched).

**Verified (in the build sandbox)**
- `npm run test:offline`: 132 tests, 132 pass (103 Phase 1 + 29 mobile game-layer, including
  750 full matches driven through the exact UI loop for 1–5 bots).
- Whole app (all screens/components) typechecked against the real React 19 and React Native 0.86.3
  type definitions; a planted-error control confirmed the check catches mistakes. Third-party libraries
  (Reanimated, SVG, haptics, safe-area, storage) were checked against hand-written declarations of the
  APIs used; export names were verified against Reanimated 4.5.1 and expo-haptics 57 sources.
- Headless browser smoke test: the real app code (React 19 dev mode, StrictMode) rendered through a
  DOM shim for React Native, 15 complete games played by clicking, with 1, 3 and 5 bots — 0 console
  errors/warnings, stats persisted, screenshots reviewed (fixed: stale banners, banner over piles,
  overflowing big hands, court-card frame).

**Not yet verified**
- Running on a real device or simulator: the sandbox cannot install npm packages. Native animation
  feel, haptics, fonts and safe areas need a check on your iPhone.
- `npm test` (Vitest) and `npm run typecheck:mobile` after `npm install`.

**Decisions taken**
- Target Expo SDK 57 (current stable; SDK 58 is in preview) so App Store Expo Go can run it.
- No navigation library yet (five screens, simple in-app router); Expo Router can come with Phase 3.
- One tap plays a legal card (no select-then-confirm).
- No sound yet (Phase 4); haptics only. App icon/splash are Expo defaults.
- Placeholder bundle id `com.example.ukblackjack` — needs your real one before TestFlight/Play builds.

## Phase 3 — Multiplayer ⏳ next

## Phase 4 — Polish
