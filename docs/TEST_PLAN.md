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
| Multi-card sequences: transitions, runs, rank chains, every power applies, covered attacks, defending, Last Card, drawn card | `game-engine/test/sequences.test.ts` |
| Queen covering, cover rules, Ace covers, mandatory cover, one-card penalty, turn end, next player, hidden penalty card | `game-engine/test/queens.test.ts` |
| Wild Aces: any-time play, called suit enforcement, invalid suit choices, attacks, finishing, sequences, A as 1 | `game-engine/test/aces.test.ts` |
| Easy bot legality, bot isolation, deterministic and bulk seeded simulations (2–6 players × 200 games) | `game-bots/test/simulation.test.ts` |
| Match controller (pacing, memoised bot decisions, Last Card grace/escape/catch, stale plans), 750 matches through the UI drive loop | `apps/mobile/test/match.test.ts` |
| Banners (incl. v1.1 events), status lines, seat layout, hand rows/sorting | `apps/mobile/test/presentation.test.ts` |
| Tap-to-build selection, lit next cards, undo, suit picker flow, Queen prompt and penalty warning, Last Card arming, attack preview | `apps/mobile/test/selection.test.ts` |

## Mobile UI checks
- Typecheck: `npm run typecheck:mobile` (after `npm install`).
- Manual device pass (Expo Go): see `apps/mobile/README.md`. Checklist: deal with 1 and 5 bots; play a
  2 and a black Jack stack; block with a red Jack; build a 3-card run; cover a Queen; get the Queen
  pick-up; call a suit with an Ace and see the chip; reverse and skip with 2 players; forget Last Card and
  get caught; catch a bot; win, lose, rematch; leave mid-game; toggle haptics and highlighting.

## Simulation invariants (checked after every accepted action)
52 cards conserved, no duplicates or missing cards, only the current player takes turn actions, version
increments by exactly 1, replaying the action is a no-op, attack state matches the top card, Last Card window
state is consistent, winners have empty hands.

## Test quality check
Mutation spot-checks: v1 — disabling red-Jack cancellation or allowing a power-card finish each failed 9 tests.
v1.1 — disabling Queen cover (3), cross-suit runs (2), non-wild Aces (10), Aces finishing (3), no Queen penalty (4).

## Extended soak
`npm run simulate -- 2000 6` runs 2,000 seeded games with 6 Easy bots and reports violations.
