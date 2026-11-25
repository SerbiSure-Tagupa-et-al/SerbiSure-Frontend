import type { WorkSetup } from '../bookings/workSetup';
import type { BookingItem } from '../bookings/api/bookingApi';
import type { SavedJobItem } from '../bookings/store/savedJobsStore';
import type { LocationScope } from './locationFilter';

export interface BookingFeedDto extends Omit<BookingItem, 'service_category'> {
  poster_id: string;
  poster_verification_status?: string;
  name?: string | null;
  profile_link?: string | null;
  service_category: string[] | string;
}

export interface FeedPost extends SavedJobItem {
  kind: 'job' | 'service';
  partnerId: string;
  authorRole: 'Homeowner' | 'Kasambahay';
  categories: string[];
  location: string;
  time: string;
  roleTag: string;
  termTag: string;
  setupTag: string;
  aboutText: string;
  tags: string[];
}

export interface FeedQuery {
  categories: string[];
  bookingType: string | null;
  workSetup?: WorkSetup | null;
  maxRate: number | null;
  ratePeriod?: 'day' | 'month';
  location: string;
  locationScope?: LocationScope;
  radiusKm?: number;
  originCity?: string;
  originBarangay?: string;
  sortBy: string;
}
