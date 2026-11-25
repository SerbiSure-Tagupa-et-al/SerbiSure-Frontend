import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SearchIcon } from '../../../shared/components/icons/LucideIcons';
import THEME from '../../../shared/theme/theme';
import { useLanguage } from '../../../shared/localization/LanguageContext';
import { HOME_FEED_CATEGORIES, HomeFeedCategory } from '../feedFilters';
import type { LocationEmptyExpansion, LocationFilterState } from '../locationFilter';

interface HomeFeedFiltersProps {
  placeholder: string;
  searchQuery: string;
  selectedCategory: HomeFeedCategory | null;
  onSearchChange: (query: string) => void;
  onCategoryChange: (category: HomeFeedCategory | null) => void;
  locationLabel?: string;
  onLocationPress?: () => void;
}

export function HomeFeedFilters({ placeholder, searchQuery, selectedCategory, onSearchChange, onCategoryChange, locationLabel, onLocationPress }: HomeFeedFiltersProps) {
  const { tr: uiText } = useUiLanguage();
  const hasActiveFilters = !!selectedCategory || !!searchQuery.trim();

  return (
    <View>
      <View style={styles.searchContainer}>
        <SearchIcon size={20} color={THEME.colors.textMuted} />
        <TextInput
          accessibilityLabel={placeholder}
          placeholder={placeholder}
          placeholderTextColor={THEME.colors.textMuted}
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={onSearchChange}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {!!searchQuery && (
          <Pressable accessibilityRole="button" accessibilityLabel={uiText("Clear search")} onPress={() => onSearchChange('')} hitSlop={10}>
            <Ionicons name="close-circle" size={20} color={THEME.colors.textMuted} />
          </Pressable>
        )}
      </View>

      {locationLabel && onLocationPress ? (
        <View style={styles.locationChipWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={uiText('Change location and distance')}
            onPress={onLocationPress}
            style={({ pressed }) => [styles.locationChip, pressed && { opacity: 0.78 }]}
          >
            <Ionicons name="location-sharp" size={14} color={THEME.colors.brandDark} />
            <Text style={styles.locationChipText} numberOfLines={1}>{locationLabel}</Text>
            <Ionicons name="chevron-down" size={14} color={THEME.colors.textSecondary} />
          </Pressable>
        </View>
      ) : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categories} keyboardShouldPersistTaps="handled">
        {HOME_FEED_CATEGORIES.map((category) => {
          const isSelected = selectedCategory === category.key;
          return (
            <Pressable
              key={category.label}
              accessibilityRole="button"
              accessibilityLabel={uiText('Filter: {category}', { category: uiText(category.label) })}
              accessibilityState={{ selected: isSelected }}
              onPress={() => onCategoryChange(isSelected ? null : category.key)}
              style={[styles.chip, isSelected && styles.chipSelected]}
            >
              <Ionicons name={category.icon} size={18} color={THEME.colors.ink} />
              <Text style={[styles.chipLabel, isSelected && styles.chipLabelSelected]}>{uiText(category.label)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {hasActiveFilters && (
        <View style={styles.filterSummary}>
          <Text style={styles.filterSummaryText} numberOfLines={1}>
            {[selectedCategory ? uiText(selectedCategory) : null, searchQuery.trim() ? `“${searchQuery.trim()}”` : null].filter(Boolean).join(' · ')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={uiText("Clear all filters")}
            hitSlop={10}
            onPress={() => { onCategoryChange(null); onSearchChange(''); }}
          >
            <Text style={styles.clearText}>{uiText("Clear")}</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

export function HomeFeedHeader({ onViewAll }: { onViewAll?: () => void }) {
  const { tr: uiText } = useUiLanguage();
  const { t } = useLanguage();
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle} numberOfLines={1} adjustsFontSizeToFit>{uiText("Recent Posts")}</Text>
      {onViewAll && (
        <Pressable accessibilityRole="button" onPress={onViewAll} hitSlop={10}>
          <Text style={styles.viewAll}>{t.viewAll}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function HomeFeedLoadingState() {
  const opacity = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View accessibilityLabel="Loading recent posts" style={[styles.skeletonFeed, { opacity }]}>
      <View style={styles.skeletonSectionHeader}>
        <View style={[styles.skeletonBlock, styles.skeletonSectionTitle]} />
        <View style={[styles.skeletonBlock, styles.skeletonViewAll]} />
      </View>
      {[0, 1].map((item) => (
        <View key={item} style={styles.skeletonCard}>
          <View style={styles.skeletonCardHeader}>
            <View style={[styles.skeletonBlock, styles.skeletonAvatar]} />
            <View style={styles.skeletonIdentity}>
              <View style={[styles.skeletonBlock, styles.skeletonName]} />
              <View style={styles.skeletonInline}>
                <View style={[styles.skeletonBlock, styles.skeletonRole]} />
                <View style={[styles.skeletonBlock, styles.skeletonTime]} />
              </View>
            </View>
            <View style={[styles.skeletonBlock, styles.skeletonBookmark]} />
          </View>
          <View style={[styles.skeletonBlock, styles.skeletonLocation]} />
          <View style={styles.skeletonMetaRow}>
            <View style={[styles.skeletonBlock, styles.skeletonTerm]} />
            <View style={[styles.skeletonBlock, styles.skeletonRate]} />
          </View>
          <View style={[styles.skeletonBlock, styles.skeletonDescription]} />
          <View style={[styles.skeletonBlock, styles.skeletonDescriptionShort]} />
          <View style={styles.skeletonActions}>
            <View style={[styles.skeletonBlock, styles.skeletonAction]} />
            <View style={[styles.skeletonBlock, styles.skeletonAction]} />
          </View>
        </View>
      ))}
    </Animated.View>
  );
}

export function HomeFeedEmptyState({ role, hasActiveFilters = false, onResetFilters, locationPrompt, onSelectLocation }: {
  role: 'homeowner' | 'kasambahay';
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
  locationPrompt?: LocationEmptyExpansion | null;
  onSelectLocation?: (next: LocationFilterState) => void;
}) {
  const { tr: uiText } = useUiLanguage();
  if (!hasActiveFilters && locationPrompt && onSelectLocation) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name="location-outline" size={40} color="#CBD5E1" style={{ marginBottom: 12 }} />
        <Text style={styles.emptyTitle}>{locationPrompt.title}</Text>
        <Text style={styles.emptySubtitle}>{locationPrompt.description}</Text>
        <View style={styles.expandActionsRow}>
          {locationPrompt.actions.map((act, idx) => (
            <Pressable
              key={act.label}
              accessibilityRole="button"
              onPress={() => onSelectLocation(act.next)}
              style={[styles.expandBtn, idx > 0 && styles.expandBtnSecondary]}
            >
              <Text style={[styles.expandBtnText, idx > 0 && styles.expandBtnTextSecondary]}>{act.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }
  const description = hasActiveFilters
    ? role === 'homeowner'
      ? 'No workers match your search or category. Try another search or clear your filters.'
      : 'No job requests match your search or category. Try another search or clear your filters.'
    : role === 'homeowner'
      ? 'There are no worker postings at the moment. Check back soon!'
      : 'There are no open job requests at the moment. Check back soon!';

  return (
    <View style={styles.emptyState}>
      <Ionicons name={hasActiveFilters ? 'search-outline' : 'newspaper-outline'} size={40} color="#CBD5E1" style={{ marginBottom: 12 }} />
      <Text style={styles.emptyTitle}>{hasActiveFilters ? uiText("No posts found") : uiText("No Recent Posts")}</Text>
      <Text style={styles.emptySubtitle}>{uiText(description)}</Text>
      {hasActiveFilters && onResetFilters ? (
        <Pressable accessibilityRole="button" onPress={onResetFilters} style={[styles.expandBtn, { marginTop: 16 }]}>
          <Text style={styles.expandBtnText}>{uiText("Clear Filters")}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  searchContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: THEME.colors.white,
    borderRadius: THEME.roundness.pill, marginHorizontal: 20, marginTop: 14,
    paddingHorizontal: 18, minHeight: 48, gap: 10,
  },
  searchInput: {
    flex: 1, minWidth: 0, paddingVertical: 12, fontSize: 14,
    fontFamily: THEME.typography.fontFamily.bodyMedium, color: THEME.colors.ink,
  },
  categories: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 4, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    minHeight: 44, paddingHorizontal: 14, paddingVertical: 10,
    backgroundColor: THEME.colors.white, borderRadius: THEME.roundness.pill,
  },
  chipSelected: { backgroundColor: THEME.colors.brand },
  chipLabel: { fontSize: 12.5, fontFamily: THEME.typography.fontFamily.secondaryMedium, color: THEME.colors.ink },
  chipLabelSelected: { fontFamily: THEME.typography.fontFamily.secondarySemiBold },
  filterSummary: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 20, marginTop: 8 },
  filterSummaryText: { flex: 1, fontSize: 12, fontFamily: THEME.typography.fontFamily.secondaryMedium, color: THEME.colors.textSecondary },
  clearText: { fontSize: 12, fontFamily: THEME.typography.fontFamily.secondarySemiBold, color: THEME.colors.brandDark },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 18, marginBottom: 14 },
  sectionTitle: { flex: 1, marginRight: 12, fontSize: 22, fontFamily: THEME.typography.fontFamily.display, color: THEME.colors.ink },
  viewAll: { fontSize: 13, color: THEME.colors.brandDark, fontFamily: THEME.typography.fontFamily.secondarySemiBold },
  skeletonFeed: { paddingTop: 18, paddingBottom: 24 },
  skeletonBlock: { backgroundColor: '#E6E4E0' },
  skeletonSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  skeletonSectionTitle: { width: 142, height: 24, borderRadius: 8 },
  skeletonViewAll: { width: 54, height: 14, borderRadius: 7 },
  skeletonCard: { backgroundColor: THEME.colors.white, borderRadius: THEME.roundness.card, padding: 18, marginBottom: 14 },
  skeletonCardHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 14 },
  skeletonAvatar: { width: 48, height: 48, borderRadius: 24 },
  skeletonIdentity: { flex: 1, marginLeft: 12, paddingTop: 2 },
  skeletonName: { width: '72%', height: 17, borderRadius: 7, marginBottom: 8 },
  skeletonInline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skeletonRole: { width: 70, height: 18, borderRadius: 7 },
  skeletonTime: { width: 58, height: 11, borderRadius: 6 },
  skeletonBookmark: { width: 24, height: 28, borderRadius: 7, marginLeft: 10 },
  skeletonLocation: { width: '78%', height: 25, borderRadius: 8, marginBottom: 8 },
  skeletonMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  skeletonTerm: { width: 104, height: 25, borderRadius: 8 },
  skeletonRate: { width: 112, height: 25, borderRadius: 8 },
  skeletonDescription: { width: '100%', height: 13, borderRadius: 7, marginBottom: 7 },
  skeletonDescriptionShort: { width: '64%', height: 13, borderRadius: 7, marginBottom: 16 },
  skeletonActions: { flexDirection: 'row', gap: 10 },
  skeletonAction: { flex: 1, height: 42, borderRadius: THEME.roundness.pill },
  emptyState: { paddingVertical: 56, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', maxWidth: 320, marginTop: 24 },
  emptyTitle: { fontSize: 17, fontFamily: THEME.typography.fontFamily.display, color: THEME.colors.ink, marginBottom: 6, textAlign: 'center' },
  emptySubtitle: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 19, fontFamily: THEME.typography.fontFamily.secondaryRegular },
  locationChipWrap: { marginHorizontal: 20, marginTop: 10, alignItems: 'flex-start' },
  locationChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: THEME.roundness.pill, backgroundColor: THEME.colors.white, borderWidth: 1, borderColor: '#EAE6DF', maxWidth: '100%' },
  locationChipText: { flexShrink: 1, fontSize: 12.5, fontFamily: THEME.typography.fontFamily.secondarySemiBold, color: THEME.colors.ink },
  expandActionsRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 16 },
  expandBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: THEME.roundness.pill, backgroundColor: THEME.colors.brand },
  expandBtnSecondary: { backgroundColor: THEME.colors.white, borderWidth: 1, borderColor: '#E5E7EB' },
  expandBtnText: { fontSize: 13, fontFamily: THEME.typography.fontFamily.display, color: THEME.colors.ink },
  expandBtnTextSecondary: { fontFamily: THEME.typography.fontFamily.secondarySemiBold, color: THEME.colors.ink },
});
