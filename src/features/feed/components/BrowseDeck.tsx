import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import THEME from '../../../shared/theme/theme';
import type { Role } from '../../../app/roleConfig';
import { browseEmptyCopy } from '../browsePresentation';
import type { LocationEmptyExpansion, LocationFilterState } from '../locationFilter';

export function BrowseDeckEmpty({ role, fetchedCount, hasFilters, error, onRefresh, onClearFilters, locationPrompt, onSelectLocation }: Readonly<{ role: Role; fetchedCount: number; hasFilters: boolean; error?: string | null; onRefresh: () => void; onClearFilters: () => void; locationPrompt?: LocationEmptyExpansion | null; onSelectLocation?: (next: LocationFilterState) => void }>) {
  if (!error && fetchedCount === 0 && !hasFilters && locationPrompt && onSelectLocation) {
    return (
      <View style={styles.empty}>
        <Ionicons name="location-outline" size={40} color="#CBD5E1" style={styles.icon} />
        <Text style={styles.title}>{locationPrompt.title}</Text>
        <Text style={styles.description}>{locationPrompt.description}</Text>
        <View style={styles.expandRow}>
          {locationPrompt.actions.map((act, idx) => (
            <Pressable
              key={act.label}
              accessibilityRole="button"
              onPress={() => onSelectLocation(act.next)}
              style={[styles.button, idx > 0 && styles.secondaryButton]}
            >
              <Text style={styles.buttonText}>{act.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }
  const copy = browseEmptyCopy(role, fetchedCount, hasFilters, error);
  const clearFilters = !error && fetchedCount === 0 && hasFilters;
  const showAction = !clearFilters && !!copy.action;
  return (
    <BrowseEmptyState
      icon={copy.icon}
      title={copy.title}
      description={copy.description}
      action={showAction ? copy.action : undefined}
      onAction={showAction ? (clearFilters ? onClearFilters : onRefresh) : undefined}
    />
  );
}

export function BrowseEmptyState({
  icon,
  title,
  description,
  action,
  onAction,
}: Readonly<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  action?: string;
  onAction?: () => void;
}>) {
  const { tr: uiText } = useUiLanguage();
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={40} color="#CBD5E1" style={styles.icon} />
      <Text style={styles.title}>{uiText(title)}</Text>
      <Text style={styles.description}>{uiText(description)}</Text>
      {action && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.button}>
          <Text style={styles.buttonText}>{uiText(action)}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function BrowseDeckSkeleton() {
  const { tr: uiText } = useUiLanguage();
  const opacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const animation = Animated.loop(Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 0.4, duration: 800, useNativeDriver: true }),
    ]));
    animation.start();
    return () => animation.stop();
  }, [opacity]);
  return (
    <Animated.View style={[styles.skeleton, { opacity }]} accessibilityLabel={uiText("Loading posts")}>
      <View style={styles.skeletonIdentity}><View style={styles.skeletonAvatar} /><View style={[styles.bar, { flex: 1 }]} /></View>
      <View style={[styles.bar, { width: '75%', height: 24 }]} />
      <View style={styles.bar} /><View style={[styles.bar, { width: '85%' }]} />
      <View style={[styles.bar, { height: 44, marginTop: 'auto' }]} />
    </Animated.View>
  );
}

export function BrowseDeckSwipeControls({ role, dragX, onSkip, onInterested }: Readonly<{ role: Role; dragX: Animated.Value; onSkip: () => void; onInterested: () => void }>) {
  const { tr: uiText } = useUiLanguage();
  const passBackground = dragX.interpolate({ inputRange: [-150, -20, 0], outputRange: ['#E53935', '#FFEBEE', '#FFFFFF'], extrapolate: 'clamp' });
  const interestedBackground = dragX.interpolate({ inputRange: [0, 20, 150], outputRange: ['#FFFFFF', '#E8F5E9', '#4CD964'], extrapolate: 'clamp' });
  const passHighlight = dragX.interpolate({ inputRange: [-120, -15, 0], outputRange: [1, 0.4, 0], extrapolate: 'clamp' });
  const interestedHighlight = dragX.interpolate({ inputRange: [0, 15, 120], outputRange: [0, 0.4, 1], extrapolate: 'clamp' });
  return (
    <View style={styles.edgeControls} pointerEvents="box-none">
      <Pressable accessibilityRole="button" accessibilityLabel={uiText("Skip this post")} onPress={onSkip} hitSlop={10}>
        <Animated.View style={[styles.edgeButton, { backgroundColor: passBackground }]}>
          <Ionicons name="close" size={18} color="#E53935" />
          <Animated.View pointerEvents="none" style={[styles.edgeHighlight, { opacity: passHighlight }]}><Ionicons name="close" size={18} color={THEME.colors.white} /></Animated.View>
        </Animated.View>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={role === 'kasambahay' ? uiText("Apply to this job") : uiText("Message this kasambahay")} onPress={onInterested} hitSlop={10}>
        <Animated.View style={[styles.edgeButton, { backgroundColor: interestedBackground }]}>
          <Ionicons name="heart-outline" size={18} color="#22C55E" />
          <Animated.View pointerEvents="none" style={[styles.edgeHighlight, { opacity: interestedHighlight }]}><Ionicons name="heart" size={18} color={THEME.colors.white} /></Animated.View>
        </Animated.View>
      </Pressable>
    </View>
  );
}

export const browseDeckStyles = StyleSheet.create({
  emptyContainer: { marginHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  centerWrapper: { width: '100%', alignItems: 'center', paddingHorizontal: 20, marginTop: 36, marginBottom: 20 },
  container: { width: '100%', aspectRatio: 0.95, position: 'relative' },
  front: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 10 },
  middle: { position: 'absolute', left: 10, right: 10, top: -10, bottom: 10, borderRadius: 28, opacity: 0.85, zIndex: 5 },
  back: { position: 'absolute', left: 20, right: 20, top: -20, bottom: 20, borderRadius: 28, opacity: 0.65, zIndex: 2 },
});

const styles = StyleSheet.create({
  empty: {
    paddingVertical: 56,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    maxWidth: 320,
    marginTop: 24,
  },
  icon: { marginBottom: 12 },
  title: {
    fontSize: 17,
    fontFamily: THEME.typography.fontFamily.display,
    color: THEME.colors.ink,
    marginBottom: 6,
    textAlign: 'center',
  },
  description: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 19,
    fontFamily: THEME.typography.fontFamily.secondaryRegular,
  },
  button: {
    marginTop: 18,
    minHeight: 40,
    paddingHorizontal: 20,
    backgroundColor: THEME.colors.brand,
    borderRadius: THEME.roundness.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  expandRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8, marginTop: 16 },
  secondaryButton: { backgroundColor: THEME.colors.white, borderWidth: 1, borderColor: '#E5E7EB', marginTop: 18 },
  buttonText: { color: THEME.colors.ink, fontSize: 13, fontFamily: THEME.typography.fontFamily.display },
  skeleton: { width: '100%', aspectRatio: 0.95, borderRadius: 28, backgroundColor: THEME.colors.white, padding: 20, gap: 16 },
  skeletonIdentity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skeletonAvatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: THEME.colors.canvasSubtle },
  bar: { height: 16, borderRadius: 8, backgroundColor: THEME.colors.canvasSubtle },
  edgeControls: { position: 'absolute', top: 0, bottom: 0, left: -18, right: -18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', zIndex: 50 },
  edgeButton: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.14, shadowRadius: 4, elevation: 3 },
  edgeHighlight: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
});
