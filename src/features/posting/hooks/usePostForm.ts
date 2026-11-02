import { toggleService, SERVICE_CHOICES, WORK_SHIFTS, type WorkShift } from '../../bookings/engagementForm';
import { publicPostHours } from '../workingHours';
import { fetchMinimumWage, type MinimumWageData } from '../../bookings/api/bookingApi';
import { validatePostingRate } from '../validation';
import { useState, useRef, useEffect } from 'react';
import { Animated, Easing, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { POSTING_CONFIG, buildPostDescription, buildPostLocation } from '../postingConfig';
import { submitPost, type PublicPostingPayload } from '../api/postingApi';

import { useUser } from '../../auth/session/UserContext';
import { useLanguage } from '../../../shared/localization/LanguageContext';

import { useWorkLocation } from '../../bookings/hooks/useWorkLocation';
import { workLocationError } from '../../bookings/workLocation';

function generateUUIDv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

import type { PostScreenProps } from '../types';

export function usePostForm({ visible, onClose, mode = 'job', token, onOpenVerification }: PostScreenProps) {
  const config = POSTING_CONFIG[mode];
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { tr } = useLanguage();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});

  const effectiveToken = token || user?.token || null;

  // Form State
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [engagementType, setEngagementType] = useState<'short' | 'long' | null>(null);
  const [setupPreference, setSetupPreference] = useState<'stay-out' | 'stay-in' | null>(null);
  const [selectedTime, setSelectedTime] = useState<WorkShift | null>(null);

  const [workHours, setWorkHours] = useState('');

  const address = useWorkLocation(visible);
  const { selectedRegion, selectedProvince, selectedCity, selectedBarangay, streetAddress, floorUnit, zipcode } = address;

  const [instructions, setInstructions] = useState('');
  const [wagePolicy, setWagePolicy] = useState<MinimumWageData | null>(null);
  const [offerAmount, setOfferAmount] = useState<string>('');
  const [agreedTerms, setAgreedTerms] = useState(false);
  const [postedSuccess, setPostedSuccess] = useState(false);
  const [isPosting, setIsPosting] = useState(false);
  const [showVerificationRequired, setShowVerificationRequired] = useState(false);
  const [showBookingRestricted, setShowBookingRestricted] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string>('Unverified');
  const requestVersion = useRef(0);
  const successTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetForm = () => {
    requestVersion.current++;
    if (successTimer.current) clearTimeout(successTimer.current);
    setIsPosting(false);
    setPostedSuccess(false);
    setShowVerificationRequired(false);
    setShowBookingRestricted(false);
    setStep(1);
    setFieldErrors({});
    setSelectedServices([]);
    setEngagementType(null);
    setSetupPreference(null);
    setSelectedTime(null);
    setWorkHours('');
    address.resetWorkLocation();
    setInstructions('');
    setOfferAmount('');
    setAgreedTerms(false);
  };

  useEffect(() => {
    if (visible) {
      resetForm();
    } else {
      setIsPosting(false);
      setPostedSuccess(false);
      setShowVerificationRequired(false);
      setShowBookingRestricted(false);
    }
    return () => {
      requestVersion.current++;
      if (successTimer.current) clearTimeout(successTimer.current);
    };
  }, [visible, mode, effectiveToken]);

  const applyUserProfileAddress = () => { if (user) address.applyProfileAddress(user); };

  // Animation values for Logo Loader
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    if (postedSuccess) {
      scaleAnim.setValue(0.7);
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 5,
        tension: 100,
        useNativeDriver: true,
      }).start();

      rotateAnim.setValue(0);
      const animation = Animated.loop(
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      );
      animation.start();

      return () => animation.stop();
    }
  }, [postedSuccess]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const services = SERVICE_CHOICES;

  const handleToggleService = (id: string) => {
    setSelectedServices(current => current.includes(id) ? [] : [id]);
    setFieldErrors(prev => ({ ...prev, service: false }));
  };

  // Clear field errors reactively
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
  useEffect(() => {
    if (offerAmount.trim()) setFieldErrors(prev => ({ ...prev, rate: false }));
  }, [offerAmount]);

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const previousMode = useRef(mode);
  useEffect(() => {
    if (previousMode.current !== mode) {
      previousMode.current = mode;
      resetForm();
    }
  }, [mode]);

  const handleEngagementChange = (type: 'short' | 'long') => {
    if (type !== engagementType) {
      setSelectedTime(null); setWorkHours('');
    }
    setEngagementType(type);
    if (type === 'short') setSetupPreference('stay-out');
    setFieldErrors(prev => ({ ...prev, engagement: false }));
  };

  const handleSetupPreference = (pref: 'stay-out' | 'stay-in') => {
    setSetupPreference(pref);
    setFieldErrors(prev => ({ ...prev, setup: false }));
  };

  // Construct emphasized auto-message
  const getSelectedRoleLabel = () => {
    if (selectedServices.length === 0) return config.defaultService;
    if (selectedServices.includes('All-around')) return 'All-around';
    const labels = selectedServices.map(
      (s) => services.find((x) => x.id === s)?.label || s.replace(/_/g, ' ')
    );
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return `${labels[0]} & ${labels[1]}`;
    return `${labels.slice(0, -1).join(', ')} & ${labels[labels.length - 1]}`;
  };

  const getTimeLabel = () => {
    const shift = WORK_SHIFTS.find(item => item.value === selectedTime);
    return engagementType === 'short' && shift ? `${shift.label.toLowerCase()} (${shift.hours})` : workHours;
  };

  const scheduleTerms = () => {
    const isShort = engagementType === 'short';
    const effectiveHours = isShort && selectedTime && selectedTime !== 'custom'
      ? (WORK_SHIFTS.find(s => s.value === selectedTime)?.hours || workHours)
      : workHours;
    return publicPostHours(effectiveHours);
  };

  const getLocationLabel = () => buildPostLocation({
    street: config.role === 'kasambahay' ? undefined : streetAddress,
    floorUnit: config.role === 'kasambahay' ? undefined : floorUnit,
    barangay: selectedBarangay?.name,
    city: selectedCity?.name,
    zipcode: config.role === 'kasambahay' ? undefined : zipcode,
  });

  const buildAutoMessage = () => {
    const roleText = getSelectedRoleLabel();
    const locText = getLocationLabel();
    const setupText = engagementType === 'short' ? 'stay-out'
      : setupPreference === 'stay-in' ? 'stay-in' : 'stay-out';

    return buildPostDescription(mode, {
      service: roleText || config.defaultService, location: locText, setup: setupText,
      time: getTimeLabel(), shortTerm: engagementType === 'short', instructions, rate: offerAmount,
    });
  };

  useEffect(() => {
    let current = true;
    setWagePolicy(null);
    if (engagementType) {
      void fetchMinimumWage(effectiveToken || undefined, engagementType === 'long' ? 'long_term' : 'short_term',
        selectedCity?.name || '', selectedRegion?.displayName || selectedRegion?.name || '').then(policy => {
          if (current) setWagePolicy(policy);
        });
    }
    return () => { current = false; };
  }, [effectiveToken, engagementType, selectedRegion?.name, selectedRegion?.displayName, selectedCity?.name]);

  const handleNext = async () => {
    if (isPosting) return;
    if (step === 1) {
      const errors: Record<string, boolean> = {};
      if (selectedServices.length === 0) errors.service = true;
      if (!engagementType) errors.engagement = true;
      if (!setupPreference) errors.setup = true;
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      setFieldErrors({});
      setStep(2);
    } else if (step === 2) {
      const errors: Record<string, boolean> = {};
      if (!selectedRegion) errors.region = true;
      if (!selectedProvince) errors.province = true;
      if (!selectedCity) errors.city = true;
      if (!selectedBarangay) errors.barangay = true;
      if (config.role !== 'kasambahay') {
        if (!streetAddress.trim()) errors.street = true;
        if (!zipcode.trim()) errors.zipcode = true;
      }

      const num = Number(offerAmount.replace(/[^0-9.]/g, ''));
      const minRate = wagePolicy ? Number(wagePolicy.minimum_rate) : null;
      if (!offerAmount.trim() || !Number.isFinite(num) || num <= 0 || (minRate !== null && num < minRate)) {
        errors.rate = true;
      }
      try {
        scheduleTerms();
      } catch (error) {
        errors.schedule = true;
        setFieldErrors(errors);
        Alert.alert(tr('Work hours'), tr(error instanceof Error ? error.message : 'Choose your working hours before continuing.'));
        return;
      }

      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
      setFieldErrors({});
      setStep(3);
    } else {
      if (!agreedTerms) {
        setFieldErrors({ terms: true });
        Alert.alert('Terms Required', config.missingTerms);
        return;
      }

      setIsPosting(true);
      setShowVerificationRequired(false);
      setShowBookingRestricted(false);
      const request = ++requestVersion.current;

      try {
        const autoMessage = buildAutoMessage();

        const schedule = scheduleTerms();

        const payload: PublicPostingPayload = {
          booking_type: engagementType === 'short' ? 'short_term' : 'long_term',
          work_setup: engagementType === 'short' ? 'stay_out'
            : setupPreference === 'stay-in' ? 'stay_in' : 'stay_out',
          service_category: selectedServices,
          ...schedule,
          region: selectedRegion?.displayName || selectedRegion?.name,
          province: selectedProvince?.name,
          city: selectedCity?.name,
          barangay: selectedBarangay?.name,
          street: config.role === 'kasambahay' ? '' : streetAddress.trim(),
          floor_number: config.role === 'kasambahay' ? undefined : (floorUnit.trim() || undefined),
          zip_code: zipcode.trim(),
          special_instruction: autoMessage,
          rate_amount: offerAmount.trim(),
          rate_period: engagementType === 'long' ? 'month' : 'day',
        };

        const response = await submitPost(effectiveToken, payload, generateUUIDv4());
        if (request !== requestVersion.current) return;

        if (!response.ok) {
          const errorData = await response.json();
          if (request !== requestVersion.current) return;
          console.log('[PostJob] Server response:', errorData);

          if (errorData?.code === 'booking_restricted' || errorData?.is_restricted === true) {
            setIsPosting(false);
            setShowBookingRestricted(true);
            return;
          }

          if (errorData?.code === 'account_not_verified') {
            setIsPosting(false);
            setVerificationStatus(errorData?.verification_status || (mode === 'service' ? user?.verificationStatus : null) || 'Unverified');
            setShowVerificationRequired(true);
            return;
          }

          let errorMsg: string = config.errorMessage;
          if (typeof errorData === 'string') {
            errorMsg = errorData;
          } else if (errorData?.detail) {
            errorMsg = String(errorData.detail);
          } else if (typeof errorData === 'object') {
            const msgs: string[] = [];
            for (const [k, v] of Object.entries(errorData)) {
              const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
              const list = Array.isArray(v) ? v : [v];
              list.forEach(m => msgs.push(`• ${tr(label)}: ${tr(String(m))}`));
            }
            if (msgs.length > 0) errorMsg = msgs.join('\n');
          }

          Alert.alert('Unable to Post', errorMsg);
          setIsPosting(false);
          return;
        }

        setPostedSuccess(true);
        successTimer.current = setTimeout(() => {
          if (request !== requestVersion.current) return;
          setPostedSuccess(false);
          setIsPosting(false);
          resetForm();
          onClose();
        }, 1800);
      } catch (error: any) {
        if (request !== requestVersion.current) return;
        console.log('[PostJob] Network error:', error);
        Alert.alert('Network Error', error?.message || 'Failed to connect to the server.');
        setIsPosting(false);
      }
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((prev) => (prev - 1) as 1 | 2 | 3);
      setFieldErrors({});
    } else {
      handleClose();
    }
  };

  return {
    visible,
    onClose,
    mode,
    onOpenVerification,
    config,
    insets,
    user,
    step,
    fieldErrors,
    setFieldErrors,
    selectedServices,
    engagementType,
    setupPreference,
    setSetupPreference,
    handleSetupPreference,
    selectedTime,
    setSelectedTime,
    workHours, setWorkHours,
    address,
    ...address,
    instructions,
    setInstructions,
    wagePolicy,
    offerAmount,
    setOfferAmount,
    agreedTerms,
    setAgreedTerms,
    postedSuccess,
    isPosting,
    showVerificationRequired,
    setShowVerificationRequired,
    showBookingRestricted,
    setShowBookingRestricted,
    verificationStatus,
    applyUserProfileAddress,
    scaleAnim,
    spin,
    services,
    handleToggleService,
    handleClose,
    handleEngagementChange,
    getSelectedRoleLabel,
    getLocationLabel,
    buildAutoMessage,
    handleNext,
    handleBack,
  };
}

export type PostFormController = ReturnType<typeof usePostForm>;
