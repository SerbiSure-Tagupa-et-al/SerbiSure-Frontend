import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React, { useState } from 'react';
import { Text, View, ScrollView, Pressable, Alert, Modal, ActivityIndicator, RefreshControl } from 'react-native';

import { Ionicons } from '@expo/vector-icons';

import { VerificationStatusModal } from '../../verification/components/VerificationStatusModal';
import { PasswordSecurityModal } from '../components/PasswordSecurityModal';
import { AboutUsModal } from '../components/AboutUsModal';
import { PrivacyPolicyModal } from '../components/PrivacyPolicyModal';
import { MyBookingsModal } from '../../bookings/components/MyBookingsModal';
import { ManageTagsModal } from '../components/ManageTagsModal';
import { ManageSocialLinksModal } from '../components/ManageSocialLinksModal';
import { AllReviewsModal } from '../../reviews/components/AllReviewsModal';
import { AppHeader } from '../../../shared/components/AppHeader';
import { ProfileAvatar } from '../../../shared/ui/ProfileAvatar';
import { formatRegisteredLocation } from '../../../shared/services/locationService';

import { ROLE_CONFIG } from '../../../app/roleConfig';

import type { ProfileScreenProps } from '../types';
import { setRememberedAccount } from '../../../shared/auth/rememberedAccount';

import { useProfile } from '../hooks/useProfile';
import { profileStyles as styles } from '../styles';
import { BioSection } from '../components/BioSection';
import { ReputationSection } from '../worker/ReputationSection';
import { AvailabilitySection } from '../worker/AvailabilitySection';
import { SettingsSection } from '../components/SettingsSection';
import { ReviewsSection } from '../components/ReviewsSection';
import { SocialIconsRow } from '../components/SocialIconsRow';
import { WorkerCvModal } from '../worker/WorkerCvModal';
import { ProfileTabs } from '../components/ProfileTabs';
import { OwnPostsSection } from '../components/OwnPostsSection';
import { ProfilePhotoSection } from '../components/ProfilePhotoSection';

