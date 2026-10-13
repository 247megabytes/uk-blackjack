# UK Black Jack

Premium mobile-first multiplayer card game based on the British shedding game (not casino Blackjack).
Ruleset: `uk-classic-v1` — see [docs/RULES.md](docs/RULES.md).

## Status
Phase 2 complete: playable offline mobile game (Expo) against 1–5 bots, on top of the Phase 1
deterministic rules engine.
See [docs/PROGRESS.md](docs/PROGRESS.md).

## Requirements
Node.js 20+ (developed on 22) and npm 10+.

## Play on your iPhone
See [apps/mobile/README.md](apps/mobile/README.md) — install Expo Go, run `npm install && npm run mobile`,
scan the QR code.

## Run locally
```bash
npm install              # installs TypeScript, Vitest, tsx, @types/node
npm test                 # full Vitest suite
npm run typecheck        # strict TypeScript across packages and tests
npm run typecheck:mobile # the Expo app
npm run simulate -- 1000 4   # 1,000 seeded games with 4 Easy bots
```

No network access to npm? `npm run test:offline` and `npm run typecheck:offline` run the same suite with a
globally installed `tsx`/`tsc` and Node's built-in test runner.

## Using the engine
```ts
import { startGame, getPlayerView, applyAction } from '@ukbj/game-engine';

let state = startGame({ seed: 'secret-seed', players: [{ id: 'me', name: 'Me' }, { id: 'bot', name: 'Bot' }] });
const view = getPlayerView(state, 'me');            // safe to show / send
const move = view.legalMoves[0]!;
const result = applyAction(state, { ...move, playerId: 'me', actionId: crypto.randomUUID() });
if (result.ok) state = result.state; else console.log(result.error.code);
```

## Layout
See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
