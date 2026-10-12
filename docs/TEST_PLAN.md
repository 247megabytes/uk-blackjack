# Test Plan

## Runners
- **Primary:** Vitest — `npm test` (requires `npm install`).
- **Offline fallback:** `npm run test:offline` runs the *same* test files on Node's built-in test runner via
  `tools/vitest-shim` (a minimal Vitest-compatible `describe/it/expect`). It exists because the initial build
  sandbox had no npm registry access. Prefer Vitest whenever dependencies are installed.

## Coverage map
| Area | File |
|---|---|
| Deck integrity, seeded shuffle, dealing, config validation | `game-engine/test/deck.test.ts` |
| Suit/rank matching, invalid moves, drawing, drawn-card play/pass, voluntary draw, idempotency, immutability, stale versions, event stamping | `game-engine/test/turns.test.ts` |
| Stacking 2s, stacking black Jacks, no mixing, red Jack cancel (and limits), Kings, Eights, two-player edge cases, starter card | `game-engine/test/powers.test.ts` |
| Last Card declare/forget/window/challenge, duplicate and late challenges, system-only close, resume order | `game-engine/test/lastcard.test.ts` |
| Winning, no finishing on 2/8/K/J (incl. while defending) | `game-engine/test/winning.test.ts` |
| Recycling, partial draws, MUST_PLAY, stalemate detection/resolution, turn cap | `game-engine/test/exhaustion.test.ts` |
| Hidden-card protection, event redaction, spectators | `game-engine/test/view.test.ts` |
| Easy bot legality, bot isolation, deterministic and bulk seeded simulations (2–6 players × 200 games) | `game-bots/test/simulation.test.ts` |

## Simulation invariants (checked after every accepted action)
52 cards conserved, no duplicates or missing cards, only the current player takes turn actions, version
increments by exactly 1, replaying the action is a no-op, attack state matches the top card, Last Card window
state is consistent, winners have empty hands.

## Test quality check
Mutation spot-checks were run: disabling red-Jack cancellation, or allowing a finish on a power card, each
caused 9 tests to fail.

## Extended soak
`npm run simulate -- 2000 6` runs 2,000 seeded games with 6 Easy bots and reports violations.
