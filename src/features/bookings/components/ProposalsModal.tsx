import { validatePostingRate } from '../../posting/validation';
import { formatRate, formatRateInput } from '../../../shared/utils/rate';
import { validRating } from '../../reviews/ratings';
import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import { realtime } from '../../../shared/realtime';
import React, { useState, useEffect } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, Modal, ActivityIndicator, Alert, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BookingProposal, fetchBookingProposals, submitBookingProposal, respondToProposal, confirmPostRate, type PendingMandatoryReview } from '../api/bookingApi';
import { ReviewModal } from '../../reviews/components/ReviewModal';

export interface ProposalsModalProps {
  visible: boolean;
  onClose: () => void;
  bookingId: string;
  isPoster: boolean;
  currentRate: string;
  ratePeriod: 'day' | 'month';
  rateNeedsReview?: boolean;
  token?: string | null;
  onUpdated?: () => void;
}

export function ProposalsModal({
  visible,
  onClose,
  bookingId,
  isPoster,
  currentRate,
  ratePeriod,
  rateNeedsReview = false,
  token,
  onUpdated,
}: ProposalsModalProps) {
  const { tr: uiText } = useUiLanguage();
  const insets = useSafeAreaInsets();

  const [proposals, setProposals] = useState<BookingProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingReview, setPendingReview] = useState<PendingMandatoryReview | null>(null);

  // Form states for non-poster (making an offer)
  const [counterRate, setCounterRate] = useState('');
  const [message, setMessage] = useState('');
  const [showOfferForm, setShowOfferForm] = useState(!isPoster);

  const loadProposals = async () => {
    if (!token || !bookingId) return;
    setLoading(true);
    try {
      const data = await fetchBookingProposals(token, bookingId);
      setProposals(data);
    } catch (err) {
      console.warn('[ProposalsModal] loadProposals failed:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible && bookingId) {
      loadProposals();
      setShowOfferForm(!isPoster);
      setCounterRate(currentRate ? currentRate.replace(/[^0-9.]/g, '') : '');
    }
  }, [visible, bookingId, isPoster, currentRate]);

  useEffect(() => {
    if (!visible || !bookingId) return;
    return realtime.subscribe(event => {
      if (event.type === 'sync' || (event.type === 'booking.changed' && event.booking_id === bookingId)) void loadProposals();
    });
  }, [visible, bookingId, token]);

  const confirmLegacyRate = async () => {
    if (!token) return;
    const rateError = validatePostingRate('job', ratePeriod === 'month' ? 'long' : 'short', counterRate);
    if (rateError) { Alert.alert(uiText(rateError.title), uiText(rateError.message)); return; }
    setSubmitting(true);
    try {
      await confirmPostRate(token, bookingId, counterRate, ratePeriod);
      Alert.alert('Monthly Amount Confirmed', 'The post can now receive new proposals. Old pending proposals were invalidated.');
      onUpdated?.();
      onClose();
    } catch (error) {
      Alert.alert('Unable to Confirm', error instanceof Error ? error.message : 'Please try again.');
    } finally { setSubmitting(false); }
  };

  const handleSubmitProposal = async () => {
    if (!token) return;
    const numRate = Number(counterRate);
    const rateError = validatePostingRate('job', ratePeriod === 'month' ? 'long' : 'short', counterRate);
    if (rateError) {
      Alert.alert(uiText(rateError.title), uiText(rateError.message));
      return;
    }

    setSubmitting(true);
    const res = await submitBookingProposal(token, bookingId, numRate, message.trim(), ratePeriod);
    setSubmitting(false);

    if (res.success) {
      Alert.alert(res.language_warning ? 'Notice' : 'Offer Submitted', res.language_warning || 'Your proposed rate has been sent to the poster!');
      setMessage('');
      setShowOfferForm(false);
      loadProposals();
      onUpdated?.();
    } else if (res.pendingReview) {
      const pending = res.pendingReview;
      Alert.alert(uiText('Review Required'), res.error || uiText('Please submit your pending review first.'), [
        { text: uiText('Later'), style: 'cancel' },
        { text: uiText('Write Review Now'), onPress: () => setPendingReview(pending) },
      ]);
    } else {
      Alert.alert('Submission Failed', res.error || 'Could not submit proposal.');
    }
  };

  const handleRespond = async (proposalId: string, action: 'accept' | 'reject') => {
    if (!token) return;
    Alert.alert(
      action === 'accept' ? 'Accept Offer?' : 'Decline Offer?',
      action === 'accept'
        ? 'Accepting confirms this booking at the proposed amount and payment period.'
        : 'Are you sure you want to decline this proposal?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action === 'accept' ? 'Confirm Accept' : 'Decline',
          style: action === 'accept' ? 'default' : 'destructive',
          onPress: async () => {
            setLoading(true);
            const res = await respondToProposal(token, proposalId, action);
            setLoading(false);
            if (res.success) {
              Alert.alert(
                'Updated',
                action === 'accept' ? 'Offer accepted! Booking is now confirmed.' : 'Offer declined.'
              );
              loadProposals();
              onUpdated?.();
              if (action === 'accept') {
                onClose();
              }
            } else if (res.pendingReview) {
              const pending = res.pendingReview;
              Alert.alert(uiText('Review Required'), res.error || uiText('Please submit your pending review first.'), [
                { text: uiText('Later'), style: 'cancel' },
                { text: uiText('Write Review Now'), onPress: () => setPendingReview(pending) },
              ]);
            } else {
              Alert.alert('Error', res.error || 'Failed to respond.');
            }
          },
        },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
          <Pressable onPress={onClose} style={styles.backBtn} hitSlop={12}>
            <Ionicons name="close" size={24} color="#1A1A1A" />
          </Pressable>
          <Text style={styles.headerTitle}>{isPoster ? 'Proposals & Offers' : 'Make Counter-Offer'}</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={styles.scrollBody}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Current Rate Banner */}
          {isPoster && rateNeedsReview ? <View style={{ padding: 16, backgroundColor: '#FFF4ED', borderRadius: 16, marginBottom: 12 }}>
              <Text style={{ fontWeight: '700' }}>{uiText("Confirm the monthly salary")}</Text>
              <Text>{uiText("This older post used an ambiguous rate field. Enter the actual monthly amount before accepting any proposal.")}</Text>
              <TextInput value={formatRateInput(counterRate)} onChangeText={text => setCounterRate(text.replace(/,/g, ''))} keyboardType="decimal-pad" style={{ padding: 12, backgroundColor: '#FFFFFF', marginVertical: 8 }} />
              <Pressable disabled={submitting} onPress={confirmLegacyRate}><Text style={{ color: '#C2410C', fontWeight: '700' }}>{submitting ? 'Confirming...' : 'Confirm Monthly Amount'}</Text></Pressable>
            </View> : null}
            <View style={styles.rateBanner}>
            <Text style={styles.rateBannerLabel}>{uiText("LISTED RATE")}</Text>
            <Text style={styles.rateBannerVal}>{uiText(formatRate(currentRate))} / {ratePeriod}</Text>
          </View>

          {/* Offer Form for Worker */}
          {!isPoster && (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{uiText("Your Proposed Rate")}</Text>
              <View style={styles.inputBox}>
                <Text style={styles.pesoSign}>₱</Text>
                <TextInput
                  style={styles.rateInput}
                  keyboardType="numeric"
                  placeholder="e.g. 650"
                  placeholderTextColor="#9CA3AF"
                  value={formatRateInput(counterRate)}
                  onChangeText={text => setCounterRate(text.replace(/,/g, ''))}
                />
                <Text style={styles.perDay}>/ {ratePeriod}</Text>
              </View>

              <Text style={[styles.cardTitle, { marginTop: 14 }]}>{uiText("Note / Message (Optional)")}</Text>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={3}
                placeholder="Add a friendly note about your experience or travel considerations..."
                placeholderTextColor="#9CA3AF"
                value={message}
                onChangeText={setMessage}
              />

              <Pressable
                style={({ pressed }) => [styles.submitBtn, pressed && { opacity: 0.9 }]}
                onPress={handleSubmitProposal}
                disabled={submitting}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitBtnText}>{uiText("Submit Counter-Offer")}</Text>
                )}
              </Pressable>
            </View>
          )}

          {/* Proposals List Section */}
          <View style={styles.sectionHeaderRow}>
            <Text style={styles.sectionTitle}>
              {isPoster ? 'Incoming Offers' : 'Previous Proposals'}
            </Text>
            <Text style={styles.countBadge}>{proposals.length}</Text>
          </View>

          {loading ? (
            <ActivityIndicator color="#FFB43B" style={{ marginVertical: 24 }} />
          ) : proposals.length > 0 ? (
            proposals.map((item) => {
              const avatarUri =
                item.proposer_avatar ||
                `https://ui-avatars.com/api/?name=${encodeURIComponent(item.proposer_name)}&background=FFB43B&color=fff`;

              return (
                <View key={item.proposal_id} style={styles.proposalCard}>
                  <View style={styles.proposalTopRow}>
                    <Image source={{ uri: avatarUri }} style={styles.proposerAvatar} />
                    <View style={styles.proposerInfo}>
                      <Text style={styles.proposerName}>{item.proposer_name}</Text>
                      <View style={styles.roleRatingRow}>
                        <Text style={styles.proposerRole}>{item.proposer_role}</Text>
                        <View style={styles.ratingPill}>
                          {validRating(item.proposer_rating) !== null && <Ionicons name="star" size={11} color="#FFB43B" />}
                          <Text style={styles.ratingText}>{validRating(item.proposer_rating)?.toFixed(1) || uiText('New')}</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.offerBadge}>
                      <Text style={styles.offerAmount}>{formatRate(item.proposed_rate)} / {item.rate_period}</Text>
                      <Text style={styles.offerStatus}>{item.status}</Text>
                    </View>
                  </View>

                  {item.message ? (
                    <Text style={styles.proposalMsg}>"{item.message}"</Text>
                  ) : null}

                  {isPoster && item.status === 'Pending' ? (
                    <View style={styles.actionBtnRow}>
                      <Pressable
                        style={styles.declineBtn}
                        onPress={() => handleRespond(item.proposal_id, 'reject')}
                      >
                        <Text style={styles.declineBtnText}>{uiText("Decline")}</Text>
                      </Pressable>
                      <Pressable
                        style={styles.acceptBtn}
                        onPress={() => handleRespond(item.proposal_id, 'accept')}
                      >
                        <Text style={styles.acceptBtnText}>{uiText("Accept Offer")}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })
          ) : (
            <View style={styles.emptyCard}>
              <Ionicons name="pricetags-outline" size={32} color="#D1D5DB" />
              <Text style={styles.emptyTitle}>{uiText("No proposals yet")}</Text>
              <Text style={styles.emptySubtitle}>
                {isPoster
                  ? 'Counter-offers from interested workers will appear here.'
                  : 'Submit a counter-offer above to negotiate rates.'}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  scrollBody: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  rateBanner: {
    backgroundColor: '#FFF8EC',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFE2B8',
  },
  rateBannerLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#D97706',
    letterSpacing: 0.5,
  },
  rateBannerVal: {
    fontSize: 17,
    fontWeight: '800',
    color: '#B45309',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#4B5563',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    height: 48,
  },
  pesoSign: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
    marginRight: 6,
  },
  rateInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  perDay: {
    fontSize: 13,
    color: '#6B7280',
  },
  textArea: {
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 12,
    minHeight: 70,
    fontSize: 14,
    color: '#1A1A1A',
    textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: '#FFB43B',
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  submitBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1A1A1A',
  },
  countBadge: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFB43B',
    backgroundColor: '#FFF8EC',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  proposalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  proposalTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  proposerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginRight: 12,
    backgroundColor: '#F3F4F6',
  },
  proposerInfo: {
    flex: 1,
  },
  proposerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  roleRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  proposerRole: {
    fontSize: 12,
    color: '#6B7280',
  },
  ratingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#374151',
  },
  offerBadge: {
    alignItems: 'flex-end',
  },
  offerAmount: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFB43B',
  },
  offerStatus: {
    fontSize: 11,
    fontWeight: '600',
    color: '#6B7280',
    textTransform: 'capitalize',
    marginTop: 2,
  },
  proposalMsg: {
    fontSize: 13,
    color: '#4B5563',
    fontStyle: 'italic',
    marginTop: 10,
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 10,
  },
  actionBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#F3F4F6',
  },
  declineBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  acceptBtn: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#FFB43B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 36,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 240,
  },
});
