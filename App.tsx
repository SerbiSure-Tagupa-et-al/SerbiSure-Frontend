import { AppProviders } from './src/app/providers/AppProviders';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ColdStartUpdateGate, StartupScreen } from './src/app/components/ColdStartUpdateGate';
import { Alert, Animated, Image, LogBox, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

LogBox.ignoreLogs(['Unable to activate keep awake', '[PostService]', '[PostJob]']);
LogBox.ignoreAllLogs(true);
import {
  useFonts,
  Nunito_400Regular,
  Nunito_600SemiBold,
  Nunito_700Bold,
  Nunito_800ExtraBold,
  Nunito_900Black,
} from '@expo-google-fonts/nunito';

import {
  LandingScreen,
  UserSelectionScreen,
  RegistrationStep1,
  RegistrationStep2,
  RegistrationStep3,
  SuspendedAccountScreen,
} from './src/features/auth';
import { clearExploreFeedCache } from './src/features/feed/feedCache';
import { chatStore } from './src/features/chat/store/chatStore';
import { clearSupportContactsCache } from './src/features/chat/supportContactsCache';
import { clearThreadCache } from './src/features/chat/threadCache';
import { AppNavigator, type Role } from './src/app/AppNavigator';
import { preloadPostLoginAssets } from './src/app/services/preloadAssets';
import { realtime } from './src/shared/realtime';
import { createSelfieUploadTask, uploadSelfie, type SelfieUploadTask } from './src/features/verification/api/selfieUpload';
import { forgetSession, restoreSession, SessionError, startSession, subscribeSession } from './src/shared/auth/session';

// Clean App Navigation Flow matching Figma structure:
// landing -> login -> user_selection -> registration1-3 -> dashboard (bottom tab navigator)
type AppFlowState =
  | 'landing'
  | 'login'
  | 'user_selection'
  | 'registration1'
  | 'registration2'
  | 'registration3'
  | 'suspended'
  | 'dashboard';

export default function App() {
  return <ColdStartUpdateGate><SerbiSureApp /></ColdStartUpdateGate>;
}

function SerbiSureApp() {
  const [fontsLoaded] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
    Nunito_900Black,
    'Geist-Regular': require('./assets/fonts/Geist-Regular.ttf'),
    'Geist-Medium': require('./assets/fonts/Geist-Medium.ttf'),
    'Geist-SemiBold': require('./assets/fonts/Geist-SemiBold.ttf'),
    'Geist-Bold': require('./assets/fonts/Geist-Bold.ttf'),
  });

  const [flowState, setFlowState] = useState<AppFlowState>('landing');
  const [selectedRole, setSelectedRole] = useState<Role>('homeowner');
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [suspensionMessage, setSuspensionMessage] = useState<string | null>(null);
  const [selfieUpload, setSelfieUpload] = useState<SelfieUploadTask | undefined>();
  const [restoringSession, setRestoringSession] = useState(true);
  const [restoreError, setRestoreError] = useState('');
  const [loginMessage, setLoginMessage] = useState('');

  const clearSession = useCallback(() => {
    realtime.stop();
    clearExploreFeedCache();
    chatStore.clearCache();
    clearSupportContactsCache();
    clearThreadCache();
    setAccessToken(null);
    setAvatarUri(null);
    setSelfieUpload(undefined);
  }, []);

  const handleLogout = useCallback(() => {
    void forgetSession().catch(error => Alert.alert('Sign out', error.message));
    clearSession();
    setSuspensionMessage(null);
    setFlowState('login');
  }, [clearSession]);

  const handleAccountSuspended = useCallback((message: string) => {
    void forgetSession().catch(error => Alert.alert('Sign out', error.message));
    clearSession();
    setSuspensionMessage(message);
    setFlowState('suspended');
  }, [clearSession]);

  const restoreSavedLogin = useCallback(async () => {
    setRestoringSession(true);
    setRestoreError('');
    try { await restoreSession(); }
    catch (error) {
      if (error instanceof SessionError && error.kind === 'ended') {
        setLoginMessage(error.message);
        setFlowState('login');
      } else {
        setRestoreError(error instanceof Error ? error.message : 'Could not restore your login. Please try again.');
      }
    } finally { setRestoringSession(false); }
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeSession((tokens, message) => {
      if (tokens) {
        setAccessToken(tokens.access);
        setFlowState('dashboard');
      } else {
        clearSession();
        setLoginMessage(message || '');
        setFlowState('login');
      }
    });
    void restoreSavedLogin();
    return unsubscribe;
  }, [clearSession, restoreSavedLogin]);

  if (!fontsLoaded || restoringSession) {
    return <StartupScreen />;
  }

  if (restoreError) {
    return (
      <View style={{ flex: 1, backgroundColor: '#F6F5F2', justifyContent: 'center', alignItems: 'center', padding: 28, gap: 20 }}>
        <Text style={{ textAlign: 'center', color: '#0D0D11', fontSize: 16 }}>{restoreError}</Text>
        <Pressable accessibilityRole="button" onPress={() => void restoreSavedLogin()} style={{ backgroundColor: '#0D0D11', borderRadius: 24, paddingVertical: 14, paddingHorizontal: 32 }}>
          <Text style={{ color: '#FFFFFF', fontSize: 16 }}>Try Again</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => { setRestoreError(''); setFlowState('login'); }} style={{ padding: 14 }}>
          <Text style={{ color: '#6B7280', fontSize: 16 }}>Sign in instead</Text>
        </Pressable>
      </View>
    );
  }

  const handleSelectRole = (role: Role) => {
    setSelectedRole(role);
    setFlowState('registration1');
  };

  return (
    <AppProviders token={accessToken} onAccountSuspended={handleAccountSuspended}>
      <StatusBar style={flowState === 'registration3' ? 'light' : 'dark'} />

      {/* Step 1 & 1.5: Landing Page & Animated Login Flow */}
      {(flowState === 'landing' || flowState === 'login') && (
        <LandingScreen
          isLoginView={flowState === 'login'}
          onGetStarted={() => setFlowState('user_selection')}
          onLoginPress={() => setFlowState('login')}
          onBackToLanding={() => setFlowState('landing')}
          sessionMessage={loginMessage}
          onLoginSuccess={async (tokens) => {
            await startSession(tokens);
            setLoginMessage('');
            preloadPostLoginAssets(tokens.access, avatarUri);
          }}
          onSignUp={() => setFlowState('user_selection')}
        />
      )}

      {/* Step 2: User Selection (Homeowner / Kasambahay) */}
      {flowState === 'user_selection' && (
        <UserSelectionScreen
          onSelectRole={handleSelectRole}
          onBack={() => setFlowState('landing')}
        />
      )}

      {/* Step 3: Registration 1 - Account Form Details */}
      {flowState === 'registration1' && (
        <RegistrationStep1
          role={selectedRole}
          onBack={() => setFlowState('user_selection')}
          onNext={(token, result) => {
            if (!result.selfiePath) return;
            const uri = result.selfiePath.startsWith('file:') ? result.selfiePath : `file://${result.selfiePath}`;
            setAccessToken(token);
            setAvatarUri(uri);
            setSelfieUpload(createSelfieUploadTask(() => uploadSelfie(token, uri)));
            setFlowState('registration3');
          }}
          onCancel={() => setFlowState('landing')}
          onNavigateToLogin={() => setFlowState('login')}
        />
      )}

      {/* Step 4: Registration 2 - Take a Selfie / Mandatory Liveness Verification */}
      {flowState === 'registration2' && (
        <RegistrationStep3
          role={selectedRole}
          token={accessToken}
          onVerified={(result) => {
            if (!result.selfiePath) return;
            const uri = result.selfiePath.startsWith('file:') ? result.selfiePath : `file://${result.selfiePath}`;
            setAvatarUri(uri);
            setSelfieUpload(createSelfieUploadTask(() => uploadSelfie(accessToken || '', uri)));
            setFlowState('registration3');
          }}
          onBack={() => setFlowState('registration1')}
        />
      )}

      {/* Step 5: Registration 3 - Verify Identity / Document Upload (Optional & Skippable) */}
      {flowState === 'registration3' && (
        <RegistrationStep2
          role={selectedRole}
          token={accessToken}
          selfieUpload={selfieUpload}
          onBack={() => setFlowState('registration2')}
          onNext={() => setFlowState('dashboard')}
          onCancel={() => setFlowState('dashboard')}
          onSkip={() => setFlowState('dashboard')}
        />
      )}

      {flowState === 'suspended' && (
        <SuspendedAccountScreen
          message={suspensionMessage || undefined}
          onReturnToSignIn={() => {
            setSuspensionMessage(null);
            setFlowState('login');
          }}
        />
      )}

      {/* Step 6: Main Dashboard (Bottom Tab Navigator - Home, Services/Jobs, Chats, Profile) */}
      {flowState === 'dashboard' && (
        <AppNavigator
          role={selectedRole}
          avatarUri={avatarUri}
          token={accessToken}
          onUpdateAvatar={(uri: string) => setAvatarUri(uri)}
          onLogout={handleLogout}
        />
      )}
    </AppProviders>
  );
}
