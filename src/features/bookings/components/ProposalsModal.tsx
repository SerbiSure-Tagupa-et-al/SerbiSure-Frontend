import { validatePostingRate } from '../../posting/validation';
import { formatRate, formatRateInput } from '../../../shared/utils/rate';
import { validRating } from '../../reviews/ratings';
import { useLanguage as useUiLanguage } from '../../../shared/localization/LanguageContext';
import { realtime } from '../../../shared/realtime';
import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, TextInput, Pressable, Modal, ActivityIndicator, Alert, ScrollView, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BookingProposal, fetchBookingProposals, submitBookingProposal, respondToProposal, confirmPostRate, type PendingMandatoryReview } from '../api/bookingApi';
import { ReviewModal } from '../../reviews/components/ReviewModal';
import { buildEngagementSchedule, WORK_SHIFTS, type WorkShift } from '../engagementForm';
import { WorkScheduleFields } from './WorkScheduleFields';

export interface ProposalsModalProps {
  visible: boolean;
  onClose: () => void;
  bookingId: string;
  isPoster: boolean;
  currentRate: string | null;
  ratePeriod: 'day' | 'month';
  posterRole?: 'Homeowner' | 'Kasambahay';
  bookingType?: 'short_term' | 'long_term';
  initialWorkHours?: string;
  requireScheduleOnHire?: boolean;
  rateNeedsReview?: boolean;
  token?: string | null;
  onUpdated?: () => void;
  onMessage?: (proposal: BookingProposal) => void;
}

