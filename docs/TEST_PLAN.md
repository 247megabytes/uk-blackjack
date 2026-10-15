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
| Suit/rank matching, invalid moves, drawing (v1.2: every pick-up ends the turn, PASS rejected), voluntary draw, idempotency, immutability, stale versions, event stamping | `game-engine/test/turns.test.ts` |
| Stacking 2s, stacking black Jacks, no mixing, red Jack cancel (and limits), Kings, Eights, two-player edge cases, starter card | `game-engine/test/powers.test.ts` |
| Last Card declare/forget/window/challenge, duplicate and late challenges, system-only close, resume order | `game-engine/test/lastcard.test.ts` |
| Winning, no finishing on 2/8/K/J (incl. while defending) | `game-engine/test/winning.test.ts` |
| Recycling, partial draws, MUST_PLAY, stalemate detection/resolution, turn cap | `game-engine/test/exhaustion.test.ts` |
| Hidden-card protection, event redaction, spectators | `game-engine/test/view.test.ts` |
| Multi-card sequences: transitions, runs both ways, rank chains, final power block only (`POWER_COVERED`), covered attacks, defending, Last Card, drawn card next turn | `game-engine/test/sequences.test.ts` |
| Queen covering, cover rules, Ace covers, mandatory cover, one-card penalty, turn end, next player, hidden penalty card | `game-engine/test/queens.test.ts` |
| Wild Aces: any-time play, called suit enforcement, invalid suit choices, attacks, finishing, Ace must be last, A as 1 at the end of a run |
| **v1.2 regression suite, one block per rule**: runs both directions, red Jack cancels any attack (single 2, stacked black Jacks, stacked-then-cancel, nothing after it), pickup ends the turn, final-block powers, Aces last, Last Card to go out (refused / declared on the play / declared earlier / multi-card go-out), Queens unchanged | `game-engine/test/v12.test.ts` |
| **Every example in the v1.2 brief** (runs, unified pick-ups, black-Jack follow rule, drawing ends turns, final-card powers, Aces, Queens, power-card finishes, declared multi-card wins) plus the answered-pick-up regression | `game-engine/test/spec-examples.test.ts` |
| **Final corrections**: persistent pick-up restriction (J♣ 2♦ 3♦, 2 followed by anything ordinary, Queen covered by a 2, red Jack resumes normal play, Ace exception limits), drawing beats extra turns (1v1 8/King after blocked finish, 4-player wrap, 3-player skip kept, window resume, catch penalty), both in Knockouts | `game-engine/test/corrections.test.ts` |
| **Knockouts**: finishing order, skipped seats, active-only 8/King counting, two-player rule by active count, last holder eliminated, final, Last Card in rounds, finished players can't challenge, turn-cap and deadlock elimination with seeded tie-break, forfeits (hand returned, hidden, turn passes, attack cleared, window closed, classic forfeit win, round ends without eliminating last holder), tournament creation, full progression, round summaries, determinism, mid-round and between-round disconnects, spectator views, invariants on every state | `game-engine/test/knockouts.test.ts` | `game-engine/test/aces.test.ts` |
| Easy bot legality, bot isolation, deterministic and bulk seeded simulations (2–6 players × 200 games), v1.2 event coverage, bots always declare on go-out, forfeits in classic, Knockouts tournaments (2–6 × 60) with and without random disconnects | `game-bots/test/simulation.test.ts` |
| Match controller (pacing, memoised bot decisions, Last Card grace/escape/catch, stale plans), 750 matches through the UI drive loop | `apps/mobile/test/match.test.ts` |
| Banners (incl. v1.1 events), status lines, seat layout, hand rows/sorting | `apps/mobile/test/presentation.test.ts` |
| Tap-to-build selection, lit next cards (runs both ways), undo, Ace ends the selection, Queen prompt and penalty warning, Last Card arming and go-out refusal, red Jack vs 2s, covered-power warning, attack preview |
| Knockouts through the UI loop (40 tournaments × 2–6 players), round-results pause, spectator + skip to champion (deterministic), finished human skip to results, round rows / headlines / standings / progress, Knockouts banners | `apps/mobile/test/knockouts.test.ts` | `apps/mobile/test/selection.test.ts` |

## Mobile UI checks
- Typecheck: `npm run typecheck:mobile` (after `npm install`).
- Manual device pass (Expo Go): see `apps/mobile/README.md`. Checklist: deal with 1 and 5 bots; play a
  2 and a black Jack stack; block a 2 and a black Jack with a red Jack; build a run up and a run down;
  play 7♠ 8♠ 9♠ and see "Covered"; cover a Queen; get the Queen pick-up; end a run with an Ace and call a
  suit; draw a playable card and check the turn passes; try to play out without Last Card (reminder),
  then arm it and win; reverse and skip with 2 players; forget Last Card and get caught; catch a bot.
  Knockouts: start with 6 players; finish early and watch (Skip to results); get knocked out (Watch /
  Skip to champion); reach the final; see the champion celebration; check the progress pips.

## Simulation invariants (checked after every accepted action)
52 cards conserved, no duplicates or missing cards, only the current player takes turn actions, version
increments by exactly 1, replaying the action is a no-op, attack state matches the top card, Last Card window
state is consistent, winners have empty hands, no drawn-card state survives (v1.2), finished/forfeited
players hold no cards, finish order matches finished players, the current player is active, at least two
players are active while playing, Knockouts rounds end with ≤1 holder. Tournament checks: nobody eliminated
twice, alive + eliminated = entrants, ≤ entrants − 1 rounds, the champion is the last player alive, every
non-final round eliminates someone, nobody eliminated advances.

## Test quality check
Mutation spot-checks: v1 — disabling red-Jack cancellation or allowing a power-card finish each failed 9 tests.
v1.1 — disabling Queen cover (3), cross-suit runs (2), non-wild Aces (10), Aces finishing (3), no Queen penalty (4).
Final corrections — 2s not live (19), no Ace exception (8), Ace cancels any pick-up (1), extra turn after automatic pick-up (5), extra turn after catch (1).
v1.2 final — no 2/black-Jack mixing (8), no black-Jack follow rule (2), Ace after anything (5), no automatic pick-up on a power finish (19), only 2s answering (14), coverable responses (1).
v1.2 — ascending-only runs (12), every power applies again (12), go-out without Last Card (3), red Jack unable to
cancel 2s (5), Aces allowed mid-sequence (3).

## Extended soak
`npm run simulate -- 2000 6` runs 2,000 seeded games with 6 Easy bots and reports violations.
`npm run simulate -- 2000 6 knockouts` runs 2,000 seeded Knockouts tournaments; add a fourth argument
(e.g. `0.01`) to inject random server forfeits (disconnects) before each action.
