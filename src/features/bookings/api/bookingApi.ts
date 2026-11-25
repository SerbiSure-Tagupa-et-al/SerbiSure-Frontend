import type { WorkSetup } from '../workSetup';
import { API_BASE_URL } from '../../../shared/api/config';
import { requestJson, requestResponse } from '../../../shared/api/httpClient';

export interface PendingMandatoryReview {
  booking_id: string;
  reviewee_name: string;
  service_category?: string[];
}

export class PendingReviewError extends Error {
  readonly code = 'pending_mandatory_review' as const;
  readonly pendingReview: PendingMandatoryReview;

  constructor(message: string, pendingReview: PendingMandatoryReview) {
    super(message);
    this.name = 'PendingReviewError';
    this.pendingReview = pendingReview;
  }
}

export function extractPendingReview(data: unknown): PendingMandatoryReview | null {
  if (!data || typeof data !== 'object') return null;
  const record = data as Record<string, unknown>;
  if (record.code !== 'pending_mandatory_review') return null;
  const pending = record.pending_review;
  if (!pending || typeof pending !== 'object') return null;
  const bookingId = (pending as Record<string, unknown>).booking_id;
  if (typeof bookingId !== 'string' || !bookingId.trim()) return null;
  const revieweeName = (pending as Record<string, unknown>).reviewee_name;
  const categories = (pending as Record<string, unknown>).service_category;
  return {
    booking_id: bookingId.trim(),
    reviewee_name: typeof revieweeName === 'string' && revieweeName.trim() ? revieweeName.trim() : 'Service Partner',
    service_category: Array.isArray(categories) ? categories.filter((c): c is string => typeof c === 'string') : undefined,
  };
}

export function getPendingReviewFromError(error: unknown): PendingMandatoryReview | null {
  if (error instanceof PendingReviewError) return error.pendingReview;
  if (error && typeof error === 'object' && 'pendingReview' in error) {
    const candidate = (error as { pendingReview?: unknown }).pendingReview;
    if (candidate && typeof candidate === 'object' && typeof (candidate as PendingMandatoryReview).booking_id === 'string') {
      return candidate as PendingMandatoryReview;
    }
  }
  return null;
}

function bookingError(data: unknown, fallback: string): string {
  if (!data || typeof data !== 'object') return fallback;
  const values = Object.entries(data as Record<string, unknown>).filter(([key]) => key !== 'code' && key !== 'pending_review');
  const text = values.flatMap(([, value]) => typeof value === 'string' ? [value]
    : Array.isArray(value) ? value.filter(v => typeof v === 'string') : []).join(' ');
  return text || fallback;
}

export interface PublicPendingPost extends BookingItem {
  viewer_proposal: { proposal_id: string; status: BookingProposal['status'] } | null;
}

export async function fetchPublicPendingPosts(token: string, userId: string): Promise<PublicPendingPost[]> {
  const data = await requestJson<unknown>(`/api/v1/booking/profile/${encodeURIComponent(userId)}/pending/`, { token });
  if (!Array.isArray(data)) throw new Error('Unexpected posts response. Please try again.');
  return data as PublicPendingPost[];
}

export interface BookingParticipant {
  id: string;
  name: string;
  account_type: string;
  verification_status: string;
  profile_link: string | null;
  rating: number;
  contact_number?: string | null;
  accepted_at?: string;
}

