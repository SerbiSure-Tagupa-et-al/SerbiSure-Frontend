import React, { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { getNativeUpdateState, getUpdatePhase, retryColdStartUpdate, startColdStartUpdate, startNativeInstall, subscribeUpdatePhase, type UpdatePhase } from '../services/coldStartUpdates';

export function StartupScreen({ failed = false, onRetry = () => {} }: { failed?: boolean; onRetry?: () => void }) {
  return <UpdateScreen checking failed={failed} restarting={false} onRetry={onRetry} />;
}

export function UpdateScreen({ failed, restarting, onRetry, checking = false }: {
  failed: boolean;
  restarting: boolean;
  onRetry: () => void;
  checking?: boolean;
}) {
  return <SafeAreaView style={styles.screen}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
      <View style={styles.content}>
        <Image source={require('../../../assets/serbisure-logo.png')} style={styles.logo} resizeMode="contain" accessible={false} />
        <Text accessibilityRole="header" style={styles.title}>{checking ? 'Starting SerbiSure...' : 'Updating SerbiSure'}</Text>
        {!failed && <ActivityIndicator size="large" color="#B45309" accessibilityLabel={checking ? 'Starting SerbiSure' : 'Updating SerbiSure'} />}
        <Text accessibilityLiveRegion="polite" style={styles.message}>
          {checking ? failed ? 'Connection is taking too long. Please check your internet connection.' : 'Please wait a moment.'
            : failed ? 'Update failed. Please check your internet connection and try again.'
            : restarting ? 'Update ready! Restarting app...'
            : 'A new update is underway. Please do not close or exit the app.'}
        </Text>
        {failed && <Pressable accessibilityRole="button" accessibilityLabel="Retry" onPress={onRetry}
          style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
          <Text style={styles.retryText}>Retry</Text>
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
  const message = phase === 'apkDownloading' ? 'Downloading update... Please do not close the app.'
    : phase === 'installing' ? 'Follow the Android instructions to install the update.'
    : failed ? native.action === 'download' ? 'Download failed. Please check your internet connection and try again.'
      : 'Installation did not finish. Allow SerbiSure to install updates, then try again.'
    : phase === 'installReady' ? 'Tap Install Update to continue. If asked, allow SerbiSure to install updates.'
    : 'Install the latest version to keep using SerbiSure.';
  return <SafeAreaView style={styles.screen}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={styles.scrollContent} bounces={false}>
      <View style={styles.content}>
        <Image source={require('../../../assets/serbisure-logo.png')} style={styles.logo} resizeMode="contain" accessible={false} />
        <Text accessibilityRole="header" style={styles.title}>New Version Available</Text>
        <Text style={styles.version}>SerbiSure {native.release!.version}</Text>
        <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>
        {busy && <ActivityIndicator size="large" color="#B45309" accessibilityLabel="Updating SerbiSure" />}
        {phase === 'apkDownloading' && native.progress !== null && <Text style={styles.message}>{Math.floor(native.progress * 100)}%</Text>}
        {!busy && <>
          {native.release!.notes !== '' && <ScrollView style={styles.notesPanel} nestedScrollEnabled>
            <Text style={styles.notes}>{native.release!.notes}</Text>
          </ScrollView>}
          <Pressable accessibilityRole="button" accessibilityLabel={failed ? 'Retry' : native.path ? 'Install Update' : 'Download & Install Update'}
            onPress={() => { void startNativeInstall(); }} style={({ pressed }) => [styles.retry, pressed && styles.pressed]}>
            <Text style={styles.retryText}>{failed ? 'Retry' : native.path ? 'Install Update' : 'Download & Install Update'}</Text>
          </Pressable>
          {(phase === 'installReady' || (failed && native.action !== 'download')) && <Pressable
            accessibilityRole="button" accessibilityLabel="Allow installation" hitSlop={6}
            onPress={() => { void startNativeInstall(true); }} style={styles.settings}>
            <Text style={styles.retryText}>Allow installation</Text>
          </Pressable>}
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
  version: { fontSize: 17, fontWeight: '600', color: '#374151' },
  notes: { fontSize: 14, lineHeight: 21, color: '#374151', alignSelf: 'stretch' },
  notesPanel: { maxHeight: 180, alignSelf: 'stretch' },
  settings: { minHeight: 48, justifyContent: 'center', paddingHorizontal: 16 },
  retry: { minHeight: 48, minWidth: 144, maxWidth: '100%', paddingHorizontal: 32, paddingVertical: 13,
    borderRadius: 14, backgroundColor: '#FFA135', alignItems: 'center', justifyContent: 'center' },
  retryText: { fontSize: 16, fontWeight: '700', color: '#35220D', textAlign: 'center' },
  pressed: { opacity: 0.8 },
});
