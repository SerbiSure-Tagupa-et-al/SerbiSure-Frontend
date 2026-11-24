import { Alert } from 'react-native';
import type { PendingMandatoryReview } from './api/bookingApi';

export function confirmBookingAcceptance(bookingType: 'short_term' | 'long_term', tr: (source: string) => string, onAccept: () => void) {
  const longTerm = bookingType === 'long_term';
  Alert.alert(
    tr(longTerm ? 'Confirm Contract Agreement' : 'Accept booking?'),
    tr(longTerm
      ? 'Accept this long-term booking? Sign the contract and register it at the Barangay separately.'
      : 'Accept this short-term booking with the dates, hours, and pay shown?'),
    [
      { text: tr('Review Details'), style: 'cancel' },
      { text: tr('Agree & Accept'), onPress: onAccept },
    ],
  );
}

export function bookingResponseMessage(error: unknown): string {
  const message = error instanceof Error ? error.message.trim() : '';
  return /network|failed to fetch|fetch failed|timed out|timeout/i.test(message)
    ? 'Could not connect. Check your connection and try again.'
    : message || 'Please try again.';
}

export function getPendingReviewFromError(error: unknown): PendingMandatoryReview | null {
  if (error && typeof error === 'object' && 'pendingReview' in error) {
    const candidate = (error as { pendingReview?: unknown }).pendingReview;
    if (candidate && typeof candidate === 'object' && typeof (candidate as PendingMandatoryReview).booking_id === 'string') {
      return candidate as PendingMandatoryReview;
    }
  }
  return null;
}

export function promptPendingReview(
  pending: PendingMandatoryReview,
  message: string | undefined,
  onWriteReview: (pending: PendingMandatoryReview) => void,
  tr: (text: string) => string = (text) => text,
) {
  const fallback = `Please submit your review for your completed booking with ${pending.reviewee_name} before creating, applying for, or accepting a new booking.`;
  Alert.alert(
    tr('Review Required'),
    message || tr(fallback),
    [
      { text: tr('Later'), style: 'cancel' },
      { text: tr('Write Review Now'), onPress: () => onWriteReview(pending) },
    ],
  );
}
