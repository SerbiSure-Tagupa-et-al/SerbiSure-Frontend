import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import { formatRate } from '../../../shared/utils/rate';
import { realtime } from '../../../shared/realtime';
import { AppState } from 'react-native';
import { workSetupLabel } from '../workSetup';
import { getBookingCounterparty, isBookingPoster } from '../bookingParticipants';
import { useUser } from '../../auth/session/UserContext';
import { ContractDownloadCard } from './ContractDownloadCard';
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Pressable, Modal, ActivityIndicator, Alert, ScrollView, RefreshControl, Image, Animated, PanResponder, Dimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BookingItem, formatBookingAddress, fetchMyBookings, fetchMyAssignedBookings, startBooking, completeBooking, fetchBookingPenaltyStatus, type BookingPenaltyStatus } from '../api/bookingApi';
import { CancelBookingModal } from './CancelBookingModal';
import { ReviewModal } from '../../reviews/components/ReviewModal';
import { ProposalsModal } from './ProposalsModal';
import { BookingModal } from './BookingModal';
import { UserProfileModal } from '../../profile/components/UserProfileModal';
import { BottomSheetHandle } from '../../../shared/components/BottomSheetHandle';
import THEME from '../../../shared/theme/theme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SNAP_EXPANDED = 0;
const SNAP_DISMISSED = SCREEN_HEIGHT;

export interface MyBookingsModalProps {
  visible: boolean;
  onClose: () => void;
  onSafetyAcknowledged?: () => void;
  token?: string | null;
  accountType?: string; // 'Homeowner' | 'Kasambahay'
  initialTab?: TabType;
}

type TabType = 'active' | 'pending' | 'ongoing' | 'completed' | 'cancelled';

