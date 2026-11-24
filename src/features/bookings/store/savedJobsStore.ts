import { formatRate } from '../../../shared/utils/rate';
import { workSetupLabel } from '../workSetup';
import { useState, useEffect } from 'react';
import { toggleSavePostApi, fetchSavedPostsApi, fetchMyProposalPosts, formatBookingLocationShort, applyToJobPost, PendingReviewError } from '../api/bookingApi';

export interface SavedJobItem {
  id: string | number;
  partnerId?: string | number;
  employerName: string;
  title?: string;
  avatar: string;
  time?: string;
  location?: string;
  roleTag?: string;
  termTag?: string;
  setupTag?: string;
  price: string;
  unit: string;
  aboutText?: string;
  tags?: string[];
  image?: string;
  start_time?: string;
  end_time?: string | null;
  booking_type?: 'short_term' | 'long_term';
  daily_start_time?: string | null;
  daily_end_time?: string | null;
  work_days?: string[];
  booking_status?: string;
  post_status?: string;
  application_status?: string;
}

type StoreListener = () => void;

class SavedJobsStore {
  private savedMap: Map<string | number, SavedJobItem> = new Map();
  private appliedMap: Map<string | number, SavedJobItem> = new Map();
  private closedJobs: Set<string | number> = new Set();
  private listeners: Set<StoreListener> = new Set();
  private currentUserId: string | null = null;
  private isSyncing: boolean = false;
  private sessionVersion = 0;
  private applicationRevision = 0;
  private applying = new Set<string | number>();
  loadError: string | null = null;
  get loading() { return this.isSyncing; }

  constructor() { }

  subscribe(listener: StoreListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }

  /**
   * Initializes or refreshes saved jobs from the backend database for a specific authenticated user.
   * Clears any previous user's data to guarantee total cross-account isolation.
   */
  async initForUser(userId: string | number, token: string | null) {
    const newUserId = String(userId);
    if (this.currentUserId !== newUserId) {
      this.clearStore();
      this.currentUserId = newUserId;
    }

    if (!token) return;
    await this.refreshFromBackend(token);
  }

  /**
   * Fetches the latest saved posts from GET /api/v1/booking/saved/ and syncs with local store.
   */
  async refreshFromBackend(token: string | null) {
    if (!token || this.isSyncing) return;
    const version = this.sessionVersion;
    const applicationRevision = this.applicationRevision;
    this.isSyncing = true; this.loadError = null; this.notify();
    try {
      const [data, applications] = await Promise.all([fetchSavedPostsApi(token), fetchMyProposalPosts(token)]);
      if (version !== this.sessionVersion) return;
      if (Array.isArray(data)) {
        // Clear saved map for this fresh sync from DB
        this.savedMap.clear();
        for (const item of data) {
          if (!item) continue;
          const categories = Array.isArray(item.service_category)
            ? item.service_category
            : (item.service_category ? [item.service_category] : ['General']);
          const avatarUrl =
            item.profile_link ||
            `https://ui-avatars.com/api/?name=${encodeURIComponent(item.name || 'User')}&background=FFB43B&color=fff`;
          const isLongTerm = item.booking_type === 'long_term';
          const termTag = isLongTerm ? 'Full-time' : 'Part-time';
          const unit = isLongTerm ? '/ month' : '/ day';
          const loc = formatBookingLocationShort(item, 'Location not provided');

          const jobItem: SavedJobItem = {
            id: item.booking_id,
            partnerId: item.poster_id,
            employerName: item.name || 'User',
            title: categories[0] || 'Household Service',
            avatar: avatarUrl,
            location: loc,
            roleTag: categories.join(', '),
            termTag: termTag,
            setupTag: workSetupLabel(item.work_setup),
            price: formatRate(item.rate_amount),
            unit: unit,
            aboutText: item.special_instruction || undefined,
            tags: [...categories, ...(item.work_setup ? [workSetupLabel(item.work_setup)] : [])],
            image: avatarUrl,
            start_time: item.start_time, booking_status: item.booking_status, post_status: item.post_status,
            end_time: item.end_time, booking_type: item.booking_type,
            daily_start_time: item.daily_start_time, daily_end_time: item.daily_end_time, work_days: item.work_days,
          };
          this.savedMap.set(jobItem.id, jobItem);
        }
        // A refresh started before an application must not erase the new entry.
        if (applicationRevision === this.applicationRevision) this.appliedMap.clear();
        for (const item of applications) {
          this.appliedMap.set(item.booking_id, {
            id: item.booking_id, partnerId: item.poster_id, employerName: item.name || 'User',
            avatar: item.profile_link || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(item.name || 'User'),
            roleTag: (item.service_category || []).join(', '), title: (item.service_category || []).join(', '),
            location: formatBookingLocationShort(item, 'Location not provided'),
            termTag: item.booking_type === 'long_term' ? 'Full-time' : 'Part-time',
            price: formatRate(item.rate_amount, 'PHP '), unit: '/ ' + item.rate_period,
            aboutText: item.special_instruction || '', tags: item.service_category || [],
            start_time: item.start_time, booking_status: item.booking_status, post_status: item.post_status,
            end_time: item.end_time, booking_type: item.booking_type,
            daily_start_time: item.daily_start_time, daily_end_time: item.daily_end_time, work_days: item.work_days,
            application_status: item.application_status,
          });
        }
        this.notify();
      }
    } catch (err) {
      if (version !== this.sessionVersion) return;
      this.loadError = err instanceof Error ? err.message : 'Unable to load saved posts and applications.';
      console.warn('[savedJobsStore] refreshFromBackend error:', err);
    } finally {
      if (version === this.sessionVersion) { this.isSyncing = false; this.notify(); }
    }
  }

