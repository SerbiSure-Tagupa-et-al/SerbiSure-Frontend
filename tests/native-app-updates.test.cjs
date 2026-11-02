const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/app/services/nativeAppUpdates.ts'), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
}).outputText;
const url = 'https://github.com/SerbiSure-Tagupa-et-al/SerbiSure-Frontend/releases/download/v2.1.10/SerbiSure-v2.1.10.apk';
const payload = { latest_version: '2.1.10', release_notes: 'New release', apk_url: url, apk_size: 70 };
function service(options = {}) {
  const files = new Map(), intents = [], moves = [];
  const application = { nativeApplicationVersion: options.installed || '2.1.9', applicationId: 'com.serbisure.frontend' };
  const disk = { cacheDirectory: 'file:///cache/', makeDirectoryAsync: async () => {},
    deleteAsync: async file => { files.delete(file); },
    getInfoAsync: async file => files.has(file) ? { exists: true, isDirectory: false, size: files.get(file) } : { exists: false },
    moveAsync: async value => { moves.push(value); files.set(value.to, files.get(value.from)); files.delete(value.from); },
    getContentUriAsync: async file => `content://app/${file.split('/').at(-1)}`,
    createDownloadResumable: (_url, file, _options, progress) => ({ downloadAsync: async () => {
      files.set(file, options.size ?? 70); progress({ totalBytesWritten: 35 });
      if (options.fail) throw Error('offline'); return { status: options.status ?? 200, uri: file };
    } }),
  };
  const mocks = { 'expo-application': application, 'expo-file-system': disk,
    'expo-intent-launcher': { startActivityAsync: async (...args) => { intents.push(args); return { resultCode: 0 }; } },
    '../../shared/api/config': { buildApiUrl: endpoint => `https://backend.test${endpoint}` } };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (!(name in mocks)) throw Error(`Unexpected dependency ${name}`); return mocks[name];
  }, module, module.exports);
  return { api: module.exports, files, intents, moves, disk };
}
test('version comparisons are numeric and reject malformed versions', () => {
  const { api } = service();
  assert.equal(api.isNewerVersion('2.1.10', '2.1.9'), true);
  assert.equal(api.isNewerVersion('2.1.9', '2.1.10'), false);
  assert.equal(api.isNewerVersion('2.1.10', '2.1.10'), false);
  for (const value of ['v2.1.2', 'latest', '2.1', '2.1.2-beta']) assert.throws(() => api.isNewerVersion(value, '2.1.0'));
});
test('version API uses the installed native version and only trusts the universal official asset', async t => {
  const { api } = service(); let requested;
  t.mock.method(global, 'fetch', async endpoint => { requested = endpoint; return { ok: true, json: async () => payload }; });
  const release = await api.checkNativeUpdate();
  assert.equal(requested, 'https://backend.test/api/v1/app-version/');
  assert.equal(release.version, '2.1.10'); assert.equal(release.url, url);
  const current = service({ installed: '2.1.10' }); assert.equal(await current.api.checkNativeUpdate(), null);
  for (const apk_url of [url.replace('github.com', 'github.com.evil.test'), url.replace('.apk', '-arm64.apk'), 'http://example.test/app.apk']) {
    t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ ...payload, apk_url }) }));
    await assert.rejects(api.checkNativeUpdate);
  }
});
test('no release is distinct from network, HTTP and malformed responses', async t => {
  const { api } = service();
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ latest_version: null, apk_url: null }) }));
  assert.equal(await api.checkNativeUpdate(), null);
  for (const result of [{ ok: false }, { ok: true, json: async () => ({ ...payload, apk_size: 0 }) }, { ok: true, json: async () => ({}) }]) {
    t.mock.method(global, 'fetch', async () => result); await assert.rejects(api.checkNativeUpdate);
  }
  t.mock.method(global, 'fetch', async () => { throw Error('offline'); }); await assert.rejects(api.checkNativeUpdate);
});
test('only a complete successful download becomes an APK; installer uses a read-granted content URI', async () => {
  const { api, intents, moves } = service(), progress = [];
  const release = { version: '2.1.10', notes: '', url, size: 70 };
  const file = await api.downloadNativeUpdate(release, value => progress.push(value));
  assert.equal(moves.length, 1); assert.match(moves[0].from, /\.apk\.part$/);
  assert.deepEqual(progress, [0, 0.5, 1]);
  await api.installNativeUpdate(file, release);
  assert.equal(intents[0][0], 'android.intent.action.INSTALL_PACKAGE');
  assert.match(intents[0][1].data, /^content:/); assert.equal(intents[0][1].flags, 1);
  await api.openInstallSettings(); assert.equal(intents[1][1].data, 'package:com.serbisure.frontend');
});
test('HTTP errors, truncated files and interrupted downloads are removed and never installed', async () => {
  for (const options of [{ status: 404 }, { size: 69 }, { fail: true }]) {
    const { api, files, moves, intents } = service(options);
    await assert.rejects(() => api.downloadNativeUpdate({ version: '2.1.10', url, size: 70 }, () => {}));
    assert.equal(files.size, 0); assert.equal(moves.length, 0); assert.equal(intents.length, 0);
  }
  const { api, intents } = service();
  await assert.rejects(() => api.installNativeUpdate('file:///missing.apk', { size: 70 }));
  assert.equal(intents.length, 0);
});
