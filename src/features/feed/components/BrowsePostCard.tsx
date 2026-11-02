import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React, { useState } from 'react';
import { ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import THEME from '../../../shared/theme/theme';

interface CardProps {
  readonly startTime?: string;
  readonly name: string;
  readonly avatarUri?: string | null;
  readonly authorRole: 'Homeowner' | 'Kasambahay';
  readonly title: string;
  readonly location: string;
  readonly description: string;
  readonly tags: readonly string[];
  readonly price: string;
  readonly unit: string;
  readonly saved: boolean;
  readonly applied?: boolean;
  readonly onProfilePress: () => void;
  readonly onSave: () => void;
  readonly onDetails: () => void;
}

function formatCardPrice(rawPrice: string): string {
  if (!rawPrice) return 'Php 0';
  const clean = rawPrice.replace(/^[₱\sPhpPHP]+/i, '').trim();
  const num = Number.parseFloat(clean.replace(/,/g, ''));
  if (Number.isNaN(num)) return rawPrice;
  const formatted = num % 1 === 0
    ? num.toLocaleString('en-PH')
    : num.toLocaleString('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return `Php ${formatted}`;
}

function formatCardUnit(rawUnit: string): string {
  if (!rawUnit) return '';
  const trimmed = rawUnit.trim();
  if (trimmed.startsWith('/')) {
    return `per ${trimmed.replace(/^\/\s*/, '')}`;
  }
  return trimmed;
}

export function BrowsePostCard({ name, avatarUri, authorRole, title, location, description, tags, price, unit, saved, applied, startTime, onProfilePress, onSave, onDetails }: CardProps) {
  const { tr: uiText } = useUiLanguage();
  const displayTags = Array.from(new Set(tags.filter((tag) => !tag.startsWith('Verified')))).slice(0, 3);
  const workerPost = authorRole === 'Kasambahay';
  return (
    <View style={styles.card}>
      <PhotoSurface uri={avatarUri} name={name}>
        <View style={styles.overlay}>
          <View style={styles.identityRow}>
            <Pressable accessibilityRole="button" accessibilityLabel={`View ${name}'s profile`} onPress={onProfilePress} style={styles.profilePill}>
              <Ionicons name="information-circle-outline" size={15} color={THEME.colors.white} />
              <Text style={styles.profileLabel} numberOfLines={1}>{workerPost ? uiText("View Profile") : name}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={saved ? uiText("Unsave post") : uiText("Save post")} accessibilityState={{ selected: saved }} onPress={onSave} style={styles.bookmark} hitSlop={12}>
              <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={24} color={saved ? THEME.colors.brandDark : THEME.colors.white} />
            </Pressable>
          </View>
          <View style={styles.contentBottom}>
            <Pressable accessibilityRole="button" onPress={workerPost ? onProfilePress : onDetails}>
              <Text style={styles.title} numberOfLines={1}>{workerPost ? name : title}</Text>
            </Pressable>
            <View style={styles.locationRow}>
              <Ionicons name="location-sharp" size={14} color="#FFAA77" />
              <Text style={styles.location} numberOfLines={1}>{location}</Text>
            </View>
            {workerPost && <Text style={styles.serviceTitle} numberOfLines={1}>{title}</Text>}
            <Text style={styles.description} numberOfLines={2}>{description}</Text>
            <View style={styles.tags}>
              {displayTags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{uiText(tag)}</Text>
                </View>
              ))}
            </View>
            <View style={styles.footer}>
              <View style={styles.rate}>
                <Text style={styles.price} numberOfLines={1} adjustsFontSizeToFit>{formatCardPrice(price)}</Text>
                <Text style={styles.unit}>{uiText(formatCardUnit(unit))}</Text>
              </View>
              <Pressable accessibilityRole="button" onPress={onDetails} style={[styles.details, applied && styles.applied]}>
                <Text style={[styles.detailsLabel, applied && styles.appliedLabel]}>
                  {applied ? uiText("Applied") : uiText("See Details")}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </PhotoSurface>
    </View>
  );
}

