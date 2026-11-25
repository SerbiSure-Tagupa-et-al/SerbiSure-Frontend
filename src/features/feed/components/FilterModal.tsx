import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import THEME from '../../../shared/theme/theme';
import type { WorkSetup } from '../../bookings/workSetup';
import type { LocationScope } from '../locationFilter';
import { formatBarangayShort, RADIUS_OPTIONS, shortCityLabel } from '../locationFilter';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, Modal, TextInput, Dimensions, TouchableWithoutFeedback, KeyboardAvoidingView, Platform, Animated, PanResponder } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheetHandle } from '../../../shared/components/BottomSheetHandle';

const SCREEN_HEIGHT = Dimensions.get('window').height;

export interface FeedFilters {
  categories: string[];
  bookingType: string | null; // 'short_term' | 'long_term' | null
  workSetup?: WorkSetup | null;
  maxRate: number | null;
  ratePeriod?: 'day' | 'month';
  location: string;
  locationScope?: LocationScope;
  radiusKm?: number;
  originCity?: string;
  originBarangay?: string;
  sortBy: 'newest' | 'nearest' | 'rate_asc' | 'rate_desc';
}

export const DEFAULT_FILTERS: FeedFilters = {
  categories: [],
  bookingType: null,
  workSetup: null,
  maxRate: null,
  ratePeriod: 'day',
  location: '',
  locationScope: 'all',
  radiusKm: 5,
  originCity: '',
  originBarangay: '',
  sortBy: 'newest',
};

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: FeedFilters) => void;
  initialFilters: FeedFilters;
  mode: 'homeowner' | 'kasambahay'; // homeowner searches kasambahays; kasambahay searches jobs
  onPickLocation?: () => void;
}

export const CATEGORY_OPTIONS = ['All-around', 'Child Care', 'Cleaning', 'Cooking', 'Caregiver', 'Laundry'];

const BOOKING_TYPES = [
  { label: 'All Types', value: null },
  { label: 'Part-time', value: 'short_term' },
  { label: 'Full-time', value: 'long_term' },
];

export const RATE_PRESETS = [600, 800, 1000, 1500, 2000];

export const SORT_OPTIONS: { label: string; value: 'newest' | 'nearest'; icon?: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Newest first', value: 'newest', icon: 'time-outline' },
  { label: 'Nearest first', value: 'nearest', icon: 'navigate-outline' },
];

