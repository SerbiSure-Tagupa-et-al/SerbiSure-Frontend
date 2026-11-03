import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';

import { FaceCamera, type FaceCameraHandle } from '../camera/FaceCamera';
import type { LandmarkFrame } from '../face/types';
import { advanceLiveness, initialLivenessState, prepareSelfieRetake, retryCurrentStep, type LivenessResult, type LivenessState } from '../liveness/livenessMachine';
import { assessSelfie } from '../quality/assessSelfie';
import { selfieQualityMessage, type SelfieQuality } from '../quality/selfieQuality';

import THEME from '../../../shared/theme/theme';
import { RegistrationStepper } from '../../auth/components/RegistrationStepper';
import { APP_HEADER_BACK_ICON_COLOR, APP_HEADER_BACK_ICON_SIZE, APP_HEADER_LOGO_SIZE, APP_HEADER_SIDE_WIDTH } from '../../../shared/components/AppHeader';

const logoSource = require('../../../../assets/serbisure-icon.png');
const faceSource = require('../../../../assets/face-placeholder.png');

function discardSelfie(path: string) {
  const uri = path.startsWith('file://') ? path : `file://${path}`;
  void FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
}

type LivenessScreenProps = {
  mode?: 'registration' | 'profile';
  role?: 'homeowner' | 'kasambahay';
  token?: string | null;
  onVerified?: (result: LivenessResult) => void;
  onBack?: () => void;
  onCancel?: () => void;
  onSkip?: () => void;
  submitting?: boolean;
  submissionFailed?: boolean;
  onRetrySubmission?: () => void;
};

type LivenessRingProps = {
  progress: number;
  showFaceIcon: boolean;
  showCheck?: boolean;
};

function LivenessRing({ progress, showFaceIcon, showCheck = false }: LivenessRingProps) {
  const size = 226;
  const strokeWidth = 7;
  const radius = (size - strokeWidth) / 2;
  const arcPath = useMemo(() => {
    const path = Skia.Path.Make();
    path.addArc(
      {
        x: strokeWidth / 2,
        y: strokeWidth / 2,
        width: size - strokeWidth,
        height: size - strokeWidth,
      },
      -128,
      Math.min(Math.max(progress, 0), 1) * 360,
    );
    return path;
  }, [progress]);

  return (
    <View style={styles.ringBox}>
      {showFaceIcon ? (
        <View style={styles.circleFrame}>
          <Image source={faceSource} style={styles.faceIcon} resizeMode="contain" />
        </View>
      ) : (
        <Canvas style={styles.ringCanvas}>
          <Path path={arcPath} color="#0AA018" style="stroke" strokeWidth={strokeWidth} strokeCap="round" />
        </Canvas>
      )}
      {showCheck ? (
        <View style={styles.checkCircle}>
          <Ionicons name="checkmark" size={42} color="#FFFFFF" />
        </View>
      ) : null}
    </View>
  );
}

function getRingProgress(state: LivenessState) {
  if (state.verified) {
    return 1;
  }

  if (state.step === 'still') {
    return 0.75 + state.stillnessProgress * 0.25;
  }

  if (state.step === 'turnLeft') {
    return 0.5;
  }

  if (state.step === 'turnRight') {
    return 0.25;
  }

  return 0;
}

function getInstruction(state: LivenessState, showTrackerNotice: boolean, awaitingFirstFace: boolean) {
  if (state.verified) {
    return 'Verification Complete!';
  }

  if (showTrackerNotice) {
    return awaitingFirstFace ? 'The camera may need a moment. Keep your face in the circle.'
      : 'Take your time. Face the camera in a little more light.';
  }

  if (state.retryMessage) return state.retryMessage;

  return state.instruction;
}

