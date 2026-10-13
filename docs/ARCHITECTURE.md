# Architecture

```
uk-blackjack/
  packages/
    game-engine/    Pure rules engine. Zero runtime dependencies. No React, Supabase or Colyseus.
    game-bots/      Bot strategies + seeded simulation harness. Depends only on game-engine.
    game-protocol/  Client↔server message contracts and invite-code helpers.
  apps/
    mobile/         Expo + React Native (+ Expo Web) client — Phase 2.
    server/         Colyseus authoritative rooms — Phase 3.
  docs/
  tools/vitest-shim Offline-only fallback test runner (see TEST_PLAN.md).
```

Dependency direction is strictly one-way: `apps → protocol/bots → engine`.

## Engine model
- **State** (`GameState`): plain JSON-serialisable data — hands, draw/discard piles, turn index,
  direction, pending attack, phase, Last Card window, RNG state, version, event log.
- **Actions** (`GameAction`): `PLAY_CARD`, `DRAW`, `PASS`, `DECLARE_LAST_CARD`,
  `CHALLENGE_LAST_CARD`, and server-only `CLOSE_LAST_CARD_WINDOW`.
- **Transition**: `applyAction(state, action) → { ok, state, events } | { ok: false, error }`.
  Inputs are never mutated (verified by deep-freezing in tests).
- **Phases**: `dealing → playing ⇄ lastCardWindow → finished`.
- **Determinism**: mulberry32 PRNG whose 32-bit state lives in `GameState.rngState`. The same seed and
  action sequence always reproduce the same game, including reshuffles — useful for replays and bug reports.
- **Versioning**: `version` increments by exactly 1 per accepted action. Actions may carry
  `expectedVersion`; mismatches are rejected with `STALE_VERSION`. `schemaVersion` and `rulesetId` are stored.
- **Idempotency**: every action has a client-generated `actionId`. Replaying an applied id returns the
  same state with `duplicate: true`. Rejected actions don't consume their id.
- **Typed errors**: rule violations are returned as `GameError { code, message }`, never thrown.
  Only programmer errors (invalid config) throw `GameConfigError`.
- **Events**: each transition appends version-stamped events (`CARD_PLAYED`, `ATTACK_STACKED`,
  `DISCARDS_RECYCLED`, …) for animation and debugging.
- **Hidden information**: `getPlayerView(state, playerId)` is the only thing that should leave the server or
  reach a bot. It contains the viewer's own hand, opponents' card counts, the top card and pile counts, the
  viewer's legal moves, and an event log with other players' drawn cards redacted.
- **Invariants**: `findInvariantViolations(state)` checks 52-card conservation, uniqueness, turn index,
  attack/top-card consistency, window consistency and end-state sanity.

## Bots
Bots implement `chooseMove(view: PlayerView): MoveIntent | null` and only ever receive a `PlayerView`.
They submit moves through the same `applyAction` path as humans. Easy is implemented; Medium/Hard come
after the game is stable.

## Server (Phase 3 plan)
One Colyseus room per match holds the authoritative `GameState`. Clients send `ClientMessage.move` with an
`actionId` and `expectedVersion`; the server injects the authenticated `playerId` (`toGameAction`), applies it,
and broadcasts a per-player `PlayerView`. Turn timers and the Last Card window timer are server-side; the
server issues `CLOSE_LAST_CARD_WINDOW` and auto-draws on turn timeout. Seeds come from a CSPRNG and are never sent.

## Mobile (Phase 2)
`apps/mobile/src/game/MatchController` owns the `GameState` for an offline match. The UI asks it for a
`Plan` (`human`, `bot` move after a delay, `closeWindow`, `finished`), keyed to the state version: the
`useMatch` hook sets one timer per version and cancels it when the human acts first, so stale bot moves
can never land. Bot decisions are memoised per version (safe under React StrictMode). The UI renders only
the human's `PlayerView`. In Phase 3 the controller is swapped for a Colyseus room client exposing the
same view/act surface.
