import { formatRate } from '../../../shared/utils/rate';
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
  readonly onWithdraw?: () => void;
  readonly withdrawing?: boolean;
  readonly onMessage?: () => void;
}

export function BrowseActivityCard({ post, applied, closed, now, onProfile, onDetails, onUnsave, onMessage, onWithdraw, withdrawing }: ActivityProps) {
  const { tr: uiText } = useUiLanguage();
  const badgeText = post.termTag || post.setupTag;

  const formatPrice = (rawPrice?: string) => uiText(formatRate(rawPrice));

  const rawUnit = post.unit ? post.unit.replace(/^\//, '').trim() : '';
  const unitText = rawUnit ? `/ ${rawUnit}` : '';
  const rawStatus = applied ? applicationLabel(post, now) : '';
  const isClosedStatus = closed || ['Position Filled', 'Withdrawn', 'Closed / Cancelled'].includes(rawStatus);
  const displayStatus = closed && rawStatus === 'Pending Review'
    ? 'Position Filled'
    : rawStatus === 'Pending Review'
      ? 'Pending'
      : rawStatus;
  const isPendingStatus = displayStatus === 'Pending';
  const showWithdraw = Boolean(applied && !closed && post.application_status === 'applied' && onWithdraw);

  return (
    <View style={styles.card}>
      <View style={styles.identityRow}>
        <Pressable accessibilityRole="button" accessibilityLabel={`View ${post.employerName}'s profile`} onPress={onProfile}>
          <ProfileAvatar uri={post.avatar} name={post.employerName} size={46} />
        </Pressable>
        <Pressable onPress={onProfile} style={styles.identity}>
          <View style={styles.nameStatusRow}>
            <Text style={styles.name} numberOfLines={1}>{post.employerName}</Text>
            {applied && displayStatus ? (
              <Text
                style={[
                  styles.statusText,
                  isPendingStatus && styles.statusPending,
                  isClosedStatus && styles.statusClosed,
                ]}
                numberOfLines={1}
              >
                {uiText(displayStatus)}
              </Text>
            ) : null}
          </View>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={13} color={THEME.colors.textSecondary} />
            <Text style={styles.location} numberOfLines={1}>{post.location || uiText("Location not provided")}</Text>
          </View>
        </Pressable>
        {!applied && onUnsave && (
          <Pressable accessibilityRole="button" accessibilityLabel={uiText("Unsave post")} onPress={onUnsave} style={styles.bookmark}>
            <Ionicons name="bookmark" size={24} color={THEME.colors.brandDark} />
          </Pressable>
        )}
      </View>

      <View style={styles.middleRow}>
        <View style={styles.jobLeft}>
          <Pressable onPress={onDetails} accessibilityRole="button" style={styles.subjectWrapper}>
            <Text style={styles.subject} numberOfLines={1}>{post.title || post.roleTag || uiText("Household Service")}</Text>
          </Pressable>
          {badgeText ? post.authorRole === 'Kasambahay' ? (
            <Text style={styles.termBadgeText}>{uiText(badgeText)}</Text>
          ) : (
            <View style={styles.termBadge}>
              <Ionicons name="briefcase" size={12} color={THEME.colors.ink} style={styles.termBadgeIcon} />
              <Text style={styles.termBadgeText}>{uiText(badgeText)}</Text>
            </View>
          ) : null}
        </View>

        {post.authorRole !== 'Kasambahay' && (
          <View style={styles.rateCol}>
            {applied && <Text style={styles.bidLabel}>{uiText(post.isBudgetAccepted ? 'Accepted Budget' : 'Your Bid')}</Text>}
            <View style={styles.priceLine}>
              <Text style={styles.price} numberOfLines={1}>{formatPrice(post.price)}</Text>
              {unitText ? <Text style={styles.unit} numberOfLines={1}> {uiText(unitText)}</Text> : null}
            </View>
          </View>
        )}
      </View>

      <View style={styles.footer}>
        <View style={styles.footerLeft}>
          {showWithdraw ? (
            <Pressable
              disabled={withdrawing}
              onPress={onWithdraw}
              accessibilityRole="button"
              accessibilityLabel={uiText('Withdraw Bid')}
              style={({ pressed }) => [styles.withdrawBtn, pressed && { opacity: 0.75 }, withdrawing && { opacity: 0.5 }]}
            >
              <Ionicons name="arrow-undo-outline" size={15} color="#B45309" />
              <Text style={styles.withdrawLabel}>{uiText('Withdraw Bid')}</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.actions}>
          {!applied && onMessage && (
            <Pressable accessibilityRole="button" accessibilityLabel={`Message ${post.employerName}`} onPress={onMessage} style={styles.iconBtn}>
              <Ionicons name="chatbubble-ellipses-outline" size={20} color="#4B5563" />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={uiText("Details")}
            onPress={onDetails}
            style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }]}
            hitSlop={6}
          >
            <Ionicons name="eye-outline" size={20} color="#4B5563" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 18, backgroundColor: THEME.colors.white, borderRadius: 24 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  identity: { flex: 1, minWidth: 0 },
  nameStatusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { flex: 1, minWidth: 0, color: THEME.colors.ink, fontSize: 16, fontFamily: THEME.typography.fontFamily.display },
  statusText: { flexShrink: 0, color: THEME.colors.success, fontSize: 12, fontFamily: THEME.typography.fontFamily.secondarySemiBold },
  statusPending: { color: '#B45309' },
  statusClosed: { color: THEME.colors.textSecondary },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  location: { flex: 1, fontSize: 12, color: THEME.colors.textSecondary, fontFamily: THEME.typography.fontFamily.secondaryRegular },
  bookmark: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  middleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 14 },
  jobLeft: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  subjectWrapper: { flexShrink: 1 },
  subject: { fontSize: 17, color: THEME.colors.ink, fontFamily: THEME.typography.fontFamily.display },
  termBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: THEME.colors.brand,
    borderRadius: THEME.roundness.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  termBadgeIcon: { marginRight: 5 },
  termBadgeText: { fontSize: 11, color: THEME.colors.ink, fontFamily: THEME.typography.fontFamily.secondarySemiBold },
  rateCol: { alignItems: 'flex-end', flexShrink: 0 },
  bidLabel: { color: THEME.colors.textSecondary, fontSize: 11, fontFamily: THEME.typography.fontFamily.secondaryRegular, marginBottom: 1 },
  priceLine: { flexDirection: 'row', alignItems: 'baseline' },
  price: { color: '#00A859', fontSize: 17, fontFamily: THEME.typography.fontFamily.display },
  unit: { color: THEME.colors.textSecondary, fontSize: 11.5, fontFamily: THEME.typography.fontFamily.secondaryRegular },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: '#EBEBE6', marginTop: 14, paddingTop: 12 },
  footerLeft: { flex: 1, alignItems: 'flex-start' },
  withdrawBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: THEME.roundness.pill,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  withdrawLabel: { color: '#B45309', fontSize: 12.5, fontFamily: THEME.typography.fontFamily.secondarySemiBold },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#F6F5F2', alignItems: 'center', justifyContent: 'center' },
});
