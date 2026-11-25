import { useRef, useState } from 'react';
import { Alert } from 'react-native';
import { useLanguage } from '../../../shared/localization/LanguageContext';
import { formatRate } from '../../../shared/utils/rate';
import { savedJobsStore, type SavedJobItem } from '../store/savedJobsStore';
import type { PendingMandatoryReview } from '../api/bookingApi';

function readPendingReview(error: unknown): PendingMandatoryReview | null {
  if (error && typeof error === 'object' && 'pendingReview' in error) {
    const candidate = (error as { pendingReview?: unknown }).pendingReview;
    if (candidate && typeof candidate === 'object' && typeof (candidate as PendingMandatoryReview).booking_id === 'string') {
      return candidate as PendingMandatoryReview;
    }
  }
  return null;
}

export function useJobApplication(
  token?: string | null,
  onUnavailable?: () => void,
  onPendingReview?: (pending: PendingMandatoryReview) => void,
) {
  const { tr: uiText } = useLanguage();
  const [applyingJobId, setApplyingJobId] = useState<string | number | null>(null);
  const busy = useRef(false);
  const activeToken = useRef(token);
  activeToken.current = token;

  const applyJob = async (post: SavedJobItem) => {
    if (busy.current) return null;
    busy.current = true;
    setApplyingJobId(post.id);
    try {
      const accepted = await new Promise<boolean>(resolve => Alert.alert(uiText('Accept Budget?'),
        uiText('Send a proposal at {amount}? The homeowner will review it before hiring.', { amount: `${formatRate(post.price)} ${post.unit || ''}`.trim() }), [
          { text: uiText('Cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: uiText('Accept {amount}', { amount: formatRate(post.price) }), onPress: () => resolve(true) },
        ], { cancelable: true, onDismiss: () => resolve(false) }));
      if (!accepted || activeToken.current !== token) return null;
      return await savedJobsStore.applyToJob(post, token);
    } catch (error) {
      if (activeToken.current === token) {
        const requiredReview = readPendingReview(error);
        if (requiredReview && onPendingReview) {
          Alert.alert(
            'Review Required',
            error instanceof Error ? error.message : `Please submit your review for your completed booking with ${requiredReview.reviewee_name} before applying.`,
            [
              { text: 'Later', style: 'cancel' },
              { text: 'Write Review Now', onPress: () => onPendingReview(requiredReview) },
            ],
          );
        } else {
          Alert.alert(
            uiText(requiredReview ? 'Review Required' : (error as { code?: string })?.code === 'short_term_monthly_cap' ? 'Monthly Booking Limit' : 'Application not confirmed'),
            uiText(error instanceof Error ? error.message : 'Please try again.'),
          );
          if (!requiredReview) onUnavailable?.();
        }
      }
      return null;
    } finally {
      busy.current = false;
      setApplyingJobId(null);
    }
  };

  return { applyJob, applyingJobId };
}