const TABS: { key: TabType; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'active', label: 'Active' },
  { key: 'ongoing', label: 'Ongoing' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

export function MyBookingsModal({
  visible,
  onClose,
  onSafetyAcknowledged,
  token,
  accountType = 'Homeowner',
  initialTab = 'pending',
}: MyBookingsModalProps) {
  const { tr: uiText, formatDate } = useUiLanguage();
  const insets = useSafeAreaInsets();
  const { user, updateUser } = useUser();
  const [penalty, setPenalty] = useState<BookingPenaltyStatus | null>(null);
  const [showPenaltyBanner, setShowPenaltyBanner] = useState<boolean>(true);
  const penaltyOpacity = useRef(new Animated.Value(1)).current;
  const penaltyTimerRef = useRef<NodeJS.Timeout | null>(null);

  const dismissPenaltyBanner = () => {
    if (penaltyTimerRef.current) clearTimeout(penaltyTimerRef.current);
    Animated.timing(penaltyOpacity, {
      toValue: 0,
      duration: 350,
      useNativeDriver: true,
    }).start(() => {
      setShowPenaltyBanner(false);
    });
  };

  useEffect(() => {
    if (visible && penalty && penalty.penalty_points > 0) {
      setShowPenaltyBanner(true);
      penaltyOpacity.setValue(1);
      if (penaltyTimerRef.current) clearTimeout(penaltyTimerRef.current);
      penaltyTimerRef.current = setTimeout(() => {
        dismissPenaltyBanner();
      }, 5000);
    }
    return () => {
      if (penaltyTimerRef.current) clearTimeout(penaltyTimerRef.current);
    };
  }, [visible, penalty?.penalty_points]);

  const [activeTab, setActiveTab] = useState<TabType>(initialTab);
  const [bookings, setBookings] = useState<BookingItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<boolean>(false);

  const activeTabRef = useRef<TabType>(activeTab);
  activeTabRef.current = activeTab;

  // Review Modal State
  const [reviewBooking, setReviewBooking] = useState<{
    id: string;
    revieweeName: string;
    isMandatory?: boolean;
  } | null>(null);

  // Proposals Modal State
  const [proposalsTarget, setProposalsTarget] = useState<{
    id: string;
    isPoster: boolean;
    currentRate: string;
    ratePeriod: 'day' | 'month';
    rateNeedsReview?: boolean;
  } | null>(null);

  // User Profile Modal State
  const [profileTarget, setProfileTarget] = useState<{
    id?: string;
    name?: string;
    avatar?: string;
    role?: string;
  } | null>(null);

  // Booking Details Modal State
  const [selectedBookingForDetails, setSelectedBookingForDetails] = useState<BookingItem | null>(null);

  const loadData = async (isPullToRefresh = false) => {
    if (!token) { setLoading(false); setRefreshing(false); setErrorMessage('Sign in to view your bookings.'); return; }
    if (!isPullToRefresh) setLoading(true);
    setErrorMessage(null);

    const currentTab = activeTab;
    const statusFilter = currentTab === 'active' ? 'Accepted' : currentTab === 'ongoing' ? 'InProgress' : currentTab;

    try {
      let data: BookingItem[] = [];

      const [posted, assigned, penaltyState] = await Promise.all([
        fetchMyBookings(token, statusFilter), fetchMyAssignedBookings(token, statusFilter), fetchBookingPenaltyStatus(token),
      ]);
      data = Array.from(new Map([...posted, ...assigned].map(item => [item.booking_id, item])).values());

      // Concurrency guard: ignore if tab changed while in-flight
      if (activeTabRef.current !== currentTab) return;

      setPenalty(penaltyState);
      updateUser({ penaltyPoints: penaltyState.penalty_points, isRestricted: penaltyState.is_restricted });
      setBookings(data);
    } catch (err: any) {
      console.warn('[MyBookingsModal] loadData failed:', err);
      if (activeTabRef.current === currentTab) {
        setErrorMessage(err?.message || 'Failed to load bookings. Please pull down to retry.');
      }
    } finally {
      if (activeTabRef.current === currentTab) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    if (visible && initialTab) {
      setActiveTab(initialTab);
    }
  }, [visible, initialTab]);

  useEffect(() => {
    if (visible) {
      loadData();
    }
  }, [visible, activeTab, accountType, token]);

  useEffect(() => {
    if (!visible || !token) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = realtime.subscribe(event => {
      if (['sync', 'booking.changed'].includes(event.type) && AppState.currentState === 'active') {
        clearTimeout(timer); timer = setTimeout(() => void loadData(true), 150);
      }
    });
    return () => { off(); clearTimeout(timer); };
  }, [visible, token, activeTab, accountType]);

  const handleStart = async (bookingId: string) => {
    if (!token || actionInProgress) return;
    Alert.alert('Start Job', 'Mark this booking as In Progress?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Confirm Start',
        onPress: async () => {
          setActionInProgress(true);
          try {
            const res = await startBooking(token, bookingId);
            if (res.success) {
              Alert.alert('Job Started', 'Status updated to In Progress.');
              loadData();
            } else {
              Alert.alert('Error', res.error || 'Failed to start job.');
            }
          } finally {
            setActionInProgress(false);
          }
        },
      },
    ]);
  };

  const handleComplete = async (bookingId: string) => {
    if (!token || actionInProgress) return;
    Alert.alert('Complete Job', 'Confirm that this job has been completed?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Complete',
        onPress: async () => {
          setActionInProgress(true);
          try {
            const res = await completeBooking(token, bookingId);
            if (res.success) {
              loadData();
              const matchingBooking = bookings.find((b) => b.booking_id === bookingId);
              const target = matchingBooking ? getBookingCounterparty(matchingBooking, user.id) : null;
              const targetName = target ? target.name : 'Partner';

              Alert.alert(
                'Job Completed',
                'Booking marked as Completed! Mandatory quality feedback is now required under SerbiSure QA.'
              );

              setReviewBooking({
                id: bookingId,
                revieweeName: targetName,
                isMandatory: true,
              });
            } else {
              Alert.alert('Error', res.error || 'Failed to complete job.');
            }
          } finally {
            setActionInProgress(false);
          }
        },
      },
    ]);
  };

  const [cancelTarget, setCancelTarget] = useState<string | null>(null);
  const handleCancel = (bookingId: string) => {
    if (token && !actionInProgress) setCancelTarget(bookingId);
  };

  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'Accepted':
      case 'Confirmed':
        return { bg: '#00B13B', text: '#FFFFFF', border: '#0D0D11' };
      case 'InProgress':
        return { bg: '#FFB380', text: '#0D0D11', border: '#0D0D11' };
      case 'Completed':
        return { bg: '#00B13B', text: '#FFFFFF', border: '#0D0D11' };
      case 'Cancelled':
      case 'Declined':
        return { bg: '#FF3E3E', text: '#FFFFFF', border: '#0D0D11' };
      default:
        return { bg: '#F6F5F2', text: '#0D0D11', border: '#0D0D11' };
    }
  };

  const panY = useRef(new Animated.Value(SNAP_EXPANDED)).current;
  const currentTranslateY = useRef(SNAP_EXPANDED);
  const gestureStartY = useRef(SNAP_EXPANDED);
  const isClosingRef = useRef(false);
  const scrollOffset = useRef(0);

  useEffect(() => {
    const id = panY.addListener(({ value }) => {
      currentTranslateY.current = value;
    });
    return () => {
      panY.removeListener(id);
    };
  }, [panY]);

  const snapTo = (toValue: number, onComplete?: () => void) => {
    currentTranslateY.current = toValue;
    Animated.spring(panY, {
      toValue,
      damping: 24,
      stiffness: 260,
      mass: 0.8,
      overshootClamping: true,
      useNativeDriver: true,
    }).start(onComplete);
  };

  const handleClose = () => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    setSelectedBookingForDetails(null);
    Animated.timing(panY, {
      toValue: SNAP_DISMISSED,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      onClose();
      isClosingRef.current = false;
      currentTranslateY.current = SNAP_EXPANDED;
    });
  };

  useEffect(() => {
    setSelectedBookingForDetails(null);
    if (visible) {
      isClosingRef.current = false;
      currentTranslateY.current = SNAP_EXPANDED;
      panY.setValue(SNAP_DISMISSED);
      Animated.spring(panY, {
        toValue: SNAP_EXPANDED,
        damping: 24,
        stiffness: 260,
        mass: 0.8,
        overshootClamping: true,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, panY]);

  const handleRelease = (gestureState: { dy: number; vy: number }) => {
    const { dy, vy } = gestureState;
    const currentY = currentTranslateY.current;

    if (dy > 70 || vy > 0.4 || currentY > 110) {
      handleClose();
    } else {
      snapTo(SNAP_EXPANDED);
    }
  };

  const headerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 3 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return Math.abs(gestureState.dy) > 3 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderGrant: () => {
        gestureStartY.current = currentTranslateY.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const rawY = gestureStartY.current + gestureState.dy;
        const targetY = Math.max(SNAP_EXPANDED, rawY);
        panY.setValue(targetY);
      },
      onPanResponderRelease: (_, gestureState) => {
        handleRelease(gestureState);
      },
      onPanResponderTerminate: (_, gestureState) => {
        handleRelease(gestureState);
      },
    })
  ).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        return isVertical && gestureState.dy > 3 && scrollOffset.current <= 5;
      },
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        const isVertical = Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
        if (!isVertical || Math.abs(gestureState.dy) < 3) return false;
        if (gestureState.dy > 0 && scrollOffset.current <= 5) {
          return true;
        }
        return false;
      },
      onPanResponderGrant: () => {
        gestureStartY.current = currentTranslateY.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const rawY = gestureStartY.current + gestureState.dy;
        const targetY = Math.max(SNAP_EXPANDED, rawY);
        panY.setValue(targetY);
      },
      onPanResponderRelease: (_, gestureState) => {
        handleRelease(gestureState);
      },
      onPanResponderTerminate: (_, gestureState) => {
        handleRelease(gestureState);
      },
    })
  ).current;

  const backdropOpacity = panY.interpolate({
    inputRange: [SNAP_EXPANDED, SNAP_DISMISSED],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <>
      <Modal visible={visible && !selectedBookingForDetails} animationType="none" transparent={true} onRequestClose={handleClose}>
      <View style={styles.modalOverlay}>
        <Animated.View style={[styles.modalBackdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheetContainer,
            {
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [{ translateY: panY }],
            },
          ]}
          {...panResponder.panHandlers}
        >
          {/* Swipable Header Area */}
          <View {...headerPanResponder.panHandlers}>
            {/* Sheet Handle */}
            <BottomSheetHandle onPress={handleClose} />

            {/* Title */}
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {uiText(accountType === 'Kasambahay' ? 'My Jobs & Contracts' : 'My Bookings & Hires')}
              </Text>
            </View>
          </View>

        {penalty && penalty.penalty_points > 0 && showPenaltyBanner && (
          <Animated.View style={[styles.penaltyBanner, { opacity: penaltyOpacity }]}>
            <View style={styles.penaltyIconWrap}>
              <Ionicons name="alert-circle" size={17} color="#EA580C" />
            </View>
            <Text style={styles.penaltyText}>
              <Text style={styles.penaltyTextBold}>{penalty.penalty_points}/3 {uiText("penalty points this month.")} </Text>
              {penalty.is_restricted
                ? uiText("Booking and posting are restricted until the 1st of next month.")
                : uiText("Points reset on the 1st of next month.")}
            </Text>
            <Pressable
              onPress={dismissPenaltyBanner}
              hitSlop={12}
              style={styles.penaltyCloseBtn}
              accessibilityRole="button"
              accessibilityLabel="Dismiss penalty alert"
            >
              <Ionicons name="close" size={16} color="#727272" />
            </Pressable>
          </Animated.View>
        )}

        {/* Mandatory Quality Feedback Banner for Completed Bookings */}
        {(() => {
          const pendingFeedback = bookings.find((b) => b.booking_status === 'Completed' && !b.has_reviewed);
          if (!pendingFeedback) return null;
          const target = getBookingCounterparty(pendingFeedback, user.id);
          const targetName = target ? target.name : 'Partner';

          return (
            <Pressable
              style={styles.mandatoryFeedbackBanner}
              onPress={() => {
                setReviewBooking({
                  id: pendingFeedback.booking_id,
                  revieweeName: targetName,
                  isMandatory: true,
                });
              }}
            >
              <View style={styles.mandatoryFeedbackIconWrap}>
                <Ionicons name="chatbubbles" size={18} color="#D97706" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.mandatoryFeedbackTitle}>{uiText("Mandatory Service Feedback")}</Text>
                <Text style={styles.mandatoryFeedbackSub} numberOfLines={2}>
                  {uiText("You have a completed booking with")} {targetName} {uiText("awaiting required review. Tap to complete.")}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color="#D97706" />
            </Pressable>
          );
        })()}

        {/* Tab Switcher */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={styles.tabsRow}>
          {TABS.map((tab) => {
            const isCurrent = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: isCurrent }}
                style={[styles.tabItem, isCurrent && styles.tabItemActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.tabText, isCurrent && styles.tabTextActive]}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Content List */}
        <ScrollView
          style={styles.scrollBody}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          onScroll={(e) => {
            scrollOffset.current = e.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                loadData(true);
              }}
              colors={['#FFB43B']}
            />
          }
        >
          {loading ? (
            <ActivityIndicator color="#FFB43B" size="large" style={{ marginTop: 40 }} />
          ) : errorMessage ? (
            <View style={styles.emptyCard}>
              <Ionicons name="cloud-offline-outline" size={44} color="#EF4444" />
              <Text style={styles.emptyTitle}>{uiText("Unable to Load Bookings")}</Text>
              <Text style={styles.emptySubtitle}>{errorMessage}</Text>
              <Pressable
                style={styles.retryBtn}
                onPress={() => loadData()}
              >
                <Ionicons name="refresh" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.retryBtnText}>{uiText("Retry")}</Text>
              </Pressable>
            </View>
          ) : bookings.length > 0 ? (
            bookings.map((booking) => {
              const counterparty = getBookingCounterparty(booking, user.id);
              const partnerInfo = counterparty || (booking.poster?.id !== user.id ? booking.poster : null);
              const displayName = partnerInfo?.name || uiText("Waiting for Kasambahay");
              const displayRole = partnerInfo?.account_type || uiText("Kasambahay");
              const rating = partnerInfo?.rating;
              const hasRating = typeof rating === 'number' && Number.isFinite(rating) && rating >= 1 && rating <= 5;
              const avatarUri = partnerInfo?.profile_link ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=FFB380&color=fff`;

              const categoryName = (
                Array.isArray(booking.service_category)
                  ? booking.service_category[0]
                  : booking.service_category
              ) || 'Service not specified';
              const formattedCategory = categoryName.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase());

              const durationLabel = booking.booking_type === 'long_term' ? 'Long-term' : 'Short-term';
              const setupRaw = booking.work_setup;
              const setupLabel = workSetupLabel(setupRaw);
              const combinedTerms = `${durationLabel} · ${setupLabel}`;

              const canStart = booking.booking_status === 'Accepted' || (booking.booking_status === 'InProgress' && !booking.started_at);
              const canComplete = booking.booking_status === 'InProgress' && !!booking.started_at;
              const isCompleted = booking.booking_status === 'Completed';
              const canCancel = ['Pending', 'Accepted', 'InProgress'].includes(booking.booking_status);

              return (
                <View key={booking.booking_id} style={styles.card}>
                  {/* Top Row: Avatar, Name, Category Badge, Role & Rating */}
                  <Pressable
                    style={styles.cardHeaderRow}
                    onPress={() => {
                      if (partnerInfo) {
                        setProfileTarget({
                          id: partnerInfo.id,
                          name: partnerInfo.name,
                          avatar: partnerInfo.profile_link || undefined,
                          role: partnerInfo.account_type,
                        });
                      }
                    }}
                  >
                    <Image
                      source={{ uri: avatarUri }}
                      style={styles.cardAvatar}
                    />
                    <View style={styles.cardHeaderTextCol}>
                      <View style={styles.cardHeaderTopLine}>
                        <Text style={styles.cardPartnerName} numberOfLines={1}>{displayName}</Text>
                        <View style={styles.categoryBadge}>
                          <Text style={styles.categoryBadgeText}>{formattedCategory}</Text>
                        </View>
                      </View>
                      <View style={styles.cardSubRow}>
                        <Text style={styles.cardRoleText}>{displayRole}</Text>
                        {partnerInfo && (hasRating ? (
                          <>
                            <Text style={styles.ratingSeparator}>·</Text>
                            <Ionicons name="star-outline" size={13.5} color="#FFB380" style={styles.starIcon} />
                            <Text style={styles.cardRatingText}>{rating.toFixed(1)}</Text>
                          </>
                        ) : (
                          <View style={styles.newBadge}>
                            <Text style={styles.newBadgeText}>{uiText('New')}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </Pressable>

                  {/* Middle Row: Rate & Combined Terms Badge */}
                  <View style={styles.cardMiddleRow}>
                    <View style={styles.rateContainer}>
                      <Text style={styles.rateAmount}>{uiText(formatRate(booking.rate_amount).replace(/\.00$/, ''))}</Text>
                      <Text style={styles.ratePeriod}>
                        / {booking.rate_period || (booking.booking_type === 'long_term' ? 'month' : 'day')}
                      </Text>
                    </View>
                    <View style={styles.combinedTermsPill}>
                      <Text style={styles.combinedTermsPillText}>
                        {combinedTerms}
                      </Text>
                    </View>
                  </View>

                  {booking.rate_needs_review ? (
                    <Text style={{ color: '#B45309', marginBottom: 8, fontSize: 12 }}>
                      {uiText("Legacy rate: the monthly amount needs confirmation.")}
                    </Text>
                  ) : null}
                  {booking.contract_summary ? <ContractDownloadCard summary={booking.contract_summary} /> : null}

                  {/* Action Buttons Row */}
                  <View style={styles.actionRow}>
                    {/* Details button */}
                    <Pressable
                      style={styles.detailsBtn}
                      onPress={() => setSelectedBookingForDetails(booking)}
                    >
                      <Text style={styles.detailsBtnText}>{uiText("Details")}</Text>
                    </Pressable>

                    {/* Middle button: Start Job / Complete / Leave Review */}
                    {canStart && (
                      <Pressable
                        style={styles.startJobBtn}
                        disabled={actionInProgress}
                        onPress={() => handleStart(booking.booking_id)}
                      >
                        <Text style={styles.startJobBtnText}>{uiText("Start Job")}</Text>
                      </Pressable>
                    )}

                    {canComplete && (
                      <Pressable
                        style={[styles.startJobBtn, { backgroundColor: '#00B13B' }]}
                        disabled={actionInProgress}
                        onPress={() => handleComplete(booking.booking_id)}
                      >
                        <Text style={styles.startJobBtnText}>{uiText("Complete")}</Text>
                      </Pressable>
                    )}

                    {isCompleted && (
                      <Pressable
                        style={[
                          styles.startJobBtn,
                          booking.has_reviewed && { backgroundColor: '#EAEAEA' },
                        ]}
                        disabled={booking.has_reviewed || actionInProgress}
                        onPress={() => {
                          const targetName = partnerInfo ? partnerInfo.name : 'Partner';
                          setReviewBooking({
                            id: booking.booking_id,
                            revieweeName: targetName,
                          });
                        }}
                      >
                        <Text
                          style={[
                            styles.startJobBtnText,
                            booking.has_reviewed && { color: '#6B7280' },
                          ]}
                        >
                          {booking.has_reviewed ? uiText("Reviewed") : uiText("Leave Review")}
                        </Text>
                      </Pressable>
                    )}

                    {/* Cancel button */}
                    {canCancel && (
                      <Pressable
                        style={styles.cancelBtn}
                        disabled={actionInProgress}
                        onPress={() => handleCancel(booking.booking_id)}
                      >
                        <Text style={styles.cancelBtnText}>{uiText("Cancel")}</Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons
                name={
                  activeTab === 'active'
                    ? 'briefcase-outline'
                    : activeTab === 'ongoing'
                      ? 'time-outline'
                      : activeTab === 'pending'
                        ? 'hourglass-outline'
                        : activeTab === 'completed'
                          ? 'checkmark-done-circle-outline'
                          : 'close-circle-outline'
                }
                size={52}
                color="#0D0D11"
              />
              <Text style={styles.emptyTitle}>
                {activeTab === 'active'
                  ? 'No Active Contracts'
                  : activeTab === 'ongoing'
                    ? 'No Ongoing Contracts'
                    : activeTab === 'pending'
                      ? 'No Pending Postings'
                      : activeTab === 'completed'
                        ? 'No Completed Bookings'
                        : 'No Cancelled Bookings'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'active'
                  ? 'Accepted bookings waiting to start will appear here.'
                  : activeTab === 'ongoing'
                    ? 'Jobs that have started and are still in progress will appear here.'
                    : activeTab === 'pending'
                      ? 'Open postings waiting for worker assignment, acceptance, or counter-offers will appear here.'
                      : activeTab === 'completed'
                        ? 'Domestic work contracts that have reached completion will appear here.'
                        : 'Bookings that were cancelled or withdrawn will appear here.'}
              </Text>
            </View>
          )}
        </ScrollView>

        {/* Modals */}
        {cancelTarget && token && <CancelBookingModal key={cancelTarget} bookingId={cancelTarget} token={token}
          onClose={() => setCancelTarget(null)} onCancelled={safety => {
            setCancelTarget(null);
            if (safety) { onClose(); onSafetyAcknowledged?.(); }
            else void loadData();
          }} />}
        {reviewBooking && (
          <ReviewModal
            visible={!!reviewBooking}
            onClose={() => setReviewBooking(null)}
            bookingId={reviewBooking.id}
            revieweeName={reviewBooking.revieweeName}
            isMandatory={reviewBooking.isMandatory ?? true}
            token={token}
            onSuccess={() => loadData()}
          />
        )}

        {proposalsTarget && (
          <ProposalsModal
            visible={!!proposalsTarget}
            onClose={() => setProposalsTarget(null)}
            bookingId={proposalsTarget.id}
            isPoster={proposalsTarget.isPoster}
            currentRate={proposalsTarget.currentRate}
            ratePeriod={proposalsTarget.ratePeriod}
            rateNeedsReview={proposalsTarget.rateNeedsReview}
            token={token}
            onUpdated={() => loadData()}
          />
        )}

        {profileTarget && (
          <UserProfileModal
            visible={!!profileTarget}
            onClose={() => setProfileTarget(null)}
            userId={profileTarget.id}
            token={token}
            prefilledName={profileTarget.name}
            prefilledAvatar={profileTarget.avatar}
            prefilledRole={profileTarget.role}
          />
        )}

        </Animated.View>
      </View>
    </Modal>

    {selectedBookingForDetails && (
      <BookingModal
        visible={!!selectedBookingForDetails}
        useNativeModal={true}
        onClose={() => setSelectedBookingForDetails(null)}
        contactName={
          getBookingCounterparty(selectedBookingForDetails, user.id)?.name ||
          selectedBookingForDetails.poster?.name ||
          'Kasambahay'
        }
        contactRole={
          getBookingCounterparty(selectedBookingForDetails, user.id)?.account_type ||
          selectedBookingForDetails.poster?.account_type ||
          'Kasambahay'
        }
        contactAvatar={
          getBookingCounterparty(selectedBookingForDetails, user.id)?.profile_link ||
          selectedBookingForDetails.poster?.profile_link ||
          undefined
        }
        readOnly={true}
        bookingType={selectedBookingForDetails.booking_type}
        bookingId={selectedBookingForDetails.booking_id}
        isConfirmed={['Accepted', 'InProgress', 'Completed'].includes(selectedBookingForDetails.booking_status)}
        isDeclined={selectedBookingForDetails.booking_status === 'Cancelled'}
        initialDetails={{
          serviceCategory: Array.isArray(selectedBookingForDetails.service_category)
            ? selectedBookingForDetails.service_category
            : selectedBookingForDetails.service_category ? [selectedBookingForDetails.service_category] : [],
          workSetup: selectedBookingForDetails.work_setup || null,
          region: selectedBookingForDetails.region || '',
          startDate: selectedBookingForDetails.start_time || '',
          endDate: selectedBookingForDetails.end_time || '',
          workHours: (selectedBookingForDetails.daily_start_time && selectedBookingForDetails.daily_end_time)
            ? `${selectedBookingForDetails.daily_start_time} - ${selectedBookingForDetails.daily_end_time}`
            : '',
          location: formatBookingAddress(selectedBookingForDetails),
          days: selectedBookingForDetails.work_days || [],
          salary: selectedBookingForDetails.rate_amount || '',
          bookingType: selectedBookingForDetails.booking_type,
          bookingId: selectedBookingForDetails.booking_id,
          passUrl: selectedBookingForDetails.pass_url,
          id: selectedBookingForDetails.booking_id,
        }}
        token={token}
      />
    )}
  </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  sheetContainer: {
    height: '90%',
    backgroundColor: '#F6F5F2',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    overflow: 'hidden',
  },
  sheetHandleWrap: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 8,
  },
  sheetHandle: {
    width: 42,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
  },
  sheetHeader: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 14,
  },
  sheetTitle: {
    fontSize: 24,
    fontFamily: THEME.typography.fontFamily.display,
    color: '#0D0D11',
  },
  tabsRow: {
    flexGrow: 1,
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 8,
  },
  tabItem: {
    flexGrow: 1,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: THEME.roundness.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EAEAEA',
  },
  tabItemActive: {
    backgroundColor: '#FFB380',
  },
  tabText: {
    fontSize: 12.5,
    fontFamily: THEME.typography.fontFamily.secondaryMedium,
    color: '#0D0D11',
  },
  tabTextActive: {
    color: '#FFFFFF',
    fontFamily: THEME.typography.fontFamily.secondaryBold,
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
    borderWidth: 0,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    backgroundColor: '#EAEAEA',
  },
  cardHeaderTextCol: {
    flex: 1,
  },
  cardHeaderTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 3,
  },
  cardPartnerName: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0D0D11',
    flex: 1,
    marginRight: 8,
  },
  categoryBadge: {
    backgroundColor: '#FFB380',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  categoryBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D0D11',
  },
  cardSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardRoleText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
  },
  starIcon: {
    marginRight: 4,
  },
  ratingSeparator: {
    marginHorizontal: 6,
    color: '#6B7280',
  },
  newBadge: {
    marginLeft: 8,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: '#F1F5F9',
  },
  newBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  cardRatingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0D0D11',
  },
  cardMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  rateContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  rateAmount: {
    fontSize: 24,
    fontWeight: '800',
    color: '#0D0D11',
  },
  ratePeriod: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6B7280',
    marginLeft: 3,
  },
  combinedTermsPill: {
    backgroundColor: '#EAEAEA',
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 6,
  },
  combinedTermsPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D0D11',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  detailsBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#0D0D11',
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailsBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  startJobBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FFB380',
    justifyContent: 'center',
    alignItems: 'center',
  },
  startJobBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cancelBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#FF3E3E',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  cancelRequestBanner: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
    marginBottom: 10,
  },
  cancelRequestTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#991B1B',
  },
  cancelRequestSub: {
    fontSize: 12,
    color: '#4B5563',
    lineHeight: 16,
    marginTop: 2,
  },
  cancelBannerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBannerBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  cancelPendingMyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
    marginBottom: 10,
  },
  cancelPendingMyTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#92400E',
  },
  cancelPendingMySub: {
    fontSize: 11.5,
    color: '#6B7280',
    marginTop: 1,
  },
  cancelWithdrawBtn: {
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    marginLeft: 8,
  },
  cancelWithdrawBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4B5563',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 70,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: THEME.typography.fontFamily.display,
    color: '#0D0D11',
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13.5,
    fontFamily: THEME.typography.fontFamily.body,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
    maxWidth: 280,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFB43B',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 8,
    marginTop: 14,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 13,
  },
  mandatoryFeedbackBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  mandatoryFeedbackIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  mandatoryFeedbackTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#92400E',
  },
  mandatoryFeedbackSub: {
    fontSize: 11,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 15,
  },
  penaltyBanner: {
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 12,
    backgroundColor: '#FFF7ED',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FED7AA',
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  penaltyIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  penaltyText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#0D0D11',
    fontFamily: THEME.typography.fontFamily.secondaryMedium,
  },
  penaltyTextBold: {
    fontWeight: '700',
    color: '#0D0D11',
    fontFamily: THEME.typography.fontFamily.secondaryBold,
  },
  penaltyCloseBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
