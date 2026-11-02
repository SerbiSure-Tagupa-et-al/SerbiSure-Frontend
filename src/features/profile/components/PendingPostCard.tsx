import { formatRate } from '../../../shared/utils/rate';
import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import { workSetupLabel } from '../../bookings/workSetup';
import React from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatBookingAddress, formatBookingLocationShort, type BookingItem } from '../../bookings/api/bookingApi';
import { profileStyles as styles } from '../styles';
import { FeedPostCard } from '../../feed/components/FeedPostCard';
import { useJobsActivity } from '../../bookings/store/savedJobsStore';
import { formatCompactTimeAgo } from '../../../shared/utils/date';
import type { FeedPost } from '../../feed/types';

export const CATEGORY_LABELS: Record<string, string> = {
  Cleaning: 'Cleaning',
  Child_care: 'Child Care',
  Cooking: 'Cook',
  Caregiver: 'Caregiver',
  Laundry: 'Laundry',
  'All-around': 'All-around',
};

export function PendingPostCard({
  post,
  note,
  feedPost,
  saved,
  onToggleSave,
  onDetails,
  token,
  authorName,
  authorAvatar,
  authorRole,
  authorLocation,
  children,
}: Readonly<{
  post: BookingItem;
  note: string;
  feedPost?: FeedPost;
  saved?: boolean;
  onToggleSave?: () => void;
  onDetails?: (post: FeedPost) => void;
  token?: string | null;
  authorName?: string;
  authorAvatar?: string;
  authorRole?: string;
  authorLocation?: string;
  children?: React.ReactNode;
}>) {
  const { tr: uiText } = useUiLanguage();
  const { isSaved, toggleSave } = useJobsActivity();

  // If authorName is provided, render the modern feed post card!
  if (authorName || feedPost) {
    const isJob = (authorRole || 'Homeowner') === 'Homeowner';
    const rawCategories = Array.isArray(post.service_category)
      ? post.service_category
      : post.service_category
      ? [post.service_category]
      : [isJob ? 'Household' : 'General Service'];
    const categories = rawCategories.map((value) =>
      !isJob && value === 'Cleaning' ? 'Cleaner' : CATEGORY_LABELS[value] || value.replace(/_/g, ' ')
    );
    const longTerm = post.booking_type === 'long_term';
    const termTag = longTerm ? 'Long-term' : 'Short-term';
    const setupTag = workSetupLabel(post.work_setup);
    const location = formatBookingLocationShort(post, authorLocation || 'Location not provided');
    const numRate = Number(post.rate_amount) || 0;
    const rawPrice = post.rate_amount
      ? `₱ ${numRate.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '₱ 0.00';
    const unit = post.rate_period ? `/${post.rate_period}` : longTerm ? '/month' : '/day';
    const description =
      post.special_instruction?.trim() ||
      (isJob
        ? `I am looking for a ${termTag.toLowerCase()} ${categories.join(' & ')} work in ${location}.`
        : `Available for ${categories.join(' & ')} work in ${location}.`);

    const mappedFeedPost: FeedPost = feedPost || {
      id: post.booking_id,
      start_time: post.start_time, booking_status: post.booking_status, post_status: post.post_status,
      end_time: post.end_time, booking_type: post.booking_type,
      daily_start_time: post.daily_start_time, daily_end_time: post.daily_end_time, work_days: post.work_days,
      partnerId: post.recipient_id || post.booking_id,
      kind: isJob ? 'job' : 'service',
      authorRole: isJob ? 'Homeowner' : 'Kasambahay',
      employerName: authorName || (isJob ? 'Homeowner' : 'Kasambahay'),
      title: categories[0] || (isJob ? 'Household Service' : 'Kasambahay'),
      avatar:
        authorAvatar ||
        `https://ui-avatars.com/api/?name=${encodeURIComponent(authorName || authorRole || 'User')}&background=FFB43B&color=fff`,
      time: formatCompactTimeAgo(post.createdAt),
      location,
      categories,
      roleTag: categories[0] || (isJob ? 'Household Service' : 'Kasambahay'),
      termTag,
      setupTag,
      price: rawPrice,
      unit,
      aboutText: description,
      tags: Array.from(new Set([termTag, setupTag, ...categories])),
    };

    const isPostSaved = saved !== undefined ? saved : isSaved(post.booking_id);

    return (
      <FeedPostCard
        post={mappedFeedPost}
        saved={isPostSaved}
        onToggleSave={onToggleSave || (() => { void toggleSave(mappedFeedPost, token); })}
        onDetails={() => onDetails?.(mappedFeedPost)}
        leftActionButton={children}
      />
    );
  }

  // Fallback for PendingPostsSection in user's own profile screen
  return (
    <View style={styles.pendingPostCard}>
      <View style={styles.pendingPostTopRow}>
        <View style={styles.categoryChipsWrap}>
          {post.service_category.map((category, index) => (
            <View key={`${category}-${index}`} style={styles.categoryChip}>
              <Text style={styles.categoryChipText}>{category.replace(/_/g, ' ')}</Text>
            </View>
          ))}
        </View>
        <View style={styles.pendingStatusBadge}>
          <Ionicons name="time" size={11} color="#B45309" style={{ marginRight: 3 }} />
          <Text style={styles.pendingStatusBadgeText}>{uiText("Pending")}</Text>
        </View>
      </View>
      <View style={styles.pendingPostRateRow}>
        <Text style={styles.pendingPostRate}>{uiText(formatRate(post.rate_amount))}</Text>
        <Text style={styles.pendingPostRateUnit}>
          {' '}
          {post.rate_needs_review ? '(unit needs confirmation)' : '/ ' + post.rate_period} ·{' '}
          {post.booking_type === 'long_term' ? uiText("Long-term") : uiText("Short-term")}
        </Text>
      </View>
      <Text style={styles.pendingPostDetailText}>
        {uiText("Work setup:")} {workSetupLabel(post.work_setup)}
      </Text>
      <View style={styles.pendingPostDetails}>
        <View style={styles.pendingPostDetailItem}>
          <Ionicons name="location-outline" size={13} color="#6B7280" style={{ marginRight: 4 }} />
          <Text style={styles.pendingPostDetailText} numberOfLines={2}>
            {formatBookingAddress(post)}
          </Text>
        </View>
      </View>
      {post.special_instruction ? (
        <View style={styles.pendingPostInstructionBox}>
          <Text style={styles.pendingPostInstructionText}>{post.special_instruction}</Text>
        </View>
      ) : null}
      <View style={styles.pendingPostProposalsRow}>
        <Ionicons name="people-outline" size={13} color="#D97706" style={{ marginRight: 5 }} />
        <Text style={styles.pendingPostProposalsText}>{note}</Text>
      </View>
      {children ? <View style={styles.pendingPostActionsRow}>{children}</View> : null}
    </View>
  );
}