export interface BookingItem {
  poster_account_type?: 'Homeowner' | 'Kasambahay';
  application?: BookingProposal;
  schedule_expired?: boolean;
  booking_id: string;
  pass_url?: string | null;
  booking_type: 'short_term' | 'long_term';
  work_setup?: WorkSetup | null;
  booking_status: 'Pending' | 'Accepted' | 'InProgress' | 'Completed' | 'Cancelled';
  post_status?: 'Available' | 'Expired' | 'Booked' | 'Ongoing' | 'Completed' | 'Cancelled' | 'Unavailable';
  can_repost?: boolean;
  application_status?: 'applied' | 'accepted' | 'not_selected' | 'expired' | 'cancelled' | 'withdrawn';
  service_category: string[];
  start_time: string;
  work_days?: string[];
  daily_start_time?: string | null;
  daily_end_time?: string | null;
  recipient_id?: string | null;
  recipient?: BookingParticipant | null;
  end_time?: string | null;
  region?: string | null;
  province?: string | null;
  city?: string | null;
  barangay?: string | null;
  street?: string | null;
  full_address?: string | null;
  floor_number?: string | null;
  zip_code?: string | null;
  special_instruction?: string | null;
  rate_amount: string | null;
  rate_period: 'day' | 'month';
  rate_needs_review?: boolean;
  started_at?: string | null;
  completed_at?: string | null;
  contract_summary?: {
    booking_id: string; service_category: string[]; rate_amount: string | null; rate_period: 'month'; rate_needs_review: boolean;
    work_setup: WorkSetup | null; start_date: string; end_date?: string | null; location: string; contract_pdf_url: string; source_url: string; notice: string;
  } | null;
  createdAt: string;
  poster?: BookingParticipant;
  assigned_partner?: BookingParticipant | null;
  has_reviewed?: boolean;
  proposals_count?: number;
  cancellation_reason?: string | null;
  cancellation_penalty_points?: number;
  cancelled_at?: string | null;
  can_cancel?: boolean;
  cancellation_deadline?: string | null;
}

/**
 * Complete work address for review, chat and booking details.
 * Prefer stored components over older full_address strings that omit unit/ZIP.
 */
export function formatBookingAddress(
  booking?: {
    full_address?: string | null;
    street?: string | null;
    floor_number?: string | null;
    barangay?: string | null;
    city?: string | null;
    province?: string | null;
    region?: string | null;
    zip_code?: string | null;
  } | null,
  fallback = 'Address not provided'
): string {
  if (!booking) return fallback;
  const hasAddressParts = [booking.street, booking.barangay, booking.city, booking.province].some(value => value?.trim());
  if (!hasAddressParts && booking.full_address?.trim()) return booking.full_address.trim();
  const barangay = (booking.barangay || '').trim().replace(/^(?:brgy\.?|barangay)\s+/i, '');
  const parts = [booking.street, booking.floor_number, barangay ? `Brgy. ${barangay}` : '', booking.city, booking.province, booking.zip_code]
    .map(p => (p || '').trim())
    .filter(Boolean);
  if (parts.length > 0) {
    return parts.join(', ');
  }
  return booking.full_address?.trim() || fallback;
}

/**
 * Formats a short location for compact card badges (e.g., "Pagatpat, Cagayan de Oro")
 */
export function formatBookingLocationShort(
  booking?: {
    barangay?: string | null;
    city?: string | null;
    full_address?: string | null;
  } | null,
  fallback = 'Location not provided'
): string {
  if (!booking) return fallback;
  const parts = [booking.barangay, booking.city]
    .map(p => (p || '').trim())
    .filter(Boolean);
  if (parts.length > 0) {
    return parts.join(', ');
  }
  if (booking.full_address && booking.full_address.trim()) {
    return booking.full_address.trim();
  }
  return fallback;
}

export interface BookingProposal {
  is_verified?: boolean;
  has_tesda_nc2?: boolean;
  avg_rating?: number | null;
  jobs_done_count?: number;
  recommendation_pct?: number | null;
  is_budget_accepted?: boolean;
  proposal_id: string;
  booking_id: string;
  proposer_id: string;
  proposer_name: string;
  proposer_role: string;
  proposer_avatar: string | null;
  proposer_rating: number;
  proposed_rate: string;
  rate_period: 'day' | 'month';
  message?: string;
  status: 'Pending' | 'Accepted' | 'Rejected' | 'Withdrawn';
  createdAt: string;
}

export interface RecommendationItem {
  id?: string;
  booking_id?: string;
  name?: string;
  title?: string;
  role?: string;
  match_score: number;
  rating?: number;
  location: string;
  tags?: string[];
  avatar?: string | null;
  poster_name?: string;
  poster_avatar?: string | null;
  rate_amount?: string;
  rate_period?: 'day' | 'month';
  booking_type?: 'short_term' | 'long_term';
  verification_status?: string;
}

