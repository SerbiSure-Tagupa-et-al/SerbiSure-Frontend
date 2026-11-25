import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import { AppState } from 'react-native';
import { realtime } from '../../../shared/realtime';
import { useRealtimeStatus } from '../../../shared/realtime/useRealtimeStatus';
import { useChatPresence } from '../../../shared/realtime/useChatPresence';
import { mapBookingCard, bookingSchedule, type BookingCardInfo } from '../bookingCards';
import { bookingStartTime, isAcceptanceExpired, PASSED_SCHEDULE_MESSAGE } from '../../bookings/postAvailability';
import { useScheduleClock } from '../../bookings/hooks/useScheduleClock';
import { sendBookingOffer, respondToBookingOffer } from '../api/bookingOffersApi';
import type { BookingConfirmData } from '../../bookings/components/BookingModal';
import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { StyleSheet, Text, View, Image, TextInput, FlatList, ScrollView, Pressable, Modal, Keyboard, KeyboardAvoidingView, Platform, Alert, Animated, ActivityIndicator, Dimensions, PanResponder, ToastAndroid, NativeModules, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { BookingModal } from '../../bookings/components/BookingModal';
import { confirmBookingAcceptance, bookingResponseMessage, getPendingReviewFromError, promptPendingReview } from '../../bookings/bookingAcceptance';
import type { PendingMandatoryReview } from '../../bookings/api/bookingApi';
import { ReviewModal } from '../../reviews/components/ReviewModal';
import { UserProfileView } from '../../profile/components/UserProfileView';
import { OfficialProfileModal } from '../../profile/components/OfficialProfileModal';
import { useChatSafety } from '../hooks/useChatSafety';
import { containsOffensiveLanguage, OFFENSIVE_LANGUAGE_ADVISORY } from '../offensiveLanguage';
import { analyzeChatCurrency, buildRateProposalMessage, formatRate, formatRateInput, type ChatCurrencyAnalysis } from '../chatCurrency';

import { useUser } from '../../auth/session/UserContext';
import THEME from '../../../shared/theme/theme';
import { fetchChatThreadDetails, generateUUID, sendChatMessage, sendChatImage, toggleChatReaction, deleteChatMessage, sendChatTyping } from '../api/chatApi';
import { chatStore } from '../store/chatStore';
import { createThreadRefreshQueue } from '../threadRefreshQueue';
import { cacheThread, forgetCachedThread, getCachedThread, threadCacheGeneration } from '../threadCache';
import { getReplyRelationship, isGenericPhotoReply } from '../replyRelationships';
import { savedJobsStore } from '../../bookings/store/savedJobsStore';
import { API_BASE_URL } from '../../../shared/api/config';
import { fetchWithTimeout } from '../../../shared/api/httpClient';

const serbisureIcon = require('../../../../assets/serbisure-icon.png');

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export const formatBookingStartDate = (dateStr?: string) => {
  if (!dateStr) return 'Not provided';
  try {
    const parts = dateStr.split('/');
    if (parts.length === 3 && parts[0] && parts[1]) {
      const m = parseInt(parts[0], 10) - 1;
      const d = parseInt(parts[1], 10);
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[m] || 'Unknown'} ${d}`;
    }
    const parsed = new Date(dateStr);
    if (!isNaN(parsed.getTime())) {
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return `${months[parsed.getMonth()]} ${parsed.getDate()}`;
    }
  } catch { }
  return dateStr;
};

// Historic text offers remain ordinary messages without actionable terms.
export function parseBookingInfoFromText(..._args: unknown[]): null { return null; }

export interface ChatMessage {
  isSensitive?: boolean;
  id: string;
  sender: 'other' | 'me' | 'system';
  text?: string;
  imageUri?: string;
  reaction?: string;
  reactionSummary?: Record<string, number>;
  replyTo?: {
    author: string;
    text: string;
    imageUri?: string;
    messageId?: string;
  };
  time: string;
  createdAtRaw?: string;
  avatar?: string;
  bookingInfo?: BookingCardInfo;
  isTyping?: boolean;
  isUploading?: boolean;
}

function isValidUUID(val?: string): boolean {
  if (!val) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(val);
}

function SwipeableMessageRow({
  children,
  onReply,
  disabled,
  align = 'left',
  onLayout,
}: {
  children: React.ReactNode;
  onReply: () => void;
  disabled?: boolean;
  align?: 'left' | 'right';
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const panX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (disabled) return false;
        if (align === 'right') {
          // Swiping own message from right to left (negative dx)
          return (
            gestureState.dx < -25 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2.5
          );
        } else {
          // Swiping partner's message from left to right (positive dx)
          return (
            gestureState.dx > 25 &&
            Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 2.5
          );
        }
      },
      onPanResponderTerminationRequest: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (align === 'right') {
          if (gestureState.dx < 0) {
            const resistance =
              gestureState.dx < -55 ? -55 + (gestureState.dx + 55) * 0.3 : gestureState.dx;
            panX.setValue(Math.max(resistance, -75));
          }
        } else {
          if (gestureState.dx > 0) {
            const resistance =
              gestureState.dx > 55 ? 55 + (gestureState.dx - 55) * 0.3 : gestureState.dx;
            panX.setValue(Math.min(resistance, 75));
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (align === 'right') {
          if (gestureState.dx <= -45) {
            onReply();
          }
        } else {
          if (gestureState.dx >= 45) {
            onReply();
          }
        }
        Animated.spring(panX, {
          toValue: 0,
          friction: 7,
          tension: 140,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(panX, {
          toValue: 0,
          friction: 7,
          tension: 140,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  const iconScale = panX.interpolate({
    inputRange: align === 'right' ? [-50, -20, 0] : [0, 20, 50],
    outputRange: align === 'right' ? [1, 0.7, 0.3] : [0.3, 0.7, 1],
    extrapolate: 'clamp',
  });

  const iconOpacity = panX.interpolate({
    inputRange: align === 'right' ? [-45, -15, 0] : [0, 15, 45],
    outputRange: align === 'right' ? [1, 0.5, 0] : [0, 0.5, 1],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={styles.swipeRowContainer}
      collapsable={false}
      onLayout={onLayout}
      {...panResponder.panHandlers}
    >
      <Animated.View
        style={[
          align === 'right' ? styles.swipeReplyIconRight : styles.swipeReplyIconLeft,
          {
            opacity: iconOpacity,
            transform: [{ scale: iconScale }],
          },
        ]}
      >
        <Ionicons name="arrow-undo" size={16} color="#1A1A1A" />
      </Animated.View>

      <Animated.View
        style={{
          transform: [{ translateX: panX }],
          width: '100%',
        }}
      >
        {children}
      </Animated.View>
    </View>
  );
}

interface ChatDetailScreenProps {
  visible: boolean;
  onClose: () => void;
  partnerId?: string;
  token?: string | null;
  contactName?: string;
  contactRole?: string;
  contactAvatar?: string;
  initialMessage?: string;
  initialReplyTo?: {
    author: string;
    text: string;
    imageUri?: string;
    messageId?: string;
  };
  userRole?: 'homeowner' | 'kasambahay';
}

function formatTimeOnly(isoString?: string): string {
  if (!isoString) {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
  }
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Now';
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours % 12 || 12}:${minutes} ${hours >= 12 ? 'PM' : 'AM'}`;
  } catch {
    return 'Now';
  }
}

function formatCenteredDateTime(isoString?: string): string {
  if (!isoString) {
    return `Today ${formatTimeOnly()}`;
  }
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return `Today ${formatTimeOnly()}`;

    const timeStr = formatTimeOnly(isoString);

    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffMs = today.getTime() - msgDate.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return `Today ${timeStr}`;
    }
    if (diffDays === 1) {
      return `Yesterday ${timeStr}`;
    }
    if (diffDays >= 2 && diffDays < 14) {
      const weekday = d.toLocaleDateString('en-US', { weekday: 'long' });
      return `${weekday} ${timeStr}`;
    }

    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const day = d.getDate();
    if (d.getFullYear() === now.getFullYear()) {
      return `${month} ${day} ${timeStr}`;
    }
    return `${month} ${day}, ${d.getFullYear()} ${timeStr}`;
  } catch {
    return `Today ${formatTimeOnly()}`;
  }
}

function isDifferentDay(d1?: string, d2?: string): boolean {
  if (!d1 || !d2) return false;
  try {
    const a = new Date(d1);
    const b = new Date(d2);
    return (
      a.getFullYear() !== b.getFullYear() ||
      a.getMonth() !== b.getMonth() ||
      a.getDate() !== b.getDate()
    );
  } catch {
    return false;
  }
}

function shouldShowTimeSeparator(prevDateStr?: string, currDateStr?: string): boolean {
  if (!prevDateStr || !currDateStr) return true;
  try {
    const prev = new Date(prevDateStr).getTime();
    const curr = new Date(currDateStr).getTime();
    if (isNaN(prev) || isNaN(curr)) return true;
    const diffMins = Math.abs(curr - prev) / (1000 * 60);
    return isDifferentDay(prevDateStr, currDateStr) || diffMins >= 20;
  } catch {
    return true;
  }
}

const REACTION_OPTIONS = ['❤️', '👍', '😂', '😢', '😮'];

function isEmojiOnly(str?: string): boolean {
  if (!str) return false;
  const trimmed = str.trim();
  if (!trimmed || trimmed.length > 10) return false;
  try {
    const emojiRegex = /^(\p{Extended_Pictographic}|\p{Emoji_Presentation}|\u200d|\ufe0f|\s)+$/u;
    return emojiRegex.test(trimmed);
  } catch {
    return false;
  }
}

function TypingDotsIndicator({ avatarUri, useOfficialLogo }: { avatarUri: string; useOfficialLogo?: boolean }) {
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const createBounce = (anim: Animated.Value, delay: number) => {
      return Animated.sequence([
        Animated.delay(delay),
        Animated.loop(
          Animated.sequence([
            Animated.timing(anim, {
              toValue: -5,
              duration: 260,
              useNativeDriver: true,
            }),
            Animated.timing(anim, {
              toValue: 0,
              duration: 260,
              useNativeDriver: true,
            }),
            Animated.delay(350),
          ])
        ),
      ]);
    };

    const anim1 = createBounce(dot1, 0);
    const anim2 = createBounce(dot2, 140);
    const anim3 = createBounce(dot3, 280);

    anim1.start();
    anim2.start();
    anim3.start();

    return () => {
      anim1.stop();
      anim2.stop();
      anim3.stop();
    };
  }, [dot1, dot2, dot3]);

  return (
    <View style={styles.typingRow}>
      {useOfficialLogo ? (
        <View style={[styles.msgAvatar, styles.officialMsgAvatarContainer]}>
          <Image source={serbisureIcon} style={styles.officialMsgAvatarLogo} resizeMode="contain" />
        </View>
      ) : (
        <Image source={{ uri: avatarUri }} style={styles.msgAvatar} />
      )}
      <View style={styles.typingDotsBubble}>
        <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot1 }] }]} />
        <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot2 }] }]} />
        <Animated.View style={[styles.typingDot, { transform: [{ translateY: dot3 }] }]} />
      </View>
    </View>
  );
}

export function ChatDetailScreen(props: ChatDetailScreenProps) {
  const { user } = useUser();
  if (!props.visible) return null;
  // Reset before the next render: an effect-based reset can still flash the old thread.
  const sessionKey = JSON.stringify([user.id || user.email || props.token || user.token || '', props.partnerId || '', props.visible]);
  return <ChatDetailSession key={sessionKey} {...props} />;
}

