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
- One tap plays a legal card (no select-then-confirm). *(Superseded in v1.1 by tap-to-build + Play.)*
- No sound yet (Phase 4); haptics only. App icon/splash are Expo defaults.
- Placeholder bundle id `com.example.ukblackjack` — needs your real one before TestFlight/Play builds.

## Rules update — uk-classic-v1.1 ✅ (2026-10-14)

**Done**
- Engine: `PLAY_CARDS` (ordered multi-card turns), Queen covering and the one-card Queen penalty,
  wild Aces with a called suit (`state.activeSuit`), schema v2, new events (`SEQUENCE_PLAYED`,
  `SUIT_CHOSEN`, `QUEEN_COVERED`, `QUEEN_UNCOVERED`, `ATTACK_NEUTRALISED`, draw reason `queenPenalty`).
  Card rules live in `packages/game-engine/src/sequence.ts`, shared by the engine, bots and app.
- Easy bots build random legal sequences, cover Queens, take the Queen penalty and call random suits.
- Mobile: tap cards to build an ordered sequence (lit next cards, numbered badges, tap to undo),
  a sequence tray with a Play button and live guidance, a Queen cover prompt, a suit picker for
  Aces, a "suit called" chip, and banners for sequences, called suits, Queen pick-ups, covered
  attacks and "Your turn". How to Play is updated.
- Interaction rules confirmed with the product owner and documented in RULES.md.

**Verified (in the build sandbox)**
- `npm run test:offline`: 200 tests, 200 pass — 105 migrated regression tests (3 updated for
  deliberate v1.1 changes: ruleset id, Aces/Queens can no longer finish, A♠ draw now playable),
  47 new engine tests (sequences, Queens, Aces), 10 bot tests, 38 mobile tests.
- 10,000 seeded Easy-bot simulations (2,000 each for 2–6 players): all finished, 0 invariant
  violations, 0 rejected bot moves.
- Mutation checks: disabling Queen cover, allowing cross-suit runs, making Aces non-wild, letting
  Aces finish, or switching off the Queen penalty each caused failing tests (2–10 per mutation).
- Engine strict typecheck clean; the whole app typechecks against real React 19 / React Native
  0.86.3 typings.
- Headless browser: 15 UI games (1, 3, 5 bots) with real taps — multi-card plays, suit picks,
  Queen covers and Queen pick-ups — 0 console errors or warnings.

**Not yet verified**
- On-device behaviour (iPhone/Expo Go), and `npm test` / `npm run typecheck:mobile` after
  `npm install`; the sandbox cannot install npm packages.
- Drag-to-play is not implemented; tap-to-build replaced the one-tap play.

**Interpretations I made that need your sign-off**
- "Covering a 2 cancels it" is also applied to a black Jack covered by an Ace.
- Skips and reverses from a sequence resolve at the end of the turn using the final direction.
- A Queen cover counts as unavailable if it would have to be an illegal finishing card.

## iPhone delivery pipeline (2026-10-14)
- The Claude sandbox cannot reach npm, Expo or any tunnel service (blocked by organisation egress
  policy), so a dev server there can't be reached from a phone. The delivery path is GitHub Actions →
  EAS Update → Expo Go instead; see docs/IPHONE_TESTING.md.
- Added `expo-updates` (~57.0.26), `runtimeVersion: {policy: appVersion}`, `eas.json` (development /
  preview / production profiles), `.github/workflows/ci.yml` (real Vitest, tsc, `expo install --check`,
  expo-doctor, simulations) and `.github/workflows/iphone-preview.yml` (tests, then `eas init` on first
  run and `eas update --channel preview`, then a QR code in the job summary).
- Removed the deprecated `android.edgeToEdgeEnabled` flag (edge-to-edge is always on in current SDKs).

## Rules update — uk-classic-v1.2 + Knockouts ✅ (2026-10-14)

