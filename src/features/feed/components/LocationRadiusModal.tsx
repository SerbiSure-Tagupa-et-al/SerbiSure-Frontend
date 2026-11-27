import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import THEME from '../../../shared/theme/theme';
import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import {
  FALLBACK_CDO_BARANGAYS,
  FALLBACK_MISAMIS_ORIENTAL_CITIES,
  getBarangays,
  getFallbackBarangays,
  type Barangay,
  type CityMunicipality,
} from '../../../shared/services/locationService';
import {
  defaultLocationFilter,
  formatBarangayShort,
  RADIUS_OPTIONS,
  resolveBarangayForScope,
  shortCityLabel,
  type LocationFilterState,
  type LocationScope,
} from '../locationFilter';

interface LocationRadiusModalProps {
  visible: boolean;
  value: LocationFilterState;
  userLocation?: { city?: string | null; barangay?: string | null } | null;
  onClose: () => void;
  onApply: (next: LocationFilterState) => void;
}

export function LocationRadiusModal({
  visible,
  value,
  userLocation,
  onClose,
  onApply,
}: Readonly<LocationRadiusModalProps>) {
  const { tr: uiText } = useUiLanguage();
  const insets = useSafeAreaInsets();

  const [scope, setScope] = useState<LocationScope>(value.scope);
  const [radiusKm, setRadiusKm] = useState<number>(value.radiusKm || 5);
  const [city, setCity] = useState<string>(value.city || '');
  const [barangay, setBarangay] = useState<string>(value.barangay || '');
  const [pickerMode, setPickerMode] = useState<'none' | 'city' | 'barangay'>('none');
  const [search, setSearch] = useState('');
  const [barangays, setBarangays] = useState<Barangay[]>(FALLBACK_CDO_BARANGAYS);
  const [loadingBarangays, setLoadingBarangays] = useState(false);

  const cityOptions = useMemo<CityMunicipality[]>(() => {
    const base = [...FALLBACK_MISAMIS_ORIENTAL_CITIES];
    const extras = [value.city, userLocation?.city]
      .map((item) => (item || '').trim())
      .filter(Boolean);
    for (const extra of extras) {
      const exists = base.some(
        (c) => c.name.toLowerCase() === extra.toLowerCase() || (c.aliases || []).includes(extra.toLowerCase()),
      );
      if (!exists) {
        base.push({ code: `custom:${extra}`, name: extra, displayName: extra });
      }
    }
    return base;
  }, [value.city, userLocation?.city]);

  const matchedCity = useMemo(() => {
    const norm = city.trim().toLowerCase();
    if (!norm) return cityOptions[0];
    return cityOptions.find(
      (c) =>
        c.name.toLowerCase() === norm ||
        (c.displayName || '').toLowerCase() === norm ||
        (c.aliases || []).includes(norm) ||
        (norm.includes('cagayan') && c.code === '104305000'),
    );
  }, [city, cityOptions]);

  useEffect(() => {
    if (!visible) return;
    const nextCity = value.city || userLocation?.city || 'City of Cagayan De Oro';
    setScope(value.scope);
    setRadiusKm(value.radiusKm || 5);
    setCity(nextCity);
    setBarangay(
      value.barangay ||
        resolveBarangayForScope(value.scope, nextCity, '', userLocation),
    );
    setPickerMode('none');
    setSearch('');
  }, [visible, value, userLocation?.city, userLocation?.barangay]);

  useEffect(() => {
    if (!visible || pickerMode !== 'barangay') return;
    const code = matchedCity?.code;
    if (!code) {
      setBarangays(FALLBACK_CDO_BARANGAYS);
      setLoadingBarangays(false);
      return;
    }
    const localBarangays = getFallbackBarangays(code);
    if (localBarangays.length > 0) {
      setBarangays(localBarangays);
      setLoadingBarangays(false);
      return;
    }
    if (code.startsWith('custom:')) {
      setBarangays([]);
      setLoadingBarangays(false);
      return;
    }
    let active = true;
    setLoadingBarangays(true);
    void getBarangays(code)
      .then((rows) => {
        if (active) setBarangays(rows);
      })
      .catch(() => {
        if (active) setBarangays([]);
      })
      .finally(() => {
        if (active) setLoadingBarangays(false);
      });
    return () => {
      active = false;
    };
  }, [visible, pickerMode, matchedCity?.code]);

  const filteredCities = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cityOptions;
    return cityOptions.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.displayName || '').toLowerCase().includes(q) ||
        (c.aliases || []).some((a) => a.includes(q)),
    );
  }, [cityOptions, search]);

  const filteredBarangays = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return barangays;
    return barangays.filter(
      (b) => b.name.toLowerCase().includes(q) || (b.displayName || '').toLowerCase().includes(q),
    );
  }, [barangays, search]);

  const cityShort = shortCityLabel(city) || uiText('City');
  const needsBarangay = scope === 'same_barangay' || scope === 'radius';
  const showAreaSelectors = scope !== 'all';

  const handleSelectScope = (nextScope: LocationScope, nextRadius?: number) => {
    setScope(nextScope);
    if (nextRadius !== undefined) setRadiusKm(nextRadius);
    const nextCity =
      nextScope !== 'all' && !city.trim()
        ? userLocation?.city || 'City of Cagayan De Oro'
        : city;
    if (nextCity !== city) {
      setCity(nextCity);
    }
    if ((nextScope === 'same_barangay' || nextScope === 'radius') && !barangay.trim()) {
      const prefilled = resolveBarangayForScope(nextScope, nextCity, '', userLocation);
      if (prefilled) setBarangay(prefilled);
    }
    setPickerMode('none');
  };

  const handleUseMyArea = () => {
    const mine = defaultLocationFilter(userLocation);
    onApply(mine);
    onClose();
  };

  const handleApply = () => {
    const effectiveCity = scope === 'all' ? '' : city.trim();
    const effectiveBarangay = resolveBarangayForScope(scope, effectiveCity, barangay, userLocation);
    const effectiveScope: LocationScope =
      scope === 'same_barangay' && !effectiveBarangay
        ? (effectiveCity ? 'same_city' : 'all')
        : scope;
    onApply({
      scope: effectiveScope,
      radiusKm,
      city: effectiveCity,
      barangay: effectiveBarangay,
    });
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Ionicons name="location-outline" size={20} color={THEME.colors.brandDark} />
              <Text style={styles.title}>{uiText('Where do you want to look?')}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={uiText('Close')} onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={22} color={THEME.colors.ink} />
            </Pressable>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
            <Text style={styles.sectionLabel}>{uiText('HOW FAR?')}</Text>
            <View style={styles.pillGrid}>
              <Pressable
                accessibilityRole="button"
                style={[styles.pill, scope === 'same_barangay' && styles.pillActive]}
                onPress={() => handleSelectScope('same_barangay')}
              >
                <Text style={[styles.pillText, scope === 'same_barangay' && styles.pillTextActive]}>
                  {uiText('Same Barangay')}
                </Text>
              </Pressable>

              {RADIUS_OPTIONS.map((km) => {
                const active = scope === 'radius' && radiusKm === km;
                return (
                  <Pressable
                    key={km}
                    accessibilityRole="button"
                    style={[styles.pill, active && styles.pillActive]}
                    onPress={() => handleSelectScope('radius', km)}
                  >
                    <Text style={[styles.pillText, active && styles.pillTextActive]}>
                      {uiText('{km} km', { km })}
                    </Text>
                  </Pressable>
                );
              })}

              <Pressable
                accessibilityRole="button"
                style={[styles.pill, scope === 'same_city' && styles.pillActive]}
                onPress={() => handleSelectScope('same_city')}
              >
                <Text style={[styles.pillText, scope === 'same_city' && styles.pillTextActive]}>
                  {uiText('All {city}', { city: cityShort })}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                style={[styles.pill, scope === 'all' && styles.pillActive]}
                onPress={() => handleSelectScope('all')}
              >
                <Text style={[styles.pillText, scope === 'all' && styles.pillTextActive]}>
                  {uiText('All Areas')}
                </Text>
              </Pressable>
            </View>

            {showAreaSelectors && (
              <View style={styles.areaSection}>
                <Text style={styles.sectionLabel}>{uiText('CHOOSE AREA')}</Text>

                <Pressable
                  accessibilityRole="button"
                  style={styles.selectorRow}
                  onPress={() => {
                    setSearch('');
                    setPickerMode(pickerMode === 'city' ? 'none' : 'city');
                  }}
                >
                  <View style={styles.selectorInfo}>
                    <Text style={styles.selectorCaption}>{uiText('City / Municipality')}</Text>
                    <Text style={styles.selectorValue} numberOfLines={1}>
                      {city || uiText('Select City')}
                    </Text>
                  </View>
                  <Ionicons name={pickerMode === 'city' ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7280" />
                </Pressable>

                {pickerMode === 'city' && (
                  <View style={styles.dropdownBox}>
                    <TextInput
                      style={styles.searchInput}
                      placeholder={uiText('Search city or town...')}
                      placeholderTextColor="#9CA3AF"
                      value={search}
                      onChangeText={setSearch}
                    />
                    <ScrollView style={styles.optionsList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {filteredCities.map((item) => {
                        const selected = item.name.toLowerCase() === city.trim().toLowerCase();
                        return (
                          <Pressable
                            key={item.code}
                            style={[styles.optionRow, selected && styles.optionRowActive]}
                            onPress={() => {
                              setCity(item.name);
                              if (item.name.toLowerCase() !== city.trim().toLowerCase()) setBarangay('');
                              setPickerMode('none');
                              setSearch('');
                            }}
                          >
                            <Text style={[styles.optionText, selected && styles.optionTextActive]}>
                              {item.displayName || item.name}
                            </Text>
                            {selected && <Ionicons name="checkmark" size={16} color={THEME.colors.brandDark} />}
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {needsBarangay && (
                  <>
                    <Pressable
                      accessibilityRole="button"
                      style={[styles.selectorRow, { marginTop: 10 }]}
                      onPress={() => {
                        setSearch('');
                        setPickerMode(pickerMode === 'barangay' ? 'none' : 'barangay');
                      }}
                    >
                      <View style={styles.selectorInfo}>
                        <Text style={styles.selectorCaption}>{uiText('Barangay')}</Text>
                        <Text style={styles.selectorValue} numberOfLines={1}>
                          {barangay ? formatBarangayShort(barangay) : uiText('Select Barangay')}
                        </Text>
                      </View>
                      <Ionicons name={pickerMode === 'barangay' ? 'chevron-up' : 'chevron-down'} size={18} color="#6B7280" />
                    </Pressable>

                    {pickerMode === 'barangay' && (
                      <View style={styles.dropdownBox}>
                        <TextInput
                          style={styles.searchInput}
                          placeholder={uiText('Search barangay...')}
                          placeholderTextColor="#9CA3AF"
                          value={search}
                          onChangeText={setSearch}
                        />
                        {loadingBarangays ? (
                          <ActivityIndicator style={{ paddingVertical: 16 }} color={THEME.colors.brandDark} />
                        ) : (
                          <ScrollView style={styles.optionsList} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                            {filteredBarangays.length > 0 ? (
                              filteredBarangays.map((item) => {
                                const selected = item.name.toLowerCase() === barangay.trim().toLowerCase();
                                return (
                                  <Pressable
                                    key={item.code}
                                    style={[styles.optionRow, selected && styles.optionRowActive]}
                                    onPress={() => {
                                      setBarangay(item.name);
                                      setPickerMode('none');
                                      setSearch('');
                                    }}
                                  >
                                    <Text style={[styles.optionText, selected && styles.optionTextActive]}>
                                      {item.displayName || item.name}
                                    </Text>
                                    {selected && <Ionicons name="checkmark" size={16} color={THEME.colors.brandDark} />}
                                  </Pressable>
                                );
                              })
                            ) : (
                              <Text style={styles.emptyDropdownText}>{uiText('No matching barangay found')}</Text>
                            )}
                          </ScrollView>
                        )}
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            {(userLocation?.city || userLocation?.barangay) ? (
              <Pressable accessibilityRole="button" style={styles.resetBtn} onPress={handleUseMyArea}>
                <Ionicons name="locate-outline" size={16} color={THEME.colors.ink} />
                <Text style={styles.resetBtnText}>{uiText('Use My Area')}</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" style={styles.applyBtn} onPress={handleApply}>
              <Text style={styles.applyBtnText}>{uiText('Apply')}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.38)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '82%' },
  handle: { width: 42, height: 4, borderRadius: 2, backgroundColor: '#D4D4D8', alignSelf: 'center', marginTop: 10, marginBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#EBE9E4' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  title: { fontSize: 16, fontFamily: THEME.typography.fontFamily.display, color: THEME.colors.ink },
  body: { maxHeight: 420 },
  bodyContent: { paddingHorizontal: 20, paddingVertical: 16 },
  sectionLabel: { fontSize: 11, fontFamily: THEME.typography.fontFamily.secondarySemiBold, color: '#6B7280', letterSpacing: 0.6, marginBottom: 10 },
  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  pillActive: { backgroundColor: THEME.colors.brand, borderColor: THEME.colors.brandDark },
  pillText: { fontSize: 13, fontFamily: THEME.typography.fontFamily.secondaryMedium, color: '#374151' },
  pillTextActive: { color: THEME.colors.ink, fontFamily: THEME.typography.fontFamily.secondarySemiBold },
  areaSection: { marginTop: 18 },
  selectorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' },
  selectorInfo: { flex: 1, marginRight: 8 },
  selectorCaption: { fontSize: 11, color: '#6B7280', fontFamily: THEME.typography.fontFamily.secondaryRegular },
  selectorValue: { fontSize: 14, color: THEME.colors.ink, fontFamily: THEME.typography.fontFamily.secondarySemiBold, marginTop: 2 },
  dropdownBox: { marginTop: 8, borderRadius: 14, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#FFFFFF', overflow: 'hidden' },
  searchInput: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB', fontSize: 13.5, color: THEME.colors.ink },
  optionsList: { maxHeight: 180 },
  optionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#F3F4F6' },
  optionRowActive: { backgroundColor: '#FFF7ED' },
  optionText: { fontSize: 13.5, color: '#1F2937', fontFamily: THEME.typography.fontFamily.secondaryRegular },
  optionTextActive: { fontFamily: THEME.typography.fontFamily.secondarySemiBold, color: THEME.colors.ink },
  emptyDropdownText: { padding: 14, fontSize: 13, color: '#6B7280', textAlign: 'center' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#EBE9E4' },
  resetBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, height: 46, borderRadius: 23, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' },
  resetBtnText: { fontSize: 13, fontFamily: THEME.typography.fontFamily.secondarySemiBold, color: THEME.colors.ink },
  applyBtn: { flex: 1, height: 46, borderRadius: 23, backgroundColor: THEME.colors.brand, alignItems: 'center', justifyContent: 'center' },
  applyBtnText: { fontSize: 14, fontFamily: THEME.typography.fontFamily.display, color: THEME.colors.ink },
});