export function ProposalsModal({ visible, onClose, bookingId, isPoster, currentRate, ratePeriod,
  posterRole = 'Homeowner', bookingType, initialWorkHours = '', requireScheduleOnHire = false,
  rateNeedsReview = false, token, onUpdated, onMessage }: ProposalsModalProps) {
  const { tr: uiText } = useUiLanguage();
  const insets = useSafeAreaInsets();
  const [proposals, setProposals] = useState<BookingProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const busy = useRef(false);
  const [pendingReview, setPendingReview] = useState<PendingMandatoryReview | null>(null);
  const [counterRate, setCounterRate] = useState('');
  const [message, setMessage] = useState('');
  const [hireTarget, setHireTarget] = useState<BookingProposal | null>(null);
  const [hireStartDate, setHireStartDate] = useState('');
  const [hireEndDate, setHireEndDate] = useState('');
  const [hireWorkHours, setHireWorkHours] = useState('');
  const [hireDays, setHireDays] = useState<string[]>([]);
  const [hireShift, setHireShift] = useState<WorkShift | null>(null);
  const [hireOngoing, setHireOngoing] = useState(false);
  const resolvedBookingType: 'short_term' | 'long_term' = bookingType || (ratePeriod === 'month' ? 'long_term' : 'short_term');
  const jobPost = posterRole === 'Homeowner';
  const amountText = (amount: unknown, period = ratePeriod) => `${formatRate(amount)} / ${uiText(period)}`;

  const loadProposals = async () => {
    if (!token || !bookingId) return;
    setLoading(true);
    try { setProposals(await fetchBookingProposals(token, bookingId)); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    if (visible && bookingId) {
      void loadProposals();
      setCounterRate(currentRate || '');
      setMessage('');
      setHireTarget(null);
    }
  }, [visible, bookingId, currentRate, token]);
  useEffect(() => {
    if (!visible || !bookingId) return;
    return realtime.subscribe(event => {
      if (event.type === 'sync' || (event.type === 'booking.changed' && event.booking_id === bookingId)) void loadProposals();
    });
  }, [visible, bookingId, token]);

  const showFailure = (result: { error?: string; code?: string; pendingReview?: PendingMandatoryReview | null }) => {
    if (result.pendingReview) {
      const pending = result.pendingReview;
      Alert.alert(uiText('Review Required'), uiText(result.error || 'Please submit your pending review first.'), [
        { text: uiText('Later'), style: 'cancel' },
        { text: uiText('Write Review Now'), onPress: () => setPendingReview(pending) },
      ]);
    } else {
      Alert.alert(uiText(result.code === 'short_term_monthly_cap' ? 'Monthly Booking Limit' : 'Unable to Send'), uiText(result.error || 'Please try again.'));
    }
  };
  const submitBid = async () => {
    if (!token || busy.current) return;
    const error = validatePostingRate('job', ratePeriod === 'month' ? 'long' : 'short', counterRate);
    if (error) { Alert.alert(uiText(error.title), uiText(error.message)); return; }
    busy.current = true; setSubmitting(true);
    try {
      const result = await submitBookingProposal(token, bookingId, Number(counterRate), message.trim(), ratePeriod);
      if (!result.success) { showFailure(result); return; }
      onUpdated?.(); onClose();
      Alert.alert(uiText('Proposal Sent'), result.language_warning || uiText('The owner will review your proposal before confirming a booking.'));
    } finally { busy.current = false; setSubmitting(false); }
  };
  const openHireSchedule = (item: BookingProposal) => {
    const trimmedHours = initialWorkHours.trim();
    const matchedShift = WORK_SHIFTS.find(preset => preset.hours === trimmedHours)?.value || (trimmedHours ? 'custom' : null);
    setHireStartDate('');
    setHireEndDate('');
    setHireWorkHours(trimmedHours);
    setHireDays([]);
    setHireShift(matchedShift);
    setHireOngoing(false);
    setHireTarget(item);
  };
  const confirmHireWithSchedule = async () => {
    if (!token || !hireTarget || busy.current) return;
    let schedule: ReturnType<typeof buildEngagementSchedule>;
    try {
      schedule = buildEngagementSchedule({
        bookingType: resolvedBookingType,
        startDate: hireStartDate,
        endDate: hireEndDate,
        workHours: hireWorkHours,
        days: hireDays,
        shift: hireShift,
        ongoing: hireOngoing,
      });
      if (Date.parse(schedule.start_time) <= Date.now()) {
        throw new Error('Choose a start time that is still ahead.');
      }
    } catch (error) {
      Alert.alert(uiText('Invalid Schedule'), uiText(error instanceof Error ? error.message : 'Please select valid dates and working hours.'));
      return;
    }
    busy.current = true; setSubmitting(true);
    try {
      const result = await respondToProposal(token, hireTarget.proposal_id, 'accept', {
        ...schedule,
        work_days: [...schedule.work_days],
      });
      if (!result.success) { showFailure(result); return; }
      setHireTarget(null);
      onUpdated?.(); onClose();
    } finally { busy.current = false; setSubmitting(false); }
  };
  const hire = (item: BookingProposal) => {
    if (busy.current) return;
    if (requireScheduleOnHire) {
      openHireSchedule(item);
      return;
    }
    Alert.alert(uiText(jobPost ? 'Hire Applicant?' : 'Accept Offer?'),
      uiText('Confirm {name} at {amount}? This confirms the booking and closes all other applicants.',
        { name: item.proposer_name, amount: amountText(item.proposed_rate, item.rate_period) }), [
      { text: uiText('Cancel'), style: 'cancel' },
      { text: uiText(jobPost ? 'Hire' : 'Accept Offer'), onPress: async () => {
        if (!token || busy.current) return;
        busy.current = true; setSubmitting(true);
        try {
          const result = await respondToProposal(token, item.proposal_id, 'accept');
          if (!result.success) { showFailure(result); return; }
          onUpdated?.(); onClose();
        } finally { busy.current = false; setSubmitting(false); }
      } },
    ]);
  };
  const confirmLegacyRate = async () => {
    if (!token || busy.current) return;
    const error = validatePostingRate('job', ratePeriod === 'month' ? 'long' : 'short', counterRate);
    if (error) { Alert.alert(uiText(error.title), uiText(error.message)); return; }
    busy.current = true; setSubmitting(true);
    try { await confirmPostRate(token, bookingId, counterRate, ratePeriod); onUpdated?.(); onClose(); }
    catch (error) { showFailure({ error: error instanceof Error ? error.message : undefined }); }
    finally { busy.current = false; setSubmitting(false); }
  };

  return <Modal visible={visible} animationType="slide" onRequestClose={() => { if (hireTarget) setHireTarget(null); else onClose(); }}>
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <Pressable onPress={() => { if (hireTarget) setHireTarget(null); else onClose(); }} style={styles.backBtn} accessibilityLabel={uiText(hireTarget ? 'Back' : 'Close')}>
          <Ionicons name={hireTarget ? 'arrow-back' : 'close'} size={24} />
        </Pressable>
        <Text style={styles.headerTitle}>{uiText(hireTarget ? 'Confirm Hire & Set Dates' : isPoster ? jobPost ? 'Applicants & Bids' : 'Incoming Offers' : jobPost ? 'Submit a Bid' : 'Offer to Hire')}</Text>
        <View style={{ width: 40 }} />
      </View>
      {hireTarget ? (
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 24) }]} keyboardShouldPersistTaps="handled">
          <View style={styles.rateBanner}>
            <View style={{ flex: 1, marginRight: 10 }}>
              <Text style={styles.rateBannerLabel}>{uiText('HIRING')}</Text>
              <Text style={styles.proposerName}>{hireTarget.proposer_name}</Text>
            </View>
            <Text style={styles.rateBannerVal}>{amountText(hireTarget.proposed_rate, hireTarget.rate_period)}</Text>
          </View>
          <View style={styles.card}>
            <Text style={[styles.proposerRole, { marginBottom: 12 }]}>
              {uiText('Pick the service start date and schedule. Confirming will book this worker and automatically close all other applicants.')}
            </Text>
            <WorkScheduleFields
              bookingType={resolvedBookingType}
              startDate={hireStartDate}
              endDate={hireEndDate}
              workHours={hireWorkHours}
              days={hireDays}
              shift={hireShift}
              ongoing={hireOngoing}
              disabled={submitting}
              onStartDate={setHireStartDate}
              onEndDate={setHireEndDate}
              onWorkHours={setHireWorkHours}
              onDays={setHireDays}
              onOngoing={setHireOngoing}
              onShift={value => {
                setHireShift(value);
                const preset = WORK_SHIFTS.find(presetItem => presetItem.value === value);
                if (preset) setHireWorkHours(preset.hours);
              }}
            />
            <Pressable style={styles.submitBtn} disabled={submitting} onPress={() => { void confirmHireWithSchedule(); }}>
              {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>{uiText('Confirm Hire')}</Text>}
            </Pressable>
            <Pressable style={[styles.declineBtn, { marginTop: 10, flex: 0 }]} disabled={submitting} onPress={() => setHireTarget(null)}>
              <Text style={styles.declineBtnText}>{uiText('Back')}</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : (
      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: Math.max(insets.bottom, 16) }]} keyboardShouldPersistTaps="handled">
        {jobPost ? <View style={styles.rateBanner}>
          <Text style={styles.rateBannerLabel}>{uiText('Listed Rate')}</Text>
          <Text style={styles.rateBannerVal}>{amountText(currentRate)}</Text>
        </View> : <Text style={styles.cardTitle}>{uiText(ratePeriod === 'month' ? 'Full-time / Monthly' : 'Part-time / Daily')}</Text>}
        {isPoster && jobPost && rateNeedsReview ? <View style={styles.card}>
          <Text style={styles.cardTitle}>{uiText('Confirm the monthly salary')}</Text>
          <Text>{uiText('This older post used an ambiguous rate field. Enter the actual monthly amount before accepting any proposal.')}</Text>
          <TextInput value={formatRateInput(counterRate)} onChangeText={text => setCounterRate(text.replace(/,/g, ''))} keyboardType="decimal-pad" style={styles.rateInput} />
          <Pressable disabled={submitting} onPress={confirmLegacyRate}><Text>{uiText('Confirm Monthly Amount')}</Text></Pressable>
        </View> : null}
        {!isPoster && <View style={styles.card}>
          <Text style={styles.cardTitle}>{uiText('Your Proposed Rate')}</Text>
          <View style={styles.inputBox}>
            <Text style={styles.pesoSign}>₱</Text>
            <TextInput accessibilityLabel={uiText('Your Proposed Rate')} style={styles.rateInput} keyboardType="decimal-pad"
              value={formatRateInput(counterRate)} onChangeText={text => setCounterRate(text.replace(/,/g, ''))}
              onBlur={() => { if (/^\d+(?:\.\d{0,2})?$/.test(counterRate)) setCounterRate(Number(counterRate).toFixed(2)); }} />
            <Text style={styles.perDay}>/ {uiText(ratePeriod)}</Text>
          </View>
          <Text style={styles.proposerRole}>{uiText(ratePeriod === 'month' ? 'Allowed range: ₱6,500.00 – ₱50,000.00 / month (Region X · RA 10361)' : 'Allowed range: ₱600.00 – ₱5,000.00 / day')}</Text>
          <TextInput accessibilityLabel={uiText('Note / Message (Optional)')} style={[styles.textArea, { minHeight: 44, height: 44 }]}
            maxLength={200} placeholder={uiText('e.g., Includes deep kitchen cleaning')} value={message} onChangeText={setMessage} />
          <Pressable style={styles.submitBtn} disabled={submitting} onPress={submitBid}>
            {submitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitBtnText}>{uiText(jobPost ? 'Submit a Bid' : 'Send Proposal')}</Text>}
          </Pressable>
        </View>}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionTitle}>{uiText(isPoster ? jobPost ? 'Applicants & Bids' : 'Incoming Offers' : 'Previous Proposals')}</Text>
          <Text style={styles.countBadge}>{proposals.length}</Text>
        </View>
        {loading ? <ActivityIndicator /> : proposals.length ? proposals.map(item => <View key={item.proposal_id} style={styles.proposalCard}>
          <View style={styles.proposalTopRow}>
            <Image source={{ uri: item.proposer_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.proposer_name)}` }} style={styles.proposerAvatar} />
            <View style={styles.proposerInfo}>
              <Text style={styles.proposerName}>{item.proposer_name}</Text>
              <Text style={styles.proposerRole}>{[item.is_verified && uiText('Verified'), item.has_tesda_nc2 && uiText('TESDA NC II')].filter(Boolean).join(' · ')}</Text>
              <Text style={styles.proposerRole}>★ {validRating(item.avg_rating ?? item.proposer_rating)?.toFixed(1) || uiText('New')} · {uiText('Jobs Done')}: {item.jobs_done_count ?? 0}</Text>
              <Text style={styles.proposerRole}>{uiText('Recommended')}: {item.recommendation_pct == null ? '—' : `${item.recommendation_pct}%`}</Text>
            </View>
          </View>
          <View style={styles.bidStatusRow}>
            <Text style={[styles.offerAmount, { color: item.is_budget_accepted ? '#047857' : '#92400E', flexShrink: 1 }]}>
              {item.is_budget_accepted ? uiText('Accepted Your Budget') : uiText('Bid')}: {amountText(item.proposed_rate, item.rate_period)}
            </Text>
            <Text style={[
              styles.offerStatusText,
              item.status === 'Pending' && styles.offerStatusPending,
              item.status === 'Accepted' && styles.offerStatusAccepted,
            ]}>
              {uiText(({ Pending: 'Pending', Accepted: 'Hired', Rejected: 'Position Filled', Withdrawn: 'Withdrawn' } as Record<string, string>)[item.status] || item.status)}
            </Text>
          </View>
          {item.message ? <Text style={styles.proposalMsg}>{item.message}</Text> : null}
          {isPoster && item.status === 'Pending' && <View style={styles.actionBtnRow}>
            {onMessage && <Pressable style={styles.declineBtn} onPress={() => onMessage(item)}><Text style={styles.declineBtnText}>{uiText('Message')}</Text></Pressable>}
            <Pressable style={styles.acceptBtn} disabled={submitting || (jobPost && rateNeedsReview)} onPress={() => hire(item)}><Text style={styles.acceptBtnText}>{uiText(jobPost ? 'Hire' : 'Accept Offer')}</Text></Pressable>
          </View>}
        </View>) : <View style={styles.emptyCard}><Text style={styles.emptyTitle}>{uiText('No proposals yet')}</Text></View>}
      </ScrollView>
      )}
    </View>
    {pendingReview && <ReviewModal visible bookingId={pendingReview.booking_id} revieweeName={pendingReview.reviewee_name} token={token} isMandatory
      onClose={() => setPendingReview(null)} onSuccess={() => setPendingReview(null)} />}
  </Modal>;
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
  bidStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 12,
  },
  offerStatusText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6B7280',
    flexShrink: 0,
  },
  offerStatusPending: {
    color: '#B45309',
  },
  offerStatusAccepted: {
    color: '#047857',
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
