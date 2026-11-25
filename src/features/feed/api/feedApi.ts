import { requestJson } from '../../../shared/api/httpClient';
import type { BookingFeedDto, FeedQuery } from '../types';

export function buildFeedPath(filters?: FeedQuery): string {
  const params = new URLSearchParams();
  if (filters?.categories.length) params.set('category', filters.categories.join(','));
  if (filters?.bookingType) params.set('booking_type', filters.bookingType);
  if (filters?.workSetup) params.set('work_setup', filters.workSetup);
  if (filters?.maxRate !== null && filters?.maxRate !== undefined) params.set('max_rate', String(filters.maxRate));
  if (filters && filters.maxRate !== null) {
    params.set('rate_period', filters.bookingType === 'long_term' ? 'month'
      : filters.bookingType === 'short_term' ? 'day' : filters.ratePeriod || 'day');
  }
  if (filters?.location.trim()) params.set('location', filters.location.trim());
  if (filters?.locationScope && filters.locationScope !== 'all') {
    params.set('scope', filters.locationScope);
    if (filters.locationScope === 'radius' && filters.radiusKm) {
      params.set('radius_km', String(filters.radiusKm));
    }
  }
  if (filters?.originCity?.trim()) params.set('origin_city', filters.originCity.trim());
  if (filters?.originBarangay?.trim()) params.set('origin_barangay', filters.originBarangay.trim());
  if (filters?.sortBy === 'nearest') params.set('sort', 'nearest');
  const query = params.toString();
  return `/api/v1/booking/feed/${query ? `?${query}` : ''}`;
}

export async function fetchFeed(token: string, filters?: FeedQuery): Promise<BookingFeedDto[]> {
  const data = await requestJson<unknown>(buildFeedPath(filters), { token });
  if (!Array.isArray(data)) throw new Error('Unexpected feed response. Please try again.');
  return data as BookingFeedDto[];
}
