// Turns `eas update --json` output into links for the GitHub job summary.
// Expo Go opens updates through qr.expo.dev (slug "exp" = Expo Go, the default).
import { appendFileSync, readFileSync } from 'node:fs';

const [updateJsonPath, appJsonPath, owner = ''] = process.argv.slice(2);
const updates = JSON.parse(readFileSync(updateJsonPath, 'utf8'));
const app = JSON.parse(readFileSync(appJsonPath, 'utf8')).expo;
const projectId = app.extra.eas.projectId;
const ios = updates.find((u) => u.platform === 'ios') ?? updates[0];
if (!ios) throw new Error('eas update returned no updates');

const groupQr = `https://qr.expo.dev/eas-update?projectId=${projectId}&groupId=${ios.group}`;
const channelQr = `https://qr.expo.dev/eas-update?projectId=${projectId}&runtimeVersion=${encodeURIComponent(ios.runtimeVersion)}&channel=preview`;
const page = owner ? `https://expo.dev/accounts/${owner}/projects/${app.slug}/updates/${ios.group}` : '';

let deepLink = '';
try {
  const res = await fetch(`${groupQr}&format=url`);
  if (res.ok) deepLink = (await res.text()).trim();
} catch {
  /* optional */
}

const lines = [
  '## 📱 UK Black Jack is ready for your iPhone',
  '',
  `Published update group \`${ios.group}\` (runtime \`${ios.runtimeVersion}\`, commit \`${(ios.gitCommitHash ?? '').slice(0, 7)}\`).`,
  '',
  '1. Install **Expo Go** from the App Store and **sign in with the same Expo account** that owns the `EXPO_TOKEN`.',
  '2. Scan this QR code with the iPhone Camera, or open this page on the iPhone and tap the link below.',
  '',
  `![Open in Expo Go](${groupQr})`,
  '',
  deepLink ? `**Open this build in Expo Go:** [${deepLink}](${deepLink})` : `QR image: ${groupQr}`,
  '',
  `**Always-latest link (bookmark this — it follows every new push while the app version is ${app.version}):**`,
  '',
  `![Latest preview](${channelQr})`,
  '',
  page ? `Expo dashboard for this update: ${page}` : '',
];
const summary = lines.join('\n') + '\n';
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
console.log(summary);
