// Called by CI right after `eas init`: makes app.json ready for EAS Update by
// pointing updates.url at the project's update service. Idempotent.
import { readFileSync, writeFileSync } from 'node:fs';

const path = process.argv[2] ?? 'apps/mobile/app.json';
const app = JSON.parse(readFileSync(path, 'utf8'));
const projectId = app.expo?.extra?.eas?.projectId;
if (!projectId) {
  console.error('No expo.extra.eas.projectId in app.json — run `eas init` first.');
  process.exit(1);
}
app.expo.updates = { ...(app.expo.updates ?? {}), url: `https://u.expo.dev/${projectId}` };
app.expo.runtimeVersion ??= { policy: 'appVersion' };
writeFileSync(path, JSON.stringify(app, null, 2) + '\n');
console.log(`Linked to Expo project ${projectId}`);
