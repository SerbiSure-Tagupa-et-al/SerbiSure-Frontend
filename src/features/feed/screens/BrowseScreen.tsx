import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ROLE_CONFIG, type Role } from '../../../app/roleConfig';
import { useLanguage } from '../../../shared/localization/LanguageContext';
import THEME from '../../../shared/theme/theme';
import { useUser } from '../../auth/session/UserContext';
import { savedJobsStore, useJobsActivity, type SavedJobItem } from '../../bookings/store/savedJobsStore';
import { useJobApplication } from '../../bookings/hooks/useJobApplication';
import type { PendingMandatoryReview } from '../../bookings/api/bookingApi';
import { ReviewModal } from '../../reviews/components/ReviewModal';
import { ChatDetailScreen } from '../../chat/components/ChatDetailScreen';
import { chatStore } from '../../chat/store/chatStore';
import { UserProfileModal } from '../../profile/components/UserProfileModal';
import { BrowseActivityCard } from '../components/BrowseActivityCard';
import { BrowseHeader, BrowseFilters } from '../components/BrowseHeader';
import { BrowsePostCard, BrowseCardBackdrop } from '../components/BrowsePostCard';
import { BrowseDeckEmpty, BrowseDeckSkeleton, BrowseDeckSwipeControls, BrowseEmptyState, browseDeckStyles as deckStyles } from '../components/BrowseDeck';
import { FilterModal, DEFAULT_FILTERS, type FeedFilters } from '../components/FilterModal';
import { LocationRadiusModal } from '../components/LocationRadiusModal';
import { ProposalsModal } from '../../bookings/components/ProposalsModal';
import { JobDetailSheet } from '../components/JobDetailSheet';
import { activeBrowseChip, quickBrowseFilters, countBrowseFilters, browseHeaderCopy, type BrowseTab } from '../browsePresentation';
import { defaultLocationFilter, formatLocationChipLabel, locationEmptyPrompt, type LocationFilterState } from '../locationFilter';
import { mapBrowsePost } from '../feedMapper';
import { useBrowseSwipeDeck } from '../hooks/useBrowseSwipeDeck';
import { useExploreFeed } from '../hooks/useExploreFeed';
import { usePostUpdates } from '../hooks/usePostUpdates';
import type { BookingFeedDto } from '../types';

interface Props {
  role: Role;
  avatarUri?: string | null;
  onViewProfile?: () => void;
  token?: string | null;
  onBookingsPress?: () => void;
}

interface ActiveChat {
  partnerId: string;
  name: string;
  role: string;
  avatar: string;
  initialMessage: string;
  initialReplyTo?: { author: string; text: string };
}

