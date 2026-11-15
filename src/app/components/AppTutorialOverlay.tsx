import React, { useEffect, useState } from 'react';
import { BackHandler, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, Mask, Rect } from 'react-native-svg';
import * as SecureStore from 'expo-secure-store';
import { useLanguage } from '../../shared/localization/LanguageContext';
import type { Role } from '../roleConfig';

export type TutorialTargetId =
  | 'browse'
  | 'post'
  | 'chats'
  | 'bookings'
  | 'personal_info'
  | 'view_cv_info'
  | 'get_verified';

export interface TargetRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TutorialStepConfig {
  readonly id: TutorialTargetId;
  readonly title: string;
  readonly description: string;
  readonly placement: 'above' | 'below';
}

export function getTutorialSteps(role: Role): readonly TutorialStepConfig[] {
  const isHomeowner = role === 'homeowner';
  const baseSteps: TutorialStepConfig[] = [
    {
      id: 'browse',
      title: isHomeowner ? 'Find a Kasambahay' : 'Find a Job',
      description: isHomeowner
        ? 'Look for helpers here. You can search by work type or check the people you saved.'
        : 'Look for house jobs here. You can search by work type or check the jobs you applied for.',
      placement: 'above',
    },
    {
      id: 'post',
      title: isHomeowner ? 'Post a Job' : 'Post Your Service',
      description: isHomeowner
        ? 'Tap + to post the help you need, your work days, and how much you pay.'
        : 'Tap + to share what work you can do, your work days, and your expected pay.',
      placement: 'above',
    },
    {
      id: 'chats',
      title: 'Chats & Barangay Help',
      description: isHomeowner
        ? 'Talk with helpers and send job offers here. You can also message your Barangay or SerbiSure Support for help.'
        : 'Talk with homeowners and check job offers here. You can also message your Barangay or SerbiSure Support for help.',
      placement: 'above',
    },
    {
      id: 'bookings',
      title: 'Your Bookings',
      description: isHomeowner
        ? 'Tap this calendar to see your hires, work dates, QR pass, and work contract.'
        : 'Tap this calendar to see your work dates, QR pass, and work contract.',
      placement: 'below',
    },
    {
      id: 'personal_info',
      title: 'Personal Information',
      description: isHomeowner
        ? 'Tap this row to open your profile card, bio, and your own job posts.'
        : 'Tap this row to open your profile card, bio, and your Worker CV.',
      placement: 'below',
    },
    {
      id: 'get_verified',
      title: 'Get Verified',
      description: isHomeowner
        ? 'Tap Get Verified to upload your ID. You need to be verified before you can post a job or hire.'
        : 'Tap Get Verified to upload your NBI or Police clearance. You need to be verified before you can post or apply.',
      placement: 'below',
    },
  ];

  return baseSteps;
}

const TUTORIAL_KEY_PREFIX = 'serbisure_app_tutorial_v1_';
const completedInSession = new Set<string>();

function sanitizeKeySuffix(userId: string): string {
  return userId.replace(/[^a-zA-Z0-9._-]/g, '_') || 'guest';
}

