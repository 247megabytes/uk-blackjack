# Testing UK Black Jack on an iPhone

## How it works
```
push to GitHub ──► GitHub Actions: npm install → Vitest → TypeScript → Expo compatibility check
                                   │ (all green)
                                   ▼
                    eas update --channel preview  ──►  Expo's servers (EAS Update)
                                                              │
                                     iPhone: Expo Go (signed in) ◄─ QR code / link
```
- No commands on your computer. GitHub's servers install, test and publish.
- The published build is hosted by Expo, so it **keeps working after the Claude session or the
  GitHub job ends**. A local `npx expo start` dev server, by contrast, only works while the
  machine running it stays on.
- The app uses only libraries bundled in Expo Go SDK 57 (Reanimated 4, SVG, safe area, haptics,
  AsyncStorage, status bar, expo-updates), so no custom native build is needed.

## One-time setup (about 10 minutes, all doable on the iPhone)
1. **GitHub repository.** The project must be in a GitHub repo you own. An empty repo is fine; Claude
   can push the code into it.
2. **Expo account.** Sign up free at <https://expo.dev/signup>.
3. **Expo access token.** Go to expo.dev → avatar → Account settings → **Access tokens** → Create
   token (name it `github`). Copy it.
4. **GitHub secret.** In the repo: **Settings → Secrets and variables → Actions → New repository
   secret**. Name `EXPO_TOKEN`, value the token.
5. **Expo Go.** Install Expo Go from the App Store, open it, and **sign in with the same Expo
   account**. Since September 2026, Expo Go only opens projects owned by the signed-in account.

## Every new version
1. Push to `main` (or ask Claude to). You can also run it by hand: **Actions → iPhone preview → Run workflow**.
2. Wait for the green tick (about 5–8 minutes). Open the run; its **Summary** shows a QR code and links.
3. On the iPhone, scan the QR code with the Camera app (or tap the link in Safari) → it opens in Expo Go.
4. The **always-latest QR** in the summary follows every new push. Scan it once and Expo Go keeps it
   under Recently opened.

On the first run the workflow creates the Expo project (`eas init`) and commits the project ID back
to `apps/mobile/app.json`. Later runs reuse it.

## If something goes wrong
| Symptom | Fix |
|---|---|
| Workflow summary says "publishing skipped" | The `EXPO_TOKEN` secret is missing or misnamed. |
| Expo Go: "project is incompatible with this version of Expo Go" | Update Expo Go from the App Store. If Expo has moved to SDK 58, bump the SDK (`npx expo install expo@^58 --fix`), or ask Claude to. |
| Expo Go asks you to sign in, or can't find the project | Sign in to Expo Go with the account that created the token. |
| Tests fail in CI | Nothing is published. Open the failed step's log, or ask Claude to read it. |

## Plan B: an installable iOS test build (EAS Build)
Use this only if Expo Go stops working for this project (for example, after adding a library Expo Go
doesn't include).
- Needs an **Apple Developer Program** membership (US$99/year).
- `eas build --profile preview --platform ios` makes an internal-distribution build for registered
  devices (register the iPhone with `eas device:create`, which gives you a link to open on the phone).
  Alternatively, a production build sent to **TestFlight** with `eas submit`.
- Builds take about 15–30 minutes on Expo's servers. The free plan's iOS build quota is limited.
- `eas go` can also put a custom Expo Go build in your TestFlight (Apple membership required).

`apps/mobile/eas.json` already defines `development`, `preview` and `production` profiles. Before the
first EAS Build, replace the placeholder `com.example.ukblackjack` bundle ID with your own.
