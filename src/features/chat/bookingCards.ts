import { formatRate } from '../../shared/utils/rate';
import { formatBookingAddress, type BookingItem } from '../bookings/api/bookingApi';
import type { WorkSetup } from '../bookings/workSetup';

export interface PersistedChatOffer {
  booking: BookingItem;
  proposal_id: string | null;
  proposed_rate: string | null;
  status: string;
  can_respond: boolean;
  sender_name: string;
}

export interface BookingCardInfo {
  title: string;
  bookedByName: string;
  bookingId: string;
  passUrl?: string | null;
  proposalId?: string;
  canRespond: boolean;
  startDate: string;
  startTime?: string;
  endDate: string;
  workHours: string;
  location: string;
  region: string;
  days: string[];
  salary: string;
  bookingType: 'long_term' | 'short_term';
  serviceCategory: string[];
  workSetup: WorkSetup | null;
  jobRole: string;
  details: string;
  isConfirmed: boolean;
  isDeclined: boolean;
  isAcquired: boolean;
}

export function philippinesDate(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const ph = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return String(ph.getUTCMonth() + 1).padStart(2, '0') + '/' + String(ph.getUTCDate()).padStart(2, '0') + '/' + ph.getUTCFullYear();
}

function clock(value?: string | null): string {
  if (!value) return '';
  const [hours = '0', minutes = '00'] = value.split(':');
  const hour = Number(hours);
  return String(hour % 12 || 12).padStart(2, '0') + ':' + minutes + (hour >= 12 ? ' PM' : ' AM');
}

export function mapBookingCard(offer?: PersistedChatOffer | null): BookingCardInfo | null {
  if (!offer?.booking?.booking_id) return null;
  const b = offer.booking;
  const confirmed = offer.status === 'Confirmed';
  const declined = offer.status === 'Rejected' || offer.status === 'Withdrawn' || offer.status === 'Cancelled';
  const unavailable = !confirmed && !declined && b.booking_status !== 'Pending';
  const hours = b.daily_start_time && b.daily_end_time ? clock(b.daily_start_time) + ' - ' + clock(b.daily_end_time) : '';
  const rate = offer.proposed_rate || b.rate_amount;
  return {
    title: confirmed ? 'BOOKING CONFIRMED' : declined ? 'BOOKING DECLINED' : unavailable ? 'OFFER UNAVAILABLE' : 'BOOKING OFFER',
    bookedByName: offer.sender_name, bookingId: b.booking_id, passUrl: b.pass_url, proposalId: offer.proposal_id || undefined,
    canRespond: offer.can_respond, startTime: b.start_time, startDate: philippinesDate(b.start_time), endDate: philippinesDate(b.end_time),
    workHours: hours, location: formatBookingAddress(b, ''), region: b.region || '', days: b.work_days || [],
    salary: rate, bookingType: b.booking_type, serviceCategory: b.service_category, workSetup: b.work_setup || null,
    jobRole: b.service_category.map(value => value.replace(/_/g, ' ')).join(', '),
    details: formatRate(rate) + ' / ' + b.rate_period + (hours ? ' · ' + hours : ''),
    isConfirmed: confirmed, isDeclined: declined, isAcquired: unavailable,
  };
}

export { bookingSchedule } from '../bookings/engagementForm';