export async function hasCompletedAppTutorial(userId?: string | null): Promise<boolean> {
  if (!userId) return false;
  const key = `${TUTORIAL_KEY_PREFIX}${sanitizeKeySuffix(userId)}`;
  if (completedInSession.has(key)) return true;
  try {
    const val = await SecureStore.getItemAsync(key);
    if (val === 'done') {
      completedInSession.add(key);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function markAppTutorialCompleted(userId?: string | null): Promise<void> {
  if (!userId) return;
  const key = `${TUTORIAL_KEY_PREFIX}${sanitizeKeySuffix(userId)}`;
  completedInSession.add(key);
  try {
    await SecureStore.setItemAsync(key, 'done');
  } catch {
    // Ignore storage errors so UI never blocks
  }
}

interface AppTutorialOverlayProps {
  readonly visible: boolean;
  readonly role: Role;
  readonly targetRects: Partial<Record<TutorialTargetId, TargetRect>>;
  readonly containerWidth?: number;
  readonly containerHeight?: number;
  readonly topInset?: number;
  readonly bottomInset?: number;
  readonly onStepChange?: (targetId: TutorialTargetId) => void;
  readonly onRequestMeasure?: () => void;
  readonly onClose: () => void;
  readonly onFinish?: () => void;
}

export function AppTutorialOverlay({
  visible,
  role,
  targetRects,
  containerWidth,
  containerHeight,
  topInset = 44,
  bottomInset = 32,
  onStepChange,
  onRequestMeasure,
  onClose,
  onFinish,
}: AppTutorialOverlayProps) {
  const { tr: uiText } = useLanguage();
  const [stepIndex, setStepIndex] = useState(0);
  const steps = getTutorialSteps(role);

  useEffect(() => {
    if (visible) {
      setStepIndex(0);
      onRequestMeasure?.();
    }
  }, [visible, onRequestMeasure]);

  const currentStep = steps[stepIndex] || steps[0]!;

  useEffect(() => {
    if (visible) {
      onStepChange?.(currentStep.id);
    }
  }, [visible, stepIndex, currentStep.id, onStepChange]);

  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  if (!visible) return null;

  const totalSteps = steps.length;
  const isLastStep = stepIndex === totalSteps - 1;

  const windowDims = Dimensions.get('window');
  const screenWidth = containerWidth || windowDims.width || 390;
  const screenHeight = containerHeight || windowDims.height || 844;

  const dockBottom = Math.max(bottomInset + 20, 32);
  const dockTop = screenHeight - dockBottom - 58;
  const tabBarWidth = screenWidth - 40 - 58 - 14;

  const fallbackRects: Record<TutorialTargetId, TargetRect> = {
    browse: {
      x: 20 + 8 + (tabBarWidth - 16) * 0.375 - 22,
      y: dockTop + 7,
      width: 44,
      height: 44,
    },
    post: {
      x: screenWidth - 20 - 58,
      y: dockTop,
      width: 58,
      height: 58,
    },
    chats: {
      x: 20 + 8 + (tabBarWidth - 16) * 0.625 - 22,
      y: dockTop + 7,
      width: 44,
      height: 44,
    },
    bookings: {
      x: 20,
      y: topInset + 4,
      width: 44,
      height: 44,
    },
    personal_info: {
      x: 20,
      y: topInset + 245,
      width: screenWidth - 40,
      height: 56,
    },
    view_cv_info: {
      x: screenWidth - 40 - 96,
      y: topInset + 114,
      width: 88,
      height: 36,
    },
    get_verified: {
      x: 20,
      y: topInset + 302,
      width: screenWidth - 40,
      height: 56,
    },
  };

  const activeRect = targetRects[currentStep.id] || fallbackRects[currentStep.id];
  const isRow = currentStep.id === 'personal_info' || currentStep.id === 'get_verified';
  const isPillButton = currentStep.id === 'view_cv_info';
  const pad = isRow ? 3 : isPillButton ? 5 : 4;

  const spotX = activeRect.x - pad;
  const spotY = activeRect.y - pad;
  const spotW = activeRect.width + pad * 2;
  const spotH = activeRect.height + pad * 2;
  const spotRadius = isRow ? 16 : isPillButton ? spotH / 2 : spotW / 2;
  const targetCenterX = activeRect.x + activeRect.width / 2;

  const cardWidth = Math.min(screenWidth - 32, 336);
  const minCardLeft = 16;
  const maxCardLeft = Math.max(16, screenWidth - cardWidth - 16);
  const idealCardLeft = targetCenterX - cardWidth / 2;
  const cardLeft = Math.min(Math.max(idealCardLeft, minCardLeft), maxCardLeft);

  const arrowLeftInCard = Math.min(
    Math.max(targetCenterX - cardLeft - 9, 18),
    cardWidth - 36,
  );

  const fitsBelow = spotY + spotH + 210 <= screenHeight - Math.max(bottomInset, 16);
  const isBelow = currentStep.placement === 'below' && (
    currentStep.id === 'bookings' ||
    currentStep.id === 'view_cv_info' ||
    fitsBelow
  );
  const calloutPositionStyle = isBelow
    ? { top: spotY + spotH + 10, left: cardLeft, width: cardWidth }
    : { bottom: Math.max(16, screenHeight - spotY + 10), left: cardLeft, width: cardWidth };

  const handleNext = () => {
    if (isLastStep) {
      if (onFinish) onFinish();
      else onClose();
    } else {
      setStepIndex((prev) => Math.min(prev + 1, totalSteps - 1));
    }
  };

  const handleBack = () => {
    setStepIndex((prev) => Math.max(prev - 1, 0));
  };

  return (
    <View style={styles.overlayRoot} pointerEvents="box-none">
      {/* Full-screen dimmed backdrop with transparent cutout directly over the real element */}
      <View style={StyleSheet.absoluteFill} pointerEvents="auto">
        <Svg width={screenWidth} height={screenHeight} style={StyleSheet.absoluteFill}>
          <Defs>
            <Mask id="tutorial-spotlight-mask">
              <Rect x="0" y="0" width={screenWidth} height={screenHeight} fill="white" />
              <Rect
                x={spotX}
                y={spotY}
                width={spotW}
                height={spotH}
                rx={spotRadius}
                ry={spotRadius}
                fill="black"
              />
            </Mask>
          </Defs>
          <Rect
            x="0"
            y="0"
            width={screenWidth}
            height={screenHeight}
            fill="rgba(13, 13, 17, 0.58)"
            mask="url(#tutorial-spotlight-mask)"
          />
        </Svg>

        {/* Crisp white highlight ring directly around the real element */}
        <View
          pointerEvents="none"
          style={[
            styles.spotlightRing,
            {
              left: spotX,
              top: spotY,
              width: spotW,
              height: spotH,
              borderRadius: spotRadius,
            },
          ]}
        />
      </View>

      {/* Callout Popover Card with Pointer Arrow */}
      <View style={[styles.calloutWrapper, calloutPositionStyle]} pointerEvents="box-none">
        {isBelow && (
          <View style={[styles.arrowUp, { marginLeft: arrowLeftInCard }]} />
        )}

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>{uiText(currentStep.title)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={uiText('Close tutorial')}
              onPress={onClose}
              hitSlop={10}
              style={styles.closeBtn}
            >
              <Ionicons name="close" size={20} color="#52525B" />
            </Pressable>
          </View>

          <Text style={styles.cardDescription}>
            {uiText(currentStep.description)}
          </Text>

          <View style={styles.cardFooter}>
            <Text style={styles.stepCounter}>
              {`${stepIndex + 1}/${totalSteps}`}
            </Text>

            <View style={styles.footerActions}>
              {stepIndex > 0 && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={uiText('Previous step')}
                  onPress={handleBack}
                  style={({ pressed }) => [
                    styles.backButton,
                    pressed && styles.buttonPressed,
                  ]}
                >
                  <Ionicons name="chevron-back" size={16} color="#0D0D11" />
                </Pressable>
              )}

              <Pressable
                accessibilityRole="button"
                accessibilityLabel={uiText(isLastStep ? 'Done' : 'Next')}
                onPress={handleNext}
                style={({ pressed }) => [
                  styles.nextButton,
                  pressed && styles.buttonPressed,
                ]}
              >
                <Text style={styles.nextButtonText}>
                  {uiText(isLastStep ? 'Done' : 'Next')}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>

        {!isBelow && (
          <View style={[styles.arrowDown, { marginLeft: arrowLeftInCard }]} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    elevation: 9999,
  },
  spotlightRing: {
    position: 'absolute',
    borderWidth: 2.5,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
  },
  calloutWrapper: {
    position: 'absolute',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#0D0D11',
    paddingRight: 8,
  },
  closeBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  cardDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: '#52525B',
    marginBottom: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepCounter: {
    fontSize: 14,
    fontWeight: '600',
    color: '#71717A',
  },
  footerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#E4E4E7',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButton: {
    height: 34,
    paddingHorizontal: 18,
    borderRadius: 999,
    backgroundColor: '#0D0D11',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  buttonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },
  arrowUp: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#FFFFFF',
    marginBottom: -1,
  },
  arrowDown: {
    width: 0,
    height: 0,
    borderLeftWidth: 9,
    borderRightWidth: 9,
    borderTopWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
    marginTop: -1,
  },
});
