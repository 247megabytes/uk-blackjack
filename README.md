# UK Black Jack

Premium mobile-first multiplayer card game based on the British shedding game (not casino Blackjack).
Ruleset: `uk-classic-v1.2` (multi-card turns both ways, final-card powers, Queen covering, wild Aces that end the turn, Last Card to go out) plus **Knockouts** mode — see [docs/RULES.md](docs/RULES.md).

## Status
Phase 2 complete: playable offline mobile game (Expo) against 1–5 bots, on top of the Phase 1
deterministic rules engine.
See [docs/PROGRESS.md](docs/PROGRESS.md).

## Requirements
Node.js 20+ (developed on 22) and npm 10+.

## Play on your iPhone
**No computer needed:** push to `main` and GitHub Actions tests the game, then publishes it to Expo
(EAS Update). Open it in Expo Go from the QR code in the workflow summary. One-time setup and your
Expo Go links are in [docs/IPHONE_TESTING.md](docs/IPHONE_TESTING.md).

With a computer: `npm install && npm run mobile`, then scan the QR code (see [apps/mobile/README.md](apps/mobile/README.md)).

## Run locally
```bash
npm install              # installs TypeScript, Vitest, tsx, @types/node
npm test                 # full Vitest suite
npm run typecheck        # strict TypeScript across packages and tests
npm run typecheck:mobile # the Expo app
npm run simulate -- 1000 4   # 1,000 seeded games with 4 Easy bots
npm run simulate -- 1000 6 knockouts   # 1,000 seeded Knockouts tournaments
```

No network access to npm? `npm run test:offline` and `npm run typecheck:offline` run the same suite with a
globally installed `tsx`/`tsc` and Node's built-in test runner.

## Using the engine
```ts
import { startGame, getPlayerView, applyAction } from '@ukbj/game-engine';

let state = startGame({ seed: 'secret-seed', players: [{ id: 'me', name: 'Me' }, { id: 'bot', name: 'Bot' }] });
const view = getPlayerView(state, 'me');            // safe to show / send
const move = view.legalMoves[0]!; // e.g. { type: 'PLAY_CARDS', plays: [{ cardId: '7S' }] }
const result = applyAction(state, { ...move, playerId: 'me', actionId: crypto.randomUUID() });
if (result.ok) state = result.state; else console.log(result.error.code);
```

## Layout
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