export function FilterModal({
  visible,
  onClose,
  onApply,
  initialFilters,
  mode,
  onPickLocation,
}: FilterModalProps) {
  const { tr: uiText } = useUiLanguage();
  const insets = useSafeAreaInsets();

  const [categories, setCategories] = useState<string[]>(initialFilters.categories || []);
  const [bookingType, setBookingType] = useState<string | null>(initialFilters.bookingType || null);
  const [workSetup, setWorkSetup] = useState<WorkSetup | null>(initialFilters.workSetup || null);
  const [ratePeriod, setRatePeriod] = useState<'day' | 'month'>(initialFilters.bookingType === 'long_term' ? 'month' : initialFilters.ratePeriod || 'day');
  const [maxRate, setMaxRate] = useState<number | null>(initialFilters.maxRate || null);
  const [customRateText, setCustomRateText] = useState<string>(
    initialFilters.maxRate ? String(initialFilters.maxRate) : ''
  );
  const [location, setLocation] = useState<string>(initialFilters.location || '');
  const [locationScope, setLocationScope] = useState<LocationScope>(initialFilters.locationScope || 'all');
  const [radiusKm, setRadiusKm] = useState<number>(initialFilters.radiusKm || 5);
  const [originCity, setOriginCity] = useState<string>(initialFilters.originCity || '');
  const [originBarangay, setOriginBarangay] = useState<string>(initialFilters.originBarangay || '');
  const [sortBy, setSortBy] = useState<'newest' | 'nearest' | 'rate_asc' | 'rate_desc'>(
    initialFilters.sortBy === 'nearest' ? 'nearest' : 'newest'
  );

  const panY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const currentTranslateY = useRef(SCREEN_HEIGHT);
  const gestureStartY = useRef(0);
  const isClosingRef = useRef(false);
  const scrollOffset = useRef(0);
  const contentHeight = useRef(0);
  const layoutHeight = useRef(0);
  const canScrollRef = useRef(false);

  useEffect(() => {
    const id = panY.addListener(({ value }) => {
      currentTranslateY.current = value;
    });
    return () => {
      panY.removeListener(id);
    };
  }, [panY]);

  const prevVisibleRef = useRef(false);

  const handleClose = useCallback(() => {
    if (isClosingRef.current) return;
    isClosingRef.current = true;
    onApply({
      categories,
      bookingType,
      workSetup,
      maxRate,
      ratePeriod: bookingType === 'long_term' ? 'month' : bookingType === 'short_term' ? 'day' : ratePeriod,
      location: location.trim(),
      locationScope,
      radiusKm,
      originCity,
      originBarangay,
      sortBy,
    });
    Animated.timing(panY, {
      toValue: SCREEN_HEIGHT,
      duration: 220,
      useNativeDriver: true,
    }).start(() => {
      onClose();
      panY.setValue(SCREEN_HEIGHT);
      currentTranslateY.current = SCREEN_HEIGHT;
      isClosingRef.current = false;
    });
  }, [onClose, onApply, panY, categories, bookingType, workSetup, maxRate, ratePeriod, location, locationScope, radiusKm, originCity, originBarangay, sortBy]);

  const handleRelease = useCallback((gestureState: { dy: number; vy: number }) => {
    const { dy, vy } = gestureState;
    if (dy > 80 || vy > 0.4 || currentTranslateY.current > 120) {
      handleClose();
    } else {
      Animated.spring(panY, {
        toValue: 0,
        damping: 24,
        stiffness: 260,
        mass: 0.8,
        overshootClamping: true,
        useNativeDriver: true,
      }).start();
    }
  }, [handleClose, panY]);

  // Sync state ONLY when modal transitions from closed to open
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      setCategories(initialFilters.categories || []);
      setBookingType(initialFilters.bookingType || null);
      setWorkSetup(initialFilters.workSetup || null);
      setRatePeriod(initialFilters.bookingType === 'long_term' ? 'month' : initialFilters.ratePeriod || 'day');
      setMaxRate(initialFilters.maxRate || null);
      setCustomRateText(initialFilters.maxRate ? String(initialFilters.maxRate) : '');
      setLocation(initialFilters.location || '');
      setLocationScope(initialFilters.locationScope || 'all');
      setRadiusKm(initialFilters.radiusKm || 5);
      setOriginCity(initialFilters.originCity || '');
      setOriginBarangay(initialFilters.originBarangay || '');
      setSortBy(initialFilters.sortBy === 'nearest' ? 'nearest' : 'newest');

      isClosingRef.current = false;
      currentTranslateY.current = SCREEN_HEIGHT;
      panY.setValue(SCREEN_HEIGHT);
      Animated.spring(panY, {
        toValue: 0,
        damping: 24,
        stiffness: 260,
        mass: 0.8,
        overshootClamping: true,
        useNativeDriver: true,
      }).start();
    }
    prevVisibleRef.current = visible;
  }, [visible, initialFilters, panY]);

  const headerPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
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
        panY.setValue(Math.max(0, rawY));
      },
      onPanResponderRelease: (_, gestureState) => {
        handleRelease(gestureState);
      },
      onPanResponderTerminate: (_, gestureState) => {
        handleRelease(gestureState);
      },
    })
  ).current;

  // Single unified PanResponder across the scrollable area
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
        if (gestureState.dy > 0 && scrollOffset.current <= 5) return true;
        if (!canScrollRef.current && gestureState.dy > 0) return true;
        return false;
      },
      onPanResponderGrant: () => {
        gestureStartY.current = currentTranslateY.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const rawY = gestureStartY.current + gestureState.dy;
        panY.setValue(Math.max(0, rawY));
      },
      onPanResponderRelease: (_, gestureState) => {
        handleRelease(gestureState);
      },
      onPanResponderTerminate: (_, gestureState) => {
        handleRelease(gestureState);
      },
    })
  ).current;

  const toggleCategory = (cat: string) => {
    setCategories((prev) => (prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]));
  };

  const handleBookingType = (bt: string | null) => {
    setBookingType(bt);
    const nextPeriod = bt === 'long_term' ? 'month' : bt === 'short_term' ? 'day' : ratePeriod;
    setRatePeriod(nextPeriod);
  };

  const handleWorkSetup = (ws: WorkSetup | null) => {
    setWorkSetup(ws);
  };

  const handlePeriodChange = (period: 'day' | 'month') => {
    setRatePeriod(period);
    setMaxRate(null);
    setCustomRateText('');
  };

  const handleRatePreset = (rate: number) => {
    const nextRate = maxRate === rate ? null : rate;
    setMaxRate(nextRate);
    setCustomRateText(nextRate ? String(nextRate) : '');
  };

  const handleCustomRateChange = (text: string) => {
    const cleaned = text.replace(/[^0-9]/g, '');
    setCustomRateText(cleaned);
    const nextRate = cleaned === '' ? null : parseInt(cleaned, 10);
    setMaxRate(nextRate);
  };

  const handleSortChange = (newSort: 'newest' | 'nearest' | 'rate_asc' | 'rate_desc') => {
    setSortBy(newSort);
  };

  const handleReset = () => {
    setCategories([]);
    setBookingType(null);
    setWorkSetup(null);
    setMaxRate(null);
    setCustomRateText('');
    setLocation('');
    setLocationScope(initialFilters.originBarangay && initialFilters.originCity ? 'radius' : initialFilters.originCity ? 'same_city' : 'all');
    setRadiusKm(5);
    setSortBy('newest');
  };

  const activeFilterCount =
    categories.length +
    (bookingType !== null ? 1 : 0) +
    (workSetup !== null ? 1 : 0) +
    (maxRate !== null ? 1 : 0) +
    (location.trim() !== '' ? 1 : 0) +
    (sortBy !== 'newest' ? 1 : 0);

  const backdropOpacity = panY.interpolate({
    inputRange: [0, SCREEN_HEIGHT * 0.5, SCREEN_HEIGHT],
    outputRange: [1, 0.5, 0],
    extrapolate: 'clamp',
  });

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <Animated.View style={[styles.modalBackdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={handleClose} />
        </Animated.View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrapper}
        >
          <Animated.View
            style={[
              styles.sheetContent,
              {
                paddingBottom: Math.max(insets.bottom, 24),
                transform: [{ translateY: panY }],
              },
            ]}
            {...panResponder.panHandlers}
          >
            {/* Swipable Handle & Header Area */}
            <View {...headerPanResponder.panHandlers}>
              <BottomSheetHandle onPress={handleClose} />

              {/* Header */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <Ionicons name="funnel-outline" size={22} color={THEME.colors.ink} style={{ marginRight: 8 }} />
                  <Text style={styles.title}>{uiText("Filter & Sort")}</Text>
                  {activeFilterCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{activeFilterCount}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>

            {/* Scrollable Filter Body */}
            <ScrollView
              style={styles.scrollBody}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              bounces={false}
              scrollEventThrottle={16}
              onScroll={(e) => {
                scrollOffset.current = e.nativeEvent.contentOffset.y;
              }}
              onContentSizeChange={(_, h) => {
                contentHeight.current = h;
                canScrollRef.current = layoutHeight.current > 0 && h > layoutHeight.current + 5;
              }}
              onLayout={(e) => {
                const h = e.nativeEvent.layout.height;
                layoutHeight.current = h;
                canScrollRef.current = contentHeight.current > 0 && contentHeight.current > h + 5;
              }}
            >
              {/* SECTION: Service Category */}
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>{uiText("SERVICE CATEGORY")}</Text>
                  {categories.length > 0 && (
                    <Pressable onPress={() => setCategories([])}>
                      <Text style={styles.clearSectionText}>{uiText("Clear")}</Text>
                    </Pressable>
                  )}
                </View>
                <View style={styles.chipGrid}>
                  {CATEGORY_OPTIONS.map((cat) => {
                    const isSelected = categories.includes(cat);
                    return (
                      <Pressable
                        key={cat}
                        style={[styles.chip, isSelected && styles.chipActive]}
                        onPress={() => toggleCategory(cat)}
                      >
                        <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>
                          + {uiText(cat)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* SECTION: Booking Type */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{uiText("BOOKING TYPE")}</Text>
                <View style={styles.toggleRow}>
                  {BOOKING_TYPES.map((bt) => {
                    const isSelected = bookingType === bt.value;
                    return (
                      <Pressable
                        key={String(bt.value)}
                        style={[styles.toggleBtn, isSelected && styles.toggleBtnActive]}
                        onPress={() => handleBookingType(bt.value)}
                      >
                        <Text
                          style={[styles.toggleBtnText, isSelected && styles.toggleBtnTextActive]}
                        >
                          {uiText(bt.label)}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.sectionHint}>
                  {uiText("Part-time: 1–7 days (daily pay) · Full-time: 30+ days (monthly pay)")}
                </Text>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{uiText("WORK SETUP")}</Text>
                <View style={styles.toggleRow}>
                  {([{ label: 'Any Setup', value: null }, { label: 'Stay-in', value: 'stay_in' }, { label: 'Stay-out', value: 'stay_out' }] as const).map(option => (
                    <Pressable key={String(option.value)} accessibilityRole="button"
                      style={[styles.toggleBtn, workSetup === option.value && styles.toggleBtnActive]}
                      onPress={() => handleWorkSetup(option.value)}>
                      <Text style={[styles.toggleBtnText, workSetup === option.value && styles.toggleBtnTextActive]}>{uiText(option.label)}</Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.sectionHint}>
                  {uiText("Stay-in: lives in employer's home · Stay-out: goes home after shift")}
                </Text>
              </View>

              {/* SECTION: Maximum Rate */}
              {mode === 'kasambahay' && <>
                <View style={styles.section}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>{uiText('Maximum rate per {period}', { period: uiText(bookingType === 'long_term' ? 'month' : bookingType === 'short_term' ? 'day' : ratePeriod) }).toUpperCase()}</Text>
                    {maxRate !== null && (
                      <Pressable
                        onPress={() => {
                          setMaxRate(null);
                          setCustomRateText('');
                        }}
                      >
                        <Text style={styles.clearSectionText}>{uiText("Any Rate")}</Text>
                      </Pressable>
                    )}
                  </View>

                  {!bookingType ? (
                    <View style={styles.periodRow}>
                      {(['day', 'month'] as const).map(period => {
                        const isSelected = ratePeriod === period;
                        return (
                          <Pressable
                            key={period}
                            style={[styles.periodBtn, isSelected && styles.periodBtnActive]}
                            onPress={() => handlePeriodChange(period)}
                          >
                            <Text style={[styles.periodBtnText, isSelected && styles.periodBtnTextActive]}>
                              {period === 'day' ? uiText("Part-time (Daily)") : uiText("Full-time (Monthly)")}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  ) : null}

                  {/* Quick Presets */}
                  <View style={styles.ratePresetsRow}>
                    {(bookingType === 'long_term' || (!bookingType && ratePeriod === 'month') ? [6500, 8000, 10000, 15000] : RATE_PRESETS).map((rate) => {
                      const isSelected = maxRate === rate;
                      return (
                        <Pressable
                          key={rate}
                          style={[styles.rateChip, isSelected && styles.rateChipActive]}
                          onPress={() => handleRatePreset(rate)}
                        >
                          <Text style={[styles.rateChipText, isSelected && styles.rateChipTextActive]}>
                            ≤ ₱{rate.toLocaleString('en-US')}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  {/* Custom Rate Input */}
                  <View style={styles.inputBox}>
                    <Text style={styles.currencyPrefix}>₱</Text>
                    <TextInput
                      style={styles.rateInput}
                      placeholder={uiText("Enter custom max budget")}
                      placeholderTextColor="#888888"
                      keyboardType="numeric"
                      value={customRateText}
                      onChangeText={handleCustomRateChange}
                    />
                    {customRateText !== '' && (
                      <Pressable
                        onPress={() => {
                          setCustomRateText('');
                          setMaxRate(null);
                        }}
                      >
                        <Ionicons name="close-circle" size={18} color="#888888" />
                      </Pressable>
                    )}
                  </View>
                </View>

              </>}
              {/* SECTION: Distance & Area */}
              <View style={styles.section}>
                <View style={styles.sectionHeaderRow}>
                  <Text style={styles.sectionTitle}>{uiText("DISTANCE & AREA")}</Text>
                  {onPickLocation && (
                    <Pressable onPress={onPickLocation}>
                      <Text style={styles.clearSectionText}>{uiText("Change Area")}</Text>
                    </Pressable>
                  )}
                </View>
                <View style={styles.chipGrid}>
                  <Pressable
                    style={[styles.chip, locationScope === 'same_barangay' && styles.chipActive]}
                    onPress={() => setLocationScope('same_barangay')}
                  >
                    <Text style={[styles.chipText, locationScope === 'same_barangay' && styles.chipTextActive]}>
                      {uiText('Same Barangay')}
                    </Text>
                  </Pressable>
                  {RADIUS_OPTIONS.map((km) => {
                    const active = locationScope === 'radius' && radiusKm === km;
                    return (
                      <Pressable
                        key={km}
                        style={[styles.chip, active && styles.chipActive]}
                        onPress={() => {
                          setLocationScope('radius');
                          setRadiusKm(km);
                        }}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                          {uiText('{km} km', { km })}
                        </Text>
                      </Pressable>
                    );
                  })}
                  <Pressable
                    style={[styles.chip, locationScope === 'same_city' && styles.chipActive]}
                    onPress={() => setLocationScope('same_city')}
                  >
                    <Text style={[styles.chipText, locationScope === 'same_city' && styles.chipTextActive]}>
                      {uiText('All {city}', { city: shortCityLabel(originCity) || uiText('City') })}
                    </Text>
                  </Pressable>
                  <Pressable
                    style={[styles.chip, locationScope === 'all' && styles.chipActive]}
                    onPress={() => setLocationScope('all')}
                  >
                    <Text style={[styles.chipText, locationScope === 'all' && styles.chipTextActive]}>
                      {uiText('All Areas')}
                    </Text>
                  </Pressable>
                </View>
                {(originBarangay || originCity) ? (
                  <Text style={styles.sectionHint}>
                    {uiText('Selected area: {area}', {
                      area: [formatBarangayShort(originBarangay), shortCityLabel(originCity)].filter(Boolean).join(', '),
                    })}
                  </Text>
                ) : null}
              </View>

              {/* SECTION: Sort By */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>{uiText("SORT RESULTS BY")}</Text>
                <View style={styles.sortContainer}>
                  {SORT_OPTIONS.map((opt, index) => {
                    const isSelected = sortBy === opt.value;
                    const isLast = index === SORT_OPTIONS.length - 1;
                    return (
                      <Pressable
                        key={opt.value}
                        style={[styles.sortRow, !isLast && styles.sortRowDivider]}
                        onPress={() => handleSortChange(opt.value)}
                      >
                        <View style={styles.sortRowLeft}>
                          <Ionicons
                            name={opt.icon}
                            size={18}
                            color={isSelected ? THEME.colors.ink : '#888888'}
                            style={{ marginRight: 10 }}
                          />
                          <Text style={[styles.sortLabel, !isSelected && styles.sortLabelUnselected]}>
                            {uiText(opt.label)}
                          </Text>
                        </View>
                        <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]} />
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Bottom Reset Action */}
              <Pressable style={styles.resetBottomRow} onPress={handleReset}>
                <Ionicons name="refresh-outline" size={15} color="#888888" style={{ marginRight: 6 }} />
                <Text style={styles.resetBottomText}>{uiText("Reset all filters")}</Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export default FilterModal;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheetWrapper: {
    width: '100%',
    maxHeight: SCREEN_HEIGHT * 0.90,
  },
  sheetContent: {
    backgroundColor: THEME.colors.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    marginBottom: 10,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontFamily: THEME.typography.fontFamily.display,
    color: THEME.colors.ink,
  },
  badge: {
    backgroundColor: THEME.colors.brand,
    borderRadius: 12,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 8,
  },
  badgeText: {
    color: THEME.colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  scrollBody: {
    maxHeight: SCREEN_HEIGHT * 0.58,
  },
  scrollContent: {
    paddingBottom: 16,
  },
  section: {
    marginBottom: 20,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: THEME.colors.ink,
    letterSpacing: 0.6,
  },
  clearSectionText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.brandDark,
  },
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: '#EAEAEB',
  },
  chipActive: {
    backgroundColor: '#FFB380',
  },
  chipText: {
    fontSize: 13,
    color: THEME.colors.ink,
    fontWeight: '600',
  },
  chipTextActive: {
    color: THEME.colors.ink,
    fontWeight: '700',
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#EAEAEB',
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  toggleBtnActive: {
    backgroundColor: THEME.colors.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#666666',
  },
  toggleBtnTextActive: {
    color: THEME.colors.ink,
    fontWeight: '700',
  },
  sectionHint: {
    fontSize: 11.5,
    color: '#6B7280',
    marginTop: 6,
    lineHeight: 16,
  },
  periodRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  periodBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 12,
    backgroundColor: '#EAEAEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  periodBtnActive: {
    backgroundColor: '#FFB380',
  },
  periodBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: THEME.colors.ink,
  },
  periodBtnTextActive: {
    fontWeight: '700',
    color: THEME.colors.ink,
  },
  ratePresetsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  rateChip: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#EAEAEB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateChipActive: {
    backgroundColor: '#FFB380',
  },
  rateChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: THEME.colors.ink,
  },
  rateChipTextActive: {
    color: THEME.colors.ink,
    fontWeight: '700',
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EAEAEB',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 46,
  },
  currencyPrefix: {
    fontSize: 15,
    fontWeight: '700',
    color: '#555555',
    marginRight: 6,
  },
  rateInput: {
    flex: 1,
    fontSize: 14,
    color: THEME.colors.ink,
  },
  locationInput: {
    flex: 1,
    fontSize: 14,
    color: THEME.colors.ink,
  },
  sortContainer: {
    backgroundColor: '#EAEAEB',
    borderRadius: 14,
    overflow: 'hidden',
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  sortRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#DCDCE0',
  },
  sortRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortLabel: {
    fontSize: 14,
    color: THEME.colors.ink,
    fontWeight: '700',
  },
  sortLabelUnselected: {
    color: '#888888',
    fontWeight: '500',
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#888888',
    backgroundColor: 'transparent',
  },
  radioCircleActive: {
    borderColor: '#1E1E1E',
    backgroundColor: '#FFB380',
  },
  resetBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 8,
    marginBottom: 4,
  },
  resetBottomText: {
    fontSize: 13,
    color: '#888888',
    fontWeight: '600',
  },
});