function ChatDetailSession({
  visible,
  onClose,
  partnerId,
  token,
  contactName = 'User',
  contactRole = 'Member',
  contactAvatar,
  initialMessage,
  initialReplyTo,
  userRole = 'homeowner',
}: ChatDetailScreenProps) {
  const { tr: uiText } = useUiLanguage();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const effectiveToken = token || user.token;
  const threadKey = effectiveToken && partnerId ? JSON.stringify([user.id || user.email || effectiveToken, partnerId]) : null;
  const sessionThreadKey = useRef(threadKey).current;
  const cachedThread = useMemo(() => visible && threadKey
    ? getCachedThread(threadKey)?.filter(message => !chatStore.isMessageDeleted(message.id)) ?? null : null, [visible, threadKey]);
  const cacheGeneration = useRef(threadCacheGeneration());
  const hasLoadedThread = useRef(cachedThread !== null);
  const [transitionReady, setTransitionReady] = useState(false);
  const safety = useChatSafety(effectiveToken, visible && transitionReady);
  const isSupportConversation = ['admin', 'superadmin', 'barangay'].includes(contactRole.toLowerCase());
  const chatPaused = !!safety?.restricted_until && !isSupportConversation;
  const sessionActive = useRef(true);
  if (threadKey !== sessionThreadKey) sessionActive.current = false;
  useLayoutEffect(() => {
    sessionActive.current = true;
    return () => { sessionActive.current = false; };
  }, []);

  const presenceAccount = effectiveToken ? user.id || effectiveToken : null;
  const presence = useChatPresence(presenceAccount, partnerId ? [partnerId] : []);
  const partnerOnline = presence(partnerId);

  // Determine if the current active user is a Kasambahay or Homeowner
  const isKasambahay =
    userRole === 'kasambahay' ||
    user?.accountType?.toLowerCase() === 'kasambahay' ||
    contactRole?.toLowerCase().includes('homeowner');
  const isHomeowner = !isKasambahay;

  const scrollViewRef = useRef<FlatList<ChatMessage>>(null);
  const [isOtherTyping, setIsOtherTyping] = useState(false);
  const lastTypingSentRef = useRef<number>(0);

  const handleTyping = () => {
    if (!partnerId || !effectiveToken) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 2500) {
      lastTypingSentRef.current = now;
      sendChatTyping(effectiveToken, partnerId, true);
    }
  };

  const copyToClipboard = (text: string) => {
    if (!text) return;
    try {
      if (NativeModules.Clipboard?.setString) {
        NativeModules.Clipboard.setString(text);
      } else {
        const RNClipboard = require('react-native/Libraries/Components/Clipboard/Clipboard');
        RNClipboard?.setString?.(text);
      }
    } catch (e) {
      console.log('[ChatDetailScreen] copy clipboard fallback:', e);
    }

    if (Platform.OS === 'android') {
      ToastAndroid.show('Copied to clipboard', ToastAndroid.SHORT);
    } else {
      Alert.alert('Copied', 'Message copied to clipboard');
    }
  };

  const isSupportPartner =
    isSupportConversation ||
    contactName?.toLowerCase().includes('support') ||
    contactName?.toLowerCase().includes('superadmin') ||
    contactName?.toLowerCase().includes('admin') ||
    contactRole?.toLowerCase().includes('support') ||
    contactRole?.toLowerCase().includes('admin');

  const hasCustomAvatar = Boolean(
    contactAvatar &&
    !contactAvatar.includes('ui-avatars.com') &&
    !contactAvatar.includes('placeholder') &&
    !contactAvatar.includes('pravatar')
  );
  const useOfficialLogo = isSupportPartner && !hasCustomAvatar;

  const resolvedAvatar =
    contactAvatar ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(contactName || 'User')}&background=FFB43B&color=fff`;

  const [inputMessage, setInputMessage] = useState('');
  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [proposalType, setProposalType] = useState<'short_term' | 'long_term'>('short_term');
  const [proposalAmount, setProposalAmount] = useState('');
  const [amountAlert, setAmountAlert] = useState<{ blocking: boolean; message: string; edit: () => void; send?: () => void; amountFormatted: string } | null>(null);
  const currencyAnalysis = useMemo(() => !isSupportConversation ? analyzeChatCurrency(inputMessage) : null, [inputMessage, isSupportConversation]);
  const currencyWarningText = (warning: NonNullable<ChatCurrencyAnalysis['warning']>) =>
    uiText(warning.message.replace(warning.amountFormatted, '{amount}'), { amount: warning.amountFormatted });
  const proposalPeriod = proposalType === 'short_term' ? 'day' : 'month';
  const proposalAnalysis = analyzeChatCurrency(`₱${proposalAmount} / ${proposalPeriod}`);
  const proposalError = !proposalAmount.trim() ? null
    : !/^\d+(?:\.\d{1,2})?$/.test(proposalAmount) || !proposalAnalysis.hasAmount
      ? uiText('Enter a valid amount with up to two decimal places.')
      : proposalAnalysis.warning ? currencyWarningText(proposalAnalysis.warning) : null;
  const quickReplies = isHomeowner
    ? ['How much is your expected rate?', 'Part-time / Daily or Full-time / Monthly?', 'Is this rate negotiable?']
    : ['What is the offered budget?', 'Part-time / Daily or Full-time / Monthly?', 'Are you still hiring?'];
  const sendingText = useRef(false);
  const [isSendingText, setIsSendingText] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>(cachedThread || []);
  const newestFirst = useMemo(() => [...messages].reverse(), [messages]);
  const newestFirstRef = useRef(newestFirst);
  newestFirstRef.current = newestFirst;
  const [selectedImageUri, setSelectedImageUri] = useState<string | null>(null);
  const uploadingImage = useRef(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [reactingMessageId, setReactingMessageId] = useState<string | null>(null);
  const [activeActionMenuMsg, setActiveActionMenuMsg] = useState<ChatMessage | null>(null);
  const [removeTarget, setRemoveTarget] = useState<ChatMessage | null>(null);
  const [languageWarning, setLanguageWarning] = useState<{ send: () => void } | null>(null);
  const [sensitiveTarget, setSensitiveTarget] = useState<string | null>(null);
  const [revealedMessages, setRevealedMessages] = useState<Set<string>>(new Set());
  const initialAutoSentKey = useRef<string | null>(null);
  useEffect(() => {
    if (!visible) {
      setLanguageWarning(null);
      setSensitiveTarget(null);
      setRevealedMessages(new Set());
      initialAutoSentKey.current = null;
    }
  }, [visible]);
  useEffect(() => {
    if (!visible || chatPaused || isSupportConversation) {
      setAmountAlert(null);
      setRateModalVisible(false);
      setProposalAmount('');
    }
  }, [visible, chatPaused, isSupportConversation]);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const removalPending = useRef(false);
  const [activeMenuLayout, setActiveMenuLayout] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const messageRefs = useRef<{ [id: string]: View | null }>({});
  const reactionScaleAnim = useRef(new Animated.Value(0.3)).current;
  const reactionOpacityAnim = useRef(new Animated.Value(0)).current;
  const menuScaleAnim = useRef(new Animated.Value(0.4)).current;
  const menuOpacityAnim = useRef(new Animated.Value(0)).current;
  const backdropOpacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (activeActionMenuMsg) {
      reactionScaleAnim.setValue(0.2);
      reactionOpacityAnim.setValue(0);
      menuScaleAnim.setValue(0.4);
      menuOpacityAnim.setValue(0);
      backdropOpacityAnim.setValue(0);

      Animated.parallel([
        Animated.timing(backdropOpacityAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.spring(reactionScaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 135,
          useNativeDriver: true,
        }),
        Animated.timing(reactionOpacityAnim, {
          toValue: 1,
          duration: 140,
          useNativeDriver: true,
        }),
        Animated.spring(menuScaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 130,
          useNativeDriver: true,
        }),
        Animated.timing(menuOpacityAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [activeActionMenuMsg, reactionScaleAnim, reactionOpacityAnim, menuScaleAnim, menuOpacityAnim, backdropOpacityAnim]);

  const handleOpenActionMenu = (item: ChatMessage) => {
    const node = messageRefs.current[item.id];
    if (node && node.measureInWindow) {
      node.measureInWindow((x, y, width, height) => {
        if (typeof y === 'number' && !isNaN(y) && height > 0) {
          setActiveMenuLayout({ x, y, width, height });
        } else {
          setActiveMenuLayout(null);
        }
        setActiveActionMenuMsg(item);
      });
    } else {
      setActiveMenuLayout(null);
      setActiveActionMenuMsg(item);
    }
  };
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [bookingReadOnly, setBookingReadOnly] = useState(false);
  const [activeBookingMsgId, setActiveBookingMsgId] = useState<string | null>(null);
  const [activeBookingDetails, setActiveBookingDetails] = useState<BookingCardInfo | null>(null);
  const scheduleNow = useScheduleClock(messages.map(message => bookingStartTime(message.bookingInfo)), !!effectiveToken);

  useEffect(() => {
    if (bookingModalVisible) {
      Keyboard.dismiss();
    }
  }, [bookingModalVisible]);

  // Right-to-left slide transition state
  const [modalVisible, setModalVisible] = useState(visible);
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;
  const entranceAnimation = useRef<Animated.CompositeAnimation | null>(null);

  // Swipe-to-reply state & input ref
  const [replyingTo, setReplyingTo] = useState<{
    id: string;
    author: string;
    text: string;
    imageUri?: string;
    messageId?: string;
  } | null>(null);
  const inputRef = useRef<TextInput>(null);

  const jumpRetry = useRef<ReturnType<typeof setTimeout>>();
  const jumpAttempts = useRef(0);
  const jumpTarget = useRef<string>();
  useEffect(() => () => { clearTimeout(jumpRetry.current); entranceAnimation.current?.stop(); }, []);

  const scrollToMessage = (targetId?: string, targetImageUri?: string) => {
    let finalTargetId = targetId;

    // 1. If finalTargetId is not known or not measured, resolve via targetImageUri
    if (!messages.some(message => message.id === finalTargetId) && targetImageUri) {
      const match = messages.find(
        (m) =>
          m.imageUri &&
          (m.imageUri === targetImageUri ||
            m.imageUri.endsWith(targetImageUri) ||
            targetImageUri.endsWith(m.imageUri))
      );
      if (match) {
        finalTargetId = match.id;
      }
    }

    // 2. Fallback: match any photo message if targetImageUri exists
    if (!finalTargetId && targetImageUri) {
      const match = messages.find((m) => !!m.imageUri);
      if (match) {
        finalTargetId = match.id;
      }
    }

    const index = newestFirst.findIndex(message => message.id === finalTargetId);
    if (index < 0) { Alert.alert(uiText('Message unavailable'), uiText('This message is no longer available.')); return; }
    clearTimeout(jumpRetry.current);
    jumpAttempts.current = 0;
    jumpTarget.current = finalTargetId;
    scrollViewRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
  };

  useEffect(() => {
    if (visible && initialReplyTo && !initialMessage) {
      setReplyingTo({
        id: `initial-reply-${Date.now()}`,
        author: initialReplyTo.author || 'Job Post',
        text: initialReplyTo.text,
        imageUri: initialReplyTo.imageUri,
        messageId: initialReplyTo.messageId,
      });
      setTimeout(() => {
        inputRef.current?.focus();
      }, 350);
    }
  }, [visible, initialReplyTo, initialMessage]);

  const handleModalShow = () => {
    entranceAnimation.current?.stop();
    slideAnim.setValue(SCREEN_WIDTH);
    entranceAnimation.current = Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true });
    entranceAnimation.current.start(({ finished }) => {
      if (finished && sessionActive.current) setTransitionReady(true);
    });
  };

  const handleClose = () => {
    entranceAnimation.current?.stop();
    if (partnerId && effectiveToken) {
      sendChatTyping(effectiveToken, partnerId, false);
    }
    Animated.timing(slideAnim, {
      toValue: SCREEN_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      if (!sessionActive.current) return;
      setModalVisible(false);
      onClose();
    });
  };

  const handleInitiateReply = (msg: ChatMessage) => {
    const authorName = msg.sender === 'me' ? 'You' : (contactName || 'User');
    const previewText = msg.text
      ? (msg.text.length > 75 ? msg.text.slice(0, 75) + '...' : msg.text)
      : msg.imageUri
        ? '📷 Photo'
        : 'Message';

    setReplyingTo({
      id: msg.id,
      author: authorName,
      text: previewText,
      imageUri: msg.imageUri,
      messageId: msg.id,
    });

    setTimeout(() => {
      inputRef.current?.focus();
    }, 80);
  };

  const responseBusyRef = useRef(false);
  const refreshThreadRef = useRef<(() => void) | null>(null);
  const [responseBusy, setResponseBusy] = useState(false);
  const threadVersion = useRef(0);
  const nextPoll = useRef(0);
  const appliedPoll = useRef(0);
  const liveStatus = useRealtimeStatus();
  const [threadLoading, setThreadLoading] = useState(cachedThread === null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [threadReload, setThreadReload] = useState(0);
  const [pendingReview, setPendingReview] = useState<PendingMandatoryReview | null>(null);
  const offerDraft = useRef<{ body: string; key: string } | null>(null);

  useLayoutEffect(() => {
    if (visible && sessionActive.current && threadKey && threadKey === sessionThreadKey && hasLoadedThread.current) cacheThread(threadKey, messages, cacheGeneration.current);
  }, [visible, threadKey, messages, threadLoading]);

  const handleOfferResponse = async (msgId: string, action: 'accept' | 'reject') => {
    const card = messages.find(message => message.id === msgId)?.bookingInfo;
    if (!card || !effectiveToken || responseBusyRef.current) return;
    responseBusyRef.current = true; setResponseBusy(true); threadVersion.current++;
    try {
      await respondToBookingOffer(effectiveToken, card, action);
      if (!sessionActive.current) return;
      setMessages(current => current.map(message => message.id === msgId && message.bookingInfo ? {
        ...message, bookingInfo: {
          ...message.bookingInfo, canRespond: false,
          isConfirmed: action === 'accept', isDeclined: action === 'reject',
          title: action === 'accept' ? 'BOOKING CONFIRMED' : 'BOOKING DECLINED'
        },
      } : message));
      if (action === 'accept') savedJobsStore.markJobClosed(card.bookingId);
    } finally {
      if (sessionActive.current) { responseBusyRef.current = false; setResponseBusy(false); refreshThreadRef.current?.(); }
    }
  };
  const handleKasambahayConfirm = (id: string) => handleOfferResponse(id, 'accept');
  const handleKasambahayDecline = (id: string) => handleOfferResponse(id, 'reject');
  const confirmFromCard = (id: string, action: 'accept' | 'reject') => {
    const card = messages.find(message => message.id === id)?.bookingInfo;
    if (!card?.canRespond || responseBusyRef.current) return;
    if (action === 'accept' && isAcceptanceExpired(card)) return;
    const respond = () => {
      if (!sessionActive.current) return;
      void handleOfferResponse(id, action).catch(error => {
        if (!sessionActive.current) return;
        const requiredReview = getPendingReviewFromError(error);
        if (requiredReview) {
          promptPendingReview(requiredReview, bookingResponseMessage(error), setPendingReview, uiText);
        } else {
          Alert.alert(uiText('Booking not updated'), uiText(bookingResponseMessage(error)));
        }
      });
    };
    if (action === 'accept') confirmBookingAcceptance(card.bookingType, uiText, respond);
    else respond();
  };

  const handleSendOffer = async (details: BookingConfirmData) => {
    if (!effectiveToken || !partnerId) throw new Error('Sign in and select a conversation before sending an offer.');
    if (isKasambahay) throw new Error('Only homeowners can send booking offers.');
    if (responseBusyRef.current) throw new Error('Please wait for the current booking action to finish.');
    const times = details.workHours.split(' - ');
    const start = bookingSchedule(details.startDate, times[0] || '');
    const end = bookingSchedule(details.ongoing ? details.startDate : details.endDate, times[1] || '');
    const payload = {
      recipient_id: partnerId, booking_type: details.bookingType, work_setup: details.workSetup,
      service_category: details.serviceCategory, start_time: start.iso, end_time: details.ongoing ? null : end.iso,
      daily_start_time: start.clock, daily_end_time: end.clock, work_days: details.days,
      region: details.region, province: details.province, city: details.city, barangay: details.barangay,
      street: details.street, floor_number: details.floorUnit || undefined, zip_code: details.zipCode, special_instruction: '',
      rate_amount: details.salary, rate_period: details.bookingType === 'long_term' ? 'month' as const : 'day' as const,
    };
    const body = JSON.stringify(payload);
    if (offerDraft.current?.body !== body) offerDraft.current = { body, key: generateUUID() };
    responseBusyRef.current = true; setResponseBusy(true);
    try {
      const version = ++threadVersion.current;
      const result = await sendBookingOffer(effectiveToken, payload, offerDraft.current.key);
      if (sessionActive.current && result.language_warning) Alert.alert('Notice', result.language_warning);
      if (!sessionActive.current) return;
      const info = mapBookingCard(result.chat_message.booking_offer);
      if (!info) throw new Error('The server did not return a saved offer. Refresh the conversation before retrying.');
      if (version !== threadVersion.current) return;
      setMessages(current => [...current.filter(message => message.id !== result.chat_message.chat_message_id), {
        id: result.chat_message.chat_message_id, sender: 'system', bookingInfo: info,
        time: formatTimeOnly(result.chat_message.createdAt), createdAtRaw: result.chat_message.createdAt,
      }]);
      offerDraft.current = null;
    } finally {
      if (sessionActive.current) { responseBusyRef.current = false; setResponseBusy(false); refreshThreadRef.current?.(); }
    }
  };

  React.useEffect(() => {
    if (!visible || !transitionReady || threadKey !== sessionThreadKey) return;

    let isMounted = true;
    let typingTimer: ReturnType<typeof setTimeout> | undefined;

    const queue = createThreadRefreshQueue((isInitial) => {
      if (!partnerId || !effectiveToken) return Promise.resolve();
      const version = threadVersion.current;
      const presenceRevision = realtime.getPresenceRevision();
      const poll = ++nextPoll.current;
      if (isInitial) setThreadLoading(!hasLoadedThread.current);

      return fetchChatThreadDetails(effectiveToken, partnerId)
        .then(({ messages: items, partnerIsTyping, partnerIsOnline }) => {
          if (!isMounted || !sessionActive.current || version !== threadVersion.current || poll < appliedPoll.current) return;
          appliedPoll.current = poll;
          setThreadLoading(false); setThreadError(null);
          if (realtime.status !== 'connected') setIsOtherTyping(partnerIsTyping);
          // HTTP is a fallback. A slow response must never replace newer live presence.
          if (realtime.status !== 'connected') realtime.recordPresence(presenceAccount, partnerId, partnerIsOnline, presenceRevision);

          const sendAutoKey = `${partnerId}-${initialMessage}-${initialReplyTo?.text || ''}`;
          const shouldSendAuto = Boolean(isInitial && initialMessage && initialAutoSentKey.current !== sendAutoKey);

          if (items && items.length > 0) {
            const visibleItems = items.filter((m) => !chatStore.isMessageDeleted(m.chat_message_id));
            const mapped: ChatMessage[] = visibleItems.map((m) => {
              const persistedOffer = mapBookingCard(m.booking_offer);
              if (persistedOffer) return {
                id: m.chat_message_id, sender: 'system' as const,
                bookingInfo: persistedOffer, time: formatTimeOnly(m.createdAt), createdAtRaw: m.createdAt
              };

              let displayReaction = m.my_reaction || undefined;
              if (!displayReaction && m.reaction_summary) {
                for (const [emoji, count] of Object.entries(m.reaction_summary)) {
                  if (count > 0) {
                    displayReaction = emoji;
                    break;
                  }
                }
              }

              let cleanText = m.message_payload || undefined;
              let replyInfo: { author: string; text: string; imageUri?: string; messageId?: string } | undefined = undefined;

              if (cleanText) {
                const replyMatch = cleanText.match(/^> \[([^\]]+)\]:\s*(.*?)\n\n([\s\S]*)$/);
                if (replyMatch && replyMatch[1] && replyMatch[2] && replyMatch[3]) {
                  const authorHeader = replyMatch[1];
                  const parts = authorHeader.split('|');
                  const author = parts[0] || 'User';
                  let imageUri: string | undefined = undefined;
                  let messageId: string | undefined = undefined;

                  if (parts.length >= 3) {
                    imageUri = parts[1] ? parts[1].trim() : undefined;
                    messageId = parts[2] ? parts[2].trim() : undefined;
                  } else if (parts.length === 2 && parts[1]) {
                    const second = parts[1].trim();
                    if (
                      second.startsWith('http://') ||
                      second.startsWith('https://') ||
                      second.startsWith('file://') ||
                      second.startsWith('data:') ||
                      second.startsWith('content://') ||
                      second.includes('/media/') ||
                      second.includes('/')
                    ) {
                      imageUri = second;
                    } else {
                      messageId = second;
                    }
                  }

                  const replyText = replyMatch[2] || 'Message';

                  if (!imageUri && (replyText.includes('Photo') || replyText.includes('📷'))) {
                    const currentIdx = visibleItems.findIndex((x) => x.chat_message_id === m.chat_message_id);
                    const prevSlice = currentIdx > 0 ? visibleItems.slice(0, currentIdx) : visibleItems;
                    const prevImgMsg = [...prevSlice].reverse().find((x) => x.image_url);
                    if (prevImgMsg && prevImgMsg.image_url) {
                      imageUri = prevImgMsg.image_url;
                      messageId = prevImgMsg.chat_message_id;
                    }
                  }

                  if (!messageId && imageUri) {
                    const targetUri = imageUri;
                    const matchMsg = visibleItems.find(
                      (x) =>
                        Boolean(x.image_url) &&
                        (x.image_url === targetUri ||
                          targetUri.includes(x.image_url as string) ||
                          (x.image_url as string).includes(targetUri))
                    );
                    if (matchMsg) {
                      messageId = matchMsg.chat_message_id;
                    }
                  }

                  replyInfo = {
                    author,
                    text: replyText,
                    imageUri,
                    messageId,
                  };
                  cleanText = replyMatch[3];
                }

              }

              return {
                id: m.chat_message_id,
                sender: m.is_sender ? ('me' as const) : ('other' as const),
                isSensitive: m.is_sensitive,
                text: cleanText,
                imageUri: m.image_url || undefined,
                reaction: displayReaction,
                reactionSummary: m.reaction_summary,
                replyTo: replyInfo,
                time: formatTimeOnly(m.createdAt),
                createdAtRaw: m.createdAt,
                avatar: m.is_sender ? undefined : resolvedAvatar,
              };
            });

            if (shouldSendAuto && initialMessage) {
              initialAutoSentKey.current = sendAutoKey;
              const replyHeader = initialReplyTo
                ? `> [${initialReplyTo.author}|${initialReplyTo.imageUri || ''}|${initialReplyTo.messageId || ''}]: ${initialReplyTo.text}\n\n`
                : '';
              const payload = `${replyHeader}${initialMessage}`;
              if (containsOffensiveLanguage(payload)) {
                setMessages(mapped);
                setInputMessage(initialMessage);
                setReplyingTo(initialReplyTo ? { ...initialReplyTo, id: initialReplyTo.messageId || '' } : null);
                return;
              }
              const tempId = `temp-${Date.now()}`;
              const autoMsg: ChatMessage = {
                id: tempId,
                sender: 'me',
                text: initialMessage,
                replyTo: initialReplyTo
                  ? {
                    author: initialReplyTo.author,
                    text: initialReplyTo.text,
                    imageUri: initialReplyTo.imageUri,
                    messageId: initialReplyTo.messageId,
                  }
                  : undefined,
                time: formatTimeOnly(),
              };
              const combined = [...mapped, autoMsg];
              hasLoadedThread.current = true;
              if (threadKey) cacheThread(threadKey, combined, cacheGeneration.current);
              setMessages(combined);

              sendChatMessage(effectiveToken, partnerId, payload)
                .then((res) => {
                  if (!isMounted || !sessionActive.current) return;
                  if (res?.data?.chat_message_id && isMounted) {
                    setMessages((prev) =>
                      prev.map((msg) => (msg.id === tempId ? { ...msg, id: res.data.chat_message_id, text: (res.data.message_payload || '').replace(/^> \[[^\n]*\]: [^\n]*\n\n/, '') } : msg))
                    );
                  }
                  if (res.language_warning) Alert.alert('Notice', res.language_warning);
                  chatStore.addOrUpdateChat({
                    partnerId,
                    name: contactName,
                    badge: contactRole,
                    avatar: resolvedAvatar,
                    message: (res.data.message_payload || '').replace(/^> \[[^\n]*\]: [^\n]*\n\n/, ''),
                    time: 'Just now',
                  });
                })
                .catch((err) => {
                  if (isMounted) { setMessages(current => current.filter(message => message.id !== tempId)); setInputMessage(initialMessage || ''); setThreadError(err instanceof Error ? err.message : 'Could not send the initial message. Please retry.'); }
                });
            } else {
              hasLoadedThread.current = true;
              if (threadKey) cacheThread(threadKey, mapped, cacheGeneration.current);
              setMessages((prev) => {
                const deduplicatedMapped = [...mapped, ...prev.filter(message => message.id.startsWith('temp-'))];
                const hasChanged =
                  prev.length !== deduplicatedMapped.length ||
                  prev.some((msg, idx) => {
                    const m = deduplicatedMapped[idx];
                    if (!m) return true;
                    if (msg.id !== m.id) return true;
                    if (msg.sender !== m.sender) return true;
                    if (!!msg.bookingInfo !== !!m.bookingInfo) return true;
                    if (JSON.stringify(msg.bookingInfo) !== JSON.stringify(m.bookingInfo)) return true;
                    if (msg.bookingInfo?.isAcquired !== m.bookingInfo?.isAcquired) return true;
                    if (msg.reaction !== m.reaction) return true;
                    if (msg.imageUri !== m.imageUri) return true;
                    if (msg.text !== m.text) return true;
                    if (msg.replyTo?.text !== m.replyTo?.text) return true;
                    if (JSON.stringify(msg.reactionSummary) !== JSON.stringify(m.reactionSummary)) return true;
                    return false;
                  });
                if (hasChanged) {
                  return deduplicatedMapped;
                }
                return prev;
              });
            }

            void chatStore.loadInbox(effectiveToken, true);
          } else if (shouldSendAuto && initialMessage) {
            initialAutoSentKey.current = sendAutoKey;
            hasLoadedThread.current = true;
            if (threadKey) cacheThread(threadKey, [], cacheGeneration.current);
            // New thread with initial auto-message!
            const replyHeader = initialReplyTo
              ? `> [${initialReplyTo.author}|${initialReplyTo.imageUri || ''}|${initialReplyTo.messageId || ''}]: ${initialReplyTo.text}\n\n`
              : '';
            const payload = `${replyHeader}${initialMessage}`;
            if (containsOffensiveLanguage(payload)) {
              // Imported drafts must go through the same explicit Send confirmation.
              setMessages([]);
              setInputMessage(initialMessage);
              setReplyingTo(initialReplyTo ? { ...initialReplyTo, id: initialReplyTo.messageId || '' } : null);
              return;
            }
            const tempId = `temp-${Date.now()}`;
            setMessages([
              {
                id: tempId,
                sender: 'me',
                text: initialMessage,
                replyTo: initialReplyTo
                  ? {
                    author: initialReplyTo.author,
                    text: initialReplyTo.text,
                    imageUri: initialReplyTo.imageUri,
                    messageId: initialReplyTo.messageId,
                  }
                  : undefined,
                time: formatTimeOnly(),
              },
            ]);

            // Persist the initial message to backend
            sendChatMessage(effectiveToken, partnerId, payload)
              .then((res) => {
                if (!isMounted || !sessionActive.current) return;
                if (res?.data?.chat_message_id && isMounted) {
                  setMessages((prev) =>
                    prev.map((msg) => (msg.id === tempId ? { ...msg, id: res.data.chat_message_id, text: (res.data.message_payload || '').replace(/^> \[[^\n]*\]: [^\n]*\n\n/, '') } : msg))
                  );
                }
                if (res.language_warning) Alert.alert('Notice', res.language_warning);
                chatStore.addOrUpdateChat({
                  partnerId,
                  name: contactName,
                  badge: contactRole,
                  avatar: resolvedAvatar,
                  message: (res.data.message_payload || '').replace(/^> \[[^\n]*\]: [^\n]*\n\n/, ''),
                  time: 'Just now',
                });
              })
              .catch((err) => {
                if (isMounted) { setMessages(current => current.filter(message => message.id !== tempId)); setInputMessage(initialMessage || ''); setThreadError(err instanceof Error ? err.message : 'Could not send the initial message. Please retry.'); }
              });
          } else {
            hasLoadedThread.current = true;
            if (threadKey) cacheThread(threadKey, [], cacheGeneration.current);
            setMessages(current => current.filter(message => message.id.startsWith('temp-')));
          }
        })
        .catch((err) => {
          if (!isMounted || version !== threadVersion.current) return;
          setThreadLoading(false);
          if ([401, 403, 404].includes(err?.status)) {
            hasLoadedThread.current = false;
            if (threadKey) forgetCachedThread(threadKey);
            setMessages([]);
            setThreadError(err.status === 401 ? 'Please sign in again.' : 'This conversation is unavailable.');
          } else {
            setThreadError(hasLoadedThread.current ? 'Could not refresh messages. Please retry.' : 'Could not load messages. Please retry.');
          }
        });
    }, () => isMounted && !!partnerId && !!effectiveToken && !responseBusyRef.current && !sendingText.current && !uploadingImage.current && AppState.currentState === 'active');
    const syncThread = queue.request;

    if (partnerId && effectiveToken) {
      // Attach listeners before fetching so an event during the request is retained.
      refreshThreadRef.current = syncThread;
      const off = realtime.subscribe(event => {
        if (event.type === 'chat.typing' && event.partner_id === partnerId) {
          setIsOtherTyping(Boolean(event.is_typing));
          clearTimeout(typingTimer);
          if (event.is_typing) typingTimer = setTimeout(() => setIsOtherTyping(false), 5000);
        } else if (event.type === 'sync' || event.type === 'booking.changed' ||
          (event.type === 'chat.changed' && event.partner_id === partnerId)) syncThread(false);
      });
      syncThread(true);
      const appState = AppState.addEventListener('change', state => { if (state === 'active') syncThread(false); });
      const intervalId = setInterval(() => { if (realtime.status !== 'connected') syncThread(false); }, 30000);
      return () => {
        isMounted = false; queue.stop(); off(); appState.remove(); clearTimeout(typingTimer); clearInterval(intervalId);
        if (refreshThreadRef.current === syncThread) refreshThreadRef.current = null;
      };
    } else {
      setThreadLoading(false);
      setThreadError('Sign in and select a conversation to view messages.');
      setMessages([]);
      return () => {
        isMounted = false; queue.stop();
      };
    }
  }, [visible, transitionReady, partnerId, effectiveToken, resolvedAvatar, initialMessage, threadReload, threadKey, presenceAccount]);

  const handleSend = (acknowledged = false, overrideText?: string, skipAmountWarning = false) => {
    const rawTrimmed = (overrideText ?? inputMessage).trim();
    let trimmed = rawTrimmed;
    if (!trimmed || sendingText.current || chatPaused) return;
    if (!partnerId || !effectiveToken) { Alert.alert('Sign in required', 'Please sign in before sending messages.'); return; }
    if (!isSupportConversation) {
      const analysis = analyzeChatCurrency(rawTrimmed);
      trimmed = analysis.formattedText;
      if (analysis.warning && (analysis.warning.blocking || !skipAmountWarning)) {
        const blocking = analysis.warning.blocking;
        if (blocking && overrideText === undefined) setInputMessage(trimmed);
        setAmountAlert({ blocking, amountFormatted: analysis.warning.amountFormatted,
          message: currencyWarningText(analysis.warning) + (blocking ? '' : ` ${uiText('Formal booking offers enforce these limits.')}`),
          edit: () => { if (overrideText === undefined) setInputMessage(trimmed); inputRef.current?.focus(); },
          // Keep the original source: typed messages clear; quick sends preserve the draft.
          send: blocking ? undefined : () => { if (sessionActive.current) handleSend(acknowledged, overrideText, true); },
        });
        return;
      }
    }
    const quoted = replyingTo ? `> [${replyingTo.author}]: ${replyingTo.text}\n\n` : '';
    if (acknowledged !== true && containsOffensiveLanguage(quoted + trimmed)) {
      setLanguageWarning({ send: () => { if (sessionActive.current) handleSend(true, overrideText, skipAmountWarning); } });
      return;
    }
    sendingText.current = true;
    threadVersion.current++;
    setIsSendingText(true);

    if (partnerId && effectiveToken) {
      sendChatTyping(effectiveToken, partnerId, false);
    }

    const timeString = formatTimeOnly();
    const tempId = `temp-${Date.now()}`;

    const currentReply = replyingTo;
    setReplyingTo(null);

    const replyHeader = currentReply
      ? `> [${currentReply.author}|${currentReply.imageUri || ''}|${currentReply.messageId || currentReply.id || ''}]: ${currentReply.text}\n\n`
      : '';
    const payloadToSend = `${replyHeader}${trimmed}`;

    const bookingInfo = parseBookingInfoFromText(
      trimmed,
      true,
      user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : 'You',
      contactName
    );

    const nowIso = new Date().toISOString();
    const newMessage: ChatMessage = bookingInfo
      ? {
        id: tempId,
        sender: 'system',
        bookingInfo,
        time: timeString,
        createdAtRaw: nowIso,
      }
      : {
        id: tempId,
        sender: 'me',
        text: trimmed,
        replyTo: currentReply
          ? {
            author: currentReply.author,
            text: currentReply.text,
            imageUri: currentReply.imageUri,
            messageId: currentReply.messageId || currentReply.id,
          }
          : undefined,
        time: timeString,
        createdAtRaw: nowIso,
      };

    setMessages((prev) => {
      const nonTyping = prev.filter((m) => !m.isTyping);
      return [...nonTyping, newMessage];
    });

    if (overrideText === undefined) setInputMessage('');

    setTimeout(() => {
      scrollViewRef.current?.scrollToOffset({ offset: 0, animated: true });
    }, 100);

    // Call real backend API if partnerId and token exist
    if (partnerId && effectiveToken) {
      sendChatMessage(effectiveToken, partnerId, payloadToSend, undefined, acknowledged === true)
        .then((res) => {
          if (!sessionActive.current) return;
          if (res?.data?.chat_message_id) {
            setMessages((prev) =>
              prev.filter(msg => msg.id !== res.data.chat_message_id).map((msg) => (msg.id === tempId ? { ...msg, id: res.data.chat_message_id, text: (res.data.message_payload || '').replace(/^> \[[^\n]*\]: [^\n]*\n\n/, '') } : msg))
            );
          }
          if (res.language_warning) Alert.alert('Notice', res.language_warning);
          chatStore.addOrUpdateChat({
            partnerId,
            name: contactName,
            badge: contactRole,
            avatar: contactAvatar,
            message: (res.data.message_payload || '').replace(/^> \[[^\n]*\]: [^\n]*\n\n/, ''),
            time: 'Just now',
          });
        })
        .catch((err) => {
          if (!sessionActive.current) return;
          setMessages(current => current.filter(message => message.id !== tempId));
          setInputMessage(current => current || trimmed);
          setReplyingTo(current => current || currentReply);
          if (err?.details?.code === 'offensive_language_warning') {
            setLanguageWarning({ send: () => { if (sessionActive.current) handleSend(true, overrideText, skipAmountWarning); } });
            return;
          }
          Alert.alert('Message not sent', err.message || 'Could not send message. Please try again.');
        }).finally(() => {
          sendingText.current = false;
          if (sessionActive.current) { setIsSendingText(false); refreshThreadRef.current?.(); }
        });
    }
  };

  const handlePickImage = async () => {
    if (chatPaused || uploadingImage.current) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!sessionActive.current) return;
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Gallery permission is required to choose photos.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!sessionActive.current) return;

      if (result.canceled || !result.assets?.[0]?.uri) return;

      const imageUri = result.assets[0].uri;

      if (!partnerId || !effectiveToken) {
        Alert.alert('Error', 'Cannot send image: conversation is not ready.');
        return;
      }

      const fileSize = result.assets[0].fileSize;
      if (fileSize && fileSize > 10 * 1024 * 1024) {
        Alert.alert('File Too Large', 'Please choose an image under 10MB.');
        return;
      }

      const now = new Date();
      const timeString = formatTimeOnly(now.toISOString());
      const tempId = `temp-img-${Date.now()}`;
      uploadingImage.current = true;
      threadVersion.current++;

      const newMsg: ChatMessage = {
        id: tempId,
        sender: 'me',
        imageUri: imageUri,
        time: timeString,
        createdAtRaw: now.toISOString(),
        isUploading: true,
      };

      setMessages((prev) => {
        const nonTyping = prev.filter((m) => !m.isTyping);
        return [...nonTyping, newMsg];
      });

      setTimeout(() => {
        scrollViewRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);

      setIsUploadingImage(true);
      try {
        const res = await sendChatImage(effectiveToken, partnerId, imageUri);
        if (!sessionActive.current) return;
        if (res?.data?.chat_message_id) {
          setMessages((prev) =>
            prev.filter(msg => msg.id !== res.data.chat_message_id).map((msg) =>
              msg.id === tempId
                ? {
                  ...msg,
                  id: res.data.chat_message_id,
                  imageUri: res.data.image_url || imageUri,
                  isUploading: false,
                }
                : msg
            )
          );
        }
        chatStore.addOrUpdateChat({
          partnerId,
          name: contactName,
          badge: contactRole,
          avatar: contactAvatar,
          message: '📷 Photo',
          time: 'Just now',
        });
      } catch (uploadErr: any) {
        if (!sessionActive.current) return;
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        const errMsg = uploadErr?.message || 'Could not send image. Please try again.';
        if (errMsg.toLowerCase().includes('too large') || errMsg.toLowerCase().includes('10 mb')) {
          Alert.alert('File Too Large', 'Please choose an image under 10MB.');
        } else if (errMsg.toLowerCase().includes('format') || errMsg.toLowerCase().includes('unsupported')) {
          Alert.alert('Invalid Format', 'Only JPEG, PNG, and WEBP images are supported.');
        } else if (errMsg.toLowerCase().includes('rate') || errMsg.toLowerCase().includes('limit') || errMsg.toLowerCase().includes('too many')) {
          Alert.alert('Slow Down', 'You are sending images too quickly. Please wait a moment.');
        } else {
          Alert.alert('Upload Failed', errMsg);
        }
      } finally {
        uploadingImage.current = false;
        if (sessionActive.current) { setIsUploadingImage(false); refreshThreadRef.current?.(); }
      }
    } catch (err) {
      if (!sessionActive.current) return;
      console.log('Error choosing image in chat:', err);
      Alert.alert('Gallery Error', 'Could not open photo gallery. Please try again.');
    }
  };

  const handleSelectReaction = async (emoji: string, targetId?: string) => {
    const targetMsgId = targetId || activeActionMenuMsg?.id || reactingMessageId;
    if (!targetMsgId) return;
    setReactingMessageId(null);

    // Normalize heart emoji
    const normalizedEmoji = emoji === '\u2764' ? '❤️' : emoji;
    const previousMessage = messages.find(message => message.id === targetMsgId);

    // Optimistic UI update
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.id === targetMsgId) {
          const isRemoving = msg.reaction === normalizedEmoji;
          const nextReaction = isRemoving ? undefined : normalizedEmoji;
          const prevSummary = { ...(msg.reactionSummary || {}) };
          if (isRemoving) {
            prevSummary[normalizedEmoji] = Math.max(0, (prevSummary[normalizedEmoji] ?? 1) - 1);
          } else {
            const currentReactionCount = msg.reaction ? prevSummary[msg.reaction] : undefined;
            if (msg.reaction && currentReactionCount !== undefined) {
              prevSummary[msg.reaction] = Math.max(0, currentReactionCount - 1);
            }
            prevSummary[normalizedEmoji] = (prevSummary[normalizedEmoji] ?? 0) + 1;
          }
          return {
            ...msg,
            reaction: nextReaction,
            reactionSummary: prevSummary,
          };
        }
        return msg;
      })
    );

    // Persist to backend
    if (effectiveToken && targetMsgId && !targetMsgId.startsWith('temp-')) {
      try {
        const res = await toggleChatReaction(effectiveToken, targetMsgId, normalizedEmoji);
        if (!sessionActive.current) return;
        if (res?.data?.reaction_counts) {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === targetMsgId
                ? {
                  ...msg,
                  reaction: res.data.my_reaction || undefined,
                  reactionSummary: res.data.reaction_counts,
                }
                : msg
            )
          );
        }
      } catch (err) {
        if (!sessionActive.current) return;
        setMessages(current => current.map(message => message.id === targetMsgId ? {
          ...message, reaction: previousMessage?.reaction, reactionSummary: previousMessage?.reactionSummary,
        } : message));
        Alert.alert(uiText('Reaction not saved'), uiText('Could not save your reaction. Please retry.'));
      }
    }
  };

  const handleRemoveForYou = async () => {
    if (!removeTarget || removalPending.current || !effectiveToken) return;
    const msg = removeTarget;
    if (msg.isUploading || !isValidUUID(msg.id)) {
      setRemoveError('Wait for this message to finish sending.');
      return;
    }
    removalPending.current = true;
    setIsRemoving(true); setRemoveError(null);
    try {
      await deleteChatMessage(effectiveToken, msg.id);
      if (!sessionActive.current) return;
      chatStore.markMessageDeleted(msg.id);
      setMessages(previous => previous.filter(message => message.id !== msg.id));
      setReplyingTo(reply => reply?.messageId === msg.id || reply?.id === msg.id ? null : reply);
      setRemoveTarget(null);
      void chatStore.loadInbox(effectiveToken, true);
      if (Platform.OS === 'android') ToastAndroid.show('Message removed for you', ToastAndroid.SHORT);
    } catch {
      if (sessionActive.current) setRemoveError('Could not remove the message. Try again.');
    } finally {
      removalPending.current = false;
      if (sessionActive.current) setIsRemoving(false);
    }
  };

  const renderReactionBadge = (msg: ChatMessage, align: 'left' | 'right') => {
    const counts = msg.reactionSummary || {};
    const normalizedCounts: Record<string, number> = {};
    for (const [rawEmoji, count] of Object.entries(counts)) {
      if (count > 0) {
        const clean = rawEmoji === '\u2764' || rawEmoji.startsWith('\u2764') ? '❤️' : rawEmoji;
        normalizedCounts[clean] = (normalizedCounts[clean] ?? 0) + count;
      }
    }
    const activeEntries = Object.entries(normalizedCounts);

    if (activeEntries.length === 0 && !msg.reaction) return null;

    const isSingleReaction =
      (activeEntries.length === 1 && (activeEntries[0]?.[1] ?? 1) <= 1) ||
      (activeEntries.length === 0 && !!msg.reaction);

    return (
      <View
        style={[
          styles.reactionBadgePill,
          isSingleReaction ? styles.reactionBadgeCircle : styles.reactionBadgeCapsule,
          align === 'left' ? styles.reactionBadgePillLeft : styles.reactionBadgePillRight,
        ]}
      >
        {activeEntries.length > 0 ? (
          activeEntries.map(([emoji, count]) => {
            const cleanEmoji = emoji === '\u2764' || emoji.startsWith('\u2764') ? '❤️' : emoji;
            return (
              <View key={emoji} style={styles.reactionBadgeItem}>
                <Text style={styles.reactionBadgeEmoji}>
                  {cleanEmoji}
                </Text>
                {count > 1 ? (
                  <Text style={styles.reactionBadgeCount}>{count}</Text>
                ) : null}
              </View>
            );
          })
        ) : msg.reaction ? (
          <View style={styles.reactionBadgeItem}>
            <Text style={styles.reactionBadgeEmoji}>
              {msg.reaction === '\u2764' || msg.reaction.startsWith('\u2764') ? '❤️' : msg.reaction}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  if (threadKey !== sessionThreadKey) return null;
  return (
    <Modal visible={modalVisible} animationType="none" transparent={false} statusBarTranslucent onShow={handleModalShow} onRequestClose={handleClose}>
      <Animated.View style={[styles.modalScreenContainer, { transform: [{ translateX: slideAnim }], paddingTop: Math.max(insets.top, 14) }]}>
        <KeyboardAvoidingView
          style={styles.container}
          behavior="padding"
        >
          {/* Header */}
          <View style={styles.header}>
            <Pressable onPress={handleClose} style={styles.backBtn} hitSlop={12}>
              <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
            </Pressable>

            <Pressable
              style={styles.headerInfo}
              onPress={() => {
                if (partnerId) {
                  setProfileModalVisible(true);
                }
              }}
              hitSlop={8}
            >
              <View style={styles.avatarWrapper}>
                {useOfficialLogo ? (
                  <View style={[styles.headerAvatar, styles.officialHeaderAvatarContainer]}>
                    <Image source={serbisureIcon} style={styles.officialHeaderAvatarLogo} resizeMode="contain" />
                  </View>
                ) : (
                  <Image source={{ uri: resolvedAvatar }} style={styles.headerAvatar} />
                )}
                {partnerOnline === true ? <View testID="chat-presence-online" style={styles.onlineDot} /> : null}
              </View>
              <View style={styles.headerTextCol}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={styles.contactName} numberOfLines={1} ellipsizeMode="tail">{contactName}</Text>
                  <Ionicons name="chevron-forward" size={13} color="#8E8E93" style={{ flexShrink: 0 }} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
                  <Text testID="chat-presence-status" numberOfLines={1} style={styles.contactSub}>{uiText(partnerOnline === undefined ? 'Checking…' : partnerOnline ? 'Active now' : 'Inactive')}</Text>
                </View>
              </View>
            </Pressable>

            {!isSupportConversation && isHomeowner ? (
              <Pressable
                style={styles.bookingHeaderBtn}
                onPress={() => {
                  Keyboard.dismiss();
                  setBookingReadOnly(false);
                  setActiveBookingMsgId(null);
                  setActiveBookingDetails(null);
                  setBookingModalVisible(true);
                }}
                hitSlop={12}
              >
                <Ionicons name="calendar-outline" size={21} color="#1A1A1A" />
              </Pressable>
            ) : (
              <View style={styles.headerPlaceholder} />
            )}
          </View>

          {/* Chat Body Container */}
          <View style={{ flex: 1 }}>
            <FlatList<ChatMessage>
              ref={scrollViewRef}
              data={newestFirst}
              inverted
              keyExtractor={message => message.id}
              initialNumToRender={12}
              maxToRenderPerBatch={8}
              windowSize={5}
              maintainVisibleContentPosition={{ minIndexForVisible: 0, autoscrollToTopThreshold: 40 }}
              style={styles.chatBody}
              contentContainerStyle={styles.chatBodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onScrollToIndexFailed={({ index, averageItemLength }) => {
                if (jumpAttempts.current++ >= 2) return;
                scrollViewRef.current?.scrollToOffset({ offset: index * averageItemLength, animated: false });
                clearTimeout(jumpRetry.current);
                jumpRetry.current = setTimeout(() => {
                  const target = newestFirstRef.current.findIndex(message => message.id === jumpTarget.current);
                  if (sessionActive.current && target >= 0) scrollViewRef.current?.scrollToIndex({ index: target, viewPosition: 0.5, animated: true });
                }, 120);
              }}
              ListHeaderComponent={isOtherTyping ? <TypingDotsIndicator avatarUri={resolvedAvatar} useOfficialLogo={useOfficialLogo} /> : null}
              ListFooterComponent={<>
                {/* Show initial Date Separator if empty thread */}
                {messages.length === 0 && !threadLoading && !threadError ? (
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <Ionicons name="chatbubbles-outline" size={38} color="#9CA3AF" />
                    <Text style={{ marginTop: 12, fontWeight: '700' }}>{uiText("No messages yet")}</Text>
                    <Text style={{ marginTop: 6, color: '#6B7280', textAlign: 'center' }}>{isSupportConversation ? 'Tell us how we can help. Your message will be sent to this support desk.' : 'Send a message or use the calendar button to propose a booking.'}</Text>
                  </View>
                ) : null}

                {liveStatus !== 'connected' ? <Text accessibilityLiveRegion="polite" style={{ padding: 12, color: '#71717A', fontSize: 12 }}>{liveStatus === 'unauthorized' ? 'Live updates unavailable. Please sign in again.' : 'Reconnecting live updates…'}</Text> : null}
                {threadLoading && !messages.length ? <ActivityIndicator style={{ marginTop: 32 }} color="#FFB380" /> : null}
                {threadError ? <View style={{ padding: 20 }}><Text>{uiText(threadError)}</Text><Pressable onPress={() => setThreadReload(value => value + 1)}><Text style={{ marginTop: 8, color: '#EA580C' }}>{uiText("Retry conversation")}</Text></Pressable></View> : null}
              </>}
              renderItem={({ item, index: reversedIndex }) => {
                const index = messages.length - 1 - reversedIndex;
                const prevMsg = index > 0 ? messages[index - 1] : null;
                const showDateSeparator =
                  index === 0 ||
                  shouldShowTimeSeparator(prevMsg?.createdAtRaw, item.createdAtRaw);
                const datePillElement = showDateSeparator ? (
                  <View key={`date-pill-${item.id}-${index}`} style={styles.datePill}>
                    <Text style={styles.datePillText}>
                      {formatCenteredDateTime(item.createdAtRaw)}
                    </Text>
                  </View>
                ) : null;

                // Share grouping with concealed messages so the last incoming bubble owns the avatar.
                const nextMsg = index < messages.length - 1 ? messages[index + 1] : null;
                const isSameSenderAsPrev =
                  !!prevMsg &&
                  prevMsg.sender === item.sender &&
                  prevMsg.sender !== 'system' &&
                  !prevMsg.bookingInfo &&
                  !item.bookingInfo &&
                  !item.replyTo;
                const isSameSenderAsNext =
                  !!nextMsg &&
                  nextMsg.sender === item.sender &&
                  nextMsg.sender !== 'system' &&
                  !nextMsg.bookingInfo &&
                  !item.bookingInfo &&
                  !nextMsg.replyTo;
                const isSameGroupAsPrev = isSameSenderAsPrev && prevMsg.time === item.time;
                const isSameGroupAsNext = isSameSenderAsNext && nextMsg.time === item.time;
                const hasReaction = !!item.reaction || Object.values(item.reactionSummary || {}).some((c) => c > 0);
                const rowSpacingStyle = isSameGroupAsNext
                  ? (hasReaction ? styles.messageRowGroupedWithReaction : styles.messageRowGrouped)
                  : null;

                const sensitive = item.isSensitive || containsOffensiveLanguage(`${item.replyTo?.text || ''}\n${item.text || ''}`);
                if (item.sender === 'other' && sensitive && !revealedMessages.has(item.id)) return (
                  <View key={`sensitive-${item.id}`}>
                    {datePillElement}
                    <View style={[styles.leftMessageRow, rowSpacingStyle]}>
                      <Pressable onPress={() => { if (partnerId) setProfileModalVisible(true); }} hitSlop={6}>
                        {!isSameGroupAsNext ? (
                          useOfficialLogo ? (
                            <View style={[styles.msgAvatar, styles.officialMsgAvatarContainer]}>
                              <Image source={serbisureIcon} style={styles.officialMsgAvatarLogo} resizeMode="contain" />
                            </View>
                          ) : (
                            <Image source={{ uri: item.avatar || contactAvatar || resolvedAvatar }} style={styles.msgAvatar} />
                          )
                        ) : (
                          <View style={styles.msgAvatarPlaceholder} />
                        )}
                      </Pressable>
                      <View style={styles.leftMessageCol}>
                        <Pressable accessibilityRole="button" accessibilityLabel="Open sensitive message"
                          onPress={() => setSensitiveTarget(item.id)} style={styles.sensitiveBubble}>
                          <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.sensitiveBlur}>━━━━━━━━━━━━{'\n'}━━━━━━━━</Text>
                          <Text style={styles.sensitiveLabel}>Sensitive message · Tap to view</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                );
                // Inverted list cells reverse their direct children. Keep each timestamp
                // and message inside one View so the timestamp stays above its message.
                // FB Marketplace Style Listing Closed / Acquired Message
                if (
                  item.text &&
                  (item.text.startsWith('[JOB_ACQUIRED]') ||
                    item.text.startsWith('[LISTING_CLOSED]') ||
                    item.text.startsWith('[LISTING CLOSED]') ||
                    item.text.toLowerCase().includes('job position has already been acquired'))
                ) {
                  const cleanMsg = item.text.replace(/^\[(?:JOB_ACQUIRED|LISTING_?CLOSED)\]:?\s*/i, '');
                  return (
                    <View key={`closed-listing-${item.id}`}>
                      {datePillElement}
                      <View style={styles.listingClosedCard}>
                        <View style={styles.listingClosedBadge}>
                          <Ionicons name="lock-closed" size={18} color="#FFFFFF" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={styles.listingClosedTitle}>{uiText("Job Position Acquired")}</Text>
                            <View style={styles.closedTagMicro}>
                              <Text style={styles.closedTagMicroText}>{uiText("ACQUIRED")}</Text>
                            </View>
                          </View>
                          <Text style={styles.listingClosedSub}>{cleanMsg}</Text>
                        </View>
                      </View>
                    </View>
                  );
                }

                if (item.sender === 'system' && item.bookingInfo) {
                  const isAcquired = item.bookingInfo.isAcquired || item.bookingInfo.title === 'OFFER UNAVAILABLE';
                  const isConfirmed = !isAcquired && (item.bookingInfo.isConfirmed || item.bookingInfo.title === 'BOOKING CONFIRMED');
                  const isDeclined = item.bookingInfo.isDeclined || item.bookingInfo.title === 'BOOKING DECLINED';
                  const bookedPersonName =
                    item.bookingInfo.bookedByName ||
                    (isKasambahay
                      ? contactName
                      : (user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : contactName));
                  const formattedStartDate = formatBookingStartDate(item.bookingInfo.startDate);
                  const formattedEndDate = item.bookingInfo.endDate
                    ? formatBookingStartDate(item.bookingInfo.endDate)
                    : item.bookingInfo.bookingType === 'long_term' ? uiText('No end date') : uiText('Same day');
                  const bookingStatus = isAcquired
                    ? 'Job filled'
                    : isConfirmed
                      ? 'Confirmed'
                      : isDeclined
                        ? 'Declined'
                        : item.bookingInfo.canRespond ? 'Offer' : 'Pending';
                  const acceptanceExpired = isAcceptanceExpired(item.bookingInfo, scheduleNow);

                  const isSolidCard = isConfirmed || isDeclined;
                  const cardFgColor = isSolidCard ? '#FFFFFF' : '#0D0D11';

                  return (
                    <View key={`system-wrap-${item.id}`}>
                      {datePillElement}
                      <View
                        style={styles.systemCardContainer}
                        collapsable={false}
                      >
                        <Pressable
                          style={({ pressed }) => [
                            styles.compactBookingCard,
                            isConfirmed && styles.compactBookingCardConfirmed,
                            isDeclined && styles.compactBookingCardDeclined,
                            isAcquired && styles.compactBookingCardAcquired,
                            pressed && styles.compactBookingCardPressed,
                          ]}
                          onPress={() => {
                            Keyboard.dismiss();
                            setActiveBookingMsgId(item.id);
                            setActiveBookingDetails(item.bookingInfo || null);
                            setBookingReadOnly(true);
                            setBookingModalVisible(true);
                          }}
                        >
                          {/* Direct Icon (no circular container) */}
                          <Ionicons
                            name={isAcquired ? 'lock-closed' : isConfirmed ? 'checkmark-sharp' : isDeclined ? 'close-outline' : 'document-text'}
                            size={22}
                            color={cardFgColor}
                            style={{ marginRight: 10 }}
                          />

                          <View style={styles.compactBookingInfoCol}>
                            <Text style={[styles.compactBookingTitle, { color: cardFgColor }]} numberOfLines={1} ellipsizeMode="tail">
                              {bookedPersonName}
                            </Text>
                            <Text style={[styles.compactBookingSubText, { color: cardFgColor }]}>
                              <Text style={[styles.compactBookingStatus, { color: cardFgColor }]}>
                                {bookingStatus}
                              </Text>
                              {` · ${uiText('Start:')} ${formattedStartDate}`}
                              {`\n${uiText('Ends')}: ${formattedEndDate}`}
                            </Text>
                          </View>

                          {/* Right Chevron Arrow */}
                          <View style={styles.compactBookingArrowWrap}>
                            <Ionicons name="chevron-forward" size={19} color={cardFgColor} />
                          </View>
                        </Pressable>

                        {!isConfirmed && !isDeclined && !isAcquired && item.bookingInfo.canRespond ? (
                          <View style={styles.compactQuickActionRow}>
                            <Pressable
                              style={({ pressed }) => [
                                styles.compactQuickDeclineBtn,
                                pressed && { opacity: 0.8 },
                              ]}
                              disabled={responseBusy} onPress={(e) => {
                                e.stopPropagation();
                                confirmFromCard(item.id, 'reject');
                              }}
                            >
                              <Ionicons name="close-circle-outline" size={16} color="#000000" style={{ marginRight: 4 }} />
                              <Text style={styles.compactQuickDeclineText}>{uiText("Decline")}</Text>
                            </Pressable>

                            <Pressable
                              style={({ pressed }) => [
                                styles.compactQuickAgreeBtn,
                                acceptanceExpired && { backgroundColor: '#9CA3AF' },
                                pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
                              ]}
                              disabled={responseBusy || acceptanceExpired} onPress={(e) => {
                                e.stopPropagation();
                                confirmFromCard(item.id, 'accept');
                              }}
                            >
                              <Ionicons name="checkmark-circle" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                              <Text style={styles.compactQuickAgreeText}>{uiText("Accept")}</Text>
                            </Pressable>
                          </View>
                        ) : null}
                        {!isConfirmed && !isDeclined && !isAcquired && item.bookingInfo.canRespond && acceptanceExpired &&
                          <Text style={{ color: '#92400E', padding: 10, fontSize: 12 }}>{uiText(PASSED_SCHEDULE_MESSAGE)}</Text>}
                      </View>
                    </View>
                  );
                }

                const quotedMessage = item.replyTo?.messageId
                  ? messages.find(message => message.id === item.replyTo?.messageId)
                  : undefined;
                const replyRelationship = item.replyTo ? getReplyRelationship({
                  currentIsMine: item.sender === 'me',
                  quotedIsMine: quotedMessage ? quotedMessage.sender === 'me' : undefined,
                  quotedAuthor: item.replyTo.author,
                  partnerName: contactName,
                }) : '';
                const replyShowsPhotoOnly = item.replyTo
                  ? isGenericPhotoReply(item.replyTo.text, item.replyTo.imageUri)
                  : false;

                if (item.sender === 'other') {
                  const isEmoji = isEmojiOnly(item.text);

                  let leftGroupingCornerStyle = styles.leftBubbleSingle;
                  if (!isSameGroupAsPrev && isSameGroupAsNext) {
                    leftGroupingCornerStyle = styles.leftBubbleTop;
                  } else if (isSameGroupAsPrev && isSameGroupAsNext) {
                    leftGroupingCornerStyle = styles.leftBubbleMiddle;
                  } else if (isSameGroupAsPrev && !isSameGroupAsNext) {
                    leftGroupingCornerStyle = styles.leftBubbleBottom;
                  }

                  return (
                    <View key={`left-frag-${item.id}`}>
                      {datePillElement}
                      <SwipeableMessageRow
                        key={item.id}
                        align="left"
                        onReply={() => handleInitiateReply(item)}
                        disabled={item.isTyping}
                      >
                        <View style={[styles.leftMessageRow, rowSpacingStyle]}>
                          <Pressable
                            onPress={() => {
                              if (partnerId) {
                                setProfileModalVisible(true);
                              }
                            }}
                            hitSlop={6}
                          >
                            {!isSameGroupAsNext ? (
                              useOfficialLogo ? (
                                <View style={[styles.msgAvatar, styles.officialMsgAvatarContainer]}>
                                  <Image source={serbisureIcon} style={styles.officialMsgAvatarLogo} resizeMode="contain" />
                                </View>
                              ) : (
                                <Image source={{ uri: item.avatar || contactAvatar || resolvedAvatar }} style={styles.msgAvatar} />
                              )
                            ) : (
                              <View style={styles.msgAvatarPlaceholder} />
                            )}
                          </Pressable>
                          <View style={styles.leftMessageCol}>
                            {/* Instagram / Messenger Style Quoted Reply Stack */}
                            {item.replyTo ? (
                              <View style={styles.replyQuoteStackLeft}>
                                <View style={styles.replyQuoteLabelRowLeft}>
                                  <Ionicons name="arrow-undo" size={12} color="#8E8E93" />
                                  <Text testID={`reply-relationship-${item.id}`} style={styles.replyQuoteLabelLeft} numberOfLines={1}>
                                    {replyRelationship}
                                  </Text>
                                </View>
                                <Pressable
                                  onPress={() => scrollToMessage(item.replyTo?.messageId, item.replyTo?.imageUri)}
                                  style={({ pressed }) => [
                                    styles.replyQuoteBubbleLeft,
                                    item.replyTo?.imageUri ? styles.replyQuoteBubbleWithPhoto : null,
                                    replyShowsPhotoOnly ? styles.replyQuotePhotoOnly : null,
                                    pressed && { opacity: 0.75 },
                                  ]}
                                >
                                  {item.replyTo.imageUri ? (
                                    <Image
                                      source={{ uri: item.replyTo.imageUri }}
                                      style={replyShowsPhotoOnly ? styles.replyQuotePhotoOnlyThumb : styles.replyQuotePhotoThumb}
                                      resizeMode="cover"
                                    />
                                  ) : null}
                                  {!replyShowsPhotoOnly ? <Text style={styles.replyQuoteBubbleText} numberOfLines={2}>
                                    {item.replyTo.text}
                                  </Text> : null}
                                </Pressable>
                              </View>
                            ) : null}

                            <View
                              ref={(el) => {
                                messageRefs.current[item.id] = el;
                              }}
                              collapsable={false}
                              style={{ alignSelf: 'flex-start' }}
                            >
                              <Pressable delayLongPress={200} onLongPress={() => handleOpenActionMenu(item)}>
                                <View
                                  style={[
                                    styles.leftBubble,
                                    leftGroupingCornerStyle,
                                    isEmoji ? styles.emojiOnlyBubble : null,
                                    item.replyTo ? styles.leftBubbleWithReply : null,
                                    item.isTyping ? styles.typingBubble : null,
                                    item.imageUri && !item.text ? styles.imageOnlyBubble : null,
                                  ]}
                                >
                                  {item.imageUri ? (
                                    <Pressable
                                      onPress={() => setSelectedImageUri(item.imageUri || null)}
                                      delayLongPress={200}
                                      onLongPress={() => handleOpenActionMenu(item)}
                                      style={styles.chatImageWrapper}
                                    >
                                      <Image source={{ uri: item.imageUri }} style={styles.chatImage} resizeMode="cover" />
                                      {item.isUploading ? (
                                        <View style={styles.imageUploadingOverlay}>
                                          <ActivityIndicator size="small" color="#FFFFFF" />
                                        </View>
                                      ) : null}
                                    </Pressable>
                                  ) : null}
                                  {item.text ? (
                                    <Text
                                      style={[
                                        styles.leftMsgText,
                                        isEmoji ? styles.emojiOnlyText : null,
                                        item.imageUri ? { marginTop: 6 } : null,
                                        item.isTyping ? styles.typingText : null,
                                      ]}
                                    >
                                      {item.text}
                                    </Text>
                                  ) : null}

                                  {renderReactionBadge(item, 'left')}
                                </View>
                              </Pressable>
                            </View>
                          </View>
                        </View>
                      </SwipeableMessageRow>
                    </View>
                  );
                }

                // Right Message (me)
                const isEmojiRight = isEmojiOnly(item.text);

                let rightGroupingCornerStyle = styles.rightBubbleSingle;
                if (!isSameGroupAsPrev && isSameGroupAsNext) {
                  rightGroupingCornerStyle = styles.rightBubbleTop;
                } else if (isSameGroupAsPrev && isSameGroupAsNext) {
                  rightGroupingCornerStyle = styles.rightBubbleMiddle;
                } else if (isSameGroupAsPrev && !isSameGroupAsNext) {
                  rightGroupingCornerStyle = styles.rightBubbleBottom;
                }

                return (
                  <View key={`right-frag-${item.id}`}>
                    {datePillElement}
                    <SwipeableMessageRow
                      key={item.id}
                      align="right"
                      onReply={() => handleInitiateReply(item)}
                    >
                      <View style={[styles.rightMessageRow, rowSpacingStyle]}>
                        {/* Instagram / Messenger Style Quoted Reply Stack */}
                        {item.replyTo ? (
                          <View style={styles.replyQuoteStackRight}>
                            <View style={styles.replyQuoteLabelRowRight}>
                              <Ionicons name="arrow-undo" size={12} color="#8E8E93" />
                              <Text testID={`reply-relationship-${item.id}`} style={styles.replyQuoteLabelRight} numberOfLines={1}>
                                {replyRelationship}
                              </Text>
                            </View>
                            <Pressable
                              onPress={() => scrollToMessage(item.replyTo?.messageId, item.replyTo?.imageUri)}
                              style={({ pressed }) => [
                                styles.replyQuoteBubbleRight,
                                item.replyTo?.imageUri ? styles.replyQuoteBubbleWithPhoto : null,
                                replyShowsPhotoOnly ? styles.replyQuotePhotoOnly : null,
                                pressed && { opacity: 0.75 },
                              ]}
                            >
                              {item.replyTo.imageUri ? (
                                <Image
                                  source={{ uri: item.replyTo.imageUri }}
                                  style={replyShowsPhotoOnly ? styles.replyQuotePhotoOnlyThumb : styles.replyQuotePhotoThumb}
                                  resizeMode="cover"
                                />
                              ) : null}
                              {!replyShowsPhotoOnly ? <Text style={styles.replyQuoteBubbleText} numberOfLines={2}>
                                {item.replyTo.text}
                              </Text> : null}
                            </Pressable>
                          </View>
                        ) : null}

                        <View
                          ref={(el) => {
                            messageRefs.current[item.id] = el;
                          }}
                          collapsable={false}
                          style={{ alignSelf: 'flex-end' }}
                        >
                          <Pressable delayLongPress={200} onLongPress={() => handleOpenActionMenu(item)}>
                            <View
                              style={[
                                styles.rightBubble,
                                rightGroupingCornerStyle,
                                isEmojiRight ? styles.emojiOnlyBubble : null,
                                item.replyTo ? styles.rightBubbleWithReply : null,
                                item.imageUri && !item.text ? styles.imageOnlyBubble : null,
                              ]}
                            >
                              {item.imageUri ? (
                                <Pressable
                                  onPress={() => setSelectedImageUri(item.imageUri || null)}
                                  delayLongPress={200}
                                  onLongPress={() => handleOpenActionMenu(item)}
                                  style={styles.chatImageWrapper}
                                >
                                  <Image source={{ uri: item.imageUri }} style={styles.chatImage} resizeMode="cover" />
                                  {item.isUploading ? (
                                    <View style={styles.imageUploadingOverlay}>
                                      <ActivityIndicator size="small" color="#FFFFFF" />
                                    </View>
                                  ) : null}
                                </Pressable>
                              ) : null}
                              {item.text ? (
                                <Text
                                  style={[
                                    styles.rightMsgText,
                                    isEmojiRight ? styles.emojiOnlyText : null,
                                    item.imageUri ? { marginTop: 6 } : null,
                                  ]}
                                >
                                  {item.text}
                                </Text>
                              ) : null}

                              {renderReactionBadge(item, 'right')}
                            </View>
                          </Pressable>
                        </View>
                      </View>
                    </SwipeableMessageRow>
                  </View>
                );
              }}
            />
          </View>

          {/* Reply Context Banner - Ultra-clean with thumbnail preview */}
          {!bookingModalVisible && (
            <>
              {replyingTo ? (
                <View style={styles.replyBanner}>
                  {replyingTo.imageUri ? (
                    <Image
                      source={{ uri: replyingTo.imageUri }}
                      style={styles.replyBannerPhotoThumb}
                      resizeMode="cover"
                    />
                  ) : null}
                  <View style={styles.replyBannerContent}>
                    <View style={styles.replyBannerTopRow}>
                      <View style={styles.replyBannerHeaderLeft}>
                        <Ionicons name="arrow-undo" size={13} color="#8E8E93" style={{ marginRight: 5 }} />
                        <Text style={styles.replyBannerAuthor}>
                          {uiText("Replying to")}{' '}<Text style={styles.replyBannerAuthorName}>{replyingTo.author}</Text>
                        </Text>
                      </View>
                      <Pressable
                        onPress={() => setReplyingTo(null)}
                        hitSlop={8}
                        style={styles.replyBannerCloseBtn}
                        accessibilityLabel="Cancel reply"
                      >
                        <Ionicons name="close" size={17} color="#8E8E93" />
                      </Pressable>
                    </View>
                    {!isGenericPhotoReply(replyingTo.text, replyingTo.imageUri) ? <Text style={styles.replyBannerText} numberOfLines={1}>
                      {replyingTo.text}
                    </Text> : null}
                  </View>
                </View>
              ) : null}

              {/* Messenger Style Input Footer */}
              {!!safety?.restricted_until && !isSupportConversation && <View style={{ paddingHorizontal: 20, paddingVertical: 12 }}>
                <Text style={{ color: '#6B7280', fontSize: 13 }}>{uiText("Messaging paused until")} {new Date(safety.restricted_until).toLocaleString()}{uiText(". Contact your Barangay desk or SerbiSure Support for help.")}</Text>
              </View>}
              {isUploadingImage && (
                <View style={styles.uploadingBar}>
                  <ActivityIndicator size="small" color="#FFB43B" />
                  <Text style={styles.uploadingText}>{uiText("Sending photo...")}</Text>
                </View>
              )}
              {!isSupportConversation && !chatPaused && (
                <>
                  {currencyAnalysis?.hasAmount && (currencyAnalysis.warning || currencyAnalysis.hint || currencyAnalysis.formattedText !== inputMessage.trim()) ? (
                    <View testID="chat-currency-banner" style={[styles.currencyBanner, currencyAnalysis.warning && styles.currencyBannerWarning]}>
                      <Text style={styles.currencyHint}>
                        {currencyAnalysis.warning ? currencyWarningText(currencyAnalysis.warning)
                          : [currencyAnalysis.formattedText !== inputMessage.trim() ? uiText('Auto-formats as {amount}', { amount: currencyAnalysis.amounts[0]?.formatted || '' }) : '',
                            currencyAnalysis.hint ? uiText(currencyAnalysis.hint) : ''].filter(Boolean).join(' ')}
                      </Text>
                      <View style={styles.currencyActions}>
                        {currencyAnalysis.warning && <Pressable accessibilityRole="button" disabled={isSendingText} onPress={() => { Keyboard.dismiss(); setRateModalVisible(true); }} style={styles.currencyPillAccent}>
                          <Text style={styles.currencyPillText}>{uiText('Propose a Rate')}</Text>
                        </Pressable>}
                        {currencyAnalysis.formattedText !== inputMessage.trim() && !currencyAnalysis.warning?.blocking && <Pressable accessibilityRole="button" disabled={isSendingText} onPress={() => setInputMessage(currencyAnalysis.formattedText)} style={styles.currencyPill}>
                          <Text style={styles.currencyPillText}>{uiText('Format')}</Text>
                        </Pressable>}
                      </View>
                    </View>
                  ) : null}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={styles.currencyQuickReplies} contentContainerStyle={styles.currencyQuickReplyContent}>
                    <Pressable accessibilityRole="button" accessibilityLabel={uiText('Propose a Rate')} disabled={isSendingText} onPress={() => { Keyboard.dismiss(); setRateModalVisible(true); }} style={[styles.currencyPill, styles.currencyPillAccent]}>
                      <Ionicons name="cash-outline" size={14} color="#9A4A20" />
                      <Text style={styles.currencyPillText}>{uiText('Propose a Rate')}</Text>
                    </Pressable>
                    {quickReplies.map(reply => <Pressable key={reply} accessibilityRole="button" accessibilityLabel={uiText(reply)} disabled={isSendingText} onPress={() => handleSend(false, uiText(reply))} style={styles.currencyPill}>
                      <Text style={styles.currencyPillText}>{uiText(reply)}</Text>
                    </Pressable>)}
                  </ScrollView>
                </>
              )}
              <View style={[styles.inputFooter, { paddingBottom: Math.max(insets.bottom, 10) }]}>
                <Pressable style={styles.attachBtn} disabled={chatPaused} onPress={handlePickImage}>
                  <Ionicons name="add-circle" size={32} color="#FFB43B" />
                </Pressable>
                <Pressable style={styles.imageBtn} disabled={chatPaused} onPress={handlePickImage}>
                  <Ionicons name="image-outline" size={22} color="#888" />
                </Pressable>

                <TextInput
                  ref={inputRef}
                  style={styles.textInput}
                  placeholder={uiText("Type a message...")}
                  placeholderTextColor="#888"
                  value={inputMessage}
                  editable={!isSendingText && !chatPaused}
                  onChangeText={(text) => {
                    setInputMessage(text);
                    handleTyping();
                  }}
                  multiline
                />

                <Pressable
                  style={({ pressed }) => [
                    styles.sendBtn,
                    (!inputMessage.trim() || chatPaused) && styles.sendBtnDisabled,
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() => handleSend()}
                  disabled={!inputMessage.trim() || isSendingText || chatPaused}
                >
                  {isSendingText ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Ionicons name="send" size={16} color="#FFFFFF" style={{ marginLeft: 2 }} />}
                </Pressable>
              </View>
            </>
          )}
        </KeyboardAvoidingView>

        {/* One dialog surface for currency warnings and rate proposals. */}
        <Modal visible={!isSupportConversation && !chatPaused && (rateModalVisible || !!amountAlert)} transparent animationType="fade"
          onRequestClose={() => { setAmountAlert(null); setRateModalVisible(false); inputRef.current?.focus(); }}>
          <KeyboardAvoidingView style={styles.removeBackdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ width: '100%' }} contentContainerStyle={styles.currencyDialogContent}>
              <View accessibilityViewIsModal style={styles.removeDialog} testID={rateModalVisible ? 'chat-rate-dialog' : 'chat-amount-alert'}>
                {rateModalVisible ? <>
                  <View style={styles.currencyDialogHeader}>
                    <Text accessibilityRole="header" style={styles.removeTitle}>{uiText('Propose a Rate')}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel={uiText('Close')} onPress={() => { setRateModalVisible(false); inputRef.current?.focus(); }} hitSlop={10}>
                      <Ionicons name="close" size={22} color="#6B7280" />
                    </Pressable>
                  </View>
                  <View style={styles.currencyChoices}>
                    {(['short_term', 'long_term'] as const).map(type => <Pressable key={type} accessibilityRole="button" accessibilityState={{ selected: proposalType === type }}
                      onPress={() => { if (proposalType !== type) { setProposalType(type); setProposalAmount(''); } }} style={[styles.currencyChoice, proposalType === type && styles.currencyPillAccent]}>
                      <Text style={styles.currencyPillText}>{uiText(type === 'short_term' ? 'Part-time / Daily' : 'Full-time / Monthly')}</Text>
                    </Pressable>)}
                  </View>
                  <View style={[styles.currencyInputBox, !!proposalError && { borderColor: '#DC2626' }]}>
                    <Text style={styles.currencyPrefix}>₱</Text>
                    <TextInput accessibilityLabel={uiText('Proposed rate')} keyboardType="decimal-pad" style={styles.currencyInput}
                      value={formatRateInput(proposalAmount)} onChangeText={value => setProposalAmount(value.replace(/,/g, ''))}
                      onBlur={() => { if (formatRate(proposalAmount) !== 'Rate not provided') setProposalAmount(formatRate(proposalAmount, '').replace(/,/g, '')); }}
                      placeholder="0.00" placeholderTextColor="#9CA3AF" />
                    <Text style={styles.currencyHint}>{uiText(proposalType === 'short_term' ? '/ day' : '/ month')}</Text>
                  </View>
                  <Text style={[styles.currencyHint, { marginTop: 8 }]}>{uiText(proposalType === 'short_term'
                    ? 'Allowed range: ₱600.00 – ₱5,000.00 / day'
                    : 'Allowed range: ₱6,500.00 – ₱50,000.00 / month (Region X · RA 10361)')}</Text>
                  {proposalError && <Text accessibilityRole="alert" style={styles.currencyError}>{proposalError}</Text>}
                  <Pressable accessibilityRole="button" accessibilityLabel={uiText('Send Proposal')} disabled={!proposalAmount.trim() || !!proposalError || isSendingText}
                    style={[styles.currencySubmit, (!proposalAmount.trim() || !!proposalError || isSendingText) && { opacity: 0.4 }]}
                    onPress={() => {
                      if (!proposalAmount.trim() || proposalError || isSendingText) return;
                      const message = buildRateProposalMessage(proposalType, proposalAmount);
                      setRateModalVisible(false); setAmountAlert(null); setProposalAmount('');
                      handleSend(false, message);
                    }}>
                    <Text style={styles.removeConfirmText}>{uiText('Send Proposal')}</Text>
                  </Pressable>
                </> : amountAlert ? <>
                  <Text accessibilityRole="header" style={styles.removeTitle}>{uiText(amountAlert.blocking ? 'Offer amount outside allowed range' : 'Check offered amount')}</Text>
                  <Text style={styles.removeDescription}>{amountAlert.message}</Text>
                  <View style={styles.removeButtons}>
                    <Pressable accessibilityRole="button" style={styles.removeButton} onPress={() => { const alert = amountAlert; setAmountAlert(null); alert.edit(); }}>
                      <Text style={styles.removeCancelText}>{uiText(amountAlert.blocking ? 'Edit Message' : 'Edit Amount')}</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" style={[styles.removeButton, styles.currencyPillAccent, { alignItems: 'center', justifyContent: 'center' }]} onPress={() => {
                      const alert = amountAlert; setAmountAlert(null);
                      if (alert.blocking) { Keyboard.dismiss(); setRateModalVisible(true); } else alert.send?.();
                    }}>
                      <Text style={styles.currencyPillText}>{amountAlert.blocking ? uiText('Propose a Rate') : uiText('Send as {amount}', { amount: amountAlert.amountFormatted })}</Text>
                    </Pressable>
                  </View>
                </> : null}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>

        {/* Messenger-Style Full-Screen Image Zoom Viewer Modal */}
        <Modal
          visible={!!selectedImageUri}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedImageUri(null)}
        >
          <View style={styles.fullImageContainer}>
            <Pressable style={styles.fullImageBackdrop} onPress={() => setSelectedImageUri(null)} />

            <Pressable
              style={[styles.fullImageCloseBtn, { top: Math.max(insets.top + 10, 30) }]}
              onPress={() => setSelectedImageUri(null)}
            >
              <Ionicons name="close" size={26} color="#FFFFFF" />
            </Pressable>

            {selectedImageUri ? (
              <Image
                source={{ uri: selectedImageUri }}
                style={styles.fullImageContent}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </Modal>

        {/* Booking Screen Modal */}
        {bookingModalVisible && <BookingModal
          visible={bookingModalVisible}
          useNativeModal={false}
          onClose={() => setBookingModalVisible(false)}
          contactName={contactName}
          contactRole={contactRole}
          contactAvatar={contactAvatar}
          readOnly={bookingReadOnly}
          canRespond={!!messages.find(message => message.id === activeBookingMsgId)?.bookingInfo?.canRespond}
          isConfirmed={activeBookingMsgId ? ((messages.find((m) => m.id === activeBookingMsgId)?.bookingInfo?.isConfirmed && !messages.find((m) => m.id === activeBookingMsgId)?.bookingInfo?.isAcquired) || false) : false}
          isDeclined={activeBookingMsgId ? messages.find((m) => m.id === activeBookingMsgId)?.bookingInfo?.isDeclined : false}
          isAcquired={activeBookingMsgId ? Boolean(messages.find((m) => m.id === activeBookingMsgId)?.bookingInfo?.isAcquired || activeBookingDetails?.isAcquired) : Boolean(activeBookingDetails?.isAcquired)}
          userRole={isHomeowner ? 'homeowner' : 'kasambahay'}
          initialDetails={bookingReadOnly && activeBookingMsgId
            ? messages.find(message => message.id === activeBookingMsgId)?.bookingInfo || activeBookingDetails
            : activeBookingDetails}
          token={effectiveToken}
          bookingType={activeBookingDetails?.bookingType}
          onConfirm={handleSendOffer}
          onKasambahayConfirm={() => {
            if (activeBookingMsgId) {
              return handleKasambahayConfirm(activeBookingMsgId);
            }
          }}
          onKasambahayDecline={() => {
            if (activeBookingMsgId) {
              return handleKasambahayDecline(activeBookingMsgId);
            }
          }}
        />}

        {/* Counterparty profile. Official desks use a focused information view;
            residents keep the existing public profile with posts and reviews. */}
        {profileModalVisible && (isSupportConversation ? (
          <OfficialProfileModal
            visible={profileModalVisible}
            onClose={() => setProfileModalVisible(false)}
            userId={partnerId}
            token={effectiveToken}
            prefilledName={contactName}
            prefilledAvatar={resolvedAvatar}
            prefilledRole={contactRole}
          />
        ) : (
          <UserProfileView
            visible={profileModalVisible}
            onClose={() => setProfileModalVisible(false)}
            onMessage={() => setProfileModalVisible(false)}
            userId={partnerId}
            token={effectiveToken}
            prefilledName={contactName}
            prefilledAvatar={resolvedAvatar}
            prefilledRole={contactRole}
          />
        ))}

        {/* Blurred Long-Press Action Menu & Reaction Overlay (Position-aware & Animated) */}
        {activeActionMenuMsg ? (() => {
          const isSender = activeActionMenuMsg.sender === 'me';
          const pillHeight = 44;
          const menuHeight = (activeActionMenuMsg.text ? 138 : 94) + (activeActionMenuMsg.sender === 'other' && !activeActionMenuMsg.bookingInfo ? 48 : 0);
          const bubbleHeight = activeMenuLayout?.height || 48;
          const bubbleWidth = activeMenuLayout?.width;

          // Vertical positioning: place pill directly above bubble and menu directly below bubble
          let bubbleTop = activeMenuLayout ? activeMenuLayout.y : (SCREEN_HEIGHT / 2 - 60);
          const minBubbleTop = Math.max(insets.top + 10, 50) + pillHeight + 8;
          const maxBubbleTop = SCREEN_HEIGHT - insets.bottom - 16 - menuHeight - 8 - bubbleHeight;

          if (maxBubbleTop >= minBubbleTop) {
            bubbleTop = Math.max(minBubbleTop, Math.min(bubbleTop, maxBubbleTop));
          } else {
            bubbleTop = Math.max(minBubbleTop, (SCREEN_HEIGHT - bubbleHeight) / 2);
          }

          const pillTop = bubbleTop - pillHeight - 8;
          const menuTop = bubbleTop + bubbleHeight + 8;

          // Horizontal positioning: align to message's screen coordinates
          const rightOffset = activeMenuLayout
            ? Math.max(16, SCREEN_WIDTH - (activeMenuLayout.x + activeMenuLayout.width))
            : 16;
          const leftOffset = activeMenuLayout
            ? Math.max(16, activeMenuLayout.x)
            : 52;

          const horizontalPositionStyle = isSender
            ? { right: rightOffset }
            : { left: leftOffset };

          return (
            <View style={styles.actionModalBackdrop}>
              {/* Dimmed Background Overlay */}
              <Animated.View style={[styles.actionModalDarkDimmer, { opacity: backdropOpacityAnim }]} />

              {/* Dismiss when tapping backdrop */}
              <Pressable
                style={StyleSheet.absoluteFillObject}
                onPress={() => setActiveActionMenuMsg(null)}
              />

              {/* 1. Floating Reaction Emoji Pill Directly Above Message */}
              <Animated.View
                style={[
                  styles.actionReactionPill,
                  horizontalPositionStyle,
                  {
                    top: pillTop,
                    opacity: reactionOpacityAnim,
                    transform: [{ scale: reactionScaleAnim }],
                  },
                ]}
              >
                {REACTION_OPTIONS.map((emoji) => (
                  <Pressable
                    key={emoji}
                    style={({ pressed }) => [
                      styles.actionEmojiButton,
                      pressed && { transform: [{ scale: 1.3 }] },
                    ]}
                    onPress={() => {
                      const targetId = activeActionMenuMsg.id;
                      setActiveActionMenuMsg(null);
                      handleSelectReaction(emoji, targetId);
                    }}
                  >
                    <Text style={styles.actionEmojiText}>{emoji}</Text>
                  </Pressable>
                ))}
              </Animated.View>

              {/* 2. Message Bubble Preview (Natural Fixed Size at exact position) */}
              <View
                style={[
                  styles.actionMessageBubblePreview,
                  isSender ? styles.actionRightBubble : styles.actionLeftBubble,
                  isEmojiOnly(activeActionMenuMsg.text) ? styles.emojiOnlyBubble : null,
                  horizontalPositionStyle,
                  activeActionMenuMsg.imageUri && !activeActionMenuMsg.text ? styles.imageOnlyBubble : null,
                  {
                    top: bubbleTop,
                    width: bubbleWidth,
                  },
                ]}
              >
                {activeActionMenuMsg.imageUri ? (
                  <View style={styles.chatImageWrapper}>
                    <Image
                      source={{ uri: activeActionMenuMsg.imageUri }}
                      style={styles.chatImage}
                      resizeMode="cover"
                    />
                  </View>
                ) : null}
                {activeActionMenuMsg.text ? (
                  <Text
                    style={[
                      isSender ? styles.rightMsgText : styles.leftMsgText,
                      isEmojiOnly(activeActionMenuMsg.text) ? styles.emojiOnlyText : null,
                      activeActionMenuMsg.imageUri ? { marginTop: 6 } : null,
                    ]}
                  >
                    {activeActionMenuMsg.text}
                  </Text>
                ) : null}

                {/* Include the reaction on long press */}
                {renderReactionBadge(activeActionMenuMsg, isSender ? 'right' : 'left')}
              </View>

              {/* 3. Floating Action Menu Card Directly Below Message */}
              <Animated.View
                style={[
                  styles.actionMenuCard,
                  horizontalPositionStyle,
                  {
                    top: menuTop,
                    opacity: menuOpacityAnim,
                    transform: [{ scale: menuScaleAnim }],
                  },
                ]}
              >
                {/* Reply */}
                <Pressable
                  style={({ pressed }) => [
                    styles.actionMenuItem,
                    pressed && styles.actionMenuItemPressed,
                  ]}
                  onPress={() => {
                    const msg = activeActionMenuMsg;
                    setActiveActionMenuMsg(null);
                    handleInitiateReply(msg);
                  }}
                >
                  <Ionicons name="arrow-undo-outline" size={19} color="#1A1A1A" style={styles.actionMenuIcon} />
                  <Text style={styles.actionMenuText}>{uiText("Reply")}</Text>
                </Pressable>

                {/* Copy */}
                {activeActionMenuMsg.text ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.actionMenuItem,
                      pressed && styles.actionMenuItemPressed,
                    ]}
                    onPress={() => {
                      const text = activeActionMenuMsg.text || '';
                      setActiveActionMenuMsg(null);
                      copyToClipboard(text);
                    }}
                  >
                    <Ionicons name="copy-outline" size={19} color="#1A1A1A" style={styles.actionMenuIcon} />
                    <Text style={styles.actionMenuText}>{uiText("Copy Text")}</Text>
                  </Pressable>
                ) : null}


                {/* Removal is private to this account for either message direction. */}
                <Pressable
                  style={({ pressed }) => [
                    styles.actionMenuItem,
                    styles.actionMenuItemLast,
                    pressed && styles.actionMenuItemPressed,
                  ]}
                  accessibilityLabel="Remove message"
                  onPress={() => { setRemoveError(null); setRemoveTarget(activeActionMenuMsg); setActiveActionMenuMsg(null); }}
                >
                  <Ionicons name="trash-outline" size={19} color="#EF4444" style={styles.actionMenuIcon} />
                  <Text style={[styles.actionMenuText, { color: '#EF4444' }]}>Remove for you</Text>
                </Pressable>
              </Animated.View>
            </View>
          );
        })() : null}
        <Modal visible={!!languageWarning || !!sensitiveTarget} transparent animationType="fade"
          onRequestClose={() => { const sending = !!languageWarning; setLanguageWarning(null); setSensitiveTarget(null); if (sending) inputRef.current?.focus(); }}>
          <View style={styles.removeBackdrop}>
            <View accessibilityViewIsModal style={styles.removeDialog}>
              <Text accessibilityRole="header" style={styles.removeTitle}>{languageWarning ? 'Review your message' : 'Sensitive message'}</Text>
              <Text style={styles.removeDescription}>{languageWarning ? OFFENSIVE_LANGUAGE_ADVISORY : 'This message may contain offensive or sensitive language. Would you like to show it?'}</Text>
              <View style={styles.removeButtons}>
                <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => {
                  const sending = !!languageWarning; setLanguageWarning(null); setSensitiveTarget(null);
                  if (sending) requestAnimationFrame(() => inputRef.current?.focus());
                }} style={styles.removeButton}><Text style={styles.removeCancelText}>Close</Text></Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={languageWarning ? 'Send Anyway' : 'Show Message'} onPress={() => {
                  if (languageWarning) { const warning = languageWarning; setLanguageWarning(null); warning.send(); }
                  else if (sensitiveTarget) { const id = sensitiveTarget; setRevealedMessages(current => new Set([...current, id])); setSensitiveTarget(null); }
                }} style={[styles.removeButton, { backgroundColor: '#FFB380' }]}>
                  <Text style={[styles.removeConfirmText, { color: '#0D0D11' }]}>{languageWarning ? 'Send Anyway' : 'Show Message'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
        <Modal visible={!!removeTarget} transparent animationType="fade" onRequestClose={() => { if (!removalPending.current) setRemoveTarget(null); }}>
          <View style={styles.removeBackdrop}>
            <View accessibilityViewIsModal style={styles.removeDialog}>
              <Text accessibilityRole="header" style={styles.removeTitle}>Remove for you?</Text>
              <Text style={styles.removeDescription}>This message will be removed from your screen. Other participants will still be able to see it.</Text>
              {removeError ? <Text accessibilityRole="alert" style={styles.removeError}>{removeError}</Text> : null}
              <View style={styles.removeButtons}>
                <Pressable accessibilityRole="button" accessibilityLabel="Cancel removal" disabled={isRemoving} onPress={() => setRemoveTarget(null)} style={styles.removeButton}>
                  <Text style={styles.removeCancelText}>Cancel</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Confirm removal" disabled={isRemoving} onPress={() => void handleRemoveForYou()} style={[styles.removeButton, styles.removeConfirmButton, isRemoving && { opacity: 0.5 }]}>
                  <Text style={styles.removeConfirmText}>{isRemoving ? 'Removing…' : 'Remove'}</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </Modal>
        {pendingReview && (
          <ReviewModal
            visible
            bookingId={pendingReview.booking_id}
            revieweeName={pendingReview.reviewee_name}
            token={effectiveToken}
            isMandatory
            onClose={() => setPendingReview(null)}
            onSuccess={() => setPendingReview(null)}
          />
        )}
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  currencyBanner: { marginHorizontal: 14, marginTop: 5, borderRadius: 10, padding: 10, backgroundColor: '#F4F5F6' },
  currencyBannerWarning: { backgroundColor: '#FFF3DF' },
  currencyHint: { fontSize: 11, lineHeight: 16, color: '#61616B' },
  currencyActions: { flexDirection: 'row', gap: 6, marginTop: 5 },
  currencyQuickReplies: { flexGrow: 0, maxHeight: 42 },
  currencyQuickReplyContent: { paddingHorizontal: 14, paddingVertical: 5, gap: 6, alignItems: 'center' },
  currencyPill: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 16, backgroundColor: '#F5F4F2', borderWidth: 1, borderColor: '#E8E3DD' },
  currencyPillAccent: { backgroundColor: '#FFE6D2', borderColor: '#FFB980', borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5 },
  currencyPillText: { fontSize: 11, lineHeight: 15, fontWeight: '600', color: '#553B2D', textAlign: 'center' },
  currencyDialogContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  currencyDialogHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  currencyChoices: { flexDirection: 'row', gap: 8, marginVertical: 14 },
  currencyChoice: { flex: 1, padding: 10, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, justifyContent: 'center' },
  currencyInputBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 12, paddingHorizontal: 12 },
  currencyPrefix: { fontSize: 17, fontWeight: '700', color: '#1A1A1A', marginRight: 8 },
  currencyInput: { flex: 1, minWidth: 0, fontSize: 18, paddingVertical: 12, color: '#1A1A1A' },
  currencyError: { fontSize: 11, lineHeight: 16, color: '#DC2626', marginTop: 8 },
  currencySubmit: { backgroundColor: '#0D0D11', alignItems: 'center', justifyContent: 'center', borderRadius: 14, minHeight: 44, marginTop: 18 },
  sensitiveBubble: { alignSelf: 'flex-start', width: 235, maxWidth: '100%', padding: 16, borderRadius: 20, backgroundColor: '#F0F0EC' },
  sensitiveBlur: { color: 'transparent', textShadowColor: '#999999', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 7, lineHeight: 18 },
  sensitiveLabel: { marginTop: 8, fontSize: 12, fontWeight: '600', color: '#52525B' },
  removeBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', padding: 24 },
  removeDialog: { width: '100%', maxWidth: 420, borderRadius: 20, backgroundColor: '#FFFFFF', padding: 24 },
  removeTitle: { fontSize: 18, fontWeight: '700', color: '#0D0D11' },
  removeDescription: { marginTop: 16, fontSize: 14, lineHeight: 22, color: '#52525B' },
  removeError: { marginTop: 12, fontSize: 13, color: '#DC2626' },
  removeButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 24 },
  removeButton: { paddingVertical: 12, paddingHorizontal: 20, borderRadius: 24 },
  removeConfirmButton: { backgroundColor: '#0D0D11' },
  removeCancelText: { fontSize: 14, fontWeight: '600', color: '#3F3F46' },
  removeConfirmText: { fontSize: 14, fontWeight: '600', color: '#FFFFFF' },
  modalScreenContainer: {
    flex: 1,
    backgroundColor: '#F9F8F6',
  },
  container: {
    flex: 1,
    backgroundColor: '#F9F8F6',
  },
  header: {
    backgroundColor: '#F6F5F2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EBE9E4',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 4,
    marginRight: 8,
    minWidth: 0,
  },
  avatarWrapper: {
    position: 'relative',
    marginRight: 10,
    flexShrink: 0,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  officialHeaderAvatarContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#FFCCAA',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  officialHeaderAvatarLogo: {
    width: 24,
    height: 24,
  },
  officialMsgAvatarContainer: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FFCCAA',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  officialMsgAvatarLogo: {
    width: 18,
    height: 18,
  },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00B13B',
    borderWidth: 2,
    borderColor: '#F6F5F2',
    position: 'absolute',
    bottom: -1,
    right: -1,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  contactName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    flexShrink: 1,
  },
  contactSub: {
    fontSize: 11.5,
    color: '#727272',
    marginTop: 1,
  },
  bookingHeaderBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerPlaceholder: {
    width: 40,
    height: 40,
  },
  chatBody: {
    flex: 1,
    backgroundColor: '#F9F8F6',
  },
  chatBodyContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 20,
  },
  datePill: {
    alignSelf: 'center',
    marginVertical: 14,
  },
  datePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8E8E93',
  },
  leftMessageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  msgAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    marginRight: 8,
    marginTop: 4,
  },
  leftMessageCol: {
    maxWidth: '78%',
    alignItems: 'flex-start',
  },
  leftBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderTopLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 46,
    alignSelf: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  typingBubble: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  leftMsgText: {
    fontSize: 14,
    color: '#1A1A1A',
    lineHeight: 20,
  },
  typingText: {
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 3,
    color: '#333',
  },
  leftTimeText: {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
    marginLeft: 4,
  },
  rightMessageRow: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
    marginBottom: 12,
    maxWidth: '82%',
  },
  rightBubble: {
    backgroundColor: '#FFB43B',
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 46,
    alignSelf: 'flex-end',
  },
  // Messenger Outgoing (Right) Grouping Corner Styles
  rightBubbleSingle: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  rightBubbleTop: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  rightBubbleMiddle: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 4,
  },
  rightBubbleBottom: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 4,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },

  // Messenger Incoming (Left) Grouping Corner Styles
  leftBubbleSingle: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },
  leftBubbleTop: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 18,
  },
  leftBubbleMiddle: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 18,
  },
  leftBubbleBottom: {
    borderTopLeftRadius: 4,
    borderTopRightRadius: 18,
    borderBottomLeftRadius: 18,
    borderBottomRightRadius: 18,
  },

  // Grouped row spacing & avatar placeholder
  messageRowGrouped: {
    marginBottom: 2,
  },
  messageRowGroupedWithReaction: {
    marginBottom: 12,
  },
  msgAvatarPlaceholder: {
    width: 28,
    marginRight: 8,
  },
  imageOnlyBubble: {
    paddingHorizontal: 2,
    paddingVertical: 2,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  chatImageWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  imageBubbleContainer: {
    position: 'relative',
  },
  imageBubbleFrame: {
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  bubbleWithImage: {
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 10,
    overflow: 'visible',
  },
  imageHeaderFrame: {
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    marginBottom: 4,
  },
  chatImage: {
    width: 220,
    height: 220,
    borderRadius: 16,
  },
  imageUploadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatImageWithCaption: {
    width: 220,
    height: 200,
  },
  imageCaptionText: {
    paddingHorizontal: 14,
    paddingTop: 4,
  },
  rightMsgText: {
    fontSize: 14,
    color: '#1A1A1A',
    lineHeight: 20,
    fontWeight: '500',
  },
  rightTimeText: {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  systemCardContainer: {
    width: '100%',
    paddingHorizontal: 8,
    marginVertical: 6,
    alignItems: 'stretch',
  },
  compactBookingCard: {
    backgroundColor: '#F6F5F2',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#0D0D11',
  },
  compactBookingCardConfirmed: {
    backgroundColor: '#00B13B',
    borderWidth: 1.5,
    borderColor: '#0D0D11',
  },
  compactBookingCardDeclined: {
    backgroundColor: '#FF3E3E',
    borderWidth: 1.5,
    borderColor: '#0D0D11',
  },
  compactBookingCardAcquired: {
    backgroundColor: '#F6F5F2',
    borderWidth: 1.5,
    borderColor: '#0D0D11',
  },
  compactBookingCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.985 }],
  },
  compactBookingInfoCol: {
    flex: 1,
    minWidth: 0,
    marginRight: 6,
    justifyContent: 'center',
  },
  compactBookingTitle: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
    color: '#0D0D11',
    letterSpacing: -0.2,
  },
  compactBookingStatus: {
    fontWeight: '700',
    color: '#0D0D11',
  },
  compactBookingSubText: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#0D0D11',
    marginTop: 2,
    fontWeight: '500',
  },
  compactBookingArrowWrap: {
    flexShrink: 0,
    paddingLeft: 4,
  },
  compactQuickActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  compactQuickDeclineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F6F5F2',
    borderWidth: 1.5,
    borderColor: '#0D0D11',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  compactQuickDeclineText: {
    color: '#0D0D11',
    fontWeight: '700',
    fontSize: 13,
  },
  compactQuickAgreeBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00B13B',
    borderWidth: 1.5,
    borderColor: '#0D0D11',
    borderRadius: 22,
    paddingVertical: 10,
    paddingHorizontal: 14,
    shadowColor: '#00B13B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  compactQuickAgreeText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 13.5,
  },
  listingClosedCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginVertical: 6,
    alignSelf: 'center',
    width: '96%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  listingClosedBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#64748B',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  listingClosedTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  listingClosedSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  closedTagMicro: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 4,
  },
  closedTagMicroText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.5,
  },
  bookingCard: {
    backgroundColor: '#FFFBF2',
    borderWidth: 1.5,
    borderColor: '#FFB43B',
    borderRadius: 16,
    padding: 14,
  },
  bookingCardConfirmed: {
    backgroundColor: '#F0F9F0',
    borderColor: '#4CAF50',
  },
  bookingTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bookingTagText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFA51F',
    letterSpacing: 0.5,
    marginLeft: 6,
  },
  bookingTagTextConfirmed: {
    color: '#4CAF50',
  },
  bookingStartTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1A1A1A',
    marginTop: 6,
  },
  bookingDetails: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  tapToViewText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFB43B',
    marginTop: 6,
    fontStyle: 'italic',
  },
  confirmBookingBtn: {
    backgroundColor: '#FFB43B',
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 20,
    alignSelf: 'center',
    marginTop: 10,
  },
  confirmBookingBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  pendingStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF5E5',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  pendingStatusText: {
    color: '#D97706',
    fontWeight: '700',
    fontSize: 11,
  },
  confirmedStatusTag: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 14,
    paddingVertical: 6,
    paddingHorizontal: 12,
    marginTop: 10,
  },
  confirmedStatusText: {
    color: '#2E7D32',
    fontWeight: '800',
    fontSize: 12,
  },
  systemTimeText: {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  inputFooter: {
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderColor: '#EFEFEF',
  },
  attachBtn: {
    marginRight: 4,
  },
  imageBtn: {
    marginRight: 6,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#F5F5F3',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
    color: '#1A1A1A',
    maxHeight: 100,
    marginRight: 8,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFB43B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: '#E0E0E0',
  },
  fullImageContainer: {
    flex: 1,
    backgroundColor: '#000000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullImageBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
  },
  fullImageCloseBtn: {
    position: 'absolute',
    left: 20,
    zIndex: 20,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImageContent: {
    width: '95%',
    height: '82%',
  },
  inlineReactionPillLeft: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  inlineReactionPillRight: {
    flexDirection: 'row',
    alignSelf: 'flex-end',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 6,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  inlineEmojiItem: {
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  inlineEmojiText: {
    fontSize: 20,
  },
  reactionBadgePill: {
    position: 'absolute',
    bottom: -6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#EFEFEF',
  },
  reactionBadgeCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  reactionBadgeCapsule: {
    height: 22,
    minWidth: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    paddingVertical: 0,
  },
  reactionBadgePillLeft: {
    right: -4,
  },
  reactionBadgePillRight: {
    right: -4,
  },
  reactionBadgeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionBadgeEmoji: {
    fontSize: 12,
    includeFontPadding: false,
    textAlign: 'center',
  },
  reactionBadgeCount: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#374151',
    marginLeft: 1.5,
    marginRight: 1,
    includeFontPadding: false,
  },
  emojiOnlyBubble: {
    backgroundColor: 'transparent',
    borderWidth: 0,
    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    paddingHorizontal: 4,
    paddingVertical: 4,
    minWidth: 0,
  },
  emojiOnlyText: {
    fontSize: 34,
    lineHeight: 42,
    textAlign: 'center',
  },
  typingRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 12,
  },
  typingDotsBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E4E6EB',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 11,
    gap: 5,
    alignSelf: 'flex-start',
    minHeight: 34,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#65676B',
  },
  swipeRowContainer: {
    position: 'relative',
    width: '100%',
    justifyContent: 'center',
  },
  swipeReplyIconLeft: {
    position: 'absolute',
    left: 8,
    top: '30%',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EBEBE6',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  swipeReplyIconRight: {
    position: 'absolute',
    right: 8,
    top: '30%',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EBEBE6',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#EBEBE6',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  replyBannerContent: {
    flex: 1,
  },
  replyBannerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  replyBannerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  replyBannerAuthor: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
  },
  replyBannerAuthorName: {
    color: '#1A1A1A',
    fontWeight: '700',
  },
  replyBannerCloseBtn: {
    padding: 3,
  },
  replyBannerText: {
    fontSize: 13,
    color: '#4B5563',
  },
  // Instagram / Messenger Style Quoted Reply Stack
  rightBubbleWithReply: {
    borderTopRightRadius: 4,
  },
  leftBubbleWithReply: {
    borderTopLeftRadius: 4,
  },
  replyQuoteStackRight: {
    alignItems: 'flex-end',
    alignSelf: 'flex-end',
    marginBottom: 2,
    maxWidth: '100%',
  },
  replyQuoteLabelRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
    maxWidth: '100%',
    marginBottom: 2,
    marginRight: 6,
  },
  replyQuoteLabelRight: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    flexShrink: 1,
  },
  replyQuoteBubbleRight: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    maxWidth: '100%',
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  replyQuoteBubbleText: {
    fontSize: 14,
    lineHeight: 19,
    color: '#262626',
    fontFamily: THEME.typography.fontFamily.secondaryRegular,
  },
  replyQuoteStackLeft: {
    alignItems: 'flex-start',
    alignSelf: 'flex-start',
    marginBottom: 2,
    maxWidth: '100%',
  },
  replyQuoteLabelRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    marginBottom: 2,
    marginLeft: 6,
  },
  replyQuoteLabelLeft: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8E8E93',
    flexShrink: 1,
  },
  replyQuoteBubbleLeft: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    maxWidth: '100%',
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  replyQuoteBubbleWithPhoto: {
    paddingLeft: 6,
    paddingVertical: 5,
  },
  replyQuotePhotoOnly: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    backgroundColor: 'transparent',
    overflow: 'hidden',
    borderRadius: 16,
  },
  replyQuotePhotoOnlyThumb: {
    width: 84,
    height: 84,
    borderRadius: 16,
  },
  replyQuotePhotoThumb: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#E5E7EB',
  },
  replyBannerPhotoThumb: {
    width: 36,
    height: 36,
    borderRadius: 6,
    marginRight: 10,
    backgroundColor: '#E5E7EB',
  },
  // Long-Press Action Modal & Reaction Overlay Styles
  actionModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    elevation: 99999,
  },
  actionModalDarkDimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(13, 13, 17, 0.45)',
  },
  actionReactionPill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#EFEFEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    gap: 10,
    zIndex: 10,
  },
  actionEmojiButton: {
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  actionEmojiText: {
    fontSize: 22,
    includeFontPadding: false,
  },
  actionMessageBubblePreview: {
    position: 'absolute',
    maxWidth: '82%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 9,
  },
  actionLeftBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderTopLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 46,
  },
  actionRightBubble: {
    backgroundColor: '#FFB43B',
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minWidth: 46,
  },
  actionMenuCard: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    width: 205,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EFEFEF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
    paddingVertical: 4,
    zIndex: 10,
  },
  actionMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionMenuItemPressed: {
    backgroundColor: '#F7F7F5',
  },
  actionMenuItemLast: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EBEBE6',
  },
  actionMenuIcon: {
    marginRight: 12,
    width: 20,
    textAlign: 'center',
  },
  actionMenuText: {
    color: '#1A1A1A',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: THEME.typography.fontFamily.secondarySemiBold,
  },
  reactionBadgeText: {
    fontSize: 14,
  },
  uploadingBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: '#FFF8EB',
    borderTopWidth: 1,
    borderTopColor: '#FFE0B2',
  },
  uploadingText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#8A5A00',
    fontWeight: '500',
  },
});