/**
 * Fetch a single booking's full details
 */
export async function fetchBookingDetail(token: string, bookingId: string): Promise<BookingItem | null> {
  try {
    const res = await requestResponse(`${API_BASE_URL}/api/v1/booking/${bookingId}/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[bookingApi] fetchBookingDetail failed:', err);
    return null;
  }
}

/**
 * Fetch bookings posted by current user
 */
async function bookingList(token: string, endpoint: string, statusFilter?: string): Promise<BookingItem[]> {
  const path = '/api/v1/booking/' + endpoint + '/' + (statusFilter ? '?status=' + encodeURIComponent(statusFilter) : '');
  const data = await requestJson<unknown>(path, { token });
  if (!Array.isArray(data)) throw new Error('Unexpected booking response. Please try again.');
  return data as BookingItem[];
}

export async function fetchMyBookings(token: string, statusFilter?: string): Promise<BookingItem[]> {
  return bookingList(token, 'mine', statusFilter);
}

export async function fetchMyPosts(token: string): Promise<BookingItem[]> {
  const data = await requestJson<unknown>('/api/v1/booking/mine/?public_only=true', { token });
  if (!Array.isArray(data)) throw new Error('Could not load your posts. Please try again.');
  return data as BookingItem[];
}

export async function repostBooking(token: string, bookingId: string, schedule: {
  start_time: string; end_time: string | null; daily_start_time: string; daily_end_time: string; work_days: string[];
}, key: string): Promise<BookingItem> {
  const res = await requestResponse(`/api/v1/booking/${encodeURIComponent(bookingId)}/repost/`, {
    token, method: 'POST', headers: { 'Idempotency-Key': key }, body: JSON.stringify(schedule),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = bookingError(data, 'Could not repost. Please try again.');
    const pendingReview = extractPendingReview(data);
    if (pendingReview) throw new PendingReviewError(message, pendingReview);
    throw new Error(message);
  }
  if (!data?.booking_id) throw new Error('Could not confirm the repost. Please retry with the same details.');
  return data;
}

export async function fetchMyAssignedBookings(token: string, statusFilter?: string): Promise<BookingItem[]> {
  return bookingList(token, 'assigned', statusFilter);
}

/**
 * Accept a pending booking
 */
export async function acceptBooking(token: string, bookingId: string): Promise<{ success: boolean; error?: string; booking?: BookingItem; pendingReview?: PendingMandatoryReview | null }> {
  try {
    const res = await requestResponse(`${API_BASE_URL}/api/v1/booking/${bookingId}/accept/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: bookingError(data, 'Could not accept booking.'), pendingReview: extractPendingReview(data) };
    return { success: true, booking: data.booking };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error.' };
  }
}

/**
 * Mark booking as InProgress
 */
export async function startBooking(token: string, bookingId: string): Promise<{ success: boolean; error?: string; booking?: BookingItem }> {
  try {
    const res = await requestResponse(`${API_BASE_URL}/api/v1/booking/${bookingId}/start/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: bookingError(data, 'Could not start booking.') };
    return { success: true, booking: data.booking };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error.' };
  }
}

/**
 * Mark booking as Completed
 */
export async function completeBooking(token: string, bookingId: string): Promise<{ success: boolean; error?: string; booking?: BookingItem }> {
  try {
    const res = await requestResponse(`${API_BASE_URL}/api/v1/booking/${bookingId}/complete/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: bookingError(data, 'Could not complete booking.') };
    return { success: true, booking: data.booking };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error.' };
  }
}

/**
 * Cancel a booking after reviewing the server-calculated penalty.
 */
