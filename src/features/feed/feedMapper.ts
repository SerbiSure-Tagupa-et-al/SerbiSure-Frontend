import { workSetupLabel } from '../bookings/workSetup';
import type { Role } from '../../app/roleConfig';
import { formatCompactTimeAgo } from '../../shared/utils/date';
import { formatBookingAddress, formatBookingLocationShort } from '../bookings/api/bookingApi';
import type { BookingFeedDto, FeedPost } from './types';
import type { SavedJobItem } from '../bookings/store/savedJobsStore';
import { formatRate, stripLegacyExpectedRate } from '../../shared/utils/rate';

// Both Browse roles use one shape for cards, saved posts, profiles and chats.
export function mapBrowsePost(item: BookingFeedDto, role: Role): SavedJobItem & { title: string; location: string; aboutText: string; tags: string[] } {
  if (item.poster_account_type === 'Homeowner' || (!item.poster_account_type && role === 'kasambahay')) return mapJobPreview(item);
  const worker = mapWorkerPreview(item);
  return {
    id: worker.id, partnerId: worker.partnerId, employerName: worker.name, title: worker.role,
    start_time: item.start_time, booking_status: item.booking_status, post_status: item.post_status,
    end_time: item.end_time, booking_type: item.booking_type,
    daily_start_time: item.daily_start_time, daily_end_time: item.daily_end_time, work_days: item.work_days,
    avatar: worker.avatar, image: worker.image, location: worker.location, roleTag: worker.role,
    authorRole: 'Kasambahay', termTag: worker.years, setupTag: worker.setupTag, price: worker.price, unit: worker.unit,
    aboutText: worker.aboutText, tags: Array.from(new Set([worker.years, ...worker.tags])),
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  Cleaning: 'Cleaning', Child_care: 'Child Care', Cooking: 'Cook', Caregiver: 'Caregiver',
  Laundry: 'Laundry', 'All-around': 'All-around',
};

export function mapFeedPost(item: BookingFeedDto, viewerRole: Role): FeedPost {
  const isJob = item.poster_account_type ? item.poster_account_type === 'Homeowner' : viewerRole === 'kasambahay';
  const rawCategories = Array.isArray(item.service_category) ? item.service_category : item.service_category ? [item.service_category] : [isJob ? 'Household' : 'General Service'];
  const categories = rawCategories.map((value) => !isJob && value === 'Cleaning' ? 'Cleaner' : CATEGORY_LABELS[value] || value.replace(/_/g, ' '));
  const authorRole = isJob ? 'Homeowner' : 'Kasambahay';
  const name = item.name || (isJob ? 'Homeowner' : 'Kasambahay Worker');
  const longTerm = item.booking_type === 'long_term';
  const termTag = longTerm ? 'Full-time' : 'Part-time';
  const setupTag = workSetupLabel(item.work_setup);
  const location = formatBookingLocationShort(item, 'Location not provided');
  const description = item.special_instruction?.trim() || (isJob
    ? `I am looking for ${categories.join(' & ')} at ${formatBookingAddress(item, 'residence')}, ${item.work_setup ? 'on a ' + setupTag.toLowerCase() + ' setup' : 'with work setup to be confirmed'}.`
    : `Available for ${categories.join(' & ')} work in ${location}.`);
  return {
    id: item.booking_id, partnerId: item.poster_id, kind: isJob ? 'job' : 'service', authorRole,
    start_time: item.start_time, booking_status: item.booking_status, post_status: item.post_status,
    end_time: item.end_time, booking_type: item.booking_type,
    daily_start_time: item.daily_start_time, daily_end_time: item.daily_end_time, work_days: item.work_days,
    employerName: name, title: categories[0] || (isJob ? 'Household Service' : 'Kasambahay'),
    avatar: item.profile_link || `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name || authorRole)}&background=FFB43B&color=fff`,
    time: formatCompactTimeAgo(item.createdAt), location, categories,
    roleTag: categories[0] || (isJob ? 'Household Service' : 'Kasambahay'), termTag, setupTag,
    price: isJob ? formatRate(item.rate_amount) : '', unit: isJob ? (longTerm ? '/ month' : '/ day') : '', aboutText: isJob ? description : stripLegacyExpectedRate(description),
    tags: Array.from(new Set(isJob ? [...(item.poster_verification_status === 'Verified' ? ['Verified Employer'] : []), termTag, setupTag, ...categories] : [...categories, termTag, ...(item.work_setup ? [setupTag] : [])])),
  };
}

export function mapWorkerPreview(item: BookingFeedDto) {
  const categories = Array.isArray(item.service_category)
    ? item.service_category
    : (item.service_category ? [item.service_category] : ['General']);
  const avatarUrl =
    item.profile_link ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name || 'Kasambahay')}&background=FFB43B&color=fff`;

  return {
    authorRole: 'Kasambahay' as const,
    id: item.booking_id,
    partnerId: item.poster_id,
    name: item.name || 'Anonymous User',
    start_time: item.start_time, end_time: item.end_time, booking_type: item.booking_type,
    daily_start_time: item.daily_start_time, daily_end_time: item.daily_end_time, work_days: item.work_days,
    location: formatBookingLocationShort(item, 'Location not provided'),
    role: categories.map((category) => CATEGORY_LABELS[category] || category.replace(/_/g, ' ')).join(', '),
    years: item.booking_type === 'long_term' ? 'Full-time' : 'Part-time',
    setupTag: workSetupLabel(item.work_setup),
    tags: [...categories.map((category) => CATEGORY_LABELS[category] || category.replace(/_/g, ' ')), ...(item.work_setup ? [workSetupLabel(item.work_setup)] : [])],
    price: '',
    unit: '',
    aboutText: stripLegacyExpectedRate(item.special_instruction) || 'Available for household services. View this post for more details.',
    image: avatarUrl,
    avatar: avatarUrl,
  };
}

export function mapJobPreview(item: BookingFeedDto) {
  const rawCategories = Array.isArray(item.service_category)
    ? item.service_category
    : item.service_category
      ? [item.service_category]
      : ['Household'];

  const categoryMap: Record<string, string> = {
    Cleaning: 'Cleaning',
    Child_care: 'Child Care',
    Cooking: 'Cook',
    Caregiver: 'Caregiver',
    Laundry: 'Laundry',
    'All-around': 'All-around',
  };
  const categories = rawCategories.map((c: string) => categoryMap[c] || c.replace(/_/g, ' '));
  const avatarUrl =
    item.profile_link ||
    `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name || 'Homeowner')}&background=FFB43B&color=fff`;

  const isLongTerm = item.booking_type === 'long_term';
  const termTag = isLongTerm ? 'Full-time' : 'Part-time';
  const setupTag = workSetupLabel(item.work_setup);
  const unit = isLongTerm ? 'per month' : 'per day';

  const locShort = formatBookingLocationShort(item, 'Location not provided');
  const locForDesc = formatBookingAddress(item, 'residence');

  let description = item.special_instruction && item.special_instruction.trim()
    ? item.special_instruction.trim()
    : `I am looking for ${categories.join(' & ')} at ${locForDesc}, ${item.work_setup ? 'on a ' + setupTag.toLowerCase() + ' setup' : 'with work setup to be confirmed'}.`;


  return {
    authorRole: 'Homeowner' as const,
    id: item.booking_id,
    partnerId: item.poster_id,
    employerName: item.name || 'Homeowner',
    start_time: item.start_time, booking_status: item.booking_status, post_status: item.post_status,
    end_time: item.end_time, booking_type: item.booking_type,
    daily_start_time: item.daily_start_time, daily_end_time: item.daily_end_time, work_days: item.work_days,
    title: categories.join(' & ') || 'Household Service',
    location: locShort,
    description,
    price: formatRate(item.rate_amount),
    unit,
    tags: [...(item.poster_verification_status === 'Verified' ? ['Verified Employer'] : []), termTag, setupTag, ...categories].filter((v, i, a) => a.indexOf(v) === i),
    image: avatarUrl,
    avatar: avatarUrl,
    roleTag: categories[0] || 'Household Help',
    termTag,
    setupTag,
    aboutText: description,
  };
}
