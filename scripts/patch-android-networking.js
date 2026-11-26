const fs = require('fs');
const path = require('path');

function writeIfChanged(file, content) {
  if (fs.readFileSync(file, 'utf8') !== content) fs.writeFileSync(file, content, 'utf8');
}

const IPV4_FIRST_DNS_SNIPPET = [
  '.dns(object : okhttp3.Dns {',
  '      override fun lookup(hostname: String): List<java.net.InetAddress> =',
  '        okhttp3.Dns.SYSTEM.lookup(hostname).sortedBy { it !is java.net.Inet4Address }',
  '    })',
].join('\n');

function patchExpoUpdates(projectRoot) {
  const pkgRoot = path.join(projectRoot, 'node_modules', 'expo-updates');
  const { version } = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
  if (version !== '0.25.28') {
    throw new Error(
      'expo-updates networking patch requires 0.25.28; found ' + version + '. Review FileDownloader.kt before upgrading.',
    );
  }
  const file = path.join(
    pkgRoot,
    'android', 'src', 'main', 'java', 'expo', 'modules', 'updates', 'loader', 'FileDownloader.kt',
  );
  const current = fs.readFileSync(file, 'utf8');
  const unpatched = [
    '  private var client: OkHttpClient = OkHttpClient.Builder()',
    '    .cache(getCache(context))',
    '    .connectTimeout(max(configuration.launchWaitMs.toLong(), 10_000L), TimeUnit.MILLISECONDS)',
  ].join('\n');
  const patched = [
    '  private var client: OkHttpClient = OkHttpClient.Builder()',
    `    ${IPV4_FIRST_DNS_SNIPPET}`,
    '    .cache(getCache(context))',
    '    .connectTimeout(max(configuration.launchWaitMs.toLong(), 4_000L), TimeUnit.MILLISECONDS)',
  ].join('\n');

  const normalized = current.replace(/\r\n/g, '\n');
  if (normalized.includes(patched)) return;
  if (!normalized.includes(unpatched)) {
    throw new Error('Unexpected FileDownloader.kt OkHttpClient builder layout in expo-updates.');
  }
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  writeIfChanged(file, normalized.replace(unpatched, patched).replace(/\n/g, eol));
}

function patchExpoFileSystem(projectRoot) {
  const pkgRoot = path.join(projectRoot, 'node_modules', 'expo-file-system');
  const { version } = JSON.parse(fs.readFileSync(path.join(pkgRoot, 'package.json'), 'utf8'));
  if (version !== '17.0.1') {
    throw new Error(
      'expo-file-system networking patch requires 17.0.1; found ' + version + '. Review FileSystemModule.kt before upgrading.',
    );
  }
  const file = path.join(
    pkgRoot,
    'android', 'src', 'main', 'java', 'expo', 'modules', 'filesystem', 'FileSystemModule.kt',
  );
  const current = fs.readFileSync(file, 'utf8');
  const dnsIndented = [
    '          .dns(object : okhttp3.Dns {',
    '            override fun lookup(hostname: String): List<java.net.InetAddress> =',
    '              okhttp3.Dns.SYSTEM.lookup(hostname).sortedBy { it !is java.net.Inet4Address }',
    '          })',
  ].join('\n');
  const unpatched = [
    '        val builder = OkHttpClient.Builder()',
    '          .connectTimeout(60, TimeUnit.SECONDS)',
  ].join('\n');
  const patched = [
    '        val builder = OkHttpClient.Builder()',
    dnsIndented,
    '          .connectTimeout(10, TimeUnit.SECONDS)',
  ].join('\n');

  const normalized = current.replace(/\r\n/g, '\n');
  if (normalized.includes(patched)) return;
  if (!normalized.includes(unpatched)) {
    throw new Error('Unexpected FileSystemModule.kt OkHttpClient builder layout in expo-file-system.');
  }
  const eol = current.includes('\r\n') ? '\r\n' : '\n';
  writeIfChanged(file, normalized.replace(unpatched, patched).replace(/\n/g, eol));
}

function patchAndroidNetworking(projectRoot = path.join(__dirname, '..')) {
  patchExpoUpdates(projectRoot);
  patchExpoFileSystem(projectRoot);
  console.log('Android networking compatibility applied: IPv4-preferred DNS with IPv6 fallback for Expo clients.');
}

if (require.main === module) patchAndroidNetworking();
module.exports = { patchAndroidNetworking };
