import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getNativeUpdateState, getUpdatePhase, retryColdStartUpdate, startColdStartUpdate, startNativeInstall, subscribeUpdatePhase, type UpdatePhase } from '../services/coldStartUpdates';
import { sanitizeReleaseNotes } from '../../shared/utils/releaseNotes';

export function StartupScreen({ failed = false, onRetry = () => {} }: { failed?: boolean; onRetry?: () => void }) {
  return <UpdateScreen checking failed={failed} restarting={false} onRetry={onRetry} />;
}

export function UpdateScreen({ failed, restarting, onRetry, checking = false }: {
  failed: boolean;
  restarting: boolean;
  onRetry: () => void;
  checking?: boolean;
}) {
  const title = checking ? failed ? 'Connection is slow' : 'Starting SerbiSure...'
    : failed ? 'Update interrupted' : restarting ? 'Almost ready' : 'Updating SerbiSure';
  const message = checking
    ? failed ? "We couldn't check for updates. Please check your internet connection." : 'Please wait a moment.'
    : failed ? "We couldn't finish your update. Please check your connection and try again."
    : restarting ? 'Your update is ready. Opening SerbiSure...'
    : 'Getting your update ready... Please keep SerbiSure open.';
  return <SafeAreaView style={styles.screen}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
      <View style={styles.content}>
        <Image source={require('../../../assets/serbisure-logo.png')} style={styles.logo} resizeMode="contain" accessible={false} />
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        {!failed && <ActivityIndicator size="large" color="#B45309" accessibilityLabel={checking ? 'Starting SerbiSure' : 'Updating SerbiSure'} />}
        <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
        {failed && <Pressable accessibilityRole="button" accessibilityLabel="Try Again" onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
          <Text style={styles.retryText}>Try Again</Text>
        </Pressable>}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

export function ColdStartUpdateGate({ children }: { children: React.ReactNode }) {
  const [phase, setPhase] = useState(getUpdatePhase);
  const [native, setNative] = useState(getNativeUpdateState);
  useEffect(() => {
    const unsubscribe = subscribeUpdatePhase(value => { setPhase(value); setNative(getNativeUpdateState()); });
    void startColdStartUpdate();
    return unsubscribe;
  }, []);

  const blocking = phase !== 'ready';
  useEffect(() => {
    if (!blocking) return;
    const back = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => back.remove();
  }, [blocking]);

  if (phase === 'ready') return <>{children}</>;
  if (phase === 'checking' || phase === 'checkError') return <StartupScreen failed={phase === 'checkError'}
    onRetry={() => { void retryColdStartUpdate(); }} />;
  if (native.release && ['nativeAvailable', 'apkDownloading', 'installing', 'installReady', 'nativeError'].includes(phase)) {
    return <NativeUpdateScreen phase={phase} native={native} />;
  }
  return <UpdateScreen failed={phase === 'error'} restarting={phase === 'restarting'}
    onRetry={() => { void retryColdStartUpdate(); }} />;
}

function NativeUpdateScreen({ phase, native }: { phase: UpdatePhase; native: ReturnType<typeof getNativeUpdateState> }) {
  const busy = phase === 'apkDownloading' || phase === 'installing';
  const failed = phase === 'nativeError';
  const showSettings = phase === 'installReady' || (failed && native.action !== 'download');
  const notes = useMemo(() => sanitizeReleaseNotes(native.release?.notes), [native.release?.notes]);
  const title = phase === 'nativeAvailable' ? 'New Update Available'
    : phase === 'apkDownloading' ? 'Getting your update ready'
    : failed && native.action === 'download' ? 'Update interrupted' : 'Finish your update';
  const message = phase === 'apkDownloading' ? 'Getting your update ready... Please keep SerbiSure open.'
    : phase === 'installing' ? "Your phone will show the next step. Tap 'Update' or 'Allow' if asked."
    : failed && native.action === 'download' ? "Your update didn't finish. Check your connection and try again."
    : showSettings ? "Tap below to finish the update. If your phone asks, tap 'Allow'."
    : 'A smoother SerbiSure is ready for you.';
  const buttonLabel = native.path ? 'Finish Update' : failed ? 'Try Again' : 'Update Now';
  return <SafeAreaView style={styles.screen}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
      <View style={styles.content}>
        <Image source={require('../../../assets/serbisure-logo.png')} style={styles.logo} resizeMode="contain" accessible={false} />
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
        {busy && <ActivityIndicator size="large" color="#B45309" accessibilityLabel="Updating SerbiSure" />}
        {phase === 'apkDownloading' && native.progress !== null && Number.isFinite(native.progress)
          && <Text accessibilityLiveRegion="polite" style={styles.message}>{Math.floor(native.progress * 100)}%</Text>}
        {!busy && <>
          {phase === 'nativeAvailable' && <View style={styles.notesPanel}>
            <Text accessibilityRole="header" style={styles.notesTitle}>What's New</Text>
            {notes.map(note => <Text key={note} style={styles.notes}>• {note}</Text>)}
          </View>}
          <Pressable accessibilityRole="button" accessibilityLabel={buttonLabel}
            onPress={() => { void startNativeInstall(); }} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
            <Text style={styles.retryText}>{buttonLabel}</Text>
          </Pressable>
          {showSettings && <>
            <Text style={styles.help}>If your phone won't update SerbiSure, open phone settings below, allow SerbiSure updates, then come back here.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Open phone settings" hitSlop={6}
            onPress={() => { void startNativeInstall(true); }} style={styles.settings}>
              <Text style={styles.settingsText}>Open phone settings</Text>
            </Pressable>
          </>}
        </>}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F6F5F2' },
  scrollContent: { flexGrow: 1, justifyContent: 'center' },
  content: { alignSelf: 'center', width: '100%', maxWidth: 460, padding: 28, alignItems: 'center', gap: 24 },
  logo: { width: 158, height: 52 },
  title: { fontSize: 24, fontWeight: '700', color: '#0D0D11', textAlign: 'center' },
  message: { fontSize: 16, lineHeight: 24, color: '#374151', textAlign: 'center' },
  notes: { fontSize: 16, lineHeight: 24, color: '#374151' },
  notesTitle: { fontSize: 17, fontWeight: '700', color: '#0D0D11' },
  notesPanel: { alignSelf: 'stretch', padding: 20, borderRadius: 16, backgroundColor: '#FFFFFF', gap: 12 },
  help: { fontSize: 14, lineHeight: 21, color: '#4B5563', textAlign: 'center' },
  settingsText: { fontSize: 16, fontWeight: '600', color: '#374151', textAlign: 'center' },
  settings: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
  retry: { minHeight: 48, minWidth: 144, maxWidth: '100%', paddingHorizontal: 32, paddingVertical: 13,
    borderRadius: 14, backgroundColor: '#FFA135', alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: 16, fontWeight: '700', color: '#35220D', textAlign: 'center' },
  pressed: { opacity: 0.8 },
});