export async function cancelBooking(
  token: string,
  bookingId: string,
  payload: { reason: string; expected_points?: number; pending_only?: boolean }
): Promise<CancellationResult> {
  try {
    const res = await requestResponse(`${API_BASE_URL}/api/v1/booking/${bookingId}/cancel/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, error: bookingError(data, 'Could not cancel booking.') };
    if (data.booking?.booking_status !== 'Cancelled' || !data.penalty) {
      return { success: false, error: 'Could not confirm cancellation. Refresh your bookings.' };
    }
    return { success: true, message: data.message, booking: data.booking, penalty: data.penalty, safety_advisory: data.safety_advisory };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error.' };
  }
}

export interface BookingPenaltyStatus {
  penalty_points: number;
  is_restricted: boolean;
  penalty_month: string;
  resets_at: string;
  pending_review?: PendingMandatoryReview | null;
}

export interface CancellationPreview extends BookingPenaltyStatus {
  points_to_add: number;
  reasons: string[];
}

export interface CancellationResult {
  success: boolean;
  message?: string;
  error?: string;
  booking?: BookingItem;
  penalty?: BookingPenaltyStatus & { points_added: number };
  safety_advisory?: boolean;
}

export function fetchBookingPenaltyStatus(token: string): Promise<BookingPenaltyStatus> {
  return requestJson('/api/v1/booking/penalties/', { token });
}

export async function fetchCancellationPreview(token: string, bookingId: string): Promise<CancellationPreview> {
  const data = await requestJson<CancellationPreview>(`/api/v1/booking/${encodeURIComponent(bookingId)}/cancel/`, { token });
  if (!data || ![0, 1, 2].includes(data.points_to_add) || typeof data.penalty_points !== 'number' || !Array.isArray(data.reasons) || !data.reasons.length || data.reasons.some(reason => typeof reason !== 'string')) {
    throw new Error('Could not load cancellation details. Try again.');
  }
  return data;
}

/**
 * Submit a counter-offer / proposal
 */
export async function submitBookingProposal(
  token: string,
  bookingId: string,
  proposedRate: number | string,
  message: string | undefined,
  ratePeriod: 'day' | 'month'
): Promise<{ success: boolean; error?: string; code?: string; proposal?: BookingProposal; language_warning?: string | null; pendingReview?: PendingMandatoryReview | null }> {
  return sendProposal(token, bookingId, { proposed_rate: proposedRate, rate_period: ratePeriod, message });
}

export async function applyToJobPost(token: string, bookingId: string) {
  return sendProposal(token, bookingId, {
    apply_at_posted_rate: true,
    message: 'I am interested in this job position',
  });
}

export const PAIR_BID_CAP_MESSAGE = 'This pair has reached 3 Part-time / Daily bookings this month. You can still choose Full-time / Monthly or a different partner.';

async function sendProposal(token: string, bookingId: string, body: Record<string, unknown>): Promise<{
  success: boolean; error?: string; code?: string; proposal?: BookingProposal; language_warning?: string | null; already_applied?: boolean; pendingReview?: PendingMandatoryReview | null;
}> {
  try {
    const res = await requestResponse(`${API_BASE_URL}/api/v1/booking/${bookingId}/proposals/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, code: data.code, error: data.code === 'short_term_monthly_cap' ? PAIR_BID_CAP_MESSAGE : bookingError(data, 'Could not submit proposal.'), pendingReview: extractPendingReview(data) };
    return { success: true, proposal: data.proposal, language_warning: data.language_warning, already_applied: data.already_applied === true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error.' };
  }
}

/**
 * Fetch proposals for a booking
 */
export async function fetchBookingProposals(token: string, bookingId: string): Promise<BookingProposal[]> {
  try {
    const res = await requestResponse(`${API_BASE_URL}/api/v1/booking/${bookingId}/proposals/list/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    return await res.json();
  } catch (err) {
    console.warn('[bookingApi] fetchBookingProposals failed:', err);
    return [];
  }
}

/**
 * Respond to a proposal ('accept' or 'reject')
 */
export interface HireSchedulePayload {
  start_time: string;
  end_time: string | null;
  daily_start_time: string;
  daily_end_time: string;
  work_days: string[];
}

export async function respondToProposal(
  token: string,
  proposalId: string,
  action: 'accept' | 'reject' | 'withdraw',
  schedule?: HireSchedulePayload
): Promise<{ success: boolean; error?: string; code?: string; proposal?: BookingProposal; booking?: BookingItem; pendingReview?: PendingMandatoryReview | null }> {
  try {
    const res = await requestResponse(`${API_BASE_URL}/api/v1/booking/proposals/${proposalId}/respond/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(schedule ? { action, ...schedule } : { action }),
    });
    const data = await res.json();
    if (!res.ok) return { success: false, code: data.code, error: data.code === 'short_term_monthly_cap' ? PAIR_BID_CAP_MESSAGE : bookingError(data, 'Could not respond to proposal.'), pendingReview: extractPendingReview(data) };
    return { success: true, proposal: data.proposal, booking: data.booking };
  } catch (err: any) {
    return { success: false, error: err.message || 'Network error.' };
  }
}

