import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ProfileAvatar } from '../../../shared/ui/ProfileAvatar';
import THEME from '../../../shared/theme/theme';
import type { SavedJobItem } from '../../bookings/store/savedJobsStore';
import { applicationLabel } from '../../bookings/postAvailability';

interface ActivityProps {
  readonly post: SavedJobItem;
  readonly applied?: boolean;
  readonly closed?: boolean;
  readonly now?: number;
  readonly onProfile: () => void;
  readonly onDetails: () => void;
  readonly onUnsave?: () => void;
  readonly onMessage?: () => void;
}

export function BrowseActivityCard({ post, applied, closed, now, onProfile, onDetails, onUnsave, onMessage }: ActivityProps) {
  const { tr: uiText } = useUiLanguage();
  const badgeText = post.termTag || post.setupTag;

  const formatPrice = (rawPrice?: string) => {
    if (!rawPrice) return '₱0';
    const cleaned = rawPrice.replace(/\.00$/, '').trim();
    if (cleaned.startsWith('₱')) return cleaned;
    return `₱${cleaned.replace(/^Php\s*/i, '')}`;
  };

  const rawUnit = post.unit ? post.unit.replace(/^\//, '').trim() : '';
  const unitText = rawUnit ? `/ ${rawUnit}` : '';

  return (
    <View style={styles.card}>
      <View style={styles.identityRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${post.employerName}'s profile`} onPress={onProfile}>
          <ProfileAvatar uri={post.avatar} name={post.employerName} size={48} />
        </Pressable>
        <Pressable onPress={onProfile} style={styles.identity}>
          <Text style={styles.name} numberOfLines={1}>{post.employerName}</Text>
          <Text style={styles.location} numberOfLines={1}>{post.location || uiText("Location not provided")}</Text>
        </Pressable>
        {onUnsave && (
          <Pressable accessibilityRole="button" accessibilityLabel={uiText("Unsave post")} onPress={onUnsave} style={styles.bookmark}>
            <Ionicons name="bookmark" size={24} color={THEME.colors.brandDark} />
          </Pressable>
        )}
      </View>

      <View style={styles.titleRow}>
        <Pressable onPress={onDetails} accessibilityRole="button" style={styles.subjectWrapper}>
          <Text style={styles.subject} numberOfLines={1}>{post.title || post.roleTag || uiText("Household Service")}</Text>
        </Pressable>
        {badgeText ? (
          <View style={styles.termBadge}>
            <Ionicons name="briefcase" size={13} color={THEME.colors.ink} style={styles.termBadgeIcon} />
            <Text style={styles.termBadgeText}>{uiText(badgeText)}</Text>
          </View>
        ) : null}
      </View>

      {applied && <Text style={[styles.status, (closed || applicationLabel(post, now).startsWith('Closed')) && styles.closed]}>
        {uiText(closed && applicationLabel(post, now) === 'Application sent' ? 'Closed / Not Selected' : applicationLabel(post, now))}
      </Text>}

      <View style={styles.footer}>
        <View style={styles.rate}>
          <Text style={styles.price} numberOfLines={1}>{formatPrice(post.price)}</Text>
          {unitText ? <Text style={styles.unit} numberOfLines={1}>{uiText(unitText)}</Text> : null}
        </View>
        <View style={styles.actions}>
          {onMessage && (
            <Pressable accessibilityRole="button" accessibilityLabel={`Message ${post.employerName}`} onPress={onMessage} style={styles.message}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color={THEME.colors.ink} />
            </Pressable>
          )}
          <Pressable accessibilityRole="button" onPress={onDetails} style={styles.details}>
            <Text style={styles.detailsLabel}>{uiText("See Details")}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, backgroundColor: THEME.colors.white, borderRadius: 24 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identity: { flex: 1 },
  name: { color: THEME.colors.ink, fontSize: 16, fontFamily: THEME.typography.fontFamily.display },
  location: { fontSize: 12, color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamily.secondaryRegular, marginTop: 3 },
  bookmark: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  subjectWrapper: { flexShrink: 1 },
  subject: { fontSize: 18, color: THEME.colors.ink, fontFamily: THEME.typography.fontFamily.display },
  termBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.brand,
    borderRadius: THEME.roundness.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  termBadgeIcon: { marginRight: 6 },
  termBadgeText: { fontSize: 11, color: THEME.colors.ink, fontFamily: THEME.typography.fontFamily.secondarySemiBold },
  status: { marginTop: 10, color: THEME.colors.success, fontSize: 11, fontFamily: THEME.typography.fontFamily.secondarySemiBold },
  closed: { color: THEME.colors.textSecondary },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderTopColor: '#EBEBE6', marginTop: 14, paddingTop: 14 },
  rate: { flex: 1, justifyContent: 'center' },
  price: { color: '#00A859', fontSize: 20, fontFamily: THEME.typography.fontFamily.display },
  unit: { color: THEME.colors.textSecondary, fontSize: 12, fontFamily: THEME.typography.fontFamily.secondaryRegular, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  message: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#F0F0F2', alignItems: 'center', justifyContent: 'center' },
  details: { minHeight: 44, paddingHorizontal: 18, borderRadius: THEME.roundness.pill, backgroundColor: THEME.colors.brand, alignItems: 'center', justifyContent: 'center' },
  detailsLabel: { color: THEME.colors.ink, fontSize: 14, fontFamily: THEME.typography.fontFamily.display },
});
