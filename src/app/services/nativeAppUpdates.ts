import * as Application from 'expo-application';
import * as FileSystem from 'expo-file-system';
import * as IntentLauncher from 'expo-intent-launcher';
import { buildApiUrl } from '../../shared/api/config';

export type NativeRelease = { version: string; notes: string; url: string; size: number };
const repository = 'SerbiSure-Tagupa-et-al/SerbiSure-Frontend';

export function versionParts(version: string): [number, number, number] {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Invalid release version');
  const parts = version.split('.').map(Number);
  if (!parts.every(Number.isSafeInteger)) throw new Error('Invalid release version');
  return parts as [number, number, number];
}

export function isNewerVersion(latest: string, installed: string): boolean {
  const left = versionParts(latest), right = versionParts(installed);
  for (const index of [0, 1, 2] as const) if (left[index] !== right[index]) return left[index] > right[index];
  return false;
}

export async function checkNativeUpdate(): Promise<NativeRelease | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(buildApiUrl('/api/v1/app-version/'), { signal: controller.signal });
    if (!response.ok) throw new Error('Version check failed');
    const data = await response.json();
    // No published release yet is different from an unreachable version service.
    if (data.latest_version === null && data.apk_url === null) return null;
    if (typeof data.latest_version !== 'string' || typeof data.apk_url !== 'string'
      || !Number.isSafeInteger(data.apk_size) || data.apk_size <= 0) throw new Error('Invalid release information');
    const installed = Application.nativeApplicationVersion;
    if (!installed) throw new Error('Installed app version is unavailable');
    if (!isNewerVersion(data.latest_version, installed)) return null;
    // Only the official universal release asset may be installed. No arbitrary download URLs.
    const escapedVersion = data.latest_version.replace(/\./g, '\\.');
    const urlPattern = new RegExp(`^https://github\\.com/${repository}/releases/download/v?${escapedVersion}/SerbiSure-v${escapedVersion}\\.apk$`);
    if (!urlPattern.test(data.apk_url)) throw new Error('Invalid APK address');
    return { version: data.latest_version, notes: typeof data.release_notes === 'string' ? data.release_notes.slice(0, 12000) : '',
      url: data.apk_url, size: data.apk_size };
  } finally { clearTimeout(timeout); }
}

export async function downloadNativeUpdate(release: NativeRelease, onProgress: (value: number | null) => void): Promise<string> {
  if (!FileSystem.cacheDirectory) throw new Error('Storage is unavailable');
  const folder = `${FileSystem.cacheDirectory}app-updates/`;
  const path = `${folder}SerbiSure-v${release.version}.apk`, partial = `${path}.part`;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
  await FileSystem.deleteAsync(partial, { idempotent: true });
  onProgress(0);
  try {
    const task = FileSystem.createDownloadResumable(release.url, partial, {}, progress => {
      onProgress(Math.min(1, Math.max(0, progress.totalBytesWritten / release.size)));
    });
    const result = await task.downloadAsync();
    const info = await FileSystem.getInfoAsync(partial);
    if (!result || result.status !== 200 || !info.exists || info.isDirectory || info.size !== release.size) {
      throw new Error('Incomplete APK download');
    }
    await FileSystem.deleteAsync(path, { idempotent: true });
    await FileSystem.moveAsync({ from: partial, to: path });
    onProgress(1);
    return path;
  } catch (error) {
    await FileSystem.deleteAsync(partial, { idempotent: true }).catch(() => {});
    throw error;
  }
}

export async function installNativeUpdate(path: string, release: NativeRelease): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists || info.isDirectory || info.size !== release.size) {
    const error = new Error('Downloaded APK is no longer available');
    error.name = 'MissingAPKError';
    throw error;
  }
  const uri = await FileSystem.getContentUriAsync(path);
  await IntentLauncher.startActivityAsync('android.intent.action.INSTALL_PACKAGE', {
    data: uri, type: 'application/vnd.android.package-archive', flags: 1,
    extra: { 'android.intent.extra.RETURN_RESULT': true },
  });
  // Returning from the installer is not proof of installation (it can be cancelled).
  // Keep the gate blocked. Android replaces the app and normally stops this process
  // on success; the user can then choose Open in the system installer.
}

export async function openInstallSettings(): Promise<void> {
  if (!Application.applicationId) throw new Error('App identity is unavailable');
  await IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES', {
    data: `package:${Application.applicationId}`,
  });
}
