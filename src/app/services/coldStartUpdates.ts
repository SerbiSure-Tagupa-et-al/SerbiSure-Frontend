import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import { checkNativeUpdate, downloadNativeUpdate, installNativeUpdate, openInstallSettings, type NativeRelease } from './nativeAppUpdates';

export type UpdatePhase = 'checking' | 'downloading' | 'restarting' | 'error' | 'ready'
  | 'nativeAvailable' | 'apkDownloading' | 'installing' | 'installReady' | 'nativeError';

const bypass = __DEV__ || Platform.OS === 'web';
let phase: UpdatePhase = bypass ? 'ready' : 'checking';
let started = false;
let downloaded = false;
let inFlight: Promise<void> | null = null;
const listeners = new Set<(value: UpdatePhase) => void>();
let nativeChecked = false;
let native = { release: null as NativeRelease | null, progress: null as number | null, path: null as string | null,
  action: 'download' as 'download' | 'install' | 'settings' };

export const getUpdatePhase = () => phase;
export const getNativeUpdateState = () => native;

export function subscribeUpdatePhase(listener: (value: UpdatePhase) => void) {
  listeners.add(listener);
  listener(phase);
  return () => { listeners.delete(listener); };
}

function setPhase(value: UpdatePhase) {
  phase = value;
  listeners.forEach(listener => listener(value));
}

// Allow the blocking screen to paint before starting native work/reloading.
const nextPaint = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

async function update() {
  try {
    if (!nativeChecked && Platform.OS === 'android') {
      const release = await checkNativeUpdate();
      nativeChecked = true;
      if (release) {
        native = { ...native, release };
        setPhase('nativeAvailable');
        return;
      }
    }
    if (!Updates.isEnabled) throw new Error('OTA updates are unavailable in this release build.');
    if (!downloaded) {
      // A user-triggered retry keeps visible feedback instead of a blank gate.
      setPhase(phase === 'error' ? 'downloading' : 'checking');
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable && !result.isRollBackToEmbedded) {
        setPhase('ready');
        return;
      }
      setPhase('downloading');
      await nextPaint();
      const fetched = await Updates.fetchUpdateAsync();
      if (!fetched.isNew && !fetched.isRollBackToEmbedded) {
        throw new Error('The detected update was not downloaded.');
      }
      downloaded = true;
    }
    setPhase('restarting');
    await nextPaint();
    // Expo owns download verification, storage and the actual bundle switch.
    // Do not release the gate or assume JS will continue after reload resolves.
    await Updates.reloadAsync();
  } catch {
    setPhase('error');
  }
}

function run() {
  if (inFlight) return inFlight;
  inFlight = update().finally(() => { inFlight = null; });
  return inFlight;
}

/** Once per JS launch, shared across re-renders, StrictMode and root remounts. */
export function startColdStartUpdate(): Promise<void> {
  if (bypass || started) return inFlight || Promise.resolve();
  started = true;
  return run();
}

export function retryColdStartUpdate(): Promise<void> {
  if (bypass || phase !== 'error') return inFlight || Promise.resolve();
  // A reload failure retries the already verified bundle without redownloading.
  return run();
}

/** User-triggered APK installation stays independent of resume events. */
export function startNativeInstall(settings = false): Promise<void> {
  if (bypass || !native.release || inFlight || !['nativeAvailable', 'nativeError', 'installReady'].includes(phase)) {
    return inFlight || Promise.resolve();
  }
  inFlight = (async () => {
    try {
      if (settings) {
        native = { ...native, action: 'settings' };
        setPhase('installing');
        await openInstallSettings();
      } else {
        if (!native.path) {
          native = { ...native, action: 'download', progress: 0 };
          setPhase('apkDownloading');
          const path = await downloadNativeUpdate(native.release!, value => {
            native = { ...native, progress: value };
            setPhase('apkDownloading');
          });
          native = { ...native, path };
        }
        native = { ...native, action: 'install' };
        setPhase('installing');
        await installNativeUpdate(native.path!, native.release!);
      }
      setPhase('installReady');
    } catch (error) {
      // Revalidate/redownload on the next attempt if Android cleared its cache.
      if (native.action === 'install' && error instanceof Error && error.name === 'MissingAPKError') {
        native = { ...native, path: null };
      }
      setPhase('nativeError');
    }
  })().finally(() => { inFlight = null; });
  return inFlight;
}