export function LivenessScreen({ role = 'homeowner', mode = 'registration', onVerified, onBack, submitting = false, submissionFailed = false, onRetrySubmission }: LivenessScreenProps) {
  const { tr: uiText } = useUiLanguage();
  const insets = useSafeAreaInsets();
  const cameraRef = useRef<FaceCameraHandle | null>(null);
  const captureStartedRef = useRef(false);
  const [started, setStarted] = useState(false);
  const hasStarted = useRef(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [state, setState] = useState(initialLivenessState);
  const stateRef = useRef(initialLivenessState);
  const lastLandmarkAt = useRef<number | null>(null);
  const startedAt = useRef(0);
  const mounted = useRef(true);
  const verifiedCallback = useRef(onVerified);
  verifiedCallback.current = onVerified;
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [captureAttempt, setCaptureAttempt] = useState(0);
  const [selfie, setSelfie] = useState<LivenessResult | null>(null);
  const pendingSelfie = useRef<LivenessResult | null>(null);
  const [photoReady, setPhotoReady] = useState(false);
  const [previewError, setPreviewError] = useState(false);
  const [photoAccepted, setPhotoAccepted] = useState(false);
  const [photoQuality, setPhotoQuality] = useState<SelfieQuality | 'checking'>('checking');
  const [showTrackerNotice, setShowTrackerNotice] = useState(false);
  const [showCenterCheck, setShowCenterCheck] = useState(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (pendingSelfie.current) {
        discardSelfie(pendingSelfie.current.selfiePath);
        pendingSelfie.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!started || state.verified || selfie) {
      return undefined;
    }

    const timer = setInterval(() => {
      const lastFrame = lastLandmarkAt.current ?? startedAt.current;
      if (Date.now() - lastFrame > 2600) {
        setShowTrackerNotice(true);
      }
    }, 750);

    return () => clearInterval(timer);
  }, [started, state.verified, selfie]);

  const prevCompletedCount = useRef(0);
  useEffect(() => {
    if (state.completedSteps.length > prevCompletedCount.current) {
      prevCompletedCount.current = state.completedSteps.length;
      setShowCenterCheck(true);
      const timer = setTimeout(() => {
        setShowCenterCheck(false);
      }, 850);
      return () => clearTimeout(timer);
    }
  }, [state.completedSteps.length]);

  const handleLandmarks = useCallback((frame: LandmarkFrame) => {
    if (!mounted.current) return;
    setCameraReady(true);
    if (!hasStarted.current || captureStartedRef.current) return;
    const now = Date.now();
    // FaceCamera already limits inference and landmark/UI callbacks.
    if (lastLandmarkAt.current === null) {
      console.info('[Liveness timing]', { stage: 'first_landmarks', durationMs: now - startedAt.current });
    }
    lastLandmarkAt.current = now;
    setShowTrackerNotice(false);
    const next = advanceLiveness(stateRef.current, frame);
    if (next.step !== stateRef.current.step) {
      console.info('[Liveness timing]', { stage: next.step, durationMs: now - startedAt.current });
    }
    stateRef.current = next;
    setState(next);
  }, []);

  const performCapture = useCallback(async () => {
    if (captureStartedRef.current) return;
    captureStartedRef.current = true;
    setShowCenterCheck(true);

    const captureStartedAt = Date.now();
    try {
      const selfiePath = await cameraRef.current?.captureSelfie();
      if (!selfiePath) throw new Error("The camera could not capture your selfie. Please retry.");
      if (!mounted.current) { discardSelfie(selfiePath); return; }
      console.info("[Liveness timing]", {
        stage: "selfie_review", captureMs: Date.now() - captureStartedAt,
        durationMs: Date.now() - startedAt.current,
      });
      const captured: LivenessResult = { verified: true, completedAt: Date.now(), selfiePath };
      pendingSelfie.current = captured;
      setPhotoReady(false);
      setPhotoQuality('checking');
      setPreviewError(false);
      setSelfie(captured);
      setShowCenterCheck(false);
      let quality: SelfieQuality;
      const qualityStartedAt = Date.now();
      try { quality = await assessSelfie(selfiePath); }
      catch { quality = 'unreadable'; }
      console.info('[Liveness timing]', { stage: 'selfie_quality', durationMs: Date.now() - qualityStartedAt });
      if (mounted.current && pendingSelfie.current?.selfiePath === selfiePath) setPhotoQuality(quality);
    } catch (error) {
      captureStartedRef.current = false;
      const code = error && typeof error === "object" && "code" in error ? error.code : "capture-failed";
      console.warn("[Liveness] Selfie capture failed", { code });
      if (mounted.current) setCaptureError("We couldn’t take your selfie.");
    }
  }, []);

  useEffect(() => {
    if (!started || !state.verified || captureStartedRef.current) {
      return;
    }
    void performCapture();
  }, [started, state.verified, captureAttempt, performCapture]);

  const instruction = submitting ? 'Face check passed. Creating your account…' : submissionFailed
    ? 'Your selfie is ready. Retry or go back to edit your details.' : selfie
    ? previewError ? 'We couldn’t display your selfie. Retake the photo.' : photoQuality === 'checking'
      ? 'Checking your photo…' : selfieQualityMessage(photoQuality)
    : state.verified ? 'Face check passed. Capturing selfie…' : !cameraReady
    ? 'Getting the camera ready… Hold your phone at eye level.' : started
    ? getInstruction(state, showTrackerNotice, lastLandmarkAt.current === null)
    : 'Hold your phone at eye level and look at the camera. Follow two small head turns. Normal room lighting is fine.';
  const ringProgress = started ? getRingProgress(state) : 0;
  const showFaceIcon = !cameraReady && !started;

  const handleCameraReady = useCallback(() => {
    if (mounted.current) setCameraReady(true);
  }, []);

  const handleContinue = useCallback(() => {
    if (pendingSelfie.current) discardSelfie(pendingSelfie.current.selfiePath);
    pendingSelfie.current = null;
    setSelfie(null);
    setPhotoReady(false);
    setPreviewError(false);
    setPhotoAccepted(false);
    setPhotoQuality('checking');
    setStarted(true);
    hasStarted.current = true;
    startedAt.current = Date.now();
    stateRef.current = initialLivenessState;
    setState(initialLivenessState);
    setShowTrackerNotice(false);
    setShowCenterCheck(false);
    prevCompletedCount.current = 0;
    lastLandmarkAt.current = null;
    setCaptureError(null);
    captureStartedRef.current = false;
  }, []);

  const handleUsePhoto = () => {
    const captured = pendingSelfie.current;
    if (!captured || !photoReady || previewError || photoQuality !== 'pass' || submitting || photoAccepted) return;
    // Transfer ownership before registration navigates away: its background
    // upload still needs this file. Repeated taps cannot submit it twice.
    pendingSelfie.current = null;
    setPhotoAccepted(true);
    verifiedCallback.current?.(captured);
  };

  const handleRetakePhoto = () => {
    if (!pendingSelfie.current || submitting || photoAccepted) return;
    discardSelfie(pendingSelfie.current.selfiePath);
    pendingSelfie.current = null;
    setSelfie(null);
    setPhotoReady(false);
    setPreviewError(false);
    setPhotoQuality('checking');
    setCaptureError(null);
    captureStartedRef.current = false;
    stateRef.current = prepareSelfieRetake(stateRef.current);
    setState(stateRef.current);
    prevCompletedCount.current = stateRef.current.completedSteps.length;
    lastLandmarkAt.current = null;
    startedAt.current = Date.now();
    setShowTrackerNotice(false);
    setShowCenterCheck(false);
  };

  const handleRetry = useCallback(() => {
    stateRef.current = retryCurrentStep(stateRef.current);
    setState(stateRef.current);
    setShowCenterCheck(false);
    prevCompletedCount.current = stateRef.current.completedSteps.length;
    setCaptureError(null);
    captureStartedRef.current = false;
    setCaptureAttempt(value => value + 1);
  }, []);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: Math.max(insets.bottom, 14) }]}>
      <View style={styles.header}>
        <View style={styles.headerSide}>
          <Pressable onPress={onBack} disabled={submitting} hitSlop={10}>
            <Ionicons name="arrow-back" size={APP_HEADER_BACK_ICON_SIZE} color={APP_HEADER_BACK_ICON_COLOR} />
          </Pressable>
        </View>
        <Image source={logoSource} style={styles.logo} resizeMode="contain" />
        <View style={[styles.headerSide, styles.headerSideRight]} />
      </View>

      <View style={styles.titleBlock}>
        <Text style={styles.title}>
          {mode === 'profile' ? uiText('Retake your photo') : role === 'homeowner' ? (
            <>Join as <Text style={styles.titleHighlight}>Homeowner</Text></>
          ) : (
            <>Join as <Text style={styles.titleHighlight}>Kasambahay</Text></>
          )}
        </Text>
        {mode === 'registration' && role !== 'homeowner' ? (
          <Text style={styles.subtitle}>{uiText("Join as a kasambahay to offer your trusted household services.")}</Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <View style={styles.cardContent}>
          <View>
            {mode === 'registration' && <RegistrationStepper
              currentStep={role === 'kasambahay' ? 4 : 3}
              totalSteps={role === 'kasambahay' ? 5 : 4}
              title={role === 'kasambahay' ? uiText("Step 4: Face Verification") : uiText("Step 3: Face Verification")}
            />}

            <View style={styles.verificationFrame}>
              <View style={styles.cameraCircle}>
                <FaceCamera ref={cameraRef} onLandmarks={handleLandmarks}
                  detecting={started && !state.verified && !selfie}
                  isActive={!selfie && !submitting} onReady={handleCameraReady} />
              </View>
              {selfie ? (
                <View style={styles.cameraCircle}>
                  <Image
                    source={{ uri: selfie.selfiePath }}
                    style={styles.previewImage}
                    resizeMode="cover"
                    fadeDuration={0}
                    accessibilityLabel={uiText('Your captured selfie')}
                    onLoad={() => setPhotoReady(true)}
                    onError={() => { setPreviewError(true); setPhotoReady(false); }}
                  />
                </View>
              ) : null}
              <LivenessRing progress={ringProgress} showFaceIcon={showFaceIcon} showCheck={!selfie && started && showCenterCheck} />
              {!selfie && started && showCenterCheck ? (
                <View style={styles.checkCircleOverlay} pointerEvents="none">
                  <View style={styles.checkCircle}>
                    <Ionicons name="checkmark" size={32} color="#FFFFFF" />
                  </View>
                </View>
              ) : null}
            </View>

            {captureError ? (
              <View style={styles.captureErrorCard} accessibilityRole="alert" accessibilityLiveRegion="polite">
                <Ionicons name="camera-outline" size={21} color="#9A5B18" />
                <View style={styles.captureErrorCopy}>
                  <Text style={styles.captureErrorTitle}>{uiText(captureError)}</Text>
                  <Text style={styles.captureErrorBody}>{uiText("Your face check is complete. Keep facing the camera and tap Retry to take the photo again.")}</Text>
                </View>
              </View>
            ) : (
              <Text accessibilityLiveRegion="polite" style={[styles.instruction, !started && styles.helperInstruction]}>
                {uiText(instruction)}
              </Text>
            )}
          </View>

          <View>
            <View style={styles.divider} />
            <View style={styles.buttonRow}>
              {submitting ? (
                <View style={[styles.primaryButton, { opacity: 0.6 }]} accessibilityLiveRegion="polite">
                  <Text style={styles.primaryButtonText}>{uiText('Creating account…')}</Text>
                </View>
              ) : submissionFailed ? (
                <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]} onPress={onRetrySubmission}>
                  <Text style={styles.primaryButtonText}>{uiText('Retry')}</Text>
                </Pressable>
              ) : selfie ? (
                <>
                  <Pressable
                    style={({ pressed }) => [styles.primaryButton, styles.retakeButton, pressed && styles.buttonPressed, photoAccepted && { opacity: 0.6 }]}
                    disabled={photoAccepted}
                    onPress={handleRetakePhoto}
                  >
                    <Text style={[styles.primaryButtonText, styles.reviewButtonText, styles.retakeButtonText]}>{uiText('Retake Photo')}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed, (!photoReady || previewError || photoQuality !== 'pass' || photoAccepted) && { opacity: 0.6 }]}
                    disabled={!photoReady || previewError || photoQuality !== 'pass' || photoAccepted}
                    onPress={handleUsePhoto}
                  >
                    <Text style={[styles.primaryButtonText, styles.reviewButtonText]}>{uiText('Use This Photo')}</Text>
                  </Pressable>
                </>
              ) : !started ? (
                <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]} onPress={handleContinue}>
                  <Text style={styles.primaryButtonText}>{uiText("Continue")}</Text>
                </Pressable>
              ) : state.retryMessage || captureError ? (
                <Pressable style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]} onPress={handleRetry}>
                  <Text style={styles.primaryButtonText}>{uiText("Retry")}</Text>
                </Pressable>
              ) : (
                <View style={[styles.primaryButton, { opacity: 0.6 }]}>
                  <Text style={styles.primaryButtonText}>{state.verified ? uiText("Capturing…") : uiText("Scanning…")}</Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  captureErrorCard: {
    marginTop: 16,
    padding: 14,
    borderRadius: 18,
    backgroundColor: THEME.colors.brandLight,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  captureErrorCopy: { flex: 1 },
  captureErrorTitle: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 14,
    lineHeight: 20,
    color: THEME.colors.ink,
  },
  captureErrorBody: {
    marginTop: 4,
    fontFamily: THEME.typography.fontFamily.body,
    fontSize: 12,
    lineHeight: 18,
    color: THEME.colors.textSecondary,
  },
  buttonPressed: {
    opacity: 0.78,
  },
  card: {
    alignSelf: 'center',
    backgroundColor: 'transparent',
    borderRadius: 0,
    flex: 1,
    marginTop: 6,
    paddingBottom: 10,
    paddingHorizontal: 18,
    paddingTop: 8,
    width: '92%',
  },
  cardContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  cameraCircle: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 113,
    overflow: 'hidden',
  },
  previewImage: { width: '100%', height: '100%' },
  retakeButton: { backgroundColor: '#ECECEC' },
  retakeButtonText: { color: THEME.colors.ink },
  reviewButtonText: { fontSize: 13, textAlign: 'center', paddingHorizontal: 6 },
  checkCircleOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    elevation: 25,
  },
  checkCircle: {
    alignItems: 'center',
    backgroundColor: '#14A11C',
    borderRadius: 25,
    height: 50,
    justifyContent: 'center',
    width: 50,
    zIndex: 9999,
    elevation: 25,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  faceIcon: {
    height: 128,
    width: 128,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    width: '100%',
  },
  headerSide: {
    width: APP_HEADER_SIDE_WIDTH,
    justifyContent: 'center',
  },
  headerSideRight: {
    alignItems: 'flex-end',
  },
  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  divider: {
    height: 1,
    backgroundColor: THEME.colors.divider,
    marginTop: 6,
    marginBottom: 12,
    width: '100%',
  },
  primaryButton: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: THEME.colors.ink,
    height: 48,
    borderRadius: THEME.roundness.pill,
    justifyContent: 'center',
  },
  primaryButtonText: {
    color: THEME.colors.white,
    fontSize: 15,
    fontFamily: THEME.typography.fontFamily.display,
    letterSpacing: THEME.typography.tracking.tight,
  },
  instruction: {
    color: THEME.colors.ink,
    fontSize: 14,
    fontFamily: THEME.typography.fontFamily.bodyMedium,
    lineHeight: 20,
    marginTop: 20,
    paddingHorizontal: 12,
    minHeight: 40,
    textAlign: 'center',
  },
  helperInstruction: {
    color: '#1F2937',
    fontFamily: THEME.typography.fontFamily.body,
    fontSize: 14,
    lineHeight: 20,
  },
  logo: {
    height: APP_HEADER_LOGO_SIZE,
    width: APP_HEADER_LOGO_SIZE,
  },
  ringBox: {
    alignItems: 'center',
    alignSelf: 'center',
    height: 226,
    justifyContent: 'center',
    width: 226,
  },
  circleFrame: {
    width: 226,
    height: 226,
    borderRadius: 113,
    borderWidth: 3,
    borderColor: '#FFBB47',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCanvas: {
    ...StyleSheet.absoluteFillObject,
  },
  root: {
    backgroundColor: THEME.colors.canvas,
    flex: 1,
  },
  skipText: {
    color: THEME.colors.brandDark,
    fontSize: 13,
    fontFamily: THEME.typography.fontFamily.bodyBold,
  },
  titleBlock: {
    marginTop: -2,
    paddingHorizontal: 24,
  },
  title: {
    color: THEME.colors.ink,
    fontSize: 24,
    fontFamily: THEME.typography.fontFamily.display,
    lineHeight: 28,
    marginBottom: 4,
  },
  titleHighlight: {
    color: THEME.colors.brand,
  },
  subtitle: {
    color: THEME.colors.textSecondary,
    fontSize: 13,
    fontFamily: THEME.typography.fontFamily.body,
    lineHeight: 18,
  },
  verificationFrame: {
    alignItems: 'center',
    alignSelf: 'center',
    height: 226,
    justifyContent: 'center',
    marginTop: 24,
    width: 226,
    position: 'relative',
    zIndex: 10,
    elevation: 10,
  },
});
