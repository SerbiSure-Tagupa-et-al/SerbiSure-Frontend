import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useUser } from '../../auth/session/UserContext';
import { submitBookingProposal, type PublicPendingPost, type PendingMandatoryReview } from '../../bookings/api/bookingApi';
import { ReviewModal } from '../../reviews/components/ReviewModal';
import { PendingPostCard } from './PendingPostCard';
import { profileStyles as styles } from '../styles';

export function PublicPostsSection({
  posts,
  loading,
  error,
  token,
  ownerId,
  ownerRole,
  authorName,
  authorAvatar,
  authorLocation,
  onRefresh,
  onSubmitted,
  onDetails,
  onMessage,
  onApplyJob,
}: Readonly<{
  posts: PublicPendingPost[];
  loading: boolean;
  error: string | null;
  token?: string | null;
  ownerId?: string;
  ownerRole: string;
  authorName?: string;
  authorAvatar?: string;
  authorLocation?: string;
  onRefresh: () => void;
  onSubmitted: (postId: string, proposal: NonNullable<PublicPendingPost['viewer_proposal']>) => void;
  onDetails?: (post: any) => void;
  onMessage?: (post?: PublicPendingPost) => void;
  onApplyJob?: (post: PublicPendingPost) => void;
}>) {
  const { tr: uiText } = useUiLanguage();
  const { user, refreshVerificationStatus } = useUser();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<PublicPendingPost | null>(null);
  const [pendingReview, setPendingReview] = useState<PendingMandatoryReview | null>(null);
  const [rate, setRate] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [checkingPostId, setCheckingPostId] = useState<string | null>(null);
  const checkingRef = useRef<object | null>(null);
  const sessionKey = JSON.stringify([user.id, user.token]);
  const activeSession = useRef(sessionKey);
  activeSession.current = sessionKey;

  useEffect(() => {
    activeSession.current = sessionKey;
    checkingRef.current = null;
    setCheckingPostId(null);
    setSelected(null);
    return () => {
      if (activeSession.current === sessionKey) activeSession.current = '';
    };
  }, [sessionKey]);

  const isJob = ownerRole === 'Homeowner';
  const allowedRole = isJob ? 'Kasambahay' : ownerRole === 'Kasambahay' ? 'Homeowner' : null;
  const canRespond = user.id !== ownerId && user.accountType === allowedRole;
  const action = isJob ? 'Apply' : 'Offer to Hire';

  const openProposal = async (post: PublicPendingPost) => {
    if (checkingRef.current) return;
    if (post.rate_needs_review) {
      Alert.alert(
        'Rate Awaiting Confirmation',
        'The poster must confirm the monthly amount before this post can receive new proposals.'
      );
      return;
    }
    const check = {};
    checkingRef.current = check;
    setCheckingPostId(post.booking_id);
    try {
      const status = await refreshVerificationStatus();
      if (activeSession.current !== sessionKey || checkingRef.current !== check) return;
      if (!status) {
        Alert.alert(
          uiText('Verification check unavailable'),
          uiText('Could not check your verification status. Check your connection and try again.')
        );
        return;
      }
      if (status !== 'Verified') {
        Alert.alert(
          uiText('Verification Required'),
          uiText('Verify your account before sending an application or hiring offer.')
        );
        return;
      }
      setRate(post.rate_amount);
      setMessage('');
      setSelected(post);
    } finally {
      if (checkingRef.current === check) {
        checkingRef.current = null;
        if (activeSession.current === sessionKey) setCheckingPostId(null);
      }
    }
  };

  const submit = async () => {
    if (!selected || !token || submittingRef.current) return;
    const amount = Number(rate);
    if (!Number.isFinite(amount) || amount < 1 || amount > 999999.99) {
      Alert.alert('Invalid Rate', 'Enter a valid amount up to ₱999,999.99. The applicable minimum is checked by the server.');
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    try {
      const result = await submitBookingProposal(
        token,
        selected.booking_id,
        amount,
        `${isJob ? 'Job application' : 'Hiring offer'}: ${message.trim() ||
        (isJob ? 'I would like to apply for this job.' : 'I would like to hire you for this service.')
        }`,
        selected.rate_period
      );
      if (!result.success || !result.proposal) {
        if (result.pendingReview) {
          const pending = result.pendingReview;
          Alert.alert(uiText('Review Required'), result.error || uiText('Please submit your pending review first.'), [
            { text: uiText('Later'), style: 'cancel' },
            { text: uiText('Write Review Now'), onPress: () => setPendingReview(pending) },
          ]);
        } else {
          Alert.alert('Unable to Send', result.error || 'Please try again.');
          onRefresh();
        }
        return;
      }
      onSubmitted(selected.booking_id, result.proposal);
      setSelected(null);
      Alert.alert(
        result.language_warning ? 'Notice' : isJob ? 'Application Sent' : 'Hiring Offer Sent',
        result.language_warning || 'The post owner has been notified. Your proposal is pending until they respond.'
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.pendingPostsSection}>
      {loading ? (
        <View style={styles.postsLoadingTile}>
          <ActivityIndicator color="#FFB380" />
          <Text style={styles.postsLoadingText}>{uiText("Loading recent posts...")}</Text>
        </View>
      ) : error ? (
        <View style={styles.postsErrorTile}>
          <Text style={styles.postsErrorTitle}>{uiText("Unable to load posts")}</Text>
          <Text style={styles.postsErrorSubtitle}>{error}</Text>
          <Pressable style={styles.postsRetryButton} onPress={onRefresh}>
            <Text style={styles.postsRetryButtonText}>{uiText("Try Again")}</Text>
          </Pressable>
        </View>
      ) : posts.length === 0 ? (
        <View style={styles.emptyPendingPostsCard}>
          <Ionicons name="time-outline" size={26} color="#9CA3AF" />
          <Text style={styles.emptyPendingPostsTitle}>{uiText("No Recent Posts")}</Text>
          <Text style={styles.emptyPendingPostsSubtitle}>
            {isJob
              ? 'This homeowner has no open job posts right now.'
              : 'This kasambahay has no service posts available right now.'}
          </Text>
        </View>
      ) : (
        <View style={styles.pendingPostsList}>
          {posts.map((post) => {
            const status = post.viewer_proposal?.status;
            const pending = status === 'Pending' || status === 'Accepted';
            const actionLabel = pending ? status === 'Accepted' ? 'Accepted' : isJob ? 'Application Sent' : 'Offer Sent'
              : !isJob && onMessage ? 'Message Now' : action;
            const actionIcon = pending ? 'checkmark-circle'
              : !isJob && onMessage ? 'chatbubble-outline' : 'paper-plane-outline';
            const actionDisabled = pending || checkingPostId !== null;
            const note =
              status === 'Pending'
                ? isJob
                  ? 'Your application is awaiting a response'
                  : 'Your hiring offer is awaiting a response'
                : status === 'Accepted'
                  ? 'Your proposal was accepted'
                  : isJob
                    ? 'Waiting for worker applications'
                    : 'Available for hiring offers';

            return (
              <PendingPostCard
                key={post.booking_id}
                post={post}
                note={note}
                token={token}
                authorName={authorName}
                authorAvatar={authorAvatar}
                authorRole={ownerRole}
                authorLocation={authorLocation}
                onDetails={onDetails}
              >
                {canRespond && token ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={uiText(actionLabel)}
                    accessibilityState={{ disabled: actionDisabled, busy: checkingPostId === post.booking_id }}
                    hitSlop={6}
                    style={{
                      width: 36,
                      height: 36,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    disabled={actionDisabled}
                    onPress={() => {
                      if (!isJob && onMessage) {
                        onMessage(post);
                      } else if (isJob && onApplyJob) {
                        onApplyJob(post);
                      } else {
                        void openProposal(post);
                      }
                    }}
                  >
                    {checkingPostId === post.booking_id ? (
                      <ActivityIndicator color="#0D0D11" />
                    ) : (
                      <Ionicons name={actionIcon} size={pending ? 20 : 18}
                        color={pending ? '#10B981' : '#0D0D11'} accessible={false} />
                    )}
                  </Pressable>
                ) : null}
              </PendingPostCard>
            );
          })}
        </View>
      )}

      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={() => !submitting && setSelected(null)}>
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            keyboardShouldPersistTaps="handled"
            style={{
              flexGrow: 0,
              maxHeight: '85%',
              backgroundColor: '#FFFFFF',
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
            }}
            contentContainerStyle={{ padding: 24, paddingBottom: Math.max(insets.bottom, 16) + 16 }}
          >
            <Text style={styles.tabSectionTitle}>{isJob ? 'Apply for this Job' : 'Send a Hiring Offer'}</Text>
            <Text style={[styles.tabSectionSubtitle, { marginBottom: 16 }]}>
              {uiText("The owner will review your proposal before confirming a booking.")}
            </Text>
            <Text style={styles.pendingPostManageBtnText}>Proposed amount (₱/{selected?.rate_period})</Text>
            <TextInput
              accessibilityLabel="Proposed compensation amount"
              value={rate}
              onChangeText={setRate}
              keyboardType="decimal-pad"
              editable={!submitting}
              style={[styles.bioTextInput, { minHeight: 48, marginTop: 8, marginBottom: 16 }]}
            />
            <Text style={styles.pendingPostManageBtnText}>{uiText("Message (optional)")}</Text>
            <TextInput
              accessibilityLabel="Proposal message"
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={450}
              editable={!submitting}
              placeholder={
                isJob
                  ? 'Tell the homeowner why you are a good fit...'
                  : 'Describe the work you would like help with...'
              }
              style={[styles.bioTextInput, { marginTop: 8, marginBottom: 16 }]}
            />
            <View style={styles.modalActionButtons}>
              <Pressable
                style={styles.cancelModalBtn}
                disabled={submitting}
                onPress={() => setSelected(null)}
              >
                <Text style={styles.cancelModalBtnText}>{uiText("Cancel")}</Text>
              </Pressable>
              <Pressable style={styles.saveModalBtn} disabled={submitting} onPress={submit}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveModalBtnText}>{uiText(isJob ? 'Send Application' : 'Send Offer')}</Text>
                )}
              </Pressable>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      {pendingReview && (
        <ReviewModal
          visible
          bookingId={pendingReview.booking_id}
          revieweeName={pendingReview.reviewee_name}
          token={token}
          isMandatory
          onClose={() => setPendingReview(null)}
          onSuccess={() => setPendingReview(null)}
        />
      )}
    </View>
  );
}