**Done**
- Engine (`RULESET_ID = uk-classic-v1.2`, schema v3): runs go up or down; red Jacks cancel any attack;
  every pick-up ends the turn (PASS retired, no drawn-card state); only the final block of power cards
  acts (`POWER_COVERED` event); Aces must end a sequence (`ACE_MUST_BE_LAST`); going out needs Last Card
  (`LAST_CARD_NOT_DECLARED`); Queen covering unchanged.
- Knockout mode in the engine (`mode: 'knockout'`): player `status`, `finishOrder`, `PLAYER_FINISHED`,
  skip-aware turn order over active players, `ROUND_COMPLETE` with `eliminatedId`, stalled rounds
  eliminate the most cards (seeded tie-break).
- `FORFEIT` action (self or server) for leaves and disconnects in both modes; hand reshuffled into the
  deck, no card ids revealed.
- `src/tournament.ts`: deterministic Knockouts tournaments (`createTournament`, `applyTournamentAction`
  with `NEXT_ROUND` / `LEAVE_TOURNAMENT`, `getTournamentView`, `tournamentStandings`).
- Bots always declare on going out; `simulateTournament`; forfeit injection in both simulators; CLI
  `npm run simulate -- <games> <players> [classic|knockouts] [forfeitChance]`.
- Protocol v2: `leave` / `nextRound` client messages, `tournament` / `playerLeft` server messages,
  `forfeitAction`.
- Mobile: Classic/Knockouts mode selector; tournament-aware `MatchController` (round-keyed plans,
  `roundOver`, `nextRound`, `fastForward`); header progress (round label + pips); seat badges for
  finished/left players; round-results sheet; champion celebration with confetti; spectator mode with
  Skip to results / Skip to champion; Last Card reminder and pulsing button for go-outs; covered-power
  warning in the tray; no Pass button; banners for finishing, forfeits, knock-outs and covered powers;
  How to Play rewritten; Knockouts stats (played / titles).

**Verified (in the build sandbox)**
- `npm run test:offline`: 298 tests, 298 pass, 0 fail (57 suites). 26 existing tests were rewritten
  where v1.2 deliberately changes behaviour (drawn-card play and PASS, every-power-applies, Aces
  mid-sequence, red Jacks vs 2s, go-outs now declared, ruleset/schema ids); new suites `v12.test.ts`,
  `knockouts.test.ts` (engine) and `knockouts.test.ts` (mobile).
- `npm run typecheck:offline` clean; the whole app typechecks against real React 19 / React Native 0.86.3
  typings (planted-error control caught).
- Simulations: 10,000 Classic games (2,000 each for 2–6 players): all won, 0 violations, 0 rejected
  moves. 10,000 Knockouts tournaments (2,000 each for 2–6 players, 30,000 rounds): all complete, 0
  violations. With random disconnects (1% per action): 3,000 Classic games and 3,000 tournaments,
  0 violations.
- Mutation checks: ascending-only runs (12 failing tests), every power applying (12), go-out without Last
  Card (3), red Jack not cancelling 2s (5), Aces mid-sequence (3).
- Headless browser (real app code, DOM shim): 4 Classic games and 5 Knockouts tournaments (4- and
  6-player) played by tapping, including round results, skips, play-outs with Last Card and the champion
  screen: 0 console errors or warnings. Fixed during this pass: the "Tap Catch" banner shown to players
  who can no longer challenge; a "0" count badge on finished seats.

**Not yet verified**
- On-device feel (iPhone / Expo Go) of the new overlays and confetti; real Vitest / `tsc` with installed
  dependencies run in GitHub Actions on push.
- Natural stalled rounds never occurred in simulation; that path is covered by engine tests that force
  the turn cap and a deadlock.

**Interpretations awaiting sign-off** — listed at the end of docs/RULES.md (Ace covering a power card,
2s-then-red-Jack, attack cleared on forfeit, forfeit leaving one holder, stalled survivor ranking,
two-player rules by active count, finished players can't challenge, random first player each round).

## Phase 3 — Multiplayer ⏳ next

## Phase 4 — Polish
