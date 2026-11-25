import { formatRate, formatRateInput } from '../../../shared/utils/rate';
import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import { useUser } from '../../auth/session/UserContext';
import type { WorkSetup } from '../workSetup';
import { workSetupLabel } from '../workSetup';
import { confirmBookingAcceptance, bookingResponseMessage, getPendingReviewFromError, promptPendingReview } from '../bookingAcceptance';
import type { PendingMandatoryReview } from '../api/bookingApi';
import { ReviewModal } from '../../reviews/components/ReviewModal';
import { bookingStartTime, isAcceptanceExpired, PASSED_SCHEDULE_MESSAGE } from '../postAvailability';
import { useScheduleClock } from '../hooks/useScheduleClock';
import { buildEngagementSchedule, normalizeServices, toggleService, SERVICE_CHOICES, WORK_SHIFTS, type WorkShift } from '../engagementForm';
import { BookingOfferReview, type BookingOfferStep } from './BookingOfferReview';
import { WorkScheduleFields } from './WorkScheduleFields';
import { WorkLocationFields } from './WorkLocationFields';
import { workLocationError } from '../workLocation';
import { useWorkLocation } from '../hooks/useWorkLocation';
import { validatePostingRate, PART_TIME_MAX_RATE, FULL_TIME_MAX_RATE } from '../../posting/validation';
import { ProfileAvatar } from '../../../shared/ui/ProfileAvatar';
import { PrivacyPolicyModal } from '../../profile/components/PrivacyPolicyModal';
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { StyleSheet, Text, View, Image, TextInput, Pressable, Modal, Alert, Animated, Dimensions, ScrollView, Keyboard, KeyboardAvoidingView, Platform, ActivityIndicator, BackHandler, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { fetchBookingDetail, fetchMinimumWage, formatBookingAddress, MinimumWageData } from '../api/bookingApi';
import THEME from '../../../shared/theme/theme';

const logoSource = require('../../../../assets/serbisure-icon.png');
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const ACCENT_PEACH = '#FFAB73';

const OFFER_STEPS = [
  { label: 'Service', title: 'What help do you need?' },
  { label: 'Schedule', title: 'When will the work happen?' },
  { label: 'Location', title: 'Where and for how much?' },
  { label: 'Review', title: 'Check your booking offer' },
] as const;

export interface BookingJobPost {
  role?: string;
  rate?: string;
  location?: string;
  extra?: string;
  rawText?: string;
}

export interface BookingConfirmData {
  serviceCategory: string[];
  workSetup: WorkSetup;
  region: string;
  province: string;
  city: string;
  barangay: string;
  street: string;
  floorUnit: string;
  zipCode: string;
  startDate: string;
  endDate: string;
  workHours: string;
  location: string;
  days: string[];
  salary: string;
  bookingType: 'long_term' | 'short_term';
  ongoing?: boolean;
  jobPost?: BookingJobPost | null;
}

interface BookingModalProps {
  visible: boolean;
  onClose: () => void;
  contactName?: string;
  contactRole?: string;
  contactAvatar?: string;
  readOnly?: boolean;
  canRespond?: boolean;
  isConfirmed?: boolean;
  userRole?: 'homeowner' | 'kasambahay';
  token?: string | null;
  bookingType?: 'long_term' | 'short_term';
  jobPost?: BookingJobPost | null;
  initialDetails?: {
    serviceCategory?: string[];
    workSetup?: WorkSetup | null;
    region?: string;
    startDate?: string;
    startTime?: string;
    endDate?: string;
    workHours?: string;
    location?: string;
    days?: string[];
    salary?: string;
    bookingType?: 'long_term' | 'short_term';
    jobPost?: BookingJobPost | null;
    id?: string | null;
    bookingId?: string | null;
    passUrl?: string | null;
  } | null;
  onConfirm?: (bookingDetails: BookingConfirmData) => Promise<void> | void;
  onKasambahayConfirm?: () => Promise<void> | void;
  onKasambahayDecline?: () => Promise<void> | void;
  isDeclined?: boolean;
  isAcquired?: boolean;
  bookingId?: string | null;
  useNativeModal?: boolean;
}

export function BookingModal({
  visible,
  onClose,
  contactName = 'Kasambahay',
  contactRole = 'Household Helper',
  contactAvatar,
  readOnly = false,
  canRespond = false,
  isConfirmed = false,
  userRole = 'homeowner',
  token,
  bookingType,
  jobPost = null,
  initialDetails = null,
  onConfirm,
  onKasambahayConfirm,
  onKasambahayDecline,
  isDeclined = false,
  isAcquired = false,
  bookingId,
  useNativeModal = true,
}: BookingModalProps) {
  const { tr: uiText } = useUiLanguage();
  const { user } = useUser();
  const ticketId = bookingId || initialDetails?.bookingId || initialDetails?.id;
  const ticketToken = token || user.token;
  const savedPassUrl = initialDetails?.passUrl;
  const ticketKey = `${ticketId}:${ticketToken}`;
  const [freshPass, setFreshPass] = useState<{ key: string; source?: string | null; url: string | null } | null>(null);
  const passUrl = freshPass?.key === ticketKey && freshPass.source === savedPassUrl ? freshPass.url : savedPassUrl;

  useEffect(() => {
    if (!visible || !readOnly || !ticketId || !ticketToken) return;
    let current = true;
    // Render the last downloaded URL immediately. A failed offline refresh must
    // not remove it; only the server can renew its 24-hour signature.
    void fetchBookingDetail(ticketToken, ticketId).then(booking => {
      if (current && booking?.booking_id === ticketId) {
        setFreshPass({ key: ticketKey, source: savedPassUrl, url: booking.pass_url || null });
      }
    }).catch(() => { });
    return () => { current = false; };
  }, [visible, readOnly, ticketId, ticketToken]);
  const insets = useSafeAreaInsets();
  const scheduleNow = useScheduleClock([bookingStartTime(initialDetails)], visible && readOnly);
  const acceptanceExpired = readOnly && isAcceptanceExpired(initialDetails, scheduleNow);

  // Slide animation: Right to Left
  const [modalVisible, setModalVisible] = useState(visible);
  const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;

  // Form states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [ongoing, setOngoing] = useState(false);
  const [workHours, setWorkHours] = useState('');
  const [savedLocation, setSavedLocation] = useState('');
  const address = useWorkLocation(visible && !readOnly);
  const location = readOnly ? savedLocation : formatBookingAddress({
    street: address.streetAddress, floor_number: address.floorUnit, barangay: address.selectedBarangay?.name,
    city: address.selectedCity?.name, province: address.selectedProvince?.name, zip_code: address.zipcode,
  }, '');
  const [selectedShift, setSelectedShift] = useState<WorkShift | null>(null);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [salary, setSalary] = useState('');
  const [selectedBookingType, setSelectedBookingType] = useState<'long_term' | 'short_term' | null>(null);
  const [serviceCategory, setServiceCategory] = useState<string[]>([]);
  const [workSetup, setWorkSetup] = useState<WorkSetup | null>(null);
  const [savedRegion, setSavedRegion] = useState('');
  const region = readOnly ? savedRegion : address.selectedRegion?.displayName || address.selectedRegion?.name || '';
  const [submitting, setSubmitting] = useState(false);
  const [pendingReview, setPendingReview] = useState<PendingMandatoryReview | null>(null);
  const submittingRef = useRef(false);
  const [minWageInfo, setMinWageInfo] = useState<MinimumWageData | null>(null);
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyAttempt, setPolicyAttempt] = useState(0);
  const [offerStep, setOfferStep] = useState<BookingOfferStep>(1);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const currentStep = OFFER_STEPS[offerStep - 1]!;
  const wageLocation = address.selectedCity?.name || '';
  const previewLocation = location;

  const goToStep = (step: BookingOfferStep) => {
    if (submittingRef.current) return;
    Keyboard.dismiss();
    setOfferStep(step);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [offerStep]);

  // Clear address field errors reactively
  useEffect(() => {
    if (address.selectedRegion) setFieldErrors(prev => ({ ...prev, region: false }));
  }, [address.selectedRegion]);
  useEffect(() => {
    if (address.selectedProvince) setFieldErrors(prev => ({ ...prev, province: false }));
  }, [address.selectedProvince]);
  useEffect(() => {
    if (address.selectedCity) setFieldErrors(prev => ({ ...prev, city: false }));
  }, [address.selectedCity]);
  useEffect(() => {
    if (address.selectedBarangay) setFieldErrors(prev => ({ ...prev, barangay: false }));
  }, [address.selectedBarangay]);
  useEffect(() => {
    if (address.streetAddress.trim()) setFieldErrors(prev => ({ ...prev, street: false }));
  }, [address.streetAddress]);
  useEffect(() => {
    if (address.zipcode.trim()) setFieldErrors(prev => ({ ...prev, zipcode: false }));
  }, [address.zipcode]);

  // Active Job Post reference
  const effectiveJobPost = useMemo(() => {
    return initialDetails?.jobPost || jobPost;
  }, [initialDetails?.jobPost, jobPost]);

  // Open / Close animation effect
  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
      setModalVisible(true);
      slideAnim.setValue(SCREEN_WIDTH);
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 220,
        easing: Easing?.out ? Easing.out(Easing?.cubic) : undefined,
        useNativeDriver: true,
      }).start(() => {
        slideAnim.setValue(0);
      });
    } else {
      slideAnim.setValue(SCREEN_WIDTH);
      setModalVisible(false);
    }
  }, [visible, slideAnim]);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue: SCREEN_WIDTH,
      duration: 180,
      easing: Easing?.in ? Easing.in(Easing?.cubic) : undefined,
      useNativeDriver: true,
    }).start(() => {
      slideAnim.setValue(SCREEN_WIDTH);
      setModalVisible(false);
      submittingRef.current = false;
      setSubmitting(false);
      onClose();
    });
  };

  useEffect(() => {
    if (!visible || useNativeModal) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      handleBack();
      return true;
    });
    return () => sub.remove();
  }, [visible, useNativeModal, offerStep, readOnly]);

  // Sync initial details
  useEffect(() => {
    if (!visible) return;
    setOfferStep(1);
    setFieldErrors({});
    setAgreedTerms(false);
    setShowTermsModal(false);

    const initialType = initialDetails?.bookingType || bookingType || null;
    setSelectedBookingType(initialType);

    setStartDate(initialDetails?.startDate || '');
    setEndDate(initialDetails?.endDate || '');
    setOngoing(initialType === 'long_term' && !!initialDetails && !initialDetails.endDate);
    setWorkHours(initialDetails?.workHours || '');
    setSelectedShift(WORK_SHIFTS.find(item => item.hours === initialDetails?.workHours)?.value || (initialDetails?.workHours ? 'custom' : null));
    setSavedLocation(initialDetails?.location || effectiveJobPost?.location || '');
    setSelectedDays(initialDetails?.days || []);
    setSalary(initialDetails?.salary || '');
    const firstCat = initialDetails?.serviceCategory?.[0];
    setServiceCategory(firstCat ? [firstCat] : []);
    setWorkSetup(initialDetails?.workSetup || null);
    setSavedRegion(initialDetails?.region || '');

    if (!readOnly && !initialDetails) {
      address.resetWorkLocation();
    }
  }, [visible, readOnly, initialDetails, effectiveJobPost, bookingType]);



  useEffect(() => {
    let current = true;
    setMinWageInfo(null);
    if (visible && !readOnly && region && selectedBookingType) {
      setPolicyLoading(true);
      void fetchMinimumWage(token || undefined, selectedBookingType, wageLocation, region).then(policy => {
        if (current) { setMinWageInfo(policy); setPolicyLoading(false); }
      });
    } else setPolicyLoading(false);
    return () => { current = false; };
  }, [visible, readOnly, token, selectedBookingType, wageLocation, region, policyAttempt]);

  const getSchedule = () => {
    const schedule = buildEngagementSchedule({
      bookingType: selectedBookingType || 'long_term', startDate, endDate, workHours, days: selectedDays, shift: selectedShift, ongoing,
    });
    if (!readOnly && Date.parse(schedule.start_time) <= Date.now()) {
      throw new Error('Choose a start time that is still ahead.');
    }
    return schedule;
  };

  const validateStep = (step: BookingOfferStep): Record<string, boolean> => {
    const errors: Record<string, boolean> = {};
    if (step === 1) {
      if (!serviceCategory.length) errors.service = true;
      if (!selectedBookingType) errors.engagement = true;
      if (!workSetup) errors.workSetup = true;
    } else if (step === 2) {
      if (!startDate) errors.startDate = true;
      if (selectedBookingType !== 'short_term' && !ongoing && !endDate) errors.endDate = true;
      if (!workHours) errors.workHours = true;
      if (!selectedDays.length) errors.days = true;
      if (startDate && workHours && (selectedBookingType === 'short_term' || ongoing || endDate)) {
        try {
          getSchedule();
        } catch (scheduleErr: any) {
          Alert.alert(uiText('Invalid Schedule'), uiText(scheduleErr?.message || 'Please check your dates and work hours.'));
          errors.startDate = true;
          errors.workHours = true;
        }
      }
    } else if (step === 3) {
      if (!address.selectedRegion) errors.region = true;
      if (!address.selectedProvince) errors.province = true;
      if (!address.selectedCity) errors.city = true;
      if (!address.selectedBarangay) errors.barangay = true;
      if (!address.streetAddress.trim()) errors.street = true;
      if (!address.zipcode.trim()) errors.zipcode = true;
      if (!salary.trim() || salaryError) errors.salary = true;
    }
    return errors;
  };

  const handleNext = () => {
    if (submittingRef.current || offerStep === 4) return;
    const errors = validateStep(offerStep);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    setFieldErrors({});
    goToStep((offerStep + 1) as BookingOfferStep);
  };
  const handleBack = () => {
    if (submittingRef.current) return;
    if (!readOnly && offerStep > 1) goToStep((offerStep - 1) as BookingOfferStep);
    else handleClose();
  };

  const handleConfirm = () => {
    if (readOnly || offerStep !== 4 || submittingRef.current) return;
    for (const step of [1, 2, 3] as const) {
      const errors = validateStep(step);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        goToStep(step);
        return;
      }
    }
    if (!agreedTerms) {
      setFieldErrors(prev => ({ ...prev, terms: true }));
      scrollRef.current?.scrollToEnd({ animated: true });
      return;
    }
    let schedule: ReturnType<typeof getSchedule>;
    try {
      schedule = getSchedule();
    } catch (scheduleErr: any) {
      Alert.alert(uiText('Invalid Schedule'), uiText(scheduleErr?.message || 'Please check your dates and work hours.'));
      setFieldErrors(prev => ({ ...prev, startDate: true, workHours: true }));
      goToStep(2);
      return;
    }
    if (!onConfirm || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    void Promise.resolve().then(() => onConfirm({
      startDate, endDate: selectedBookingType === 'short_term' ? (endDate || startDate) : ongoing ? '' : endDate,
      ongoing: selectedBookingType === 'long_term' && ongoing,
      workHours: selectedBookingType === 'short_term' && selectedShift !== 'custom' ? WORK_SHIFTS.find(item => item.value === selectedShift)!.hours : workHours,
      location: location.trim(), days: schedule.work_days,
      salary: salary.trim(), bookingType: selectedBookingType || 'long_term', jobPost: effectiveJobPost,
      serviceCategory: normalizeServices(serviceCategory), workSetup: selectedBookingType === 'short_term' ? 'stay_out' : (workSetup || 'stay_out'), region,
      province: address.selectedProvince!.name, city: address.selectedCity!.name, barangay: address.selectedBarangay!.name,
      street: address.streetAddress.trim(), floorUnit: address.floorUnit.trim(), zipCode: address.zipcode.trim(),
    })).then(handleClose).catch(error => {
      submittingRef.current = false; setSubmitting(false);
      const requiredReview = getPendingReviewFromError(error);
      if (requiredReview) {
        promptPendingReview(requiredReview, bookingResponseMessage(error), setPendingReview, uiText);
      } else {
        Alert.alert(uiText('Cannot Send Offer'), uiText(bookingResponseMessage(error)));
      }
    });

  };

  const runResponse = (action?: () => Promise<void> | void) => {
    if (!action || submittingRef.current) return;
    submittingRef.current = true; setSubmitting(true);
    void Promise.resolve().then(action).then(handleClose).catch(error => {
      submittingRef.current = false; setSubmitting(false);
      const requiredReview = getPendingReviewFromError(error);
      if (requiredReview) {
        promptPendingReview(requiredReview, bookingResponseMessage(error), setPendingReview, uiText);
      } else {
        Alert.alert(uiText('Booking not updated'), uiText(bookingResponseMessage(error)));
      }
    });
  };

  const salaryError = salary.trim()
    ? validatePostingRate('job', selectedBookingType === 'short_term' ? 'short' : 'long', salary, minWageInfo || undefined) : null;
  const isInvalidRate = !!salaryError;
  const minimumRate = Number(minWageInfo?.minimum_rate ?? (selectedBookingType === 'short_term' ? 600 : 6500));
  const maximumRate = Number(minWageInfo?.maximum_rate ?? (selectedBookingType === 'short_term' ? PART_TIME_MAX_RATE : FULL_TIME_MAX_RATE));


  const modalContent = (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateX: slideAnim }],
          paddingTop: Math.max(insets.top, 14),
          paddingBottom: Math.max(insets.bottom, 14),
        },
      ]}
    >
      {/* Global Aligned Header Matching Chat Screen */}
      <View style={styles.header}>
        <Pressable onPress={handleBack} disabled={submitting} style={styles.backBtn} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
        </Pressable>

        <View style={styles.headerTitleCenter}>
          <Text style={styles.headerTitle}>{readOnly ? 'Booking Details' : 'Booking Offer'}</Text>
        </View>

        <View style={styles.headerRight}>
          <Image source={logoSource} style={styles.logo} resizeMode="contain" />
        </View>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {!readOnly && (
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              {uiText("Step")} {offerStep} {uiText("of")} {OFFER_STEPS.length}
            </Text>
            <View style={styles.progressRow}>
              {OFFER_STEPS.map((item, index) => {
                const isCompletedOrActive = index < offerStep;
                const isCurrent = index + 1 === offerStep;
                return (
                  <Pressable
                    key={item.label}
                    accessibilityRole="button"
                    accessibilityLabel={`Step ${index + 1}: ${item.label}`}
                    accessibilityState={{ selected: isCurrent, disabled: index + 1 >= offerStep || submitting }}
                    disabled={index + 1 >= offerStep || submitting}
                    onPress={() => goToStep((index + 1) as BookingOfferStep)}
                    style={styles.progressItem}
                  >
                    <View style={[styles.progressBar, isCompletedOrActive && styles.progressBarActive]} />
                    <Text style={[styles.progressLabel, isCurrent && styles.progressLabelActive]}>
                      {uiText(item.label)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}
        <ScrollView
          ref={scrollRef}
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {!readOnly && offerStep < 4 && (
            <View style={styles.workerCard}>
              <ProfileAvatar uri={contactAvatar} name={contactName} size={42} />
              <View style={styles.workerTextCol}>
                <Text style={styles.workerName} numberOfLines={1}>{contactName}</Text>
                <Text style={styles.kasambahaySub}>
                  {contactRole}
                  {selectedBookingType ? ` · ${selectedBookingType === 'short_term' ? uiText("Part-time") : uiText("Full-time")}` : ''}
                </Text>
              </View>
            </View>
          )}

          {!readOnly && (
            <View style={styles.stepIntro} accessibilityLiveRegion="polite">
              <Text style={styles.stepTitle}>
                {offerStep === 1 && userRole === 'kasambahay' ? 'Which services will you offer?' : currentStep.title}
              </Text>
            </View>
          )}

          {/* Step 1: Service */}
          {!readOnly && offerStep === 1 && (
            <>
              <View style={styles.formGroup}>
                <View style={styles.serviceGrid}>
                  {SERVICE_CHOICES.map(item => {
                    const selected = serviceCategory.includes(item.id);
                    return (
                      <Pressable
                        key={item.id}
                        disabled={submitting}
                        accessibilityRole="button"
                        accessibilityState={{ selected }}
                        style={[
                          styles.serviceChoice,
                          selected && styles.choiceActive,
                          fieldErrors.service && styles.choiceError,
                        ]}
                        onPress={() => {
                          setServiceCategory(current => (current.includes(item.id) ? [] : [item.id]));
                          setFieldErrors(prev => ({ ...prev, service: false }));
                        }}
                      >
                        {item.id === 'Cleaning' ? (
                          <MaterialCommunityIcons name="broom" size={26} color="#1A1A1A" />
                        ) : item.id === 'Child_care' ? (
                          <MaterialCommunityIcons name="baby-face-outline" size={26} color="#1A1A1A" />
                        ) : item.id === 'Cooking' ? (
                          <MaterialCommunityIcons name="pot-steam-outline" size={26} color="#1A1A1A" />
                        ) : item.id === 'Caregiver' ? (
                          <Ionicons name="heart-outline" size={24} color="#1A1A1A" />
                        ) : item.id === 'Laundry' ? (
                          <MaterialCommunityIcons name="washing-machine" size={26} color="#1A1A1A" />
                        ) : (
                          <Ionicons name="home-outline" size={24} color="#1A1A1A" />
                        )}
                        <Text style={[styles.choiceText, selected && styles.choiceTextActive]}>
                          {uiText(item.label)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>{uiText("ENGAGEMENT")}</Text>
                <View style={styles.typeSelectorRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={uiText("Part-time / Daily")}
                    accessibilityState={{ selected: selectedBookingType === 'short_term' }}
                    disabled={submitting}
                    style={[
                      styles.termChoice,
                      selectedBookingType === 'short_term' && styles.choiceActive,
                      fieldErrors.engagement && styles.choiceError,
                    ]}
                    onPress={() => {
                      if (selectedBookingType !== 'short_term') {
                        setSalary(''); setWorkHours(''); setSelectedShift(null); setSelectedDays([]); setEndDate(''); setOngoing(false);
                        setSelectedBookingType('short_term');
                        setFieldErrors(prev => ({ ...prev, engagement: false }));
                      }
                    }}
                  >
                    <View style={styles.choiceHeaderRow}>
                      <Ionicons name="time-outline" size={18} color="#1A1A1A" />
                      <Text style={[styles.termChoiceText, selectedBookingType === 'short_term' && styles.choiceTextActive]}>
                        {uiText("Part-time / Daily")}
                      </Text>
                    </View>
                    <Text style={[styles.choiceSubtext, selectedBookingType === 'short_term' && styles.choiceSubtextActive]}>
                      {uiText("1–7 days · Daily pay")}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={uiText("Full-time / Monthly")}
                    accessibilityState={{ selected: selectedBookingType === 'long_term' }}
                    disabled={submitting}
                    style={[
                      styles.termChoice,
                      selectedBookingType === 'long_term' && styles.choiceActive,
                      fieldErrors.engagement && styles.choiceError,
                    ]}
                    onPress={() => {
                      if (selectedBookingType !== 'long_term') {
                        setSalary(''); setWorkHours(''); setSelectedShift(null); setSelectedDays([]); setEndDate(''); setOngoing(false);
                        setSelectedBookingType('long_term');
                        setFieldErrors(prev => ({ ...prev, engagement: false }));
                      }
                    }}
                  >
                    <View style={styles.choiceHeaderRow}>
                      <Ionicons name="calendar-outline" size={18} color="#1A1A1A" />
                      <Text style={[styles.termChoiceText, selectedBookingType === 'long_term' && styles.choiceTextActive]}>
                        {uiText("Full-time / Monthly")}
                      </Text>
                    </View>
                    <Text style={[styles.choiceSubtext, selectedBookingType === 'long_term' && styles.choiceSubtextActive]}>
                      {uiText("30+ days · Monthly pay")}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>{uiText("WORK SETUP")}</Text>
                <View style={styles.typeSelectorRow}>
                  {(['stay_in', 'stay_out'] as const).map(value => {
                    const selected = workSetup === value;
                    return (
                      <Pressable
                        key={value}
                        accessibilityRole="button"
                        accessibilityLabel={uiText(workSetupLabel(value))}
                        accessibilityState={{ selected }}
                        disabled={submitting}
                        style={[
                          styles.setupChoice,
                          selected && styles.choiceActive,
                          fieldErrors.workSetup && styles.choiceError,
                        ]}
                        onPress={() => {
                          setWorkSetup(value);
                          setFieldErrors(prev => ({ ...prev, workSetup: false }));
                        }}
                      >
                        <View style={styles.choiceHeaderRow}>
                          <Ionicons
                            name={value === 'stay_in' ? 'home-outline' : 'footsteps-outline'}
                            size={18}
                            color="#1A1A1A"
                          />
                          <Text style={[styles.setupChoiceText, selected && styles.choiceTextActive]}>
                            {uiText(workSetupLabel(value))}
                          </Text>
                        </View>
                        <Text style={[styles.choiceSubtext, selected && styles.choiceSubtextActive]}>
                          {value === 'stay_in' ? uiText("Live-in") : uiText("Goes home")}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            </>
          )}

          {/* Step 2: Schedule */}
          {!readOnly && offerStep === 2 && (
            <WorkScheduleFields
              bookingType={selectedBookingType || 'long_term'}
              startDate={startDate}
              endDate={endDate}
              workHours={workHours}
              days={selectedDays}
              shift={selectedShift}
              errors={fieldErrors}
              onStartDate={val => {
                setStartDate(val);
                if (val) setFieldErrors(prev => ({ ...prev, startDate: false }));
              }}
              onEndDate={val => {
                setEndDate(val);
                if (val) setFieldErrors(prev => ({ ...prev, endDate: false }));
              }}
              onWorkHours={val => {
                setWorkHours(val);
                if (val) setFieldErrors(prev => ({ ...prev, workHours: false }));
              }}
              onDays={val => {
                setSelectedDays(val);
                if (val.length > 0) setFieldErrors(prev => ({ ...prev, days: false }));
              }}
              onShift={value => {
                setSelectedShift(value);
                const preset = WORK_SHIFTS.find(item => item.value === value);
                if (preset) {
                  setWorkHours(preset.hours);
                  setFieldErrors(prev => ({ ...prev, workHours: false }));
                }
              }}
              onBookingType={type => {
                if (type !== selectedBookingType) {
                  setSalary(''); setWorkHours(''); setSelectedShift(null); setSelectedDays([]); setEndDate(''); setOngoing(false);
                  setSelectedBookingType(type);
                  setFieldErrors(prev => ({ ...prev, engagement: false }));
                }
              }}
              ongoing={ongoing}
              onOngoing={val => {
                setOngoing(val);
                if (val) setFieldErrors(prev => ({ ...prev, endDate: false }));
              }}
              disabled={!visible || submitting}
            />
          )}

          {/* Step 3: Location */}
          {!readOnly && offerStep === 3 && (
            <>
              <View style={styles.formGroup}>
                <View style={styles.locationHeaderRow}>
                  <Text style={styles.fieldLabel}>{uiText("WORK ADDRESS")}</Text>
                  {user && (user.barangay || user.city) ? (
                    <Pressable
                      accessibilityRole="button"
                      disabled={submitting || address.loadingLocations}
                      style={[styles.useProfileAddressBtn, (submitting || address.loadingLocations) && styles.disabledBtn]}
                      hitSlop={8}
                      onPress={() => {
                        if (!submittingRef.current && !address.loadingLocations) address.applyProfileAddress(user);
                      }}
                    >
                      <Ionicons name="location" size={13} color="#EA580C" />
                      <Text style={styles.useProfileAddressText}>{uiText('Use Profile Address')}</Text>
                    </Pressable>
                  ) : null}
                </View>
                <WorkLocationFields form={address} disabled={submitting} errors={fieldErrors} />
              </View>
              <View style={styles.formGroup}>
                <Text style={styles.fieldLabel}>
                  {selectedBookingType === 'short_term' ? 'AGREED DAILY RATE' : 'AGREED MONTHLY SALARY'}
                </Text>
                <View style={[styles.inputBox, (fieldErrors.salary || isInvalidRate) && styles.inputBoxInvalid]}>
                  <Text style={[styles.currencyPrefix, (fieldErrors.salary || isInvalidRate) && { color: '#DC2626' }]}>₱</Text>
                  <TextInput
                    accessibilityLabel={selectedBookingType === 'short_term' ? 'Daily rate' : 'Monthly salary'}
                    style={styles.inputText}
                    value={formatRateInput(salary)}
                    onBlur={() => { if (formatRate(salary) !== 'Rate not provided') setSalary(formatRate(salary, '').replace(/,/g, '')); }}
                    onChangeText={text => {
                      setSalary(text.replace(/,/g, ''));
                      if (text.trim()) setFieldErrors(prev => ({ ...prev, salary: false }));
                    }}
                    editable={!submitting}
                    keyboardType="decimal-pad"
                    placeholder="Enter amount"
                    placeholderTextColor="#9CA3AF"
                  />
                  <Text style={styles.rateUnitSuffix}>
                    {selectedBookingType === 'short_term' ? uiText("/ day") : uiText("/ month")}
                  </Text>
                </View>
                <Text style={styles.helperText}>
                  {uiText('Allowed range: {minimum} – {maximum} / {period} ({engagement})', {
                    minimum: formatRate(minimumRate), maximum: formatRate(maximumRate),
                    period: uiText(selectedBookingType === 'short_term' ? 'day' : 'month'),
                    engagement: uiText(selectedBookingType === 'short_term' ? 'Part-time / Daily' : 'Full-time / Monthly · RA 10361'),
                  })}
                </Text>
                <Text style={styles.helperText}>{uiText('Direct payment between Homeowner and Kasambahay · ₱0.00 SerbiSure fee.')}</Text>
                {isInvalidRate && (
                  <Text style={[styles.helperText, styles.invalidRateHint]}>
                    {uiText(salaryError?.message || 'Please enter a valid compensation amount.')}
                  </Text>
                )}
              </View>
            </>
          )}

          {/* Step 4: Review */}
          {(readOnly || offerStep === 4) && (
            <>
              <BookingOfferReview
                serviceCategory={serviceCategory}
                workSetup={workSetup || 'stay_out'}
                bookingType={selectedBookingType || 'long_term'}
                startDate={startDate}
                endDate={selectedBookingType === 'short_term' ? (endDate || startDate) : endDate}
                ongoing={ongoing}
                workHours={workHours}
                days={selectedDays}
                region={region}
                location={previewLocation}
                salary={salary}
                contactName={contactName}
                contactRole={contactRole}
                contactAvatar={contactAvatar}
                bookingId={bookingId || initialDetails?.bookingId || initialDetails?.id}
                passUrl={passUrl}
                isConfirmed={isConfirmed}
                isDeclined={isDeclined}
                isAcquired={isAcquired}
                onEdit={readOnly ? undefined : goToStep}
                disabled={submitting}
              />

              {!readOnly && (
                <>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: agreedTerms }}
                    style={styles.checkboxRow}
                    onPress={() => {
                      if (!agreedTerms) {
                        setShowTermsModal(true);
                      } else {
                        setAgreedTerms(false);
                      }
                    }}
                    disabled={submitting}
                  >
                    <View style={[styles.checkbox, agreedTerms && styles.checkboxActive, fieldErrors.terms && styles.checkboxError]}>
                      {agreedTerms && <Ionicons name="checkmark" size={15} color="#0D0D11" />}
                    </View>
                    <Text style={styles.checkboxText}>
                      {uiText("I agree to the ")}
                      <Text
                        style={[styles.checkboxBoldText, { textDecorationLine: 'underline' }]}
                        onPress={() => setShowTermsModal(true)}
                      >
                        {uiText("SerbiSure Terms of Service")}
                      </Text>
                      {uiText(" and confirm these booking offer details")}
                    </Text>
                  </Pressable>

                  <PrivacyPolicyModal
                    visible={showTermsModal}
                    document="terms"
                    mode="consent"
                    onClose={() => setShowTermsModal(false)}
                    onAccept={() => {
                      setAgreedTerms(true);
                      setShowTermsModal(false);
                      setFieldErrors(prev => ({ ...prev, terms: false }));
                    }}
                    onDecline={() => {
                      setAgreedTerms(false);
                      setShowTermsModal(false);
                    }}
                  />
                </>
              )}
            </>
          )}
        </ScrollView>

        {readOnly && canRespond && !isConfirmed && !isDeclined && !isAcquired && acceptanceExpired &&
          <Text style={{ color: '#92400E', paddingHorizontal: 20, paddingVertical: 8 }}>{uiText(PASSED_SCHEDULE_MESSAGE)}</Text>}
        {/* Action Button Footer */}
        <View style={styles.footerContainer}>
          <View style={styles.footerDivider} />
          {readOnly ? (
            isAcquired ? (
              <View style={[styles.pendingBanner, { backgroundColor: '#F6F5F2' }]}>
                <Ionicons name="lock-closed" size={18} color="#0D0D11" style={{ marginRight: 6 }} />
                <Text style={styles.pendingBannerText}>{uiText("Job filled")}</Text>
              </View>
            ) : isDeclined ? (
              <View style={[styles.pendingBanner, { backgroundColor: '#FF3E3E' }]}>
                <Ionicons name="close-circle" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={[styles.pendingBannerText, { color: '#FFFFFF' }]}>{uiText("Declined")}</Text>
              </View>
            ) : isConfirmed ? (
              <View style={styles.confirmedBanner}>
                <Text style={styles.confirmedBannerText}>{uiText("Booking Confirmed")}</Text>
              </View>
            ) : canRespond ? (
              <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                <Pressable
                  disabled={submitting} style={({ pressed }) => [styles.declineBtn, pressed && styles.pressedBtn]}
                  onPress={() => {
                    Alert.alert(
                      'Decline Booking Offer',
                      `Are you sure you want to decline this booking offer from ${contactName}? The offer status will be updated.`,
                      [
                        { text: 'Keep Reviewing', style: 'cancel' },
                        {
                          text: 'Decline Offer',
                          style: 'destructive',
                          onPress: () => {
                            runResponse(onKasambahayDecline);
                          },
                        },
                      ]
                    );
                  }}
                >
                  <Ionicons name="close-circle-outline" size={18} color="#000000" style={{ marginRight: 6 }} />
                  <Text style={styles.declineBtnText}>{uiText("Decline")}</Text>
                </Pressable>

                <Pressable
                  disabled={submitting || acceptanceExpired} style={({ pressed }) => [styles.agreeBtn, { flex: 1 }, acceptanceExpired && { backgroundColor: '#9CA3AF' }, pressed && styles.pressedBtn]}
                  onPress={() => { if (!isAcceptanceExpired(initialDetails)) confirmBookingAcceptance(selectedBookingType || 'long_term', uiText, () => runResponse(onKasambahayConfirm)); }}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#FFFFFF" style={{ marginRight: 6 }} />
                  <Text style={styles.agreeBtnText}>{uiText("Accept")}</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.pendingBanner}>
                <Ionicons name="time-outline" size={18} color="#000000" style={{ marginRight: 6 }} />
                <Text style={styles.pendingBannerText}>{uiText("Pending")}</Text>
              </View>
            )
          ) : (
            <View style={styles.footerRow}>
              <Pressable accessibilityRole="button" disabled={submitting} onPress={handleBack} style={styles.wizardBack}>
                <Text style={styles.wizardBackText}>{offerStep === 1 ? uiText("Cancel") : uiText("Back")}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={submitting || (offerStep === 3 && policyLoading)}
                style={({ pressed }) => [
                  styles.confirmBtn,
                  pressed && styles.pressedBtn,
                  (submitting || (offerStep === 3 && policyLoading)) && styles.disabledBtn
                ]}
                onPress={offerStep === 4 ? handleConfirm : handleNext}
              >
                {(submitting || (offerStep === 3 && policyLoading)) && (
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 6 }} />
                )}
                <Text style={styles.confirmBtnText}>
                  {submitting
                    ? 'Sending…'
                    : offerStep === 3 && policyLoading
                      ? 'Checking pay…'
                      : offerStep === 4
                        ? 'Send Offer'
                        : uiText("Next")}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
      {pendingReview && (
        <ReviewModal
          visible
          bookingId={pendingReview.booking_id}
          revieweeName={pendingReview.reviewee_name}
          token={token || user.token}
          isMandatory
          onClose={() => setPendingReview(null)}
          onSuccess={() => setPendingReview(null)}
        />
      )}
    </Animated.View>
  );

  if (!useNativeModal) {
    if (!modalVisible) return null;
    return (
      <View style={[StyleSheet.absoluteFill, { zIndex: 9999, elevation: 9999, backgroundColor: '#F6F5F2' }]}>
        {modalContent}
      </View>
    );
  }

  return (
    <Modal
      visible={modalVisible}
      animationType="none"
      transparent={false}
      statusBarTranslucent
      onRequestClose={handleBack}
    >
      <View style={styles.modalRoot}>
        {modalContent}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    backgroundColor: '#F6F5F2',
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: '#F6F5F2',
    width: '100%',
    height: '100%',
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: '#F6F5F2',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1A1A1A',
    fontFamily: THEME.typography.fontFamily.display,
  },
  headerRight: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  logo: {
    height: 36,
    width: 36,
  },
  progressContainer: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 16,
  },
  progressText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 10,
  },
  progressRow: {
    flexDirection: 'row',
    gap: 8,
  },
  progressItem: {
    flex: 1,
    alignItems: 'center',
  },
  progressBar: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#DCDFE4',
    marginBottom: 6,
  },
  progressBarActive: {
    backgroundColor: ACCENT_PEACH,
  },
  progressLabel: {
    color: '#8E8E93',
    fontSize: 10.5,
    textAlign: 'center',
    fontWeight: '500',
  },
  progressLabelActive: {
    color: '#1A1A1A',
    fontWeight: '800',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 24,
  },
  workerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  workerTextCol: {
    flex: 1,
  },
  workerName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  kasambahaySub: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '500',
    marginTop: 2,
  },
  stepIntro: {
    marginBottom: 16,
  },
  stepTitle: {
    color: '#1A1A1A',
    fontSize: 22,
    fontWeight: '800',
    fontFamily: THEME.typography.fontFamily.display,
  },
  errorCard: {
    flexDirection: 'row',
    gap: 8,
    padding: 12,
    borderRadius: 14,
    backgroundColor: '#FEF2F2',
    marginBottom: 16,
  },
  errorText: {
    flex: 1,
    color: '#B91C1C',
    fontSize: 13,
    lineHeight: 19,
  },
  formGroup: {
    marginBottom: 16,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6B7280',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  serviceGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  serviceChoice: {
    width: '31%',
    flexGrow: 1,
    minHeight: 80,
    padding: 12,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  choiceActive: {
    backgroundColor: ACCENT_PEACH,
  },
  choiceError: {
    borderColor: '#EF4444',
  },
  choiceText: {
    color: '#1A1A1A',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  choiceTextActive: {
    fontWeight: '800',
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 10,
  },
  termChoice: {
    flex: 1,
    minHeight: 58,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'transparent',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  termChoiceText: {
    color: '#1A1A1A',
    fontSize: 12.5,
    fontWeight: '700',
  },
  setupChoice: {
    flex: 1,
    minHeight: 58,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'transparent',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  setupChoiceText: {
    color: '#1A1A1A',
    fontSize: 12.5,
    fontWeight: '700',
  },
  choiceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  choiceSubtext: {
    color: '#6B7280',
    fontSize: 11,
    fontWeight: '500',
    textAlign: 'center',
  },
  choiceSubtextActive: {
    color: '#1F2937',
  },
  locationHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  useProfileAddressBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  useProfileAddressText: {
    color: '#EA580C',
    fontSize: 11.5,
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontWeight: '700',
  },
  inputBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1.5,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  inputBoxInvalid: {
    borderColor: '#EF4444',
  },
  inputText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  currencyPrefix: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginRight: 6,
  },
  rateUnitSuffix: {
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
    marginLeft: 6,
  },
  helperText: {
    color: THEME.colors.textSecondary,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 6,
  },
  invalidRateHint: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 5,
    paddingHorizontal: 2,
  },
  policyLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  retryPolicy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 8,
  },
  retryText: {
    color: '#EA580C',
    fontSize: 12,
    fontWeight: '600',
  },
  footerContainer: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    backgroundColor: '#F6F5F2',
  },
  footerDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: 14,
  },
  footerRow: {
    flexDirection: 'row',
    gap: 12,
  },
  wizardBack: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  wizardBackText: {
    color: '#1A1A1A',
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 15,
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 1,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 25,
    backgroundColor: '#111315',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  confirmBtnText: {
    color: '#FFFFFF',
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 15,
    fontWeight: '800',
  },
  agreeBtn: {
    flexDirection: 'row',
    backgroundColor: '#00B13B',
    borderRadius: 25,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agreeBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  declineBtn: {
    flex: 0.45,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  declineBtnText: {
    color: '#1A1A1A',
    fontWeight: '700',
    fontSize: 14,
    fontFamily: THEME.typography.fontFamily.mainBold,
  },
  pressedBtn: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  disabledBtn: {
    opacity: 0.6,
  },
  confirmedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#00B13B',
    borderRadius: 25,
    paddingVertical: 14,
  },
  confirmedBannerText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  pendingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 25,
    paddingHorizontal: 12,
    paddingVertical: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  pendingBannerText: {
    flex: 1,
    flexShrink: 1,
    color: '#1A1A1A',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    marginBottom: 20,
    paddingHorizontal: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#9CA3AF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: '#FFB380',
    borderColor: '#FFB380',
  },
  checkboxError: {
    borderColor: '#EF4444',
  },
  checkboxText: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 17,
  },
  checkboxBoldText: {
    color: '#0D0D11',
    fontWeight: '700',
  },
});
