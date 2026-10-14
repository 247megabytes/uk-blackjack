# UK Black Jack — mobile app

Expo SDK 57 · React Native 0.86 · React 19.2 · Reanimated 4.5 · TypeScript (strict).

## Play it on your iPhone (Expo Go)

**Easiest:** let GitHub Actions publish it for you — see [docs/IPHONE_TESTING.md](../../docs/IPHONE_TESTING.md).
The steps below run a dev server on your own computer instead.

1. On the iPhone, install **Expo Go** from the App Store.
2. On your Mac/PC (Node 20+), from the repo root:
   ```bash
   npm install
   npx expo install --check --project-root apps/mobile   # optional: confirms SDK 57 versions
   npm run mobile                                         # starts the Expo dev server
   ```
3. Scan the QR code with the iPhone **Camera** app and tap the banner to open it in Expo Go.
   The phone and computer must be on the same Wi-Fi. If your network blocks that (office/guest
   Wi-Fi, VPN), run `npm run start --workspace @ukbj/mobile -- --tunnel` instead.

Expo Go from the App Store supports SDK 57 (confirmed by Expo, September 2026) and requires you to be
signed in to the same Expo account in both Expo Go and the CLI (`npx expo login`). If Expo Go says the project's SDK is incompatible, Expo has moved to a newer SDK:
run `npx expo install expo@latest --fix` in `apps/mobile`, then try again.

Other targets: `npm run ios --workspace @ukbj/mobile` (iOS Simulator, macOS + Xcode),
`npm run android --workspace @ukbj/mobile`, `npm run web --workspace @ukbj/mobile`.

## Playing a turn (v1.1)
Tap lit cards in the order you want to play them. Each card you pick rises with a number, and the
cards that can follow light up. Tap the last picked card to take it back. The tray shows what will
happen; tap **Play**. Tapping an Ace asks you to call a suit. After a Queen, only its suit lights
up; if you have none, the tray warns you'll pick up one card.

## Structure

```
App.tsx              Screen routing (small in-app router), providers
src/game/            Framework-free game layer — tested headlessly
  match.ts           MatchController: human seat + bots, pacing, Last Card windows
  effects.ts         Engine events → banners + haptic hints; status line
  layout.ts          Seat positions, hand fan/rows, sorting
src/state/           React bindings: useMatch (timers), settings/stats (AsyncStorage), haptics
src/ui/              Cards (SVG suits), hand, piles, seats, banners, results sheet
src/screens/         Home, Play solo setup, Game table, How to play, Settings
test/                Vitest tests for src/game (run from the repo root)
```

The UI never touches `GameState`; it renders the human's redacted `PlayerView` and submits moves
through the engine's `applyAction`, the same path the multiplayer server will use in Phase 3.
