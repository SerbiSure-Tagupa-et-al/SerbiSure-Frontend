import { POSTING_CONFIG, type PostingMode } from './postingConfig';
import type { MinimumWageData } from '../bookings/api/bookingApi';
import { formatRate } from '../../shared/utils/rate';

export const PART_TIME_MAX_RATE = 5000;
export const FULL_TIME_MAX_RATE = 50000;

export function validatePostingRate(mode: PostingMode, engagement: 'short' | 'long' | null, value: string, policy?: MinimumWageData): { title: string; message: string } | null {
  const amount = Number(value);
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim()) || !Number.isFinite(amount) || amount <= 0)
    return { title: 'Valid Rate Required', message: POSTING_CONFIG[mode].invalidAmount };
  const period = engagement === 'long' ? 'month' : 'day';
  const label = period === 'month' ? 'Full-time / Monthly' : 'Part-time / Daily';
  const maxRate = policy?.maximum_rate ? Number(policy.maximum_rate) : (period === 'month' ? FULL_TIME_MAX_RATE : PART_TIME_MAX_RATE);
  const minRate = Number(policy?.minimum_rate ?? (period === 'month' ? 6500 : 600));
  if (policy && policy.rate_period !== period) return { title: 'Rate Policy Changed', message: 'Refresh the wage policy before continuing.' };
  if (!Number.isFinite(minRate) || !Number.isFinite(maxRate) || minRate <= 0 || maxRate < minRate)
    return { title: 'Rate Policy Changed', message: 'Refresh the wage policy before continuing.' };
  if (amount < minRate) return { title: 'Minimum Compensation', message: `Minimum compensation for ${label} bookings is ${formatRate(minRate)} / ${period}.` };
  if (amount > maxRate) return { title: 'Maximum Rate Exceeded', message: `Maximum compensation for ${label} bookings is ${formatRate(maxRate)} / ${period}.` };
  return null;
}
