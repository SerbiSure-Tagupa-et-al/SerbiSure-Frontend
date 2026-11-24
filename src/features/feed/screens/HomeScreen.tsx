import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import { ErrorNotice } from '../../../shared/ui/ErrorNotice';
import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { resolveRole, ROLE_CONFIG, type Role } from '../../../app/roleConfig';
import { useUser } from '../../auth/session/UserContext';
import { useLanguage } from '../../../shared/localization/LanguageContext';
import { AppHeader } from '../../../shared/components/AppHeader';
import { GreetingCard } from '../../../shared/components/GreetingCard';
import { ScreenLayout } from '../../../shared/components/ScreenLayout';
import { NotificationBell } from '../../notifications/NotificationContext';
import { useJobsActivity } from '../../bookings/store/savedJobsStore';
import { useJobApplication } from '../../bookings/hooks/useJobApplication';
import type { PendingMandatoryReview } from '../../bookings/api/bookingApi';
import { ReviewModal } from '../../reviews/components/ReviewModal';
import { UserProfileModal } from '../../profile/components/UserProfileModal';
import { ChatDetailScreen } from '../../chat/components/ChatDetailScreen';
import { JobDetailSheet } from '../components/JobDetailSheet';
import { HomeFeedFilters, HomeFeedHeader, HomeFeedEmptyState, HomeFeedLoadingState } from '../components/HomeFeedControls';
import { FeedPostCard } from '../components/FeedPostCard';
import { useFeed } from '../hooks/useFeed';
import { usePostUpdates } from '../hooks/usePostUpdates';
import { matchesHomeFeedFilters, type HomeFeedCategory } from '../feedFilters';
import type { FeedPost } from '../types';
import THEME from '../../../shared/theme/theme';

interface HomeScreenProps {
  readonly role?: Role;
  readonly avatarUri?: string | null;
  readonly onAvatarPress?: () => void;
  readonly onViewAll?: () => void;
  readonly token?: string | null;
  readonly onBookingsPress?: () => void;
}

interface ActiveChat {
  post: FeedPost;
  initialMessage: string;
  initialReplyTo?: { author: string; text: string };
}

