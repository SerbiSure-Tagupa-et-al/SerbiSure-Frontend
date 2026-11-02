const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { validateVersions } = require('./release-policy.cjs');
const version = validateVersions();
const sourceDir = process.argv[2] || 'apks';
const metadata = JSON.parse(fs.readFileSync(path.join(sourceDir, 'output-metadata.json')));
if (metadata.applicationId !== 'com.serbisure.frontend') throw new Error('Wrong Android application');
fs.mkdirSync('dist/apks', { recursive: true });
const checksums = [];
for (const [input, suffix] of [['app-universal-release.apk', ''], ['app-arm64-v8a-release.apk', '-arm64'], ['app-armeabi-v7a-release.apk', '-arm32']]) {
  const item = metadata.elements.find(value => value.outputFile === input);
  const baseCode = JSON.parse(fs.readFileSync('app.json')).expo.android.versionCode;
  const code = baseCode * 1000 + (suffix === '-arm32' ? 1 : suffix === '-arm64' ? 2 : 3);
  if (!item || item.versionName !== version || item.versionCode !== code) throw new Error(`Invalid APK metadata: ${input}`);
  const bytes = fs.readFileSync(path.join(sourceDir, input));
  if (!bytes.length) throw new Error('Empty APK');
  const output = `SerbiSure-v${version}${suffix}.apk`;
  fs.writeFileSync(path.join('dist/apks', output), bytes);
  checksums.push(`${crypto.createHash('sha256').update(bytes).digest('hex')}  ${output}`);
}
fs.writeFileSync('dist/apks/SHA256SUMS.txt', `${checksums.join('\n')}\n`);