export function ProfileScreen(props: ProfileScreenProps) {
  const { tr: uiText } = useUiLanguage();
  const [showCv, setShowCv] = useState(false);
  const [photoRetakeOpen, setPhotoRetakeOpen] = useState(false);
  const profile = useProfile(props);
  const {
    avatarUri,
    onLogout,
    insets,
    t,
    getFullName,
    user,
    updateUser,
    role,
    isWorker,
    copy,
    analyticsData,
    currentView,
    setCurrentView,
    localAvatar,
    reviews,
    summary,
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
    showContactNumber,
    isUpdatingPrivacy,
    isRefreshing,
    bookingsModalInitialTab,
    handleRefresh,
    loadVerificationStatus,
    effectiveVerificationStatus,
    isVerified,
    handleSaveTags,
    handleToggleContactPrivacy,
    positivePercentage,
    socialLinks,
    reloadSocialLinks,
    totalReviews,
  } = profile;

  return (
    <View style={styles.container}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scrollContent, { paddingTop: 4 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={['#FFB43B']}
            tintColor="#FFB43B"
          />
        }
      >

        <ProfilePhotoSection info={verificationData} token={user.token} role={role} open={photoRetakeOpen}
          onOpenChange={setPhotoRetakeOpen} onSaved={loadVerificationStatus} />
        {currentView === 'personal_info' ? (
          <React.Fragment>
            {/* Identity Hero Card (Clean Rounded Peach Neo-Pop Card matching Ryan Gosling design) */}
            <View style={styles.personalHeroCard}>
              {/* Top row: Avatar on left, Role pill badge + View CV pill on right */}
              <View style={styles.personalHeroTopRow}>
                <View style={styles.personalAvatarWrapper}>
                  <ProfileAvatar uri={user.profileLink || localAvatar || avatarUri} name={getFullName()} size={90} />
                  {isVerified ? (
                    <View style={styles.avatarShieldBadgePersonal}>
                      <Ionicons
                        name="shield-checkmark"
                        size={15}
                        color="#FFFFFF"
                      />
                    </View>
                  ) : null}
                </View>

                <View style={styles.heroTopActions}>
                  <View style={styles.roleBadgePill}>
                    <Text style={styles.roleBadgePillText}>{uiText(copy.name)}</Text>
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

              {/* Name Row */}
              <View style={styles.personalNameRow}>
                <Text style={styles.personalName}>{getFullName()}</Text>
                {isVerified ? (
                  <Ionicons name="checkmark-circle" size={19} color="#10B981" style={{ marginLeft: 6 }} />
                ) : null}
              </View>

              {/* Location Row */}
              <View style={styles.heroInfoRow}>
                <Ionicons name="location-sharp" size={14} color="#0D0D11" />
                <Text style={styles.heroInfoText}>
                  {formatRegisteredLocation(user.street, user.city, user.province) || uiText("Location not provided")}
                </Text>
              </View>

              {/* Phone Row */}
              {user.contactNumber ? (
                <View style={[styles.heroInfoRow, { marginTop: 6 }]}>
                  <Ionicons name="call" size={13} color="#0D0D11" />
                  <Text style={styles.heroInfoText}>{user.contactNumber}</Text>
                  <Pressable
                    style={[
                      styles.privacyPill,
                      showContactNumber ? styles.privacyPillPublic : styles.privacyPillPrivate,
                      { marginLeft: 4 },
                    ]}
                    onPress={() => handleToggleContactPrivacy(!showContactNumber)}
                    disabled={isUpdatingPrivacy}
                  >
                    <Ionicons
                      name={showContactNumber ? 'eye' : 'eye-off'}
                      size={10}
                      color={showContactNumber ? '#065F46' : '#6B7280'}
                    />
                    <Text
                      style={[
                        styles.privacyPillText,
                        showContactNumber ? styles.privacyPillTextPublic : styles.privacyPillTextPrivate,
                      ]}
                    >
                      {showContactNumber ? uiText("Public") : uiText("Private")}
                    </Text>
                  </Pressable>
                </View>
              ) : null}


              {/* Ticket Notched Divider */}
              <View style={styles.ticketDividerContainer}>
                <View style={styles.ticketNotchLeft} />
                <View style={styles.ticketDividerLine} />
                <View style={styles.ticketNotchRight} />
              </View>

              {/* Sentiment Track */}
              <View style={styles.sentimentCard}>
                <Text style={styles.sentimentCardLabel}>
                  {isWorker ? (t.workerSentiment || 'Worker Sentiment') : (t.clientSentiment || 'Client Sentiment')}
                </Text>
                <View style={styles.sentimentTrack}>
                  <View
                    style={[
                      styles.sentimentFill,
                      {
                        width: `${totalReviews > 0 ? Math.min(100, Math.max(0, positivePercentage ?? 0)) : 0}%`,
                        backgroundColor: totalReviews > 0 ? '#22C55E' : 'transparent',
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.sentimentCardScore, totalReviews === 0 && { color: '#6B7280', fontWeight: '600' }]}>
                  {totalReviews > 0 ? uiText('{count}% Positive', { count: positivePercentage ?? 0 }) : uiText("No reviews yet")}
                </Text>
              </View>

              {/* Integrated Profile Tags */}
              {tags && tags.length > 0 ? (
                <View style={styles.heroTagsWrap}>
                  {tags.map((tagItem, idx) => (
                    <View key={`${tagItem}-${idx}`} style={styles.heroTagPill}>
                      <Text style={styles.heroTagPillText}>{tagItem}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Social Links Row with Real App Icons and Single Unified Edit Button */}
              <SocialIconsRow
                links={socialLinks}
                editable
                onEdit={() => setIsManageSocialLinksModalVisible(true)}
              />
            </View>

            <BioSection profile={profile} />
            {isWorker && <ReputationSection profile={profile} />}
            <ProfileTabs activeTab={profile.activeProfileTab} onChange={profile.setActiveProfileTab}
              postsCount={profile.pendingPosts.length} reviewsCount={totalReviews} />
            {profile.activeProfileTab === 'posts'
              ? <OwnPostsSection posts={profile.pendingPosts} loading={profile.isLoadingPendingPosts} error={profile.pendingPostsError}
                  token={user.token} now={profile.postsNow} onRefresh={() => { void profile.loadPendingPosts(true); }} />
              : <ReviewsSection profile={profile} showHeader={false} />}

            {/* Bottom padding */}
            <View style={{ height: 90 }} />
          </React.Fragment>
        ) : (
          <React.Fragment>
            {/* Settings Profile Hero Card */}
            <View style={styles.settingsHeroCard}>
              <View style={styles.settingsHeroTopRow}>
                <View style={styles.avatarWrapper}>
                  <ProfileAvatar uri={user.profileLink || localAvatar || avatarUri} name={getFullName()} size={68} />
                  {isVerified ? (
                    <View style={styles.avatarShieldBadge}>
                      <Ionicons
                        name="shield-checkmark"
                        size={13}
                        color="#FFFFFF"
                      />
                    </View>
                  ) : null}
                </View>

                <View style={styles.heroDetails}>
                  <View style={styles.heroNameRow}>
                    <Text style={styles.heroName} numberOfLines={1}>{getFullName()}</Text>
                    {isVerified ? (
                      <Ionicons name="checkmark-circle" size={17} color="#4CAF50" style={{ marginLeft: 5, marginBottom: 2 }} />
                    ) : null}
                  </View>
                  <View style={styles.heroRolePillBadge}>
                    <Text style={styles.rolePillText}>{uiText(user.accountType || ROLE_CONFIG[role].accountType).toUpperCase()}</Text>
                  </View>

                  <View style={styles.heroContactRow}>
                    <Ionicons name="call" size={12} color="#9CA3AF" />
                    <Text style={styles.heroContactText}>{user.contactNumber || uiText("No phone registered")}</Text>
                    <View
                      style={[
                        styles.privacyPill,
                        showContactNumber ? styles.privacyPillPublic : styles.privacyPillPrivate,
                      ]}
                    >
                      <Text
                        style={[
                          styles.privacyPillText,
                          showContactNumber ? styles.privacyPillTextPublic : styles.privacyPillTextPrivate,
                        ]}
                      >
                        {showContactNumber ? uiText("Public") : uiText("Private")}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {isWorker && <AvailabilitySection profile={profile} />}
            </View>

            {/* Verification Notice Banner */}
            {profile.renewalRequired ? (
              <Pressable style={styles.verificationNoticeBanner} onPress={() => setIsVerificationModalVisible(true)}>
                <View style={styles.verificationNoticeIconBox}>
                  <Ionicons name="refresh-circle" size={22} color="#B45309" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.verificationNoticeTitle}>{uiText('Renewal needed')}</Text>
                  <Text style={styles.verificationNoticeSub}>{uiText('A required document has expired. Tap to upload your renewed document so you can apply and post again.')}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#B45309" />
              </Pressable>
            ) : effectiveVerificationStatus === 'Pending' ? (
              <Pressable
                style={styles.verificationNoticeBanner}
                onPress={() => setIsVerificationModalVisible(true)}
              >
                <View style={styles.verificationNoticeIconBox}>
                  <Ionicons name="time" size={18} color="#B45309" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={styles.verificationNoticeTitle}>{profile.renewalPending ? uiText('Renewal under review') : copy.pendingTitle}</Text>
                  <Text style={styles.verificationNoticeSub}>
                    {profile.renewalPending ? uiText('We received your renewed document. You can apply and post again once your required documents are approved and valid.') : copy.pendingDescription}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#B45309" />
              </Pressable>
            ) : effectiveVerificationStatus === 'Rejected' ? (
              <Pressable
                style={[styles.verificationNoticeBanner, styles.verificationNoticeBannerRejected]}
                onPress={() => setIsVerificationModalVisible(true)}
              >
                <View style={[styles.verificationNoticeIconBox, styles.verificationNoticeIconBoxRejected]}>
                  <Ionicons name="alert-circle" size={18} color="#B91C1C" />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={[styles.verificationNoticeTitle, { color: '#B91C1C' }]}>{uiText("Verification Needs Attention")}</Text>
                  <Text style={styles.verificationNoticeSub}>
                    {uiText("A document was rejected. Tap to review feedback and re-upload.")}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color="#B91C1C" />
              </Pressable>
            ) : null}

            <SettingsSection profile={profile} />
            {/* Log Out Pill Button */}
            <Pressable
              style={({ pressed }) => [
                styles.logoutButton,
                pressed && { opacity: 0.8 },
              ]}
              onPress={async () => {
                const name = (profile.getFirstNameOnly ? profile.getFirstNameOnly() : profile.user?.firstName || 'User').trim().split(' ')[0] || 'User';
                const id = profile.user?.email || profile.user?.contactNumber || '';
                await setRememberedAccount({ firstName: name, identifier: id });
                onLogout?.();
              }}
            >
              <Ionicons name="log-out-outline" size={18} color="#FFFFFF" />
              <Text style={styles.logoutButtonText}>{t.logout}</Text>
            </Pressable>

            {/* Bottom padding for tab bar */}
            <View style={{ height: 85 }} />
          </React.Fragment>
        )}
      </ScrollView>

      {/* Verification Status Modal */}
      <VerificationStatusModal
        visible={isVerificationModalVisible}
        onClose={() => setIsVerificationModalVisible(false)}
        statusData={verificationData}
        loading={isLoadingVerification}
        token={user.token}
        onRefresh={loadVerificationStatus}
        onRetakePhoto={() => { setIsVerificationModalVisible(false); setPhotoRetakeOpen(true); }}
        role={role}
      />

      {/* Password & Security Modal */}
      <PasswordSecurityModal
        visible={isPasswordModalVisible}
        onClose={() => setIsPasswordModalVisible(false)}
        token={user.token}
      />

      {/* About Us Modal */}
      <AboutUsModal
        visible={isAboutUsModalVisible}
        onClose={() => setIsAboutUsModalVisible(false)}
      />

      {/* Privacy Policy Modal */}
      <PrivacyPolicyModal
        visible={isPrivacyPolicyModalVisible}
        mode="view"
        onClose={() => setIsPrivacyPolicyModalVisible(false)}
      />

      {/* Terms and Conditions Modal */}
      <PrivacyPolicyModal
        visible={isTermsModalVisible}
        document="terms"
        mode="view"
        onClose={() => setIsTermsModalVisible(false)}
      />

      {/* My Bookings / Jobs Modal */}
      <MyBookingsModal
        visible={isMyBookingsModalVisible}
        onClose={() => setIsMyBookingsModalVisible(false)}
        onSafetyAcknowledged={profile.returnToDashboard}
        token={user.token || ''}
        accountType={ROLE_CONFIG[role].accountType}
        initialTab={bookingsModalInitialTab}
      />

      {/* Manage Tags Modal */}
      <ManageTagsModal
        visible={isManageTagsModalVisible}
        onClose={() => setIsManageTagsModalVisible(false)}
        currentTags={tags}
        onSave={handleSaveTags}
        accountType={user.accountType}
      />

      {/* Manage Social Links & Tags Modal */}
      <ManageSocialLinksModal
        visible={isManageSocialLinksModalVisible}
        onClose={() => setIsManageSocialLinksModalVisible(false)}
        token={user.token}
        currentTags={tags}
        onSaveTags={handleSaveTags}
        onSaved={() => {
          reloadSocialLinks();
          void handleRefresh();
        }}
        accountType={user.accountType}
      />

      {/* Worker CV Modal */}
      {isWorker && user.id && user.token && (
        <WorkerCvModal
          visible={showCv}
          onClose={() => setShowCv(false)}
          userId={user.id}
          token={user.token}
          avatarUrl={user.profileLink}
          email={user.email}
          editable
          onSaved={() => void handleRefresh()}
        />
      )}

      {/* All Reviews Modal */}
      <AllReviewsModal
        visible={isAllReviewsModalVisible}
        onClose={() => setIsAllReviewsModalVisible(false)}
        reviews={reviews}
        averageRating={analyticsData?.average_rating ?? summary?.average_rating}
        positivePercentage={positivePercentage}
        title={copy.reviewTitle}
      />
    </View>
  );
}

