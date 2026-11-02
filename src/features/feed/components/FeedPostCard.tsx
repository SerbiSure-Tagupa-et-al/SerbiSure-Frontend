import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MapPinIcon } from '../../../shared/components/icons/LucideIcons';
import { ProfileAvatar } from '../../../shared/ui/ProfileAvatar';
import THEME from '../../../shared/theme/theme';
import type { FeedPost } from '../types';

export interface FeedPostCardProps {
  readonly post: FeedPost;
  readonly saved: boolean;
  readonly applied?: boolean;
  readonly onViewProfile?: () => void;
  readonly onDetails?: () => void;
  readonly onToggleSave?: () => void;
  readonly leftActionButton?: React.ReactNode;
  readonly rightActionButton?: React.ReactNode;
}

export function FeedPostCard({
  post,
  saved,
  applied = false,
  onViewProfile,
  onDetails,
  onToggleSave,
  leftActionButton,
  rightActionButton,
}: Readonly<FeedPostCardProps>): React.JSX.Element {
  const { tr: uiText } = useUiLanguage();
  const unit = (post.unit || '').replace(/^(?:\/|per\s+)\s*/i, '').trim();
  const priceMatch = String(post.price || '').trim().match(/^(?:₱|PHP?)\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)$/i);
  const amount = Number(priceMatch?.[1]?.replace(/,/g, ''));
  const formattedPrice = priceMatch && Number.isFinite(amount)
    ? amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null;
  const [whole, decimals] = formattedPrice?.split('.') || [];

  return (
    <View style={styles.workerCard}>
      <View style={styles.workerHeader}>
        <Pressable
          onPress={onViewProfile}
          disabled={!onViewProfile}
          accessibilityRole="button"
          accessibilityLabel={uiText('Profile')}
          hitSlop={6}
        >
          <ProfileAvatar uri={post.avatar} name={post.employerName} size={50} />
        </Pressable>
        <View style={styles.workerInfo}>
          <View style={styles.workerNameRow}>
            <Text style={styles.workerName} numberOfLines={1} ellipsizeMode="tail">
              {post.employerName}
            </Text>
            {formattedPrice ? (
              <View style={styles.rateGroup} accessible accessibilityLabel={`₱ ${formattedPrice}${unit ? `/${uiText(unit)}` : ''}`}>
                <Text style={styles.rateMainNumber} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                  ₱ {whole}
                </Text>
                <Text style={styles.rateDecimalsAndUnit} numberOfLines={1}>
                  .{decimals}{unit ? `/${uiText(unit)}` : ''}
                </Text>
              </View>
            ) : (
              <Text style={styles.rateAmount} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{post.price}</Text>
            )}
          </View>
          <View style={styles.roleRow}>
            <Text style={styles.serviceText}>{uiText(post.roleTag)}</Text>
            {post.time ? (
              <Text style={styles.serviceTimeText}>· {uiText(post.time)}</Text>
            ) : null}
          </View>
        </View>
      </View>

      {post.location ? (
        <View style={styles.locationRow}>
          <MapPinIcon size={13} color="#6B7280" />
          <Text style={styles.locationText} numberOfLines={1}>
            {post.location}
          </Text>
        </View>
      ) : null}

      {post.aboutText ? (
        <Text style={styles.descriptionText} numberOfLines={2} ellipsizeMode="tail">
          {post.aboutText}
        </Text>
      ) : null}

      <View style={styles.cardActionsRow}>
        <View style={styles.cardActionsRight}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={uiText(saved ? 'Unsave post' : 'Save post')}
            accessibilityState={{ selected: saved, disabled: !onToggleSave }}
            disabled={!onToggleSave}
            onPress={onToggleSave}
            hitSlop={6}
            style={({ pressed }) => [styles.bookmarkBtn, pressed && styles.actionPressed]}
          >
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={22}
              color={saved ? '#FFA135' : '#4B5563'}
              accessible={false}
            />
          </Pressable>
          {leftActionButton !== undefined ? (
            leftActionButton
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={uiText('Profile')}
              accessibilityState={{ disabled: !onViewProfile }}
              disabled={!onViewProfile}
              onPress={onViewProfile}
              hitSlop={6}
              style={({ pressed }) => [styles.viewProfileBtn, pressed && styles.actionPressed]}
            >
              <Ionicons name="person-outline" size={20} color="#4B5563" accessible={false} />
            </Pressable>
          )}
          {rightActionButton !== undefined ? (
            rightActionButton
          ) : (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={uiText('Details')}
              accessibilityState={{ disabled: !onDetails }}
              disabled={!onDetails}
              onPress={onDetails}
              hitSlop={6}
              style={({ pressed }) => [styles.seeDetailsBtn, pressed && styles.actionPressed]}
            >
              <Ionicons name={applied ? 'checkmark-circle' : 'eye-outline'} size={20} color={applied ? '#10B981' : '#4B5563'} accessible={false} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  workerCard: {
    backgroundColor: THEME.colors.white,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 22,
    marginBottom: 16,
    shadowColor: '#2D241D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 2,
  },
  workerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  workerInfo: {
    flex: 1,
    minWidth: 0,
  },
  workerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  workerName: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 21,
    fontFamily: THEME.typography.fontFamily.display,
    color: THEME.colors.ink,
  },
  rateGroup: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexShrink: 1,
    maxWidth: '65%',
    minHeight: 28,
  },
  rateAmount: {
    flexShrink: 1,
    maxWidth: '65%',
    fontSize: 17,
    lineHeight: 26,
    includeFontPadding: true,
    textAlign: 'right',
    fontFamily: THEME.typography.fontFamily.secondaryBold,
    color: '#176B3A',
  },
  rateMainNumber: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: 17,
    lineHeight: 26,
    includeFontPadding: true,
    fontFamily: THEME.typography.fontFamily.secondaryBold,
    color: '#176B3A',
  },
  rateDecimalsAndUnit: {
    flexShrink: 0,
    fontSize: 11.5,
    lineHeight: 20,
    includeFontPadding: true,
    fontFamily: THEME.typography.fontFamily.secondaryMedium,
    color: '#176B3A',
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  serviceText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#8B511F',
    fontFamily: THEME.typography.fontFamily.secondaryBold,
  },
  serviceTimeText: {
    fontSize: 12,
    lineHeight: 16,
    color: '#6B7280',
    fontFamily: THEME.typography.fontFamily.secondaryRegular,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minWidth: 0,
    marginBottom: 12,
  },
  locationText: {
    flexShrink: 1,
    fontSize: 11.5,
    lineHeight: 16,
    color: '#6B7280',
    fontFamily: THEME.typography.fontFamily.secondaryRegular,
  },
  descriptionText: {
    fontSize: 13,
    lineHeight: 22,
    color: '#4B5563',
    marginBottom: 16,
    fontFamily: THEME.typography.fontFamily.body,
  },
  cardActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 38,
    marginTop: 4,
  },
  cardActionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
    marginLeft: 'auto',
  },
  bookmarkBtn: {
    flexShrink: 0,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewProfileBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seeDetailsBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPressed: {
    opacity: 0.75,
  },
});

export const feedPostStyles = styles;
