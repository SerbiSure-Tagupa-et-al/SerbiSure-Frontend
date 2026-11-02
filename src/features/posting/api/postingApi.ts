import type { WorkSetup } from '../../bookings/workSetup';
import { requestResponse } from '../../../shared/api/httpClient';
import { clearExploreFeedCache } from '../../feed/feedCache';

export interface PostingPayload {
  booking_type: 'short_term' | 'long_term';
  work_setup: WorkSetup;
  service_category: string[];
  start_time: string;
  end_time: string | null;
  work_days?: string[];
  daily_start_time?: string;
  daily_end_time?: string;
  region?: string;
  province?: string;
  city?: string;
  barangay?: string;
  street: string;
  floor_number?: string;
  zip_code: string;
  special_instruction: string;
  rate_amount: string;
  rate_period: 'day' | 'month';
}

// Keep the shared contract shape above intact for ChatOfferPayload.
export type PublicPostingPayload = Omit<PostingPayload,
  'start_time' | 'end_time' | 'work_days' | 'daily_start_time' | 'daily_end_time'> & {
  daily_start_time: string;
  daily_end_time: string;
};

export async function submitPost(token: string | null, payload: PublicPostingPayload, idempotencyKey: string) {
  const response = await requestResponse('/api/v1/booking/post/', {
    token, method: 'POST', headers: { 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(payload),
  });
  if (response.ok) clearExploreFeedCache();
  return response;
}
