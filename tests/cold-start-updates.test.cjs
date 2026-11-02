const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const Reconciler = require('react-reconciler');
const { DefaultEventPriority } = require('react-reconciler/constants');

const rootDir = path.resolve(__dirname, '..');
function load(file, mocks, dev = false, frame = callback => callback(0)) {
  const output = ts.transpileModule(fs.readFileSync(path.join(rootDir, file), 'utf8'), {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', '__DEV__', 'requestAnimationFrame', output)(name => {
    if (name === 'react') return { ...React, default: React };
    if (name in mocks) return mocks[name];
    if (/\.(png|ttf)$/.test(name)) return 1;
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports, dev, frame);
  return module.exports;
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const available = { isAvailable: true, isRollBackToEmbedded: false };
const current = { isAvailable: false, isRollBackToEmbedded: false };
const fetched = { isNew: true, isRollBackToEmbedded: false };

function updater(options = {}) {
  const calls = [], frames = [];
  const api = {
    isEnabled: true,
    checkForUpdateAsync: async () => { calls.push('check'); return current; },
    fetchUpdateAsync: async () => { calls.push('fetch'); return fetched; },
    reloadAsync: async () => { calls.push('reload'); },
    ...options.api,
  };
  const state = load('src/app/services/coldStartUpdates.ts', {
    'expo-updates': api, 'react-native': { Platform: { OS: options.platform || 'android' } },
    './nativeAppUpdates': { checkNativeUpdate: options.nativeCheck || (async () => null),
      downloadNativeUpdate: options.nativeDownload, installNativeUpdate: options.nativeInstall,
      openInstallSettings: options.installSettings },
  }, options.dev || false, callback => { frames.push(callback); return frames.length; });
  const paint = async () => { frames.splice(0).forEach(callback => callback(0)); await tick(); };
  return { state, api, calls, frames, paint };
}

test('development and web bypass without any update calls', async () => {
  for (const options of [{ dev: true }, { platform: 'web' }]) {
    const u = updater(options);
    assert.equal(u.state.getUpdatePhase(), 'ready');
    await u.state.startColdStartUpdate(); await u.state.retryColdStartUpdate();
    assert.deepEqual(u.calls, []);
  }
});

test('no update proceeds without fetching, reloading, or displaying an update phase', async () => {
  const u = updater(), phases = [];
  u.state.subscribeUpdatePhase(value => phases.push(value));
  await u.state.startColdStartUpdate();
  assert.equal(u.state.getUpdatePhase(), 'ready');
  assert.deepEqual(u.calls, ['check']);
  assert.equal(phases.includes('downloading'), false);
  assert.equal(phases.includes('restarting'), false);
  await u.state.startColdStartUpdate(); await u.state.retryColdStartUpdate();
  assert.deepEqual(u.calls, ['check']);
});

test('download and finalizing phases paint before native work; successful reload never unlocks old code', async () => {
  const download = deferred();
  const u = updater({ api: { checkForUpdateAsync: async () => available,
    fetchUpdateAsync: () => { u.calls.push('fetch'); return download.promise; } } });
  const run = u.state.startColdStartUpdate(); await tick();
  assert.equal(u.state.getUpdatePhase(), 'downloading');
  assert.deepEqual(u.calls, []);
  await u.paint(); assert.deepEqual(u.calls, ['fetch']);
  download.resolve(fetched); await tick();
  assert.equal(u.state.getUpdatePhase(), 'restarting');
  assert.deepEqual(u.calls, ['fetch']);
  await u.paint(); await run;
  assert.deepEqual(u.calls, ['fetch', 'reload']);
  assert.equal(u.state.getUpdatePhase(), 'restarting');
  await u.state.startColdStartUpdate();
  assert.deepEqual(u.calls, ['fetch', 'reload']);
});

test('network/check failure stays blocked and duplicate Retry taps share one request', async () => {
  const check = deferred(), u = updater({ api: { checkForUpdateAsync: () => { u.calls.push('check'); return check.promise; } } });
  const first = u.state.startColdStartUpdate();
  assert.equal(u.state.startColdStartUpdate(), first);
  check.reject(new Error('offline')); await first;
  assert.equal(u.state.getUpdatePhase(), 'checkError');
  const retried = deferred();
  u.api.checkForUpdateAsync = () => { u.calls.push('check'); return retried.promise; };
  const retry = u.state.retryColdStartUpdate();
  assert.equal(u.state.getUpdatePhase(), 'checking');
  assert.equal(u.state.retryColdStartUpdate(), retry);
  assert.equal(u.state.startColdStartUpdate(), retry);
  await tick(); // Retry checks the native version before checking Expo again.
  assert.deepEqual(u.calls, ['check', 'check']);
  retried.resolve(current); await retry;
  assert.equal(u.state.getUpdatePhase(), 'ready');
});

test('an interrupted download does not reload or unlock; retry fetches a verified update', async () => {
  let attempts = 0;
  const u = updater({ api: { checkForUpdateAsync: async () => available,
    fetchUpdateAsync: async () => { u.calls.push('fetch'); if (++attempts === 1) throw new Error('connection lost'); return fetched; } } });
  const first = u.state.startColdStartUpdate(); await tick(); await u.paint(); await first;
  assert.equal(u.state.getUpdatePhase(), 'error'); assert.deepEqual(u.calls, ['fetch']);
  const retry = u.state.retryColdStartUpdate(); await tick(); await u.paint(); await u.paint(); await retry;
  assert.deepEqual(u.calls, ['fetch', 'fetch', 'reload']);
  assert.equal(u.state.getUpdatePhase(), 'restarting');
});

test('fetch returning no usable update is an error and never reloads', async () => {
  const u = updater({ api: { checkForUpdateAsync: async () => available,
    fetchUpdateAsync: async () => ({ isNew: false, isRollBackToEmbedded: false }) } });
  const run = u.state.startColdStartUpdate(); await tick(); await u.paint(); await run;
  assert.equal(u.state.getUpdatePhase(), 'error');
  assert.equal(u.calls.includes('reload'), false);
});

test('reload failure remains blocked and Retry reuses the downloaded update', async () => {
  let reloads = 0;
  const u = updater({ api: { checkForUpdateAsync: async () => { u.calls.push('check'); return available; },
    reloadAsync: async () => { u.calls.push('reload'); if (++reloads === 1) throw new Error('reload failed'); } } });
  const first = u.state.startColdStartUpdate(); await tick(); await u.paint(); await u.paint(); await first;
  assert.equal(u.state.getUpdatePhase(), 'error');
  const retry = u.state.retryColdStartUpdate(); await u.paint(); await retry;
  assert.deepEqual(u.calls, ['check', 'fetch', 'reload', 'reload']);
  assert.equal(u.state.getUpdatePhase(), 'restarting');
});

test('an Expo rollback directive uses the verified fetch/reload path', async () => {
  const u = updater({ api: { checkForUpdateAsync: async () => ({ isAvailable: false, isRollBackToEmbedded: true }),
    fetchUpdateAsync: async () => ({ isNew: false, isRollBackToEmbedded: true }) } });
  const run = u.state.startColdStartUpdate(); await tick(); await u.paint(); await u.paint(); await run;
  assert.deepEqual(u.calls, ['reload']); assert.equal(u.state.getUpdatePhase(), 'restarting');
});

test('a release with disabled native updates fails closed; a fresh JS launch checks again', async () => {
  const disabled = updater({ api: { isEnabled: false } });
  await disabled.state.startColdStartUpdate(); assert.equal(disabled.state.getUpdatePhase(), 'checkError');
  assert.deepEqual(disabled.calls, []);
  const nextLaunch = updater(); await nextLaunch.state.startColdStartUpdate();
  assert.deepEqual(nextLaunch.calls, ['check']);
});

const append = (parent, child) => { parent.children = parent.children.filter(item => item !== child); parent.children.push(child); };
const remove = (parent, child) => { parent.children = parent.children.filter(item => item !== child); };
const renderer = Reconciler({
  supportsMutation: true, isPrimaryRenderer: true, now: Date.now,
  getRootHostContext: () => null, getChildHostContext: () => null, getCurrentEventPriority: () => DefaultEventPriority,
  prepareForCommit: () => null, resetAfterCommit() {}, shouldSetTextContent: () => false,
  createInstance: (type, props) => ({ type, props, children: [] }), createTextInstance: text => ({ text, children: [] }), getPublicInstance: node => node,
  appendInitialChild: append, appendChild: append, appendChildToContainer: append, removeChild: remove, removeChildFromContainer: remove,
  insertBefore(parent, child, before) { remove(parent, child); parent.children.splice(parent.children.indexOf(before), 0, child); },
  insertInContainerBefore(parent, child, before) { remove(parent, child); parent.children.splice(parent.children.indexOf(before), 0, child); },
  prepareUpdate: () => true, commitUpdate(node, _payload, _type, _old, props) { node.props = props; }, commitTextUpdate(node, _old, text) { node.text = text; },
  finalizeInitialChildren: () => false, clearContainer(node) { node.children = []; },
  scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1, detachDeletedInstance() {},
});
const text = node => node.text || node.children.map(text).join('');
function ui(t, u, { app = false, fontsLoaded = true, restoreSession } = {}) {
  const back = new Set();
  const native = { StyleSheet: { create: value => value }, LogBox: { ignoreLogs() {}, ignoreAllLogs() {} },
    BackHandler: { addEventListener: (name, fn) => { assert.equal(name, 'hardwareBackPress'); back.add(fn); return { remove: () => back.delete(fn) }; } },
    AppState: { addEventListener() { throw new Error('The startup gate must not subscribe to app resume.'); } },
  };
  for (const type of ['ActivityIndicator', 'Image', 'Pressable', 'SafeAreaView', 'ScrollView', 'Text', 'View']) native[type] = type;
  const gate = load('src/app/components/ColdStartUpdateGate.tsx', { 'react-native': native, 'expo-status-bar': { StatusBar: 'StatusBar' },
    '../../shared/utils/releaseNotes': require('../src/shared/utils/releaseNotes'),
    '../services/coldStartUpdates': u.state });
  const calls = { fontLoads: 0, restores: 0 };
  const Component = app ? load('App.tsx', {
    'react-native': native, 'expo-status-bar': { StatusBar: 'StatusBar' }, './src/app/components/ColdStartUpdateGate': gate,
    './src/app/providers/AppProviders': { AppProviders: props => React.createElement('Providers', props, props.children) },
    '@expo-google-fonts/nunito': { useFonts: () => { calls.fontLoads++; return [fontsLoaded]; } },
    './src/features/auth': { LandingScreen: 'Landing', UserSelectionScreen: 'Role', RegistrationStep1: 'Registration1', RegistrationStep2: 'Registration2', RegistrationStep3: 'Registration3', SuspendedAccountScreen: 'Suspended' },
    './src/features/feed/feedCache': { clearExploreFeedCache() {} }, './src/features/chat/store/chatStore': { chatStore: { clearCache() {} } },
    './src/features/chat/supportContactsCache': { clearSupportContactsCache() {} }, './src/features/chat/threadCache': { clearThreadCache() {} },
    './src/app/AppNavigator': { AppNavigator: 'Dashboard' }, './src/app/services/preloadAssets': {}, './src/shared/realtime': { realtime: { stop() {} } },
    './src/features/verification/api/selfieUpload': {},
    './src/shared/auth/session': { subscribeSession: () => () => {}, restoreSession: async () => { calls.restores++; return restoreSession?.(); }, SessionError: class extends Error {} },
  }).default : () => React.createElement(gate.ColdStartUpdateGate, null, React.createElement('Main'));
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const act = callback => { renderer.flushSync(callback); renderer.flushPassiveEffects(); };
  const render = (visible = true) => act(() => renderer.updateContainer(visible ? React.createElement(Component) : null, root, null));
  const nodes = () => { const all = []; const visit = node => { all.push(node); node.children.forEach(visit); }; visit(container); return all; };
  t.after(() => render(false)); render();
  return { act, render, nodes, back, calls, content: () => text(container) };
}

test('root gate prevents fonts, session restoration and main providers until no-update is confirmed', async t => {
  const check = deferred(), u = updater({ api: { checkForUpdateAsync: () => { u.calls.push('check'); return check.promise; } } });
  const screen = ui(t, u, { app: true });
  assert.deepEqual(screen.calls, { fontLoads: 0, restores: 0 });
  assert.match(screen.content(), /Starting SerbiSure/);
  assert.equal(screen.nodes().some(node => node.type === 'Image'), true);
  assert.equal(screen.nodes().some(node => node.type === 'ActivityIndicator'), true);
  assert.equal(screen.nodes().some(node => node.type === 'Providers'), false);
  check.resolve(current); await tick(); await tick();
  assert.equal(screen.calls.restores, 1); assert.ok(screen.calls.fontLoads > 0);
  assert.equal(screen.nodes().some(node => node.type === 'Landing'), true);
  assert.equal(screen.back.size, 0);
  screen.render(); screen.render(false); screen.render(); await tick();
  assert.deepEqual(u.calls, ['check']);
});

test('blocking UI uses friendly English, has only Try Again on failure, and cleans up Back handling', async t => {
  const download = deferred();
  const u = updater({ api: { checkForUpdateAsync: async () => available, fetchUpdateAsync: () => download.promise } });
  const screen = ui(t, u); await tick();
  assert.match(screen.content(), /Updating SerbiSure/);
  assert.match(screen.content(), /Getting your update ready\.\.\. Please keep SerbiSure open\./);
  assert.equal(screen.nodes().some(node => node.type === 'Main'), false);
  assert.equal([...screen.back][0](), true);
  await u.paint(); download.reject(new Error('offline')); await tick();
  assert.match(screen.content(), /We couldn't finish your update\. Please check your connection and try again\./);
  assert.equal(screen.nodes().some(node => node.type === 'ActivityIndicator'), false);
  const buttons = screen.nodes().filter(node => node.type === 'Pressable');
  assert.deepEqual(buttons.map(node => node.props.accessibilityLabel), ['Try Again']);
  u.api.fetchUpdateAsync = async () => fetched;
  screen.act(() => buttons[0].props.onPress()); await tick(); await u.paint();
  assert.match(screen.content(), /Your update is ready\. Opening SerbiSure\.\.\./);
  assert.equal(u.calls.includes('reload'), false);
  await u.paint(); assert.equal(u.calls.includes('reload'), true);
  assert.equal(screen.nodes().some(node => node.type === 'Main'), false);
  screen.render(false); assert.equal(screen.back.size, 0);
});

test('remount during download shares the cold-start operation; unmounted listeners receive no more phases', async t => {
  const check = deferred(), u = updater({ api: { checkForUpdateAsync: () => { u.calls.push('check'); return check.promise; } } });
  const phases = [];
  const unsubscribe = u.state.subscribeUpdatePhase(value => phases.push(value));
  const screen = ui(t, u); await tick(); screen.render(false); unsubscribe(); screen.render();
  check.resolve(available); await tick();
  assert.deepEqual(u.calls, ['check']);
  assert.deepEqual(phases, ['checking', 'checking']);
  await u.paint(); await u.paint();
  assert.deepEqual(u.calls, ['check', 'fetch', 'reload']);
});

test('native and Expo config disable normal silent startup downloads and agree on runtime/channel', () => {
  const config = JSON.parse(fs.readFileSync(path.join(rootDir, 'app.json'), 'utf8')).expo;
  const manifest = fs.readFileSync(path.join(rootDir, 'android/app/src/main/AndroidManifest.xml'), 'utf8');
  assert.equal(config.updates.checkAutomatically, 'ON_ERROR_RECOVERY');
  assert.match(manifest, /EXPO_UPDATES_CHECK_ON_LAUNCH" android:value="ERROR_RECOVERY_ONLY"/);
  assert.match(manifest, /expo.modules.updates.ENABLED" android:value="true"/);
  assert.equal(config.android.runtimeVersion, JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'))).version);
  assert.match(manifest, /expo-channel-name.*production/);
});

test('a native update takes priority over OTA and a cancelled installer never unlocks the app', async t => {
  const release = { version: '9.0.0', notes: 'A new version.', url: 'https://test.invalid/app.apk', size: 50 };
  const download = deferred();
  let checks = 0, downloads = 0, installs = 0;
  const u = updater({ nativeCheck: async () => { checks++; return release; },
    nativeDownload: async (_release, progress) => { downloads++; progress(0.5); return download.promise; },
    nativeInstall: async () => { installs++; } });
  const screen = ui(t, u); await tick();
  assert.equal(checks, 1); assert.deepEqual(u.calls, []);
  assert.match(screen.content(), /New Update Available/);
  assert.match(screen.content(), /What's New/);
  assert.doesNotMatch(screen.content(), /9\.0\.0|\bversion\b|\bAPK\b|\bpermission\b/i);
  const button = screen.nodes().find(node => node.props?.accessibilityLabel === 'Update Now');
  screen.act(() => button.props.onPress()); await tick();
  assert.match(screen.content(), /Getting your update ready\.\.\. Please keep SerbiSure open\./);
  assert.match(screen.content(), /50%/);
  void u.state.startNativeInstall(); assert.equal(downloads, 1);
  download.resolve('file:///app.apk'); await tick(); await tick();
  assert.equal(installs, 1); assert.equal(u.state.getUpdatePhase(), 'installReady');
  assert.equal(screen.nodes().some(node => node.type === 'Main'), false);
  assert.equal(screen.nodes().some(node => node.props?.accessibilityLabel === 'Finish Update'), true);
  assert.equal(screen.nodes().some(node => node.props?.accessibilityLabel === 'Open phone settings'), true);
  assert.match(screen.content(), /If your phone asks, tap 'Allow'/);
  assert.match(screen.content(), /open phone settings below/);
  assert.deepEqual(u.calls, []);
  screen.render(false); screen.render(); await tick(); assert.equal(checks, 1);
});

test('native download failure offers Retry and reuses a complete file when installation is cancelled', async () => {
  let downloads = 0, installs = 0, settings = 0;
  const release = { version: '9.0.0', notes: '', size: 50, url: 'https://test.invalid/app.apk' };
  const u = updater({ nativeCheck: async () => release, nativeDownload: async () => {
    if (++downloads === 1) throw Error('offline'); return 'file:///app.apk';
  }, nativeInstall: async () => { installs++; }, installSettings: async () => { settings++; } });
  await u.state.startColdStartUpdate();
  await u.state.startNativeInstall(); assert.equal(u.state.getUpdatePhase(), 'nativeError');
  await u.state.startNativeInstall(); assert.equal(u.state.getUpdatePhase(), 'installReady');
  await u.state.startNativeInstall(true); assert.equal(settings, 1);
  await u.state.startNativeInstall(); assert.equal(installs, 2); assert.equal(downloads, 2);
  assert.deepEqual(u.calls, []);
});

test('failed version checks do not run OTA; Retry checks the version service again', async () => {
  let attempts = 0;
  const u = updater({ nativeCheck: async () => { if (++attempts === 1) throw Error('503'); return null; } });
  await u.state.startColdStartUpdate(); assert.equal(u.state.getUpdatePhase(), 'checkError'); assert.deepEqual(u.calls, []);
  await u.state.retryColdStartUpdate(); assert.equal(attempts, 2); assert.equal(u.state.getUpdatePhase(), 'ready');
  assert.deepEqual(u.calls, ['check']);
});

test('a stalled native check times out at six seconds, aborts and ignores late results after Retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const first = deferred(), second = deferred();
  const signals = [];
  const u = updater({ nativeCheck: signal => { signals.push(signal); return signals.length === 1 ? first.promise : second.promise; } });
  const screen = ui(t, u);
  t.mock.timers.tick(5999); await tick();
  assert.equal(u.state.getUpdatePhase(), 'checking');
  t.mock.timers.tick(1); await tick();
  assert.equal(signals[0].aborted, true);
  assert.equal(u.state.getUpdatePhase(), 'checkError');
  assert.match(screen.content(), /Connection is slow/);
  assert.doesNotMatch(screen.content(), /Starting SerbiSure/);
  assert.match(screen.content(), /We couldn't check for updates\. Please check your internet connection\./);
  assert.equal(screen.nodes().some(node => node.type === 'ActivityIndicator'), false);
  assert.deepEqual(screen.nodes().filter(node => node.type === 'Pressable').map(node => node.props.accessibilityLabel), ['Try Again']);
  assert.equal(screen.nodes().some(node => node.type === 'Main'), false);
  screen.act(() => screen.nodes().find(node => node.props?.accessibilityLabel === 'Try Again').props.onPress());
  assert.equal(u.state.getUpdatePhase(), 'checking');
  assert.equal(screen.nodes().some(node => node.type === 'ActivityIndicator'), true);
  void u.state.retryColdStartUpdate(); assert.equal(signals.length, 2);
  first.resolve({ version: '9.0.0' }); await tick();
  assert.equal(u.state.getUpdatePhase(), 'checking'); assert.deepEqual(u.calls, []);
  second.resolve(null); await tick();
  assert.equal(u.state.getUpdatePhase(), 'ready');
  assert.equal(screen.nodes().some(node => node.type === 'Main'), true);
});

test('native and OTA availability share one six-second budget; late Expo results cannot unlock or download', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const native = deferred(), ota = deferred();
  const u = updater({ nativeCheck: () => native.promise, api: { checkForUpdateAsync: () => { u.calls.push('check'); return ota.promise; } } });
  const run = u.state.startColdStartUpdate();
  t.mock.timers.tick(4000); native.resolve(null); await tick();
  assert.deepEqual(u.calls, ['check']);
  t.mock.timers.tick(1999); await tick(); assert.equal(u.state.getUpdatePhase(), 'checking');
  t.mock.timers.tick(1); await run;
  assert.equal(u.state.getUpdatePhase(), 'checkError');
  ota.resolve(available); await tick();
  assert.equal(u.state.getUpdatePhase(), 'checkError'); assert.deepEqual(u.calls, ['check']);
  u.api.checkForUpdateAsync = async () => current;
  await u.state.retryColdStartUpdate(); assert.equal(u.state.getUpdatePhase(), 'ready');
});

test('the check deadline is cleared once an update is found; downloads may take longer than six seconds', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const download = deferred();
  const u = updater({ api: { checkForUpdateAsync: async () => available, fetchUpdateAsync: () => download.promise } });
  const run = u.state.startColdStartUpdate(); await tick(); await u.paint();
  t.mock.timers.tick(20000); await tick();
  assert.equal(u.state.getUpdatePhase(), 'downloading');
  download.resolve(fetched); await tick(); await u.paint(); await run;
  assert.equal(u.state.getUpdatePhase(), 'restarting');
});

test('fonts and saved-login restoration keep the branded loader visible after update checks', async t => {
  for (const fontsLoaded of [false, true]) {
    const login = deferred(), u = updater();
    const screen = ui(t, u, { app: true, fontsLoaded, restoreSession: () => login.promise });
    await tick();
    assert.equal(u.state.getUpdatePhase(), 'ready');
    assert.match(screen.content(), /Starting SerbiSure/);
    assert.equal(screen.nodes().some(node => node.type === 'Providers'), false);
    login.resolve(); await tick();
    if (fontsLoaded) assert.equal(screen.nodes().some(node => node.type === 'Landing'), true);
    else assert.match(screen.content(), /Starting SerbiSure/);
  }
});

test('Android keeps its existing logo background until the React startup screen draws', () => {
  const styles = fs.readFileSync(path.join(rootDir, 'android/app/src/main/res/values/styles.xml'), 'utf8');
  const theme = styles.match(/<style name="AppTheme"[\s\S]*?<\/style>/)[0];
  assert.match(theme, /name="android:windowBackground">@drawable\/splashscreen/);
  assert.ok(fs.existsSync(path.join(rootDir, 'assets/serbisure-logo.png')));
});

test('cached developer changelogs are sanitized before rendering and empty notes still show a friendly fallback', async t => {
  for (const notes of ['', 'feat(api): adjust BookingSerializer.ts by @dev in https://github.com/org/app/pull/56\n**Full Changelog**: https://github.com/org/app/compare/v1...v2',
    '• **SerbiSure opens more smoothly.**\n• Clearer messages help you update.']) {
    const release = { version: '9.0.0', notes, size: 50, url: 'https://example.invalid/app.apk' };
    const u = updater({ nativeCheck: async () => release });
    const screen = ui(t, u); await tick();
    assert.match(screen.content(), /What's New/);
    assert.match(screen.content(), /• /);
    assert.doesNotMatch(screen.content(), /feat\(|BookingSerializer|github|@dev|Full Changelog|https:|\*\*|9\.0\.0/);
    if (!notes || notes.startsWith('feat(')) assert.match(screen.content(), /General improvements and bug fixes/);
  }
});

test('installer permission errors keep the download; a deleted cached APK is downloaded again', async () => {
  for (const missing of [false, true]) {
    let downloads = 0, installs = 0;
    const release = { version: '9.0.0', notes: '', size: 50, url: 'https://test.invalid/app.apk' };
    const u = updater({ nativeCheck: async () => release,
      nativeDownload: async () => { downloads++; return 'file:///app.apk'; }, nativeInstall: async () => {
        if (++installs === 1) { const error = Error('installation failed'); if (missing) error.name = 'MissingAPKError'; throw error; }
      } });
    await u.state.startColdStartUpdate(); await u.state.startNativeInstall();
    assert.equal(u.state.getUpdatePhase(), 'nativeError');
    assert.equal(u.state.getNativeUpdateState().path, missing ? null : 'file:///app.apk');
    await u.state.startNativeInstall();
    assert.equal(downloads, missing ? 2 : 1); assert.equal(u.state.getUpdatePhase(), 'installReady');
  }
});
