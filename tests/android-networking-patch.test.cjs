const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { patchAndroidNetworking } = require('../scripts/patch-android-networking.js');

function fixture(t, { updatesVersion = '0.25.28', fileSystemVersion = '17.0.1' } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'serbisure-net-patch-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('serbisure-net-patch-'));
    fs.rmSync(root, { recursive: true, force: true });
  });

  const files = {
    'node_modules/expo-updates/package.json': JSON.stringify({ name: 'expo-updates', version: updatesVersion }),
    'node_modules/expo-updates/android/src/main/java/expo/modules/updates/loader/FileDownloader.kt': [
      'class FileDownloader(context: Context, private val configuration: UpdatesConfiguration) {',
      '  private var client: OkHttpClient = OkHttpClient.Builder()',
      '    .cache(getCache(context))',
      '    .connectTimeout(max(configuration.launchWaitMs.toLong(), 10_000L), TimeUnit.MILLISECONDS)',
      '    .readTimeout(max(configuration.launchWaitMs.toLong(), 10_000L), TimeUnit.MILLISECONDS)',
      '    .addInterceptor(BrotliInterceptor)',
      '    .build()',
      '}',
    ].join('\n'),
    'node_modules/expo-file-system/package.json': JSON.stringify({ name: 'expo-file-system', version: fileSystemVersion }),
    'node_modules/expo-file-system/android/src/main/java/expo/modules/filesystem/FileSystemModule.kt': [
      'class FileSystemModule {',
      '  private val okHttpClient: OkHttpClient?',
      '    get() {',
      '      if (client == null) {',
      '        val builder = OkHttpClient.Builder()',
      '          .connectTimeout(60, TimeUnit.SECONDS)',
      '          .readTimeout(60, TimeUnit.SECONDS)',
      '          .writeTimeout(60, TimeUnit.SECONDS)',
      '        client = builder.build()',
      '      }',
      '      return client',
      '    }',
      '}',
    ].join('\n'),
  };

  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, 'utf8');
  }

  return {
    root,
    fileDownloader: path.join(
      root,
      'node_modules/expo-updates/android/src/main/java/expo/modules/updates/loader/FileDownloader.kt',
    ),
    fileSystemModule: path.join(
      root,
      'node_modules/expo-file-system/android/src/main/java/expo/modules/filesystem/FileSystemModule.kt',
    ),
  };
}

test('fresh and repeat installs apply IPv4-first DNS with IPv6 fallback without touching unchanged mtimes', t => {
  const { root, fileDownloader, fileSystemModule } = fixture(t);
  patchAndroidNetworking(root);

  const downloaderContent = fs.readFileSync(fileDownloader, 'utf8');
  const fsModuleContent = fs.readFileSync(fileSystemModule, 'utf8');

  assert.match(downloaderContent, /okhttp3\.Dns\.SYSTEM\.lookup\(hostname\)\.sortedBy \{ it !is java\.net\.Inet4Address \}/);
  assert.match(downloaderContent, /connectTimeout\(max\(configuration\.launchWaitMs\.toLong\(\), 4_000L\), TimeUnit\.MILLISECONDS\)/);
  assert.doesNotMatch(downloaderContent, /connectTimeout\(max\(configuration\.launchWaitMs\.toLong\(\), 10_000L\)/);

  assert.match(fsModuleContent, /okhttp3\.Dns\.SYSTEM\.lookup\(hostname\)\.sortedBy \{ it !is java\.net\.Inet4Address \}/);
  assert.match(fsModuleContent, /\.connectTimeout\(10, TimeUnit\.SECONDS\)/);
  assert.doesNotMatch(fsModuleContent, /\.connectTimeout\(60, TimeUnit\.SECONDS\)/);

  const downloaderMtime = fs.statSync(fileDownloader).mtimeMs;
  const fsModuleMtime = fs.statSync(fileSystemModule).mtimeMs;

  patchAndroidNetworking(root);
  assert.equal(fs.readFileSync(fileDownloader, 'utf8'), downloaderContent);
  assert.equal(fs.readFileSync(fileSystemModule, 'utf8'), fsModuleContent);
  assert.equal(fs.statSync(fileDownloader).mtimeMs, downloaderMtime, 'unchanged patch must preserve mtime');
  assert.equal(fs.statSync(fileSystemModule).mtimeMs, fsModuleMtime, 'unchanged patch must preserve mtime');
});

test('unsupported dependency versions fail closed before modifying native sources', t => {
  const badUpdates = fixture(t, { updatesVersion: '0.26.0' });
  const originalDownloader = fs.readFileSync(badUpdates.fileDownloader, 'utf8');
  assert.throws(() => patchAndroidNetworking(badUpdates.root), /requires 0\.25\.28; found 0\.26\.0/);
  assert.equal(fs.readFileSync(badUpdates.fileDownloader, 'utf8'), originalDownloader);

  const badFs = fixture(t, { fileSystemVersion: '18.0.0' });
  const originalFs = fs.readFileSync(badFs.fileSystemModule, 'utf8');
  assert.throws(() => patchAndroidNetworking(badFs.root), /requires 17\.0\.1; found 18\.0\.0/);
  assert.equal(fs.readFileSync(badFs.fileSystemModule, 'utf8'), originalFs);
});

test('MainApplication and postinstall wire IPv4-preferred DNS across React Native and Expo clients', () => {
  const project = path.join(__dirname, '..');
  const mainApp = fs.readFileSync(
    path.join(project, 'android/app/src/main/java/com/serbisure/frontend/MainApplication.kt'),
    'utf8',
  );
  assert.match(mainApp, /OkHttpClientProvider\.setOkHttpClientFactory/);
  assert.match(mainApp, /Dns\.SYSTEM\.lookup\(hostname\)\.sortedBy \{ it !is Inet4Address \}/);
  assert.match(mainApp, /\.connectTimeout\(10, TimeUnit\.SECONDS\)/);

  const pkg = JSON.parse(fs.readFileSync(path.join(project, 'package.json'), 'utf8'));
  assert.match(pkg.scripts.postinstall, /patch-mediapipe\.js/);
  assert.match(pkg.scripts.postinstall, /patch-android-networking\.js/);
});