export function BrowseScreen({ role, avatarUri, onViewProfile, token, onBookingsPress }: Props) {
  const { tr: uiText } = useLanguage();
  const { user } = useUser();
  const effectiveToken = token || user.token;
  const [pendingReview, setPendingReview] = useState<PendingMandatoryReview | null>(null);
  const { applyJob, applyingJobId } = useJobApplication(effectiveToken, () => { void refresh(); }, setPendingReview);
  const findingJobs = role === 'kasambahay';
  const partnerRole = ROLE_CONFIG[role].partnerType;
  const mapPost = useCallback((item: BookingFeedDto) => mapBrowsePost(item, role), [role]);
  const { items, setItems, isLoading, error: feedError, fetchItems, fetchedCount } = useExploreFeed(role, effectiveToken, mapPost);
  const defaultFiltersForUser = useCallback((): FeedFilters => {
    const loc = defaultLocationFilter(user);
    return {
      ...DEFAULT_FILTERS,
      locationScope: loc.scope,
      radiusKm: loc.radiusKm,
      originCity: loc.city,
      originBarangay: loc.barangay,
    };
  }, [user.city, user.barangay]);
  const [filters, setFilters] = useState<FeedFilters>(() => defaultFiltersForUser());
  const [filterVisible, setFilterVisible] = useState(false);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [quickFiltersVisible, setQuickFiltersVisible] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [subTab, setSubTab] = useState<BrowseTab>('explore');
  const [bidPost, setBidPost] = useState<SavedJobItem | null>(null);
  const [withdrawing, setWithdrawing] = useState<string | number | null>(null);
  const [selectedPost, setSelectedPost] = useState<SavedJobItem | null>(null);
  const [profilePost, setProfilePost] = useState<SavedJobItem | null>(null);
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const { savedJobs, savedLoadError, loadingSaved, appliedJobs, savedCount, appliedCount,
    isSaved, isApplied, isJobClosed, toggleSave, refreshSavedFromBackend } = useJobsActivity();
  const { canUsePost, now } = usePostUpdates([...items, ...savedJobs, ...appliedJobs], () => { void refresh(); });
  const visiblePosts = useMemo(() => {
    let posts = items.filter(post => canUsePost(post) && (!findingJobs || !isJobClosed(post)));

    // 1. Service Category filter
    if (filters.categories && filters.categories.length > 0) {
      posts = posts.filter(post => {
        const postTags = [post.roleTag, post.title, ...(post.tags || [])]
          .filter(Boolean)
          .map(t => (t || '').toLowerCase().replace(/[-_\s]/g, ''));
        return filters.categories.some(cat => {
          const normCat = cat.toLowerCase().replace(/[-_\s]/g, '');
          return postTags.some(tag => tag.includes(normCat) || normCat.includes(tag));
        });
      });
    }

    // 2. Booking Type filter
    if (filters.bookingType) {
      posts = posts.filter(post => {
        const term = (post.termTag || '').toLowerCase();
        if (filters.bookingType === 'short_term') return term.includes('short') || term.includes('part');
        if (filters.bookingType === 'long_term') return term.includes('long') || term.includes('full');
        return true;
      });
    }

    // 3. Work Setup filter
    if (filters.workSetup) {
      posts = posts.filter(post => {
        const setup = (post.setupTag || '').toLowerCase().replace(/[-_\s]/g, '');
        const target = filters.workSetup?.toLowerCase().replace(/[-_\s]/g, '');
        return target ? setup.includes(target) : true;
      });
    }

    // 4. Max Rate filter
    if (findingJobs && filters.maxRate !== null && filters.maxRate !== undefined) {
      posts = posts.filter(post => {
        const num = parseFloat(String(post.price || '').replace(/[^0-9.]/g, ''));
        return isNaN(num) || num <= filters.maxRate!;
      });
    }

    // 5. Location filter
    if (filters.location && filters.location.trim()) {
      const locTarget = filters.location.trim().toLowerCase();
      posts = posts.filter(post => (post.location || '').toLowerCase().includes(locTarget));
    }

    return posts;
  }, [items, findingJobs, isJobClosed, filters, canUsePost]);
  const currentPost = useRef<SavedJobItem | undefined>(undefined);
  currentPost.current = visiblePosts[0];

  const contactPost = async (post: SavedJobItem, quote = false, applyBudget = true) => {
    if (!post.partnerId) return false;
    const application = findingJobs && applyBudget ? await applyJob(post) : null;
    if (findingJobs && applyBudget && !application) return false;
    const partnerId = String(post.partnerId);
    const name = post.employerName || partnerRole;
    const contactRole = findingJobs ? partnerRole : post.roleTag || partnerRole;
    const initialMessage = findingJobs ? '' : 'Hi! I am interested in hiring you for a service.';
    const snippet = [post.roleTag || post.title, `${post.price} ${post.unit}`.trim(), post.location, post.termTag].filter(Boolean).join(' • ');
    chatStore.addOrUpdateChat({
      id: partnerId, partnerId, name, badge: contactRole, avatar: post.avatar, time: 'Just now',
      message: findingJobs ? 'I am interested in this job position' : initialMessage
    });
    setSelectedPost(null);
    setActiveChat({
      partnerId, name, role: contactRole, avatar: post.avatar, initialMessage,
      initialReplyTo: findingJobs || quote ? { author: findingJobs ? 'Job Post' : 'Service Post', text: snippet } : undefined
    });
    return true;
  };

  const removeCurrentCard = (interested: boolean) => {
    const post = currentPost.current;
    if (!post) return;
    if (interested) {
      void contactPost(post, true).then(contacted => {
        if (contacted) setItems(previous => previous.filter(item => item.id !== post.id));
        else position.setValue({ x: 0, y: 0 });
      });
    } else setItems(previous => previous.filter(item => item.id !== post.id));
  };
  const { position, rotateCard, panHandlers, swipeCard } = useBrowseSwipeDeck(
    subTab === 'explore' && !isLoading && !feedError ? visiblePosts[0]?.id : undefined, removeCurrentCard);

  const fetchFeed = async (forceRefresh = false, selectedFilters = filters) => {
    const loaded = await fetchItems(forceRefresh, selectedFilters);
    if (loaded) position.setValue({ x: 0, y: 0 });
  };
  const applyFilters = (updated: FeedFilters) => {
    const safeFilters = findingJobs ? updated : { ...updated, maxRate: null };
    setFilters(safeFilters);
    void fetchFeed(true, safeFilters);
  };
  const currentLocationState: LocationFilterState = {
    scope: filters.locationScope || 'all',
    radiusKm: filters.radiusKm || 5,
    city: filters.originCity || '',
    barangay: filters.originBarangay || '',
  };
  const applyLocation = (next: LocationFilterState) => {
    applyFilters({
      ...filters,
      locationScope: next.scope,
      radiusKm: next.radiusKm,
      originCity: next.city,
      originBarangay: next.barangay,
    });
  };
  const refresh = async () => {
    setIsRefreshing(true);
    try {
      position.setValue({ x: 0, y: 0 });
      await Promise.all([fetchFeed(true), effectiveToken ? refreshSavedFromBackend(effectiveToken) : Promise.resolve()]);
    } finally { setIsRefreshing(false); }
  };

  useEffect(() => {
    const initial = defaultFiltersForUser();
    setBidPost(null); setFilters(initial); setSubTab('explore'); setSelectedPost(null); setProfilePost(null); setActiveChat(null); setFilterVisible(false); setLocationModalVisible(false); setQuickFiltersVisible(true);
    void fetchFeed(true, initial);
    if (effectiveToken) void refreshSavedFromBackend(effectiveToken);
  }, [role, effectiveToken, user.city, user.barangay]);
  useEffect(() => {
    if ((subTab === 'saved' || subTab === 'applied') && effectiveToken) void refreshSavedFromBackend(effectiveToken);
  }, [subTab, effectiveToken]);

  const withdraw = (post: SavedJobItem) => Alert.alert(uiText('Withdraw Bid?'), uiText('Withdrawing a pending bid has no cancellation penalty.'), [
    { text: uiText('Cancel'), style: 'cancel' },
    { text: uiText('Withdraw Bid'), onPress: async () => {
      if (withdrawing !== null) return;
      setWithdrawing(post.id);
      try { await savedJobsStore.withdrawBid(post, effectiveToken); }
      catch (error) { Alert.alert(uiText('Unable to Send'), uiText(error instanceof Error ? error.message : 'Please try again.')); }
      finally { setWithdrawing(null); }
    } },
  ]);
  const activeFilterCount = countBrowseFilters(filters);
  const activityPosts = subTab === 'applied' ? appliedJobs : savedJobs;
  const headerCopy = browseHeaderCopy(role, subTab, subTab === 'explore' ? visiblePosts.length : subTab === 'saved' ? savedCount : appliedCount, isLoading, feedError, uiText);
  const [card0, card1, card2] = visiblePosts;
  const detailsClosed = !!selectedPost && (!canUsePost(selectedPost) || (findingJobs && isJobClosed(selectedPost)));
  const openProfile = (post: SavedJobItem) => { if (post.partnerId) setProfilePost(post); };

  return <View style={styles.container}>
    <ScrollView style={{ flex: 1, backgroundColor: THEME.colors.canvas }} contentContainerStyle={{ flexGrow: 1, paddingTop: 6, paddingBottom: 20 }}
      showsVerticalScrollIndicator={false} alwaysBounceVertical
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refresh} colors={[THEME.colors.brandDark]} tintColor={THEME.colors.brandDark} progressViewOffset={0} />}>
      <BrowseHeader {...headerCopy} name={user.firstName || ROLE_CONFIG[role].accountType} avatarUri={user.profileLink || avatarUri}
        tab={subTab} savedCount={savedCount} appliedCount={findingJobs ? appliedCount : undefined}
        onTabChange={tab => setSubTab(!findingJobs && tab === 'applied' ? 'explore' : tab)} onProfilePress={onViewProfile}
        filtersVisible={quickFiltersVisible} onFiltersToggle={() => setQuickFiltersVisible(visible => !visible)} />
      {subTab === 'explore' ? <>
        <View style={styles.locationChipWrap}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={uiText('Change location and distance')}
            onPress={() => setLocationModalVisible(true)}
            style={({ pressed }) => [styles.locationChip, pressed && { opacity: 0.78 }]}
          >
            <Ionicons name="location-sharp" size={14} color={THEME.colors.brandDark} />
            <Text style={styles.locationChipText} numberOfLines={1}>{formatLocationChipLabel(currentLocationState, uiText)}</Text>
            <Ionicons name="chevron-down" size={14} color={THEME.colors.textSecondary} />
          </Pressable>
        </View>
        {quickFiltersVisible && <BrowseFilters activeChip={activeBrowseChip(filters)} filterCount={activeFilterCount}
          onChipPress={label => applyFilters(quickBrowseFilters(filters, label))} onFilterPress={() => setFilterVisible(true)} />}
        {isLoading ? <View style={deckStyles.centerWrapper}><BrowseDeckSkeleton /></View>
          : feedError || !card0 ? <View style={deckStyles.emptyContainer}><BrowseDeckEmpty role={role} fetchedCount={fetchedCount}
            hasFilters={activeFilterCount > 0} error={feedError} onRefresh={() => { void fetchFeed(true); }} onClearFilters={() => applyFilters(defaultFiltersForUser())}
            locationPrompt={locationEmptyPrompt(currentLocationState, uiText)} onSelectLocation={applyLocation} /></View>
            : <View style={deckStyles.centerWrapper}><View style={deckStyles.container}>
              {card2 && <View style={deckStyles.back}><BrowseCardBackdrop avatarUri={card2.avatar} name={card2.employerName} /></View>}
              {card1 && <View style={deckStyles.middle}><BrowseCardBackdrop avatarUri={card1.avatar} name={card1.employerName} /></View>}
              <Animated.View style={[deckStyles.front, { transform: [{ translateX: position.x }, { translateY: position.y }, { rotate: rotateCard }] }]} {...panHandlers}>
                <BrowsePostCard startTime={card0.start_time} name={card0.employerName} avatarUri={card0.avatar} authorRole={partnerRole} title={card0.title}
                  location={card0.location} proximityLabel={card0.proximity_label} description={card0.aboutText} tags={card0.tags} price={card0.price} unit={card0.unit}
                  saved={isSaved(card0.id)} applied={findingJobs && isApplied(card0.id)} onProfilePress={() => openProfile(card0)}
                  onSave={() => { void toggleSave(card0, effectiveToken); }} onDetails={() => setSelectedPost(card0)} />
              </Animated.View>
              <BrowseDeckSwipeControls role={role} dragX={position.x} onSkip={() => swipeCard('left')} onInterested={() => swipeCard('right')} />
            </View></View>}
      </> : <View style={styles.activityTabContainer}>
        {loadingSaved && activityPosts.length === 0 ? <BrowseDeckSkeleton />
          : savedLoadError ? <BrowseEmptyState icon="cloud-offline-outline" title={subTab === 'applied' ? 'Unable to load applications' : 'Unable to load saved posts'}
            description={savedLoadError} action="Retry" onAction={() => { void refreshSavedFromBackend(effectiveToken || null); }} />
            : activityPosts.length === 0 ? <View style={deckStyles.emptyContainer}><BrowseEmptyState icon={subTab === 'applied' ? 'paper-plane-outline' : 'bookmark-outline'}
              title={subTab === 'applied' ? 'No applications yet' : findingJobs ? 'No saved jobs yet' : 'No saved services yet'}
              description={subTab === 'applied' ? 'Jobs you apply to will appear here.' : findingJobs ? 'Save job posts to review and apply when you are ready.' : 'Save service posts to review or message the kasambahay later.'}
            /></View>
              : <View style={styles.activityList}>{activityPosts.map(post => <BrowseActivityCard key={post.id} post={post}
                now={now}
                applied={findingJobs && (subTab === 'applied' || isApplied(post.id))} closed={findingJobs && (isJobClosed(post) || !canUsePost(post))}
                onProfile={() => openProfile(post)} onDetails={() => setSelectedPost(post)}
                onUnsave={subTab === 'saved' ? () => { void toggleSave(post, effectiveToken); } : undefined}
                onMessage={() => { void contactPost(post, false, false); }}
                onWithdraw={subTab === 'applied' && post.application_status === 'applied' && post.proposalId ? () => withdraw(post) : undefined} withdrawing={withdrawing === post.id} />)}</View>}
      </View>}
      <JobDetailSheet visible={!!selectedPost} job={selectedPost} onClose={() => setSelectedPost(null)}
        onMessage={() => { if (selectedPost) void contactPost(selectedPost, false, false); }}
        onSubmitBid={() => { setBidPost(selectedPost); setSelectedPost(null); }}
        isApplying={applyingJobId === selectedPost?.id}
        onApply={() => { if (selectedPost) contactPost(selectedPost); }} isApplied={findingJobs && !!selectedPost && isApplied(selectedPost.id)}
        isSaved={!!selectedPost && isSaved(selectedPost.id)} isClosed={detailsClosed}
        onToggleSave={() => { if (selectedPost) void toggleSave(selectedPost, effectiveToken); }}
        onViewProfile={() => { if (selectedPost) { openProfile(selectedPost); setSelectedPost(null); } }}
        ctaText={!findingJobs ? uiText('Message Kasambahay') : undefined}
        ctaNotice={!findingJobs ? uiText('Start a direct chat with this kasambahay') : undefined} token={effectiveToken} />
      {bidPost && <ProposalsModal visible onClose={() => setBidPost(null)} bookingId={String(bidPost.id)} isPoster={false}
        currentRate={bidPost.price?.replace(/[^0-9.]/g, '') || null} ratePeriod={bidPost.unit?.includes('month') ? 'month' : 'day'} token={effectiveToken} onUpdated={() => { void refresh(); }} />}
      {activeChat && <ChatDetailScreen visible onClose={() => setActiveChat(null)} {...activeChat}
        contactName={activeChat.name} contactRole={activeChat.role} contactAvatar={activeChat.avatar} userRole={role} token={effectiveToken} />}
      <FilterModal
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        onApply={applyFilters}
        initialFilters={filters}
        mode={role}
        onPickLocation={() => {
          setFilterVisible(false);
          setLocationModalVisible(true);
        }}
      />
      <LocationRadiusModal
        visible={locationModalVisible}
        value={currentLocationState}
        userLocation={user}
        onClose={() => setLocationModalVisible(false)}
        onApply={applyLocation}
      />
      {profilePost && <UserProfileModal visible onClose={() => setProfilePost(null)} userId={String(profilePost.partnerId)}
        prefilledName={profilePost.employerName} prefilledRole={partnerRole} prefilledAvatar={profilePost.avatar} token={effectiveToken || ''} />}
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
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: THEME.colors.canvas },
  locationChipWrap: { marginHorizontal: 20, marginBottom: 8, alignItems: 'flex-start' },
  locationChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: THEME.roundness.pill, backgroundColor: THEME.colors.white, borderWidth: 1, borderColor: '#EAE6DF', maxWidth: '100%' },
  locationChipText: { flexShrink: 1, fontSize: 12.5, fontFamily: THEME.typography.fontFamily.secondarySemiBold, color: THEME.colors.ink },
  activityTabContainer: { flex: 1, paddingBottom: 40 },
  activityList: { paddingHorizontal: 20, gap: 12, paddingTop: 4 },
});