function PhotoSurface({ uri, name, children }: Readonly<{ uri?: string | null; name: string; children: React.ReactNode }>) {
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const photoUri = uri?.trim();
  if (photoUri && photoUri !== failedUri) {
    return <ImageBackground source={{ uri: photoUri }} style={styles.photo} resizeMode="cover" accessibilityLabel={`${name}'s profile photo`} onError={() => setFailedUri(photoUri)}>{children}</ImageBackground>;
  }
  const initials = name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || '?';
  return <View style={styles.photo}><View style={styles.photoPlaceholder} pointerEvents="none"><Text style={styles.initials}>{initials}</Text></View>{children}</View>;
}

export function BrowseCardBackdrop({ avatarUri, name }: Readonly<{ avatarUri?: string | null; name: string }>) {
  return <View style={styles.card}><PhotoSurface uri={avatarUri} name={name}><View style={styles.backdropOverlay} /></PhotoSurface></View>;
}

const styles = StyleSheet.create({
  card: { flex: 1, borderRadius: 28, overflow: 'hidden', backgroundColor: THEME.colors.ink },
  photo: { flex: 1, width: '100%', height: '100%', backgroundColor: THEME.colors.inkSubtle },
  photoPlaceholder: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  initials: { fontSize: 88, color: THEME.colors.brand, fontFamily: THEME.typography.fontFamily.display },
  backdropOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    paddingVertical: 14,
    paddingHorizontal: 28,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  profilePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '80%',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  profileLabel: {
    flexShrink: 1,
    fontSize: 11,
    color: THEME.colors.white,
    fontFamily: THEME.typography.fontFamily.secondarySemiBold,
  },
  bookmark: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contentBottom: {
    width: '100%',
  },
  title: {
    fontSize: 22,
    lineHeight: 26,
    color: THEME.colors.white,
    fontFamily: THEME.typography.fontFamily.display,
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 5,
  },
  location: {
    flex: 1,
    fontSize: 11.5,
    lineHeight: 15,
    color: THEME.colors.white,
    fontFamily: THEME.typography.fontFamily.secondaryMedium,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  serviceTitle: {
    fontSize: 14,
    lineHeight: 18,
    color: THEME.colors.white,
    fontFamily: THEME.typography.fontFamily.secondarySemiBold,
    marginBottom: 3,
    textShadowColor: 'rgba(0, 0, 0, 0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  description: {
    fontSize: 11,
    lineHeight: 15,
    color: 'rgba(255,255,255,0.92)',
    fontFamily: THEME.typography.fontFamily.secondaryRegular,
    marginBottom: 9,
    textShadowColor: 'rgba(0, 0, 0, 0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 10,
  },
  tag: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4.5,
  },
  tagText: {
    color: '#0D0D11',
    fontSize: 10.5,
    fontFamily: THEME.typography.fontFamily.secondarySemiBold,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 2,
  },
  rate: {
    flex: 1,
    justifyContent: 'center',
  },
  price: {
    fontSize: 19,
    lineHeight: 23,
    fontFamily: THEME.typography.fontFamily.display,
    color: THEME.colors.white,
    textShadowColor: 'rgba(0, 0, 0, 0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  unit: {
    fontSize: 10.5,
    lineHeight: 14,
    color: 'rgba(255,255,255,0.85)',
    fontFamily: THEME.typography.fontFamily.secondaryRegular,
    marginTop: 1,
  },
  details: {
    minHeight: 38,
    borderRadius: 19,
    backgroundColor: '#FFAA77',
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsLabel: {
    color: '#0D0D11',
    fontSize: 12,
    fontFamily: THEME.typography.fontFamily.display,
  },
  applied: {
    backgroundColor: THEME.colors.successLight,
  },
  appliedLabel: {
    color: THEME.colors.success,
  },
});
