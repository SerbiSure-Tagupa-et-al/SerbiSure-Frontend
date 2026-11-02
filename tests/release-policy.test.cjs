const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { classify, compare, validateVersions, validateProductionChannel } = require('../scripts/release-policy.cjs');
const root = path.join(__dirname, '..');
test('native, mixed, JS-only, root entry point and documentation changes select one safe track', () => {
  for (const file of ['android/app/build.gradle', 'package.json', 'package-lock.json', 'app.json', 'app.config.ts', 'eas.json', 'scripts/patch-mediapipe.js', 'plugins/new.js', 'assets/face.task']) {
    assert.deepEqual(classify([file, 'src/a.ts']), { native: true, ota: false }, file);
  }
  for (const file of ['App.tsx', 'src/a.ts', 'assets/logo.png']) assert.deepEqual(classify([file]), { native: false, ota: true });
  assert.deepEqual(classify(['README.md', 'tests/sample.test.cjs']), { native: false, ota: false });
  assert.equal(compare('2.1.10', '2.1.9'), 1); assert.throws(() => compare('nightly', '2.1.9'));
});
test('native versions and runtime agree, including universal APK upgrade ordering', () => {
  assert.equal(validateVersions(), JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version);
  const gradle = fs.readFileSync(path.join(root, 'android/app/build.gradle'), 'utf8');
  assert.match(gradle, /versionCodes\.get\(abi\) \?: 3/);
});

test('a docs-only successor carries pending JavaScript from the published native release', () => {
  assert.deepEqual(classify(['README.md'], ['src/fix.ts']), { native: false, ota: true });
  assert.deepEqual(classify(['tests/check.test.cjs'], ['App.tsx']), { native: false, ota: true });
  assert.deepEqual(classify(['README.md'], ['README.md']), { native: false, ota: false });
  assert.deepEqual(classify(['android/app/build.gradle'], ['src/fix.ts']), { native: true, ota: false });
});
test('the pinned EAS CLI channel response must be active and point only to production', () => {
  const channel = { name: 'production', isPaused: false, updateBranches: [{ name: 'production' }] };
  validateProductionChannel({ currentPage: channel });
  for (const value of [{}, channel, { currentPage: { ...channel, isPaused: true } },
    { currentPage: { ...channel, updateBranches: [{ name: 'preview' }] } },
    { currentPage: { ...channel, updateBranches: [{ name: 'production' }, { name: 'preview' }] } }]) {
    assert.throws(() => validateProductionChannel(value));
  }
});
test('all tests run, required gate cannot hide failures, and privileged workflows only release trusted main builds', () => {
  const pr = fs.readFileSync(path.join(root, '.github/workflows/pr-check.yml'), 'utf8');
  assert.match(pr, /npm ci/); assert.match(pr, /npm test/); assert.match(pr, /npm run typecheck/);
  assert.match(pr, /assembleRelease -x lint -x test --no-daemon/);
  assert.match(pr, /if: always\(\)/); assert.match(pr, /test "\$ANDROID" = success/);
  assert.doesNotMatch(pr, /continue-on-error|pull_request_target/);
  for (const file of ['build-and-release-apk.yml', 'ota-update.yml']) {
    const workflow = fs.readFileSync(path.join(root, '.github/workflows', file), 'utf8');
    assert.match(workflow, /github\.repository == 'SerbiSure-Tagupa-et-al\/SerbiSure-Frontend'/);
    assert.match(workflow, /workflow_run\.event == 'push'/); assert.match(workflow, /workflow_run\.conclusion == 'success'/);
    assert.match(workflow, /run-id: \$\{\{ github\.event\.workflow_run\.id \}\}/);
    assert.doesNotMatch(workflow, /continue-on-error|pull_request_target/);
  }
});
