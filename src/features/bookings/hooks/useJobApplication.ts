import { useRef, useState } from 'react';
import { Alert } from 'react-native';
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
  const [applyingJobId, setApplyingJobId] = useState<string | number | null>(null);
  const busy = useRef(false);
  const activeToken = useRef(token);
  activeToken.current = token;

  const applyJob = async (post: SavedJobItem) => {
    if (busy.current) return null;
    busy.current = true;
    setApplyingJobId(post.id);
    try {
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
            requiredReview ? 'Review Required' : 'Application not confirmed',
            error instanceof Error ? error.message : 'Please try again.',
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