/**
 * Fetch Smart Recommendations
 */
export async function fetchRecommendations(token: string): Promise<RecommendationItem[]> {
  try {
    const res = await requestResponse(`${API_BASE_URL}/api/v1/booking/recommendations/`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.recommendations || [];
  } catch (err) {
    console.warn('[bookingApi] fetchRecommendations failed:', err);
    return [];
  }
}

export interface MinimumWageData {
  booking_type: 'long_term' | 'short_term';
  rate_period: 'day' | 'month';
  minimum_rate: string;
  maximum_rate?: string;
  max_daily_rate?: string | null;
  max_monthly_rate?: string | null;
  min_daily_rate: string | null;
  min_monthly_rate?: string | null;
  working_days_per_month?: number;
  is_statutory_mandatory?: boolean;
  wage_order?: string;
  law?: string;
  description?: string;
}

/**
 * GET /api/v1/booking/minimum-wage/
 * Returns the server's minimum compensation and its explicit day/month period.
 */
export async function fetchMinimumWage(
  token?: string,
  bookingType: 'long_term' | 'short_term' = 'long_term',
  address: string = '',
  region: string = ''
): Promise<MinimumWageData | null> {
  try {
    const qs = new URLSearchParams({
      booking_type: bookingType,
      address,
      region,
    });
    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    const res = await requestResponse(`${API_BASE_URL}/api/v1/booking/minimum-wage/?${qs.toString()}`, {
      headers,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.warn('[bookingApi] fetchMinimumWage failed:', err);
    return null;
  }
}

/**
 * POST /api/v1/booking/save/
 * Toggles saving or bookmarking a post on the backend database.
 */
export async function toggleSavePostApi(
  bookingId: string | number,
  token?: string | null
): Promise<{ is_saved: boolean; booking_id: string; message: string } | null> {
  if (!token) return null;
  try {
    const res = await requestResponse(`${API_BASE_URL}/api/v1/booking/save/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ booking_id: String(bookingId) }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      console.warn('[bookingApi] toggleSavePostApi server error:', res.status, errData);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn('[bookingApi] toggleSavePostApi network error:', err);
    return null;
  }
}

/**
 * GET /api/v1/booking/saved/
 * Fetches all saved posts for the current authenticated user from the database.
 */
export async function fetchSavedPostsApi(token?: string | null): Promise<any[]> {
  if (!token) throw new Error('Sign in to view saved posts.');
  const data = await requestJson<unknown>('/api/v1/booking/saved/', { token });
  if (!Array.isArray(data)) throw new Error('Unexpected saved posts response.');
  return data;
}

export async function fetchMyProposalPosts(token: string): Promise<any[]> {
  const data = await requestJson<unknown>('/api/v1/booking/my-proposals/', { token });
  if (!Array.isArray(data)) throw new Error('Unexpected applications response.');
  return data;
}

export async function confirmPostRate(token: string, bookingId: string, rateAmount: string, ratePeriod: 'day' | 'month'): Promise<BookingItem> {
  const res = await requestResponse('/api/v1/booking/' + bookingId + '/rate/', {
    token, method: 'PATCH', body: JSON.stringify({ rate_amount: rateAmount, rate_period: ratePeriod }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(bookingError(data, 'Could not confirm this post amount.'));
  return data as BookingItem;
}
