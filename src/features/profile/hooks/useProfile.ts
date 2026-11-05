import React, { useState, useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLanguage } from '../../../shared/localization/LanguageContext';
import { useUser } from '../../auth/session/UserContext';
import { fetchReceivedReviews, fetchReviewSummary, ReviewItem, ReviewSummaryData } from '../../reviews/api/reviewApi';
import { fetchUserAbout, fetchUserTags, updateUserTags, fetchContactPrivacy, updateContactPrivacy, fetchUserSocialLinks, type SocialLinkItem } from '../api/accountApi';
import type { VerificationStatusResponse } from '../../verification/api/verificationApi';
import { fetchNotifications } from '../../notifications/api/notificationsApi';

import { BookingItem, fetchMyPosts } from '../../bookings/api/bookingApi';
import { usePostUpdates } from '../../feed/hooks/usePostUpdates';

import { resolveRole, ROLE_CONFIG } from '../../../app/roleConfig';
import { localizeProfileCopy } from '../profileConfig';
import type { ProfileScreenProps } from '../types';
import { useWorkerProfile } from '../worker/useWorkerProfile';

export function useProfile({ role: requestedRole, avatarUri, initialView = 'main', onViewChange, onUpdateAvatar, onBack, onLogout, onBookingsPress }: ProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const { language, setLanguage, t, tr } = useLanguage();
  const { getFullName, getFirstNameOnly, user, updateUser, refreshUserProfile } = useUser();
  const role = requestedRole || resolveRole(user.accountType);
  const isWorker = ROLE_CONFIG[role].workerProfile;
  const copy = localizeProfileCopy(role, tr);
  const worker = useWorkerProfile(isWorker);
  const { isOnJob, jobStatusError, isUpdatingJobStatus, analyticsData, isLoadingAnalytics, refreshWorkerProfile, handleToggleJobStatus } = worker;
  const [currentView, setCurrentView] = useState<'main' | 'personal_info'>(initialView);

  useEffect(() => {
    if (initialView) {
      setCurrentView(initialView);
    }
  }, [initialView]);

  useEffect(() => {
    onViewChange?.(currentView);
  }, [currentView, onViewChange]);

  const [isLanguageExpanded, setIsLanguageExpanded] = useState(false);
  const [localAvatar, setLocalAvatar] = useState<string | null>(avatarUri || null);

  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState<ReviewSummaryData | null>(null);

  const [bio, setBio] = useState<string>(user.userAbout || '');
  const [isLoadingBio, setIsLoadingBio] = useState(false);
  const [isEditingBio, setIsEditingBio] = useState(false);
  const [editBioText, setEditBioText] = useState('');
  const [isSavingBio, setIsSavingBio] = useState(false);

  const [isVerificationModalVisible, setIsVerificationModalVisible] = useState(false);
  const [isPasswordModalVisible, setIsPasswordModalVisible] = useState(false);
  const [isNotificationsModalVisible, setIsNotificationsModalVisible] = useState(false);
  const [isAboutUsModalVisible, setIsAboutUsModalVisible] = useState(false);
  const [isPrivacyPolicyModalVisible, setIsPrivacyPolicyModalVisible] = useState(false);
  const [isTermsModalVisible, setIsTermsModalVisible] = useState(false);
  const [isMyBookingsModalVisible, setIsMyBookingsModalVisible] = useState(false);
  const [unreadNotifCount, setUnreadNotifCount] = useState(0);
  const [verificationData, setVerificationData] = useState<VerificationStatusResponse | null>(null);
  const [isLoadingVerification, setIsLoadingVerification] = useState(false);

  const [tags, setTags] = useState<string[]>(user.userTags || []);
  const [socialLinks, setSocialLinks] = useState<SocialLinkItem[]>([]);
  const [isManageTagsModalVisible, setIsManageTagsModalVisible] = useState(false);
  const [isManageSocialLinksModalVisible, setIsManageSocialLinksModalVisible] = useState(false);
  const [isAllReviewsModalVisible, setIsAllReviewsModalVisible] = useState(false);

  const reloadSocialLinks = async () => {
    if (!user.token) return;
    try {
      const data = await fetchUserSocialLinks(user.token);
      if (data?.social_links) {
        setSocialLinks(data.social_links);
      }
    } catch {}
  };

  useEffect(() => {
    if (user.token) {
      void reloadSocialLinks();
    }
  }, [user.token]);
  const [isReviewsExpanded, setIsReviewsExpanded] = useState(false);
  const [showContactNumber, setShowContactNumber] = useState<boolean>(user.showContactNumber ?? false);
  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [pendingPosts, setPendingPosts] = useState<BookingItem[]>([]);
  const [isLoadingPendingPosts, setIsLoadingPendingPosts] = useState(false);
  const [pendingPostsError, setPendingPostsError] = useState<string | null>(null);
  const postsRequest = useRef(0);
  const postsSession = useRef('');
  postsSession.current = `${user.id}:${user.token}`;
  const [activeProfileTab, setActiveProfileTab] = useState<'posts' | 'reviews'>('posts');
  const [bookingsModalInitialTab, setBookingsModalInitialTab] = useState<'active' | 'pending' | 'completed' | 'cancelled'>('pending');

  const openMyBookings = (initialTab: 'active' | 'pending' | 'completed' | 'cancelled' = 'pending') => {
    setBookingsModalInitialTab(initialTab);
    setIsMyBookingsModalVisible(true);
  };

  const loadPendingPosts = async (silent = false) => {
    if (!user.token) return;
    const session = postsSession.current;
    const request = ++postsRequest.current;
    const isCurrent = () => session === postsSession.current && request === postsRequest.current;
    if (!silent) setIsLoadingPendingPosts(true);
    setPendingPostsError(null);
    try {
      const data = await fetchMyPosts(user.token);
      if (isCurrent()) setPendingPosts(Array.isArray(data) ? data : []);
    } catch (err: any) {
      if (isCurrent()) setPendingPostsError(err?.message || 'Could not load your posts. Please try again.');
    } finally {
      if (isCurrent()) setIsLoadingPendingPosts(false);
    }
  };


  const { now: postsNow } = usePostUpdates(pendingPosts, () => loadPendingPosts(true), currentView === 'personal_info');
  useEffect(() => {
    setPendingPosts([]);
    setPendingPostsError(null);
    setIsLoadingPendingPosts(false);
    if (currentView === 'personal_info') void loadPendingPosts();
    return () => { postsRequest.current++; };
  }, [currentView, user.id, user.token]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const promises: Promise<any>[] = [];
      promises.push(refreshWorkerProfile());
      if (user.token) {
        promises.push(
          refreshUserProfile().then((data) => {
            if (data) setVerificationData(data);
          }).catch(() => { })
        );
        promises.push(
          fetchUserAbout(user.token).then((about) => {
            setBio(about);
            updateUser({ userAbout: about });
          }).catch(() => { })
        );
        promises.push(
          fetchReceivedReviews(user.token).then((items) => {
            setReviews(items || []);
          }).catch(() => { })
        );
        if (user.id) {
          promises.push(
            fetchReviewSummary(user.token, user.id).then((sum) => {
              if (sum) setSummary(sum);
            }).catch(() => { })
          );
        }
        promises.push(
          fetchNotifications(user.token).then((res) => {
            setUnreadNotifCount(res?.unread_count ?? 0);
          }).catch(() => { })
        );
        promises.push(
          fetchUserTags(user.token).then((userTags) => {
            setTags(userTags);
            updateUser({ userTags });
          }).catch(() => { })
        );
        promises.push(
          fetchContactPrivacy(user.token).then((show) => {
            setShowContactNumber(show);
            updateUser({ showContactNumber: show });
          }).catch(() => { })
        );
        promises.push(
          fetchUserSocialLinks(user.token).then((data) => {
            if (data?.social_links) {
              setSocialLinks(data.social_links);
            }
          }).catch(() => { })
        );
        promises.push(loadPendingPosts(true));
      }
      await Promise.allSettled(promises);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } finally {
      setIsRefreshing(false);
    }
  };

  const loadVerificationStatus = (photoSubmitted = false) => {
    // A confirmed upload is Pending even if the follow-up GET loses connection.
    if (photoSubmitted) setVerificationData(previous => previous ? { ...previous,
      documents: previous.documents.map(doc => doc.document_type === 'profile_photo'
        ? { ...doc, verification_status: 'Pending', rejection_reason: null } : doc),
    } : previous);
    if (user.token) {
      setIsLoadingVerification(true);
      return refreshUserProfile()
        .then((data) => {
          if (data) setVerificationData(data);
        })
        .catch((err) => console.warn('[KasambahayProfile] verification status error:', err))
        .finally(() => setIsLoadingVerification(false));
    }
  };

  useEffect(() => {
    if (isVerificationModalVisible) loadVerificationStatus();
  }, [isVerificationModalVisible]);

  // The live account status includes expiry and only the latest required submissions.
  const effectiveVerificationStatus = user.verificationStatus || verificationData?.overall_status || 'Unverified';
  const renewalRequired = user.renewalRequired === true;
  const renewalPending = user.renewalPending === true;
  const verificationLabel = renewalRequired ? 'Renewal needed'
    : renewalPending ? 'Renewal under review' : effectiveVerificationStatus;
  const isVerified = effectiveVerificationStatus === 'Verified' && !renewalRequired;

  React.useEffect(() => {
    if (avatarUri) {
      setLocalAvatar(avatarUri);
    }
  }, [avatarUri]);

  React.useEffect(() => {
    if (initialView) {
      setCurrentView(initialView);
    }
  }, [initialView]);

  React.useEffect(() => {
    if (user.token) {
      setIsLoadingBio(true);
      fetchUserAbout(user.token)
        .then((about) => {
          setBio(about);
          updateUser({ userAbout: about });
        })
        .catch((err) => console.warn('[KasambahayProfile] fetch bio error:', err))
        .finally(() => setIsLoadingBio(false));

      fetchReceivedReviews(user.token)
        .then((items) => {
          setReviews(items || []);
        })
        .catch((err) => console.warn('[KasambahayProfile] Received reviews error:', err));

      if (user.id) {
        fetchReviewSummary(user.token, user.id)
          .then((sum) => {
            if (sum) setSummary(sum);
          })
          .catch((err) => console.warn('[KasambahayProfile] Review summary error:', err));
      }

      fetchNotifications(user.token)
        .then((res) => {
          setUnreadNotifCount(res?.unread_count ?? 0);
        })
        .catch(() => { });

      fetchUserTags(user.token)
        .then((userTags) => {
          setTags(userTags);
          updateUser({ userTags });
        })
        .catch((err) => console.warn('[KasambahayProfile] fetch tags error:', err));

      fetchContactPrivacy(user.token)
        .then((show) => {
          setShowContactNumber(show);
          updateUser({ showContactNumber: show });
        })
        .catch((err) => console.warn('[KasambahayProfile] fetch contact privacy error:', err));

      loadVerificationStatus();
    }
  }, [user.token, user.id]);

  const handleSaveTags = async (newTags: string[]) => {
    if (!user.token) return;
    const saved = await updateUserTags(user.token, newTags);
    setTags(saved);
    updateUser({ userTags: saved });
  };

  const handleToggleContactPrivacy = async (value: boolean) => {
    if (!user.token || isUpdatingPrivacy) return;
    setShowContactNumber(value);
    setIsUpdatingPrivacy(true);
    try {
      const updated = await updateContactPrivacy(user.token, value);
      setShowContactNumber(updated);
      updateUser({ showContactNumber: updated });
    } catch (err: any) {
      setShowContactNumber(!value);
      Alert.alert('Error', err?.message || 'Failed to update contact privacy setting.');
    } finally {
      setIsUpdatingPrivacy(false);
    }
  };

  const totalReviews = summary?.total_reviews ?? reviews.length;
  const positivePercentage =
    summary && summary.total_reviews > 0
      ? Math.round((summary.sentiment_breakdown.Positive / summary.total_reviews) * 100)
      : reviews.length > 0
        ? Math.round((reviews.filter((r) => r.nlp_sentiment === 'Positive').length / reviews.length) * 100)
        : null;

  return {
    avatarUri,
    returnToDashboard: () => { setIsMyBookingsModalVisible(false); onBack?.(); },
    onLogout,
    insets,
    language,
    setLanguage,
    t,
    getFullName,
    getFirstNameOnly,
    user,
    updateUser,
    role,
    isWorker,
    copy,
    isOnJob,
    jobStatusError,
    isUpdatingJobStatus,
    refreshWorkerProfile,
    analyticsData,
    handleToggleJobStatus,
    currentView,
    setCurrentView,
    isLanguageExpanded,
    setIsLanguageExpanded,
    localAvatar,
    reviews,
    summary,
    bio,
    setBio,
    isEditingBio,
    setIsEditingBio,
    editBioText,
    setEditBioText,
    isSavingBio,
    setIsSavingBio,
    isVerificationModalVisible,
    setIsVerificationModalVisible,
    isPasswordModalVisible,
    setIsPasswordModalVisible,
    isAboutUsModalVisible,
    setIsAboutUsModalVisible,
    isPrivacyPolicyModalVisible,
    setIsPrivacyPolicyModalVisible,
    isTermsModalVisible,
    setIsTermsModalVisible,
    isMyBookingsModalVisible,
    setIsMyBookingsModalVisible,
    verificationData,
    isLoadingVerification,
    tags,
    isManageTagsModalVisible,
    setIsManageTagsModalVisible,
    isManageSocialLinksModalVisible,
    setIsManageSocialLinksModalVisible,
    isAllReviewsModalVisible,
    setIsAllReviewsModalVisible,
    isReviewsExpanded,
    setIsReviewsExpanded,
    showContactNumber,
    isUpdatingPrivacy,
    isRefreshing,
    pendingPosts,
    postsNow,
    isLoadingPendingPosts,
    pendingPostsError,
    activeProfileTab,
    setActiveProfileTab,
    bookingsModalInitialTab,
    openMyBookings,
    loadPendingPosts,
    handleRefresh,
    loadVerificationStatus,
    effectiveVerificationStatus,
    renewalRequired,
    renewalPending,
    verificationLabel,
    isVerified,
    handleSaveTags,
    handleToggleContactPrivacy,
    totalReviews,
    positivePercentage,
    socialLinks,
    setSocialLinks,
    reloadSocialLinks,
  };
}

export type ProfileController = ReturnType<typeof useProfile>;