  /**
   * Clears all saved jobs, applied jobs, and closed jobs from memory (used on logout).
   */
  clearStore() {
    this.sessionVersion++; this.isSyncing = false;
    this.applying.clear();
    this.applicationRevision++;
    this.loadError = null;
    this.savedMap.clear();
    this.appliedMap.clear();
    this.closedJobs.clear();
    this.currentUserId = null;
    this.isSyncing = false;
    this.notify();
  }

  /**
   * Optimistically toggles save state locally, and syncs with backend database.
   * If backend request fails, rolls back the optimistic update.
   */
  async toggleSave(job: SavedJobItem, token?: string | null) {
    const wasSaved = this.savedMap.has(job.id);
    if (wasSaved) {
      this.savedMap.delete(job.id);
    } else {
      this.savedMap.set(job.id, { ...job });
    }
    this.notify();

    if (token) {
      const res = await toggleSavePostApi(job.id, token);
      if (!res) {
        // Rollback optimistic update on failure
        if (wasSaved) {
          this.savedMap.set(job.id, { ...job });
        } else {
          this.savedMap.delete(job.id);
        }
        this.notify();
      }
    }
  }

  isSaved(id: string | number): boolean {
    return this.savedMap.has(id);
  }

  isApplied(id: string | number): boolean {
    return this.appliedMap.has(id);
  }

  async applyToJob(job: SavedJobItem, token?: string | null): Promise<{ created: boolean } | null> {
    if (!token) throw new Error('Please sign in to apply for this job.');
    if (this.applying.has(job.id)) return null;
    const wasApplied = this.appliedMap.has(job.id);
    const version = this.sessionVersion;
    this.applying.add(job.id);
    try {
      const result = await applyToJobPost(token, String(job.id));
      if (version !== this.sessionVersion) return null;
      if (!result.success || !result.proposal?.proposal_id) {
        const message = result.error || 'Your application could not be confirmed. Please try again.';
        if (result.pendingReview) throw new PendingReviewError(message, result.pendingReview);
        throw new Error(message);
      }
      this.applicationRevision++;
      this.appliedMap.set(job.id, { ...job, application_status: 'applied' });
      this.notify();
      return { created: !wasApplied && !result.already_applied };
    } finally {
      if (version === this.sessionVersion) this.applying.delete(job.id);
    }
  }

  markJobClosed(id?: string | number | null, ...extraKeys: (string | number | undefined | null)[]) {
    if (id !== undefined && id !== null) {
      this.closedJobs.add(id);
      this.closedJobs.add(String(id));
      if (typeof id === 'string') {
        this.closedJobs.add(id.trim().toLowerCase());
      }
    }
    extraKeys.forEach((key) => {
      if (key !== undefined && key !== null) {
        this.closedJobs.add(key);
        this.closedJobs.add(String(key));
        if (typeof key === 'string') {
          this.closedJobs.add(key.trim().toLowerCase());
        }
      }
    });
    this.notify();
  }

  isClosed(id?: string | number | null): boolean {
    if (id === undefined || id === null) return false;
    if (this.closedJobs.has(id) || this.closedJobs.has(String(id))) return true;
    if (typeof id === 'string' && this.closedJobs.has(id.trim().toLowerCase())) return true;
    return false;
  }

  isJobClosed(job?: any): boolean {
    if (!job) return false;
    if (job.id && this.isClosed(job.id)) return true;
    if (job.partnerId && this.isClosed(job.partnerId)) return true;
    if (job.employerName && this.isClosed(job.employerName)) return true;
    return false;
  }

  getSavedJobs(): SavedJobItem[] {
    return Array.from(this.savedMap.values());
  }

  getAppliedJobs(): SavedJobItem[] {
    return Array.from(this.appliedMap.values());
  }

  getSavedCount(): number {
    return this.savedMap.size;
  }

  getAppliedCount(): number {
    return this.appliedMap.size;
  }
}

export const savedJobsStore = new SavedJobsStore();

export function useJobsActivity() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const unsubscribe = savedJobsStore.subscribe(() => {
      setTick((prev) => prev + 1);
    });
    return unsubscribe;
  }, []);

  return {
    savedLoadError: savedJobsStore.loadError,
    loadingSaved: savedJobsStore.loading,
    savedJobs: savedJobsStore.getSavedJobs(),
    appliedJobs: savedJobsStore.getAppliedJobs(),
    savedCount: savedJobsStore.getSavedCount(),
    appliedCount: savedJobsStore.getAppliedCount(),
    isSaved: (id: string | number) => savedJobsStore.isSaved(id),
    isApplied: (id: string | number) => savedJobsStore.isApplied(id),
    isClosed: (id?: string | number | null) => savedJobsStore.isClosed(id),
    isJobClosed: (job?: any) => savedJobsStore.isJobClosed(job),
    markJobClosed: (id?: string | number | null, ...extraKeys: (string | number | undefined | null)[]) =>
      savedJobsStore.markJobClosed(id, ...extraKeys),
    toggleSave: (job: SavedJobItem, token?: string | null) => savedJobsStore.toggleSave(job, token),
    clearStore: () => savedJobsStore.clearStore(),
    refreshSavedFromBackend: (token: string | null) => savedJobsStore.refreshFromBackend(token),
  };
}
