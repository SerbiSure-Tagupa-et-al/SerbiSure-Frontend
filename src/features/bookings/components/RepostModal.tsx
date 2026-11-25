import { formatRate } from '../../../shared/utils/rate';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../../shared/localization/LanguageContext';
import { generateUUID } from '../../chat/api/chatApi';
import { repostBooking, getPendingReviewFromError, type BookingItem, type PendingMandatoryReview } from '../api/bookingApi';
import { ReviewModal } from '../../reviews/components/ReviewModal';
import { buildEngagementSchedule, WORK_SHIFTS, type WorkShift } from '../engagementForm';
import { WorkScheduleFields } from './WorkScheduleFields';

export function RepostModal({ post, token, onClose, onSuccess }: {
  post: BookingItem; token: string; onClose: () => void; onSuccess: () => void;
}) {
  const { tr } = useLanguage();
  const insets = useSafeAreaInsets();
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [workHours, setWorkHours] = useState('');
  const [days, setDays] = useState<string[]>(post.work_days || []);
  const [shift, setShift] = useState<WorkShift | null>(null);
  const [ongoing, setOngoing] = useState(post.booking_type === 'long_term' && !post.end_time);
  const [saving, setSaving] = useState(false);
  const [pendingReview, setPendingReview] = useState<PendingMandatoryReview | null>(null);
  const busy = useRef(false);
  const draft = useRef<{ body: string; key: string } | null>(null);
  const submit = async () => {
    if (busy.current) return;
    try {
      const { work_days, ...schedule } = buildEngagementSchedule({
        bookingType: post.booking_type, startDate, endDate, workHours, days, shift, ongoing,
      });
      if (Date.parse(schedule.start_time) <= Date.now()) throw new Error('Choose a start time that is still ahead.');
      const payload = { ...schedule, work_days: [...work_days], ...((post.poster_account_type || post.poster?.account_type) === 'Kasambahay' ? { rate_amount: null } : {}) };
      const body = JSON.stringify(payload);
      if (draft.current?.body !== body) draft.current = { body, key: generateUUID() };
      busy.current = true; setSaving(true);
      await repostBooking(token, post.booking_id, payload, draft.current.key);
      onSuccess();
      onClose();
    } catch (error) {
      const requiredReview = getPendingReviewFromError(error);
      if (requiredReview) {
        Alert.alert(tr('Review Required'), tr(error instanceof Error ? error.message : 'Please submit your pending review first.'), [
          { text: tr('Later'), style: 'cancel' },
          { text: tr('Write Review Now'), onPress: () => setPendingReview(requiredReview) },
        ]);
      } else {
        Alert.alert(tr('Could not repost'), tr(error instanceof Error ? error.message : 'Please try again.'));
      }
    } finally { busy.current = false; setSaving(false); }
  };
  return <Modal visible animationType="slide" onRequestClose={() => { if (!busy.current) onClose(); }}>
    <ScrollView contentContainerStyle={{ padding: 20, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }}>
      <Text style={{ fontSize: 23, fontWeight: '700', marginBottom: 12 }}>{tr('Repost / Reschedule')}</Text>
      <Text style={{ marginBottom: 20 }}>{tr((post.poster_account_type || post.poster?.account_type) === 'Kasambahay' ? 'Choose a new schedule. Your service and location stay the same. The new post is open for offers.' : 'Choose a new schedule. Your service, pay and location stay the same. Previous applications stay with the old post.')}</Text>
      <WorkScheduleFields bookingType={post.booking_type} startDate={startDate} endDate={endDate} workHours={workHours}
        days={days} shift={shift} ongoing={ongoing} disabled={saving}
        onStartDate={setStartDate} onEndDate={setEndDate} onWorkHours={setWorkHours} onDays={setDays} onOngoing={setOngoing}
        onShift={value => { setShift(value); const preset = WORK_SHIFTS.find(item => item.value === value); if (preset) setWorkHours(preset.hours); }} />
      <Text style={{ marginVertical: 16 }}>{post.service_category.join(', ')} · {(post.poster_account_type || post.poster?.account_type) === 'Kasambahay' ? tr(post.booking_type === 'long_term' ? 'Full-time' : 'Part-time') : `${formatRate(post.rate_amount)} / ${post.rate_period}`}</Text>
      <Pressable disabled={saving} onPress={() => { void submit(); }} style={{ padding: 16, backgroundColor: '#FFB380', borderRadius: 24, alignItems: 'center' }}>
        {saving ? <ActivityIndicator /> : <Text style={{ fontWeight: '700' }}>{tr('Publish New Post')}</Text>}
      </Pressable>
      <Pressable disabled={saving} onPress={onClose} style={{ padding: 16, alignItems: 'center' }}><Text>{tr('Cancel')}</Text></Pressable>
    </ScrollView>
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
  </Modal>;
}
