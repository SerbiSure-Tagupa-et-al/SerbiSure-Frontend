import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React from 'react';
import { StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { profileStyles as styles } from '../styles';
import type { ProfileController } from '../hooks/useProfile';
import type { VerifiedWorkHistoryData } from '../api/accountApi';
import { ProfileAvatar } from '../../../shared/ui/ProfileAvatar';
import { validRating } from '../../reviews/ratings';

export function ReviewsSection({
  profile,
  showHeader = false,
}: {
  profile: Pick<ProfileController, 't' | 'copy' | 'reviews' | 'isReviewsExpanded' | 'setIsReviewsExpanded'>;
  showHeader?: boolean;
}) {
  const { tr: uiText, formatDate } = useUiLanguage();
  const {
    t,
    reviews,
    isReviewsExpanded,
    setIsReviewsExpanded,
  } = profile;
  const hasMoreReviews = reviews.length > 3;
  const visibleReviews = isReviewsExpanded ? reviews : reviews.slice(0, 3);
  return (<>
    <View style={styles.reviewsSection}>
      {showHeader ? (
        <View style={styles.tabSectionHeader}>
          <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
            <Text style={styles.tabSectionTitle}>{uiText("Reviews & Feedback")}</Text>
          </View>
          {hasMoreReviews ? (
            <Pressable
              onPress={() => setIsReviewsExpanded((prev) => !prev)}
              hitSlop={15}
              style={({ pressed }) => [styles.viewAllBtnWrap, pressed && { opacity: 0.7 }]}
            >
              <Text style={styles.viewAllPill}>
                {isReviewsExpanded ? uiText("Show Less") : t.viewAll}
              </Text>
              <Ionicons
                name={isReviewsExpanded ? 'chevron-up' : 'chevron-down'}
                size={13}
                color="#F97316"
                style={{ marginLeft: 3 }}
              />
            </Pressable>
          ) : null}
        </View>
      ) : hasMoreReviews ? (
        <View style={styles.reviewsHeader}>
          <Pressable
            onPress={() => setIsReviewsExpanded((prev) => !prev)}
            hitSlop={15}
            style={({ pressed }) => [styles.viewAllBtnWrap, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.viewAllPill}>
              {isReviewsExpanded ? uiText("Show Less") : t.viewAll}
            </Text>
            <Ionicons
              name={isReviewsExpanded ? 'chevron-up' : 'chevron-down'}
              size={13}
              color="#F97316"
              style={{ marginLeft: 3 }}
            />
          </Pressable>
        </View>
      ) : null}

      {reviews.length > 0 ? (
        <View style={styles.reviewsList}>
          {visibleReviews.map((r, index) => {
            const rating = validRating(r.rating);
            const reviewerName = r.reviewer_name || uiText('Reviewer');
            const sentimentColor = r.nlp_sentiment === 'Negative'
              ? '#BE123C'
              : r.nlp_sentiment === 'Neutral'
                ? '#64748B'
                : r.nlp_sentiment === 'Positive' ? '#059669' : '#64748B';

            return (
              <View
                key={r.review_id}
                style={[styles.reviewCard, index < visibleReviews.length - 1 && styles.reviewCardDivider]}
              >
                <View style={styles.reviewCardHeader}>
                  <View style={styles.reviewerIdentity}>
                    <ProfileAvatar uri={r.reviewer_profile_link} name={reviewerName} size={40} />
                    <View style={styles.reviewerDetails}>
                      <Text style={styles.reviewerName} numberOfLines={1}>{reviewerName}</Text>
                      <View style={styles.reviewerMetaRow}>
                        <Text style={styles.reviewerDate}>
                          {r.createdAt
                            ? formatDate(r.createdAt, 'monthYear')
                            : uiText("Verified review")}
                        </Text>
                        <View style={styles.sentimentInline}>
                          <View style={[styles.sentimentDot, { backgroundColor: sentimentColor }]} />
                          <Text style={[styles.sentimentInlineText, { color: sentimentColor }]}>
                          {uiText(r.nlp_sentiment || 'Not analyzed')}
                          </Text>
                        </View>
                      </View>
                    </View>
                  </View>
                  <View style={styles.reviewRatingTop}>
                    {rating !== null && <Ionicons name="star" size={16} color="#F2A66F" />}
                    <Text style={styles.reviewRatingValue}>{rating === null ? uiText('No rating provided') : rating.toFixed(1)}</Text>
                  </View>
                </View>
                {r.would_recommend === true && (
                  <View style={historyStyles.recommendBadge}>
                    <Ionicons name="thumbs-up" size={12} color="#166534" />
                    <Text style={historyStyles.recommendBadgeText}>{uiText(r.reviewer_account_type === 'Kasambahay' ? 'Recommended by Kasambahay' : 'Recommended by Homeowner')}</Text>
                  </View>
                )}
                <Text style={styles.reviewText}>{r.unstructured_feedback}</Text>
              </View>
            );
          })}
        </View>
      ) : (
        <View style={styles.emptyReviewsCard}>
          <Ionicons name="chatbubbles-outline" size={32} color="#D1D5DB" />
          <Text style={styles.emptyReviewsTitle}>{t.noReviewsYet}</Text>
          <Text style={styles.emptyReviewsSubtitle}>
            {t.noReviewsSubtitle}
          </Text>
        </View>
      )}
    </View>
  </>);
}

export function WorkHistorySection({
  workHistory,
  loading = false,
  profileRole = 'Kasambahay',
}: {
  workHistory?: VerifiedWorkHistoryData | null;
  loading?: boolean;
  profileRole?: 'Kasambahay' | 'Homeowner';
}) {
  const { tr: uiText, formatDate } = useUiLanguage();
  const summary = workHistory?.summary;
  const jobs = workHistory?.jobs || [];
  const isWorker = profileRole === 'Kasambahay';

  if (loading && !workHistory) {
    return (
      <View style={historyStyles.loadingBox}>
        <ActivityIndicator size="small" color="#F97316" />
      </View>
    );
  }

  return (
    <View style={historyStyles.container}>
      {/* Summary card */}
      {summary && (summary.completed_jobs_count > 0 || summary.recommended_count > 0) ? (
        <View style={historyStyles.summaryCard}>
          <View style={historyStyles.summaryStatsRow}>
            <View style={historyStyles.statCol}>
              <Text style={historyStyles.statNumber}>{summary.completed_jobs_count}</Text>
              <Text style={historyStyles.statLabel}>{uiText(isWorker ? 'Completed Jobs' : 'Jobs Done')}</Text>
            </View>
            <View style={historyStyles.statDivider} />
            <View style={historyStyles.statCol}>
              <Text style={[historyStyles.statNumber, { color: '#15803D' }]}>{summary.recommended_count}</Text>
              <Text style={historyStyles.statLabel}>{uiText(isWorker ? 'Homeowner Referrals' : 'Kasambahay Referrals')}</Text>
            </View>
            {summary.repeat_employers_count > 0 && (
              <>
                <View style={historyStyles.statDivider} />
                <View style={historyStyles.statCol}>
                  <Text style={[historyStyles.statNumber, { color: '#EA580C' }]}>{summary.repeat_employers_count}</Text>
                  <Text style={historyStyles.statLabel}>{uiText(isWorker ? 'Repeat Clients' : 'Repeat Helpers')}</Text>
                </View>
              </>
            )}
          </View>
          <View style={historyStyles.verifiedNoteRow}>
            <Ionicons name="shield-checkmark-outline" size={14} color="#15803D" />
            <Text style={historyStyles.verifiedNoteText}>
              {uiText("Verified SerbiSure jobs are recorded automatically after completed bookings.")}
            </Text>
          </View>
        </View>
      ) : null}

      {jobs.length > 0 ? (
        <View style={historyStyles.jobsList}>
          {jobs.map((job) => {
            const serviceTitle = (job.service_labels && job.service_labels.length > 0
              ? job.service_labels.map((label) => uiText(label)).join(', ')
              : uiText('Household Service'));
            const termLabel = job.booking_type === 'long_term' ? uiText('Full-time') : uiText('Part-time');
            const setupLabel = job.work_setup === 'stay_in' ? uiText('Stay-in') : job.work_setup === 'stay_out' ? uiText('Stay-out') : null;
            const dateLabel = job.completed_at
              ? formatDate(job.completed_at, 'monthYear')
              : job.start_date
                ? formatDate(job.start_date, 'monthYear')
                : '';
            const rating = validRating(job.rating);

            return (
              <View key={job.booking_id} style={historyStyles.jobCard}>
                <View style={historyStyles.jobTopRow}>
                  <Text style={historyStyles.jobTitle} numberOfLines={2}>{serviceTitle}</Text>
                  <View style={historyStyles.verifiedPill}>
                    <Ionicons name="checkmark-circle" size={12} color="#15803D" />
                    <Text style={historyStyles.verifiedPillText}>{uiText("Verified Job")}</Text>
                  </View>
                </View>

                <View style={historyStyles.metaChipsRow}>
                  <View style={historyStyles.metaChip}>
                    <Text style={historyStyles.metaChipText}>{termLabel}</Text>
                  </View>
                  {setupLabel && (
                    <View style={historyStyles.metaChip}>
                      <Text style={historyStyles.metaChipText}>{setupLabel}</Text>
                    </View>
                  )}
                  {dateLabel ? (
                    <View style={historyStyles.metaChip}>
                      <Text style={historyStyles.metaChipText}>{dateLabel}</Text>
                    </View>
                  ) : null}
                </View>

                {job.area ? (
                  <View style={historyStyles.areaRow}>
                    <Ionicons name="location-outline" size={14} color="#6B7280" />
                    <Text style={historyStyles.areaText} numberOfLines={1}>{job.area}</Text>
                  </View>
                ) : null}

                <View style={historyStyles.employerRow}>
                  <View style={historyStyles.employerLeft}>
                    <ProfileAvatar uri={job.employer_avatar} name={job.employer_name} size={28} />
                    <Text style={historyStyles.employerName} numberOfLines={1}>
                      {uiText(isWorker ? 'Hired by' : 'Worked with')} {job.employer_name}
                    </Text>
                    {job.employer_verified && (
                      <Ionicons name="checkmark-circle" size={14} color="#10B981" />
                    )}
                  </View>
                  {rating !== null && (
                    <View style={historyStyles.ratingBadge}>
                      <Ionicons name="star" size={13} color="#F59E0B" />
                      <Text style={historyStyles.ratingText}>{rating.toFixed(1)}</Text>
                    </View>
                  )}
                </View>

                {job.would_recommend === true && (
                  <View style={historyStyles.referralBox}>
                    <View style={historyStyles.referralHeader}>
                      <Ionicons name="thumbs-up" size={13} color="#166534" />
                      <Text style={historyStyles.referralHeaderText}>
                        {uiText(isWorker ? 'Employer Referral · Recommended to other Homeowners' : 'Kasambahay Referral · Recommended to other Kasambahays')}
                      </Text>
                    </View>
                    {job.feedback ? (
                      <Text style={historyStyles.referralQuote} numberOfLines={3}>
                        “{job.feedback}”
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
            );
          })}
        </View>
      ) : (
        <View style={historyStyles.emptyCard}>
          <Ionicons name="briefcase-outline" size={34} color="#D1D5DB" />
          <Text style={historyStyles.emptyTitle}>{uiText(isWorker ? 'No completed jobs on SerbiSure yet' : 'No completed bookings on SerbiSure yet')}</Text>
          <Text style={historyStyles.emptySubtitle}>
            {uiText(isWorker
              ? 'Completed bookings and Homeowner referrals will automatically appear here once this Kasambahay finishes a job on SerbiSure.'
              : 'Completed bookings and Kasambahay referrals will automatically appear here once this Homeowner finishes a booking on SerbiSure.')}
          </Text>
        </View>
      )}
    </View>
  );
}

const historyStyles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 16,
  },
  loadingBox: {
    paddingVertical: 32,
    alignItems: 'center',
  },
  recommendBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 5,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
    marginTop: 6,
    marginBottom: 6,
  },
  recommendBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#166534',
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginBottom: 14,
  },
  summaryStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginBottom: 12,
  },
  statCol: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0D0D11',
  },
  statLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E5E7EB',
  },
  verifiedNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  verifiedNoteText: {
    flex: 1,
    fontSize: 11.5,
    color: '#166534',
    lineHeight: 16,
  },
  jobsList: {
    gap: 12,
  },
  jobCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
  },
  jobTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 8,
  },
  jobTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '800',
    color: '#0D0D11',
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  verifiedPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  metaChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  metaChip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 9999,
  },
  metaChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#374151',
  },
  areaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
  },
  areaText: {
    flex: 1,
    fontSize: 12.5,
    color: '#4B5563',
  },
  employerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E5E7EB',
    gap: 8,
  },
  employerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  employerName: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#374151',
    flexShrink: 1,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFBEB',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 9999,
  },
  ratingText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
  referralBox: {
    marginTop: 10,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  referralHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  referralHeaderText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  referralQuote: {
    marginTop: 5,
    fontSize: 12.5,
    color: '#14532D',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 28,
    alignItems: 'center',
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 19,
  },
});
