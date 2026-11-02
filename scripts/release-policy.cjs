const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
function classify(files) {
  const native = files.some(file => /^(android\/|ios\/|plugins\/|modules\/|patches\/|scripts\/|\.github\/(?:workflows|actions)\/)/.test(file)
    || /^(package(?:-lock)?\.json|app\.json|app\.config\.[cm]?[jt]s|eas\.json|react-native\.config\.[cm]?js|expo-module\.config\.json|\.npmrc)$/.test(file)
    || /^assets\/.*\.(?:task|tflite)$/.test(file));
  const javascript = files.some(file => /^(src\/|assets\/|App\.tsx$|index\.[jt]s$|(?:babel|metro)\.config\.[cm]?js$|tsconfig\.json$)/.test(file));
  return { native, ota: !native && javascript };
}
function changes(base, head) {
  if (!/^[a-f0-9]{40}$/.test(head) || !/^[a-f0-9]{40}$/.test(base)) throw new Error('Commit SHAs are required');
  const args = /^0+$/.test(base) ? ['ls-tree', '-r', '--name-only', '-z', head]
    : ['diff', '--name-only', '--no-renames', '-z', base, head];
  return execFileSync('git', args, { encoding: 'utf8' }).split('\0').filter(Boolean);
}
function compare(a, b) {
  if (![a, b].every(value => /^\d+\.\d+\.\d+$/.test(value))) throw new Error('Use a stable X.Y.Z version');
  const left = a.split('.').map(Number), right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
  return 0;
}
function validateProductionChannel(result) {
  // eas-cli 16.28.0 channel:view --json wraps its channel in currentPage.
  const channel = result.currentPage;
  if (!channel || channel.name !== 'production' || channel.isPaused !== false
    || channel.updateBranches?.length !== 1 || channel.updateBranches[0].name !== 'production') {
    throw new Error('The active production channel must point only to the production branch');
  }
}
function validateVersions(base, native) {
  const pkg = JSON.parse(fs.readFileSync('package.json'));
  const lock = JSON.parse(fs.readFileSync('package-lock.json'));
  const app = JSON.parse(fs.readFileSync('app.json')).expo;
  const gradle = fs.readFileSync('android/app/build.gradle', 'utf8');
  const strings = fs.readFileSync('android/app/src/main/res/values/strings.xml', 'utf8');
  compare(pkg.version, pkg.version);
  if ([app.version, app.android.runtimeVersion, lock.version, lock.packages[''].version,
    gradle.match(/versionName "([^"]+)"/)?.[1], strings.match(/name="expo_runtime_version">([^<]+)/)?.[1]]
    .some(value => value !== pkg.version)) throw new Error('Package, lockfile, app, native version and runtime must match');
  if (Number(gradle.match(/versionCode (\d+)/)?.[1]) !== app.android.versionCode) throw new Error('Android version codes must match');
  if (base && !/^0+$/.test(base)) {
    const previous = JSON.parse(git('show', `${base}:package.json`));
    const previousApp = JSON.parse(git('show', `${base}:app.json`)).expo;
    if (native && (compare(pkg.version, previous.version) <= 0 || app.android.versionCode <= previousApp.android.versionCode)) {
      throw new Error('Native changes require a new version, runtime and increasing Android versionCode');
    }
    if (!native && pkg.version !== previous.version) throw new Error('JS-only changes must keep the native version');
  }
  return pkg.version;
}
if (require.main === module) {
  if (process.argv[2] === 'verify-ota') {
    const tag = `v${validateVersions()}`;
    git('merge-base', '--is-ancestor', tag, 'HEAD');
    if (classify(changes(git('rev-parse', `${tag}^{commit}`), git('rev-parse', 'HEAD'))).native) {
      throw new Error('Native changes since the published APK cannot be sent through OTA');
    }
  } else {
    const [base, head] = process.argv.slice(2);
    const result = { ...classify(changes(base, head)), sha: head };
    validateVersions(base, result.native);
    fs.writeFileSync('release-plan.json', JSON.stringify(result));
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `native=${result.native}\nota=${result.ota}\n`);
    console.log(JSON.stringify(result));
  }
}
module.exports = { classify, changes, compare, validateVersions, validateProductionChannel };
