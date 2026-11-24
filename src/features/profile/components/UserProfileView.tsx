import { formatRate } from '../../../shared/utils/rate';
import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, Modal, ActivityIndicator, Linking, Alert, RefreshControl, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const serbisureIcon = require('../../../../assets/serbisure-icon.png');
import { usePublicProfile } from '../hooks/usePublicProfile';
import { profileStyles } from '../styles';
import { ProfileTabs } from './ProfileTabs';
import { PublicPostsSection } from './PublicPostsSection';
import { ProfileAvatar } from '../../../shared/ui/ProfileAvatar';
import { useUser } from '../../auth/session/UserContext';
import { useLanguage } from '../../../shared/localization/LanguageContext';
import { AppHeader, APP_HEADER_BACK_ICON_COLOR, APP_HEADER_BACK_ICON_SIZE } from '../../../shared/components/AppHeader';
import { localizeProfileCopy } from '../profileConfig';
import { ReviewsSection } from './ReviewsSection';
import { WorkerCvModal } from '../worker/WorkerCvModal';
import { JobDetailSheet } from '../../feed/components/JobDetailSheet';
import { BookingModal, type BookingConfirmData } from '../../bookings/components/BookingModal';
import { sendBookingOffer, type ChatOfferPayload } from '../../chat/api/bookingOffersApi';
import { generateUUID } from '../../chat/api/chatApi';
import { bookingSchedule } from '../../bookings/engagementForm';
import { useJobsActivity } from '../../bookings/store/savedJobsStore';
import { useJobApplication } from '../../bookings/hooks/useJobApplication';
import type { PendingMandatoryReview } from '../../bookings/api/bookingApi';
import { ReviewModal } from '../../reviews/components/ReviewModal';
import { mapFeedPost } from '../../feed/feedMapper';
import type { FeedPost } from '../../feed/types';
import { formatBookingAddress, formatBookingLocationShort, type PublicPendingPost } from '../../bookings/api/bookingApi';
import { formatRegisteredLocation } from '../../../shared/services/locationService';
import { CATEGORY_LABELS } from './PendingPostCard';
import { SocialIconsRow } from './SocialIconsRow';
import THEME from '../../../shared/theme/theme';

export interface ProfileMessageTarget {
  partnerId: string;
  token: string;
  contactName: string;
  contactRole: string;
  contactAvatar?: string;
  userRole: 'kasambahay' | 'homeowner';
  initialMessage?: string;
  initialReplyTo?: {
    author: string;
    text: string;
    imageUri?: string;
    messageId?: string;
  };
}

export interface UserProfileViewProps {
  visible: boolean;
  onClose: () => void;
  userId?: string;
  token?: string | null;
  prefilledName?: string;
  prefilledAvatar?: string;
  prefilledRole?: string;
  onMessage: (target: ProfileMessageTarget) => void;
  children?: React.ReactNode;
}