export function HomeScreen({ role: requestedRole, avatarUri, onAvatarPress, onViewAll, token, onBookingsPress }: HomeScreenProps) {
  const { tr: uiText } = useUiLanguage();
  const { user, getFirstNameOnly } = useUser();
  const { t } = useLanguage();
  const role = requestedRole || resolveRole(user.accountType);
  const authToken = token || user.token;
  const { posts, isLoading, isRefreshing, error, refresh } = useFeed(role, authToken, user.id);
  const [pendingReview, setPendingReview] = useState<PendingMandatoryReview | null>(null);
  const { applyJob, applyingJobId } = useJobApplication(authToken, () => { void handleRefresh(); }, setPendingReview);
  const { canUsePost } = usePostUpdates(posts, () => { void handleRefresh(); });
  const { isSaved, isApplied, isClosed, toggleSave, refreshSavedFromBackend } = useJobsActivity();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<HomeFeedCategory | null>(null);
  const [selectedPost, setSelectedPost] = useState<FeedPost | null>(null);
  const [profilePost, setProfilePost] = useState<FeedPost | null>(null);
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);

  useEffect(() => {
    setSearchQuery(''); setSelectedCategory(null); setSelectedPost(null); setProfilePost(null); setActiveChat(null);
    if (authToken) void refreshSavedFromBackend(authToken);
  }, [authToken, user.id, role]);

  const visiblePosts = posts.filter((post) => {
    if (!canUsePost(post)) return false;
    if (isClosed(post.id) || isClosed(post.partnerId) || (post.kind === 'job' && isClosed(post.employerName))) return false;
    return matchesHomeFeedFilters(post.categories, [post.employerName, post.location, post.aboutText, post.termTag, ...post.tags], selectedCategory, searchQuery);
  });
  const hasActiveFilters = !!selectedCategory || !!searchQuery.trim();
  const resetFilters = () => { setSearchQuery(''); setSelectedCategory(null); };
  const handleRefresh = async () => { await Promise.all([refresh(), authToken ? refreshSavedFromBackend(authToken) : Promise.resolve()]); };

  const contactPoster = async (post: FeedPost) => {
    const application = post.kind === 'job' ? await applyJob(post) : null;
    if (post.kind === 'job' && !application) return;
    setSelectedPost(null);
    if (post.kind === 'job') {
      setActiveChat({
        post, initialMessage: '', initialReplyTo: {
          author: 'Job Post', text: `${post.roleTag} • ${post.price} ${post.unit} • ${post.location} • ${post.termTag}`,
        }
      });
    } else {
      setActiveChat({ post, initialMessage: `Hello ${post.employerName}! I saw your post on SerbiSure for ${post.roleTag} (${post.termTag}) and would like to ask about your availability.` });
    }
  };

  const renderPosts = () => {
    if (isLoading) return <HomeFeedLoadingState />;
    if (!error && visiblePosts.length === 0) {
      return <HomeFeedEmptyState role={role} hasActiveFilters={hasActiveFilters} onResetFilters={resetFilters} />;
    }
    return visiblePosts.map((post) => {
      const actions = {
        post,
        saved: isSaved(post.id),
        onViewProfile: () => setProfilePost(post),
        onDetails: () => setSelectedPost(post),
        onToggleSave: () => { void toggleSave(post, authToken); },
      };
      return <FeedPostCard key={post.id} {...actions} applied={post.kind === 'job' && isApplied(post.id)} />;
    });
  };

  return (
    <View style={styles.container}>
      <ScreenLayout
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
      >
        <GreetingCard name={getFirstNameOnly()} greeting={t.greeting} avatarUri={avatarUri} onAvatarPress={onAvatarPress} />
        <HomeFeedFilters placeholder={t[ROLE_CONFIG[role].searchKey]} searchQuery={searchQuery} selectedCategory={selectedCategory} onSearchChange={setSearchQuery} onCategoryChange={setSelectedCategory} />
        {(!isLoading && visiblePosts.length > 0) ? <HomeFeedHeader onViewAll={onViewAll} /> : null}
        <View style={styles.list}>
          {error && <ErrorNotice message={error} onRetry={() => { void handleRefresh(); }} />}
          {renderPosts()}
        </View>
      </ScreenLayout>
      {profilePost && <UserProfileModal visible onClose={() => setProfilePost(null)} userId={profilePost.partnerId} token={authToken} prefilledName={profilePost.employerName} prefilledRole={profilePost.kind === 'job' ? 'Homeowner' : profilePost.roleTag} prefilledAvatar={profilePost.avatar} />}
      <JobDetailSheet
        visible={!!selectedPost} job={selectedPost} onClose={() => setSelectedPost(null)}
        onApply={() => selectedPost && contactPoster(selectedPost)}
        isApplied={selectedPost?.kind === 'job' ? isApplied(selectedPost.id) : false}
        isApplying={applyingJobId === selectedPost?.id}
        isSaved={selectedPost ? isSaved(selectedPost.id) : false}
        isClosed={selectedPost ? !canUsePost(selectedPost) || isClosed(selectedPost.id) || isClosed(selectedPost.partnerId) || (selectedPost.kind === 'job' && isClosed(selectedPost.employerName)) : false}
        onToggleSave={() => { if (selectedPost) void toggleSave(selectedPost, authToken); }}
        onViewProfile={() => selectedPost && setProfilePost(selectedPost)}
        ctaText={role === 'homeowner' ? uiText("Message Kasambahay") : undefined}
        ctaNotice={role === 'homeowner' ? uiText("Start direct chat with this kasambahay") : undefined}
        token={authToken}
      />
      {activeChat && <ChatDetailScreen visible onClose={() => setActiveChat(null)} partnerId={activeChat.post.partnerId} token={authToken} contactName={activeChat.post.employerName} contactRole={activeChat.post.kind === 'job' ? 'Homeowner' : activeChat.post.roleTag} contactAvatar={activeChat.post.avatar} initialMessage={activeChat.initialMessage} initialReplyTo={activeChat.initialReplyTo} userRole={role} />}
      {pendingReview && (
        <ReviewModal
          visible
          bookingId={pendingReview.booking_id}
          revieweeName={pendingReview.reviewee_name}
          token={authToken}
          isMandatory
          onClose={() => setPendingReview(null)}
          onSuccess={() => setPendingReview(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.colors.canvas }, list: { paddingHorizontal: 20 },
});
