import { bookingSchedule } from './engagementForm';

export const POST_UNAVAILABLE = 'This post is no longer available as it has already been booked or cancelled.';
export const PASSED_SCHEDULE_MESSAGE = 'Cannot accept: Original date has passed. Please send a new offer in chat with an updated date.';

export interface PostState {
  id?: string | number; start_time?: string; schedule_expired?: boolean; booking_status?: string; post_status?: string; application_status?: string;
}

export function postDisplayStatus(post: PostState, now = Date.now()): string {
  const status = post.post_status || ({ Accepted: 'Booked', InProgress: 'Ongoing', Pending: 'Available' } as Record<string, string>)[post.booking_status || 'Pending'] || post.booking_status!;
  return status === 'Expired' ? 'Available' : status;
}

export function isScheduleExpired(post: PostState, now = Date.now()): boolean {
  const start = Date.parse(post.start_time || '');
  if (!Number.isFinite(start)) return post.schedule_expired === true;
  const datePH = (stamp: number) => new Date(stamp + 8 * 3600000).toISOString().slice(0, 10);
  return datePH(start) < datePH(now);
}

export function bookingStartTime(details?: { startTime?: string; startDate?: string; workHours?: string } | null): number {
  const raw = Date.parse(details?.startTime || '');
  if (Number.isFinite(raw)) return raw;
  try { return Date.parse(bookingSchedule(details?.startDate || '', details?.workHours?.split(' - ')[0] || '12:00 AM').iso); }
  catch { return NaN; }
}

export function isAcceptanceExpired(details?: { startTime?: string; startDate?: string; workHours?: string } | null, now = Date.now()): boolean {
  const start = bookingStartTime(details);
  return !Number.isFinite(start) || start <= now;
}

export function isPostAvailable(post: PostState, now = Date.now()): boolean {
  return postDisplayStatus(post, now) === 'Available';
}

export function applicationLabel(post: PostState, now = Date.now()): string {
  const status = post.application_status;
  if (status === 'accepted') return 'Hired';
  if (status === 'withdrawn') return 'Withdrawn';
  if (status === 'not_selected') return 'Position Filled';
  if (status === 'cancelled' || postDisplayStatus(post, now) === 'Cancelled') return 'Closed / Cancelled';
  if (!isPostAvailable(post, now)) return 'Position Filled';
  return 'Pending Review';
}