export function UserProfileView({
  visible,
  onClose,
  userId,
  token,
  prefilledName = 'User',
  prefilledAvatar,
  prefilledRole = 'Member',
  onMessage,
  children,
}: UserProfileViewProps) {
  const { tr: uiText } = useUiLanguage();
  const insets = useSafeAreaInsets();

  const { user } = useUser();
  const { t } = useLanguage();
  const { isSaved, isApplied, toggleSave } = useJobsActivity();
  const effectiveToken = token || user.token;
  const [pendingReview, setPendingReview] = useState<PendingMandatoryReview | null>(null);
  const { applyJob, applyingJobId } = useJobApplication(effectiveToken, () => { void refreshPosts(); }, setPendingReview);
  const { profile, reviews, summary, posts, canUsePost, loading, postsLoading, profileError, postsError, refreshPosts, markSubmitted } = usePublicProfile(visible, userId, effectiveToken);
  const [activeTab, setActiveTab] = useState<'posts' | 'reviews'>('posts');
  const [isReviewsExpanded, setIsReviewsExpanded] = useState(false);
  const [showCv, setShowCv] = useState(false);
  const [selectedJob, setSelectedJob] = useState<FeedPost | null>(null);
  const [bookingModalVisible, setBookingModalVisible] = useState(false);
  const [offerPost, setOfferPost] = useState<FeedPost | null>(null);
  const offerDraft = useRef<{ body: string; key: string } | null>(null);
  const offerJobPost = useMemo(() => offerPost ? {
    role: offerPost.title, rate: offerPost.price, location: offerPost.location, rawText: offerPost.aboutText,
  } : null, [offerPost]);

  const activeAvatar = profile?.profile_link || prefilledAvatar;
  const displayName = profile?.full_name || prefilledName;
  const displayRole = profile?.account_type || prefilledRole;
  const isWorker = displayRole === 'Kasambahay';

  useEffect(() => {
    setActiveTab('posts');
    setIsReviewsExpanded(false);
    setShowCv(false);
    setSelectedJob(null);
    setBookingModalVisible(false);
    setOfferPost(null);
    offerDraft.current = null;
  }, [visible, userId, user.id]);

  const handleConfirmBookingOffer = async (details: BookingConfirmData) => {
    if (!effectiveToken || !userId) {
      throw new Error('Please sign in and reopen the recipient’s profile before sending an offer.');
    }
    try {
      const times = details.workHours.split(' - ');
      const start = bookingSchedule(details.startDate, times[0] || '');
      const end = bookingSchedule(details.ongoing ? details.startDate : details.endDate, times[1] || '');
      const payload: ChatOfferPayload = {
        recipient_id: userId,
        booking_type: details.bookingType,
        work_setup: details.workSetup,
        service_category: details.serviceCategory,
        start_time: start.iso,
        end_time: details.ongoing ? null : end.iso,
        daily_start_time: start.clock,
        daily_end_time: end.clock,
        work_days: details.days,
        region: details.region,
        province: details.province,
        city: details.city,
        barangay: details.barangay,
        street: details.street,
        floor_number: details.floorUnit || undefined,
        zip_code: details.zipCode,
        special_instruction: '',
        rate_amount: details.salary,
        rate_period: details.bookingType === 'long_term' ? 'month' : 'day',
      };
      const body = JSON.stringify(payload);
      if (offerDraft.current?.body !== body) offerDraft.current = { body, key: generateUUID() };
      const result = await sendBookingOffer(effectiveToken, payload, offerDraft.current.key);
      offerDraft.current = null;
      setBookingModalVisible(false);
      setOfferPost(null);
      Alert.alert(
        uiText('Booking Offer Sent'),
        result.language_warning ||
        uiText('Your booking offer has been sent to {name}. You can track and chat with them in your messages.', {
          name: displayName,
        })
      );
    } catch (err: any) {
      void refreshPosts();
      throw err;
    }
  };

  const locationText = formatRegisteredLocation(profile?.street, profile?.city, profile?.province);
  const isVerified = profile?.verification_status === 'Verified';
  const canMessage = Boolean(userId && effectiveToken && user.id !== userId);

  // Sentiment calculations
  const totalReviews = summary?.total_reviews ?? reviews.length;
  const positiveSentiment = summary?.sentiment_breakdown?.Positive ?? reviews.filter(r => r.nlp_sentiment === 'Positive').length;
  const positivePercentage = totalReviews > 0 ? Math.round((positiveSentiment / totalReviews) * 100) : 0;

  const displayTags = profile?.user_tags || [];

  const handlePostReply = async (post?: PublicPendingPost) => {
    if (!userId || !effectiveToken) return;
    if (!post) {
      onMessage({
        partnerId: userId,
        token: effectiveToken,
        contactName: displayName,
        contactRole: displayRole,
        contactAvatar: activeAvatar,
        userRole: user.accountType === 'Kasambahay' ? 'kasambahay' : 'homeowner',
      });
      return;
    }

    const isJob = displayRole === 'Homeowner';
    const application = isJob ? await applyJob(mapFeedPost({ ...post, poster_id: userId }, 'kasambahay')) : null;
    if (isJob && !application) return;
    const rawCategories = Array.isArray(post.service_category)
      ? post.service_category
      : post.service_category
        ? [post.service_category]
        : [isJob ? 'Household Service' : 'General Service'];
    const catKey = rawCategories[0];
    const roleName = (catKey && CATEGORY_LABELS[catKey]) || catKey?.replace(/_/g, ' ') || (isJob ? 'Job Position' : 'Service');
    const formattedRate = formatRate(post.rate_amount);
    const period = post.rate_period || (post.booking_type === 'long_term' ? 'month' : 'day');
    const rateStr = isJob ? `${formattedRate} / ${period}` : `${formattedRate} per ${period}`;
    const locStr = formatBookingLocationShort(post, locationText || '');
    const snippet = [roleName, rateStr, locStr].filter(Boolean).join(' • ');

    const initialMessage = isJob
      ? ''
      : 'Hi! I am interested in hiring you for a service.';

    onMessage({
      partnerId: userId,
      token: effectiveToken,
      contactName: displayName,
      contactRole: displayRole,
      contactAvatar: activeAvatar,
      userRole: user.accountType === 'Kasambahay' ? 'kasambahay' : 'homeowner',
      initialMessage,
      initialReplyTo: {
        author: displayName || (isJob ? 'Job Post' : 'Service Post'),
        text: snippet,
      },
    });
  };

  return (
    <Modal visible={visible} animationType="none" transparent={false} statusBarTranslucent onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: Math.max(insets.top, 14) }]}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={uiText("Back")} onPress={onClose} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="arrow-back" size={24} color="#1A1A1A" />
          </Pressable>
          <Image source={serbisureIcon} style={styles.headerLogo} resizeMode="contain" />
          <View style={styles.headerRightSpacer} />
        </View>

        <ScrollView
          style={styles.scrollBody}
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + (canMessage ? 80 : 24) }}
          refreshControl={<RefreshControl refreshing={postsLoading} onRefresh={refreshPosts} tintColor="#FFB380" colors={['#FFB380']} />}
          showsVerticalScrollIndicator={false}
        >
          {/* Profile Hero Card (Clean Rounded Peach Neo-Pop Card) */}
          <View style={styles.heroCard}>
            {/* Top row: Avatar on left, Role pill badge + View CV pill on right */}
            <View style={styles.heroTopRow}>
              <View style={styles.heroAvatarWrapper}>
                <ProfileAvatar uri={activeAvatar} name={displayName} size={84} />
              </View>

              <View style={styles.heroTopActions}>
                <View style={styles.roleBadgePill}>
                  <Text style={styles.roleBadgePillText}>{uiText(displayRole)}</Text>
                </View>
                {isWorker ? (
                  <Pressable
                    style={styles.viewCvTopBtn}
                    onPress={() => setShowCv(true)}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={uiText("View CV")}
                  >
                    <Text style={styles.viewCvTopBtnText}>{uiText("View CV")}</Text>
                  </Pressable>
                ) : (
                  <View style={[styles.viewCvTopBtn, { opacity: 0 }]} pointerEvents="none">
                    <Text style={styles.viewCvTopBtnText}>{uiText("View CV")}</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Name + Verified Checkmark */}
            <View style={styles.nameRow}>
              <Text style={styles.displayNameText}>{displayName}</Text>
              {isVerified && (
                <Ionicons name="checkmark-circle" size={20} color="#10B981" style={{ marginLeft: 6 }} />
              )}
            </View>

            {/* Location row */}
            <View style={styles.infoRow}>
              <Ionicons name="location-sharp" size={15} color="#0D0D11" style={{ marginRight: 6 }} />
              <Text style={styles.infoText}>{locationText || uiText("Location not provided")}</Text>
            </View>

            {/* Phone row */}
            {profile?.contact_number ? (
              <Pressable
                style={styles.infoRow}
                onPress={() => profile.contact_number && Linking.openURL(`tel:${profile.contact_number}`)}
              >
                <Ionicons name="call" size={14} color="#0D0D11" style={{ marginRight: 6 }} />
                <Text style={styles.infoText}>{profile.contact_number}</Text>
              </Pressable>
            ) : null}



            {/* Ticket Notched Divider */}
            <View style={styles.ticketDividerContainer}>
              <View style={styles.ticketNotchLeft} />
              <View style={styles.ticketDividerLine} />
              <View style={styles.ticketNotchRight} />
            </View>

            {/* Sentiment Track */}
            <View style={styles.sentimentRow}>
              <Text style={styles.sentimentLabel}>
                {displayRole.toLowerCase().includes('kasambahay') ? (t.workerSentiment || 'Worker Sentiment') : (t.clientSentiment || 'Client Sentiment')}
              </Text>
              <View style={styles.sentimentTrack}>
                <View
                  style={[
                    styles.sentimentFill,
                    {
                      width: `${totalReviews > 0 ? Math.min(100, Math.max(0, positivePercentage)) : 0}%`,
                      backgroundColor: totalReviews > 0 ? '#22C55E' : 'transparent',
                    },
                  ]}
                />
              </View>
              <Text style={[styles.sentimentScore, totalReviews === 0 && { color: '#6B7280', fontWeight: '600' }]}>
                {totalReviews > 0 ? uiText('{count}% Positive', { count: positivePercentage }) : uiText("No reviews yet")}
              </Text>
            </View>

            {/* Hero Tags Pill Row */}
            <View style={styles.heroTagsRow}>
              {displayTags.map((tag, idx) => (
                <View key={`${tag}-${idx}`} style={styles.heroTagBadge}>
                  <Text style={styles.heroTagBadgeText}>{tag}</Text>
                </View>
              ))}
            </View>

            {/* Social Links Row with Real App Icons */}
            <SocialIconsRow links={profile?.social_links} />
          </View>

          {profileError ? (
            <View style={styles.aboutCard}>
              <Text style={profileStyles.postsErrorSubtitle}>{profileError}</Text>
            </View>
          ) : null}

          {/* About / Bio Section */}
          <View style={styles.aboutCard}>
            <Text style={styles.aboutCardTitle}>{uiText(isWorker ? 'About Kasambahay' : 'About Homeowner')}</Text>
            {loading && !profile ? (
              <ActivityIndicator size="small" color="#FFB43B" style={{ alignSelf: 'flex-start', marginVertical: 8 }} />
            ) : profile?.user_about && profile.user_about !== 'No Bio' && profile.user_about.trim() !== '' ? (
              <Text style={styles.aboutBodyText}>{profile.user_about}</Text>
            ) : (
              <View style={styles.emptyBioRow}>
                <Ionicons name="information-circle-outline" size={18} color="#9CA3AF" />
                <Text style={styles.emptyBioText}>{uiText("No bio provided yet.")}</Text>
              </View>
            )}
          </View>

          {/* Profile Tabs: Recent Posts vs Reviews & Feedbacks */}
          <ProfileTabs
            activeTab={activeTab}
            onChange={setActiveTab}
            postsCount={posts.length}
            reviewsCount={totalReviews}
          />

          {activeTab === 'posts' ? (
            <PublicPostsSection
              key={userId}
              posts={posts}
              loading={postsLoading}
              error={postsError}
              token={effectiveToken}
              ownerId={userId}
              ownerRole={displayRole}
              authorName={displayName}
              authorAvatar={activeAvatar}
              authorLocation={locationText}
              onRefresh={refreshPosts}
              onSubmitted={markSubmitted}
              onDetails={(jobPost) => setSelectedJob(jobPost)}
              onMessage={handlePostReply}
              onApplyJob={handlePostReply}
            />
          ) : (
            <ReviewsSection
              profile={{
                t,
                copy: localizeProfileCopy(isWorker ? 'kasambahay' : 'homeowner', uiText),
                reviews,
                isReviewsExpanded,
                setIsReviewsExpanded,
              }}
            />
          )}
        </ScrollView>

        {/* Floating Bottom Action Button ("Message [FirstName]") */}
        {canMessage ? (
          <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <Pressable
              accessibilityRole="button"
              style={styles.messageRyanBtn}
              onPress={() => handlePostReply()}
            >
              <Text style={styles.messageRyanBtnText}>
                {uiText("Message")} {displayName.split(' ')[0]}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {/* Details sheet when tapping See Details on any post */}
        <JobDetailSheet
          visible={!!selectedJob}
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          onApply={async () => {
            const isBookingOffer = isWorker && user.accountType === 'Homeowner';
            const currentJob = selectedJob;
            if (isBookingOffer) {
              setOfferPost(currentJob);
              offerDraft.current = null;
              setSelectedJob(null);
              setBookingModalVisible(true);
            } else if (!isWorker && user.accountType === 'Kasambahay' && currentJob && userId && effectiveToken) {
              const application = await applyJob(currentJob);
              if (!application) return;
              setSelectedJob(null);
              const snippet = [
                currentJob.title || currentJob.roleTag,
                `${currentJob.price} ${currentJob.unit}`.trim(),
                currentJob.location,
              ].filter(Boolean).join(' • ');
              onMessage({
                partnerId: userId,
                token: effectiveToken,
                contactName: displayName,
                contactRole: displayRole,
                contactAvatar: activeAvatar,
                userRole: 'kasambahay',
                initialMessage: '',
                initialReplyTo: {
                  author: displayName || 'Job Post',
                  text: snippet,
                },
              });
            }
          }}
          isApplied={
            selectedJob
              ? isApplied(selectedJob.id) || posts.some(
                (p) =>
                  p.booking_id === selectedJob.id &&
                  (p.viewer_proposal?.status === 'Pending' || p.viewer_proposal?.status === 'Accepted')
              )
              : false
          }
          isApplying={applyingJobId === selectedJob?.id}
          isClosed={selectedJob ? !canUsePost(selectedJob) : false}
          isSaved={selectedJob ? isSaved(selectedJob.id) : false}
          onToggleSave={() => {
            if (selectedJob) void toggleSave(selectedJob, effectiveToken);
          }}
          ctaText={isWorker && user.accountType === 'Homeowner' ? uiText('Offer to Book') : undefined}
          ctaNotice={
            isWorker && user.accountType === 'Homeowner'
              ? uiText('Send a direct booking offer to this worker')
              : undefined
          }
          token={effectiveToken}
        />

        {/* Booking Screen Modal */}
        {bookingModalVisible && (
          <BookingModal
            visible={bookingModalVisible}
            onClose={() => { setBookingModalVisible(false); setOfferPost(null); offerDraft.current = null; }}
            contactName={displayName}
            contactRole={displayRole}
            contactAvatar={activeAvatar}
            userRole="homeowner"
            token={effectiveToken}
            bookingType={offerPost?.termTag === 'Full-time' || offerPost?.termTag === 'Long-term' ? 'long_term' : 'short_term'}
            jobPost={offerJobPost}
            onConfirm={handleConfirmBookingOffer}
          />
        )}

        {/* Worker CV Modal */}
        {effectiveToken && isWorker && (
          <WorkerCvModal
            visible={showCv}
            onClose={() => setShowCv(false)}
            userId={profile?.id || userId || ''}
            token={effectiveToken}
            avatarUrl={activeAvatar}
            email={profile?.email}
          />
        )}

        {children}
        {pendingReview && (
          <ReviewModal
            visible
            bookingId={pendingReview.booking_id}
            revieweeName={pendingReview.reviewee_name}
            token={effectiveToken}
            isMandatory
            onClose={() => setPendingReview(null)}
            onSuccess={() => setPendingReview(null)}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F6F5F2',
  },
  header: {
    backgroundColor: '#F6F5F2',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogo: {
    width: 40,
    height: 40,
  },
  headerRightSpacer: {
    width: 40,
    height: 40,
  },
  scrollBody: {
    flex: 1,
  },
  // Hero Card Styles
  heroCard: {
    backgroundColor: '#FFCCAA',
    borderRadius: 32,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
    marginHorizontal: 16,
    marginTop: 38,
    marginBottom: 16,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  heroAvatarWrapper: {
    marginTop: -42,
    borderRadius: 44,
    borderWidth: 3.5,
    borderColor: '#FFCCAA',
    overflow: 'hidden',
  },
  heroTopActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroTopActionsCentered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  roleBadgePill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 9999,
  },
  roleBadgePillText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 13,
    fontWeight: '700',
    color: '#0D0D11',
  },
  viewCvTopBtn: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 9999,
  },
  viewCvTopBtnText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 13,
    fontWeight: '700',
    color: '#4B5563',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  displayNameText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 22,
    fontWeight: '800',
    color: '#0D0D11',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  infoText: {
    fontFamily: THEME.typography.fontFamily.secondaryMedium,
    fontSize: 12.5,
    color: '#0D0D11',
    fontWeight: '600',
  },
  heroDivider: {
    width: '100%',
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    marginVertical: 14,
  },
  ticketDividerContainer: {
    alignSelf: 'stretch',
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    marginHorizontal: -20,
    height: 22,
  },
  ticketNotchLeft: {
    position: 'absolute',
    left: -11,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F6F5F2',
    zIndex: 2,
  },
  ticketDividerLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    marginHorizontal: 16,
  },
  ticketNotchRight: {
    position: 'absolute',
    right: -11,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F6F5F2',
    zIndex: 2,
  },
  sentimentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  sentimentLabel: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 13,
    fontWeight: '700',
    color: '#0D0D11',
  },
  sentimentTrack: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.75)',
    borderRadius: 9999,
    marginHorizontal: 10,
    overflow: 'hidden',
  },
  sentimentFill: {
    height: '100%',
    borderRadius: 9999,
    backgroundColor: '#22C55E',
  },
  sentimentScore: {
    fontFamily: THEME.typography.fontFamily.secondaryBold,
    fontSize: 12,
    fontWeight: '700',
    color: '#16A34A',
  },
  heroTagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  heroTagBadge: {
    backgroundColor: '#FFAE7A',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 9999,
  },
  heroTagBadgeText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '700',
  },

  // About Card
  aboutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  aboutCardTitle: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 15,
    fontWeight: '700',
    color: '#0D0D11',
    marginBottom: 10,
  },
  aboutBodyText: {
    fontFamily: THEME.typography.fontFamily.body,
    fontSize: 13.5,
    color: '#374151',
    lineHeight: 20,
  },
  emptyBioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  emptyBioText: {
    fontFamily: THEME.typography.fontFamily.secondary,
    fontSize: 13.5,
    color: '#9CA3AF',
    fontStyle: 'italic',
  },

  // Bottom Fixed Button
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 10,
    backgroundColor: 'rgba(246, 245, 242, 0.95)',
  },
  messageRyanBtn: {
    backgroundColor: '#0D0D11',
    borderRadius: 9999,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  messageRyanBtnText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 15.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Extra helper styles
  sectionHeading: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 10,
  },
  viewResumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF4E5',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFE2B8',
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  viewResumeBtnText: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
  },
  socialLinksList: {
    gap: 8,
  },
  socialLinkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  socialIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  socialPlatformName: {
    fontFamily: THEME.typography.fontFamily.mainBold,
    fontSize: 13,
    fontWeight: '600',
    color: '#1F2937',
  },
  socialHandleText: {
    fontFamily: THEME.typography.fontFamily.secondary,
    fontSize: 12,
    color: '#6B7280',
    marginTop: 1,
  },
});
