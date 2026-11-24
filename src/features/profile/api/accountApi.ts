import { API_BASE_URL } from '../../../shared/api/config';
import { requestResponse } from '../../../shared/api/httpClient';

const ACCOUNTS_BASE = `${API_BASE_URL}/api/v1/accounts`;

export interface UserAboutResponse {
  user_about: string;
}

/**
 * Fetch the authenticated user's about/bio string from the backend.
 * GET /api/v1/accounts/user-about/
 */
export async function fetchUserAbout(token: string): Promise<string> {
  try {
    const res = await requestResponse(`${ACCOUNTS_BASE}/user-about/`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.detail || `Failed to fetch bio (${res.status})`);
    }

    const data: UserAboutResponse = await res.json();
    return data.user_about ?? 'No Bio';
  } catch (error: any) {
    console.warn('[accountApi] fetchUserAbout error:', error?.message || error);
    throw error;
  }
}

/**
 * Update the authenticated user's about/bio text.
 * PATCH /api/v1/accounts/user-about/
 * Note: Rate limited to 3 requests/hour by backend.
 */
export async function updateUserAbout(token: string, bio: string): Promise<string> {
  try {
    const res = await requestResponse(`${ACCOUNTS_BASE}/user-about/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_about: bio }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      if (res.status === 429) {
        throw new Error(errJson?.detail || 'Too many attempts. Please try again later.');
      }
      if (errJson?.user_about) {
        const fieldError = Array.isArray(errJson.user_about)
          ? errJson.user_about.join(' ')
          : errJson.user_about;
        throw new Error(fieldError);
      }
      throw new Error(errJson?.detail || `Failed to update bio (${res.status})`);
    }

    const data: UserAboutResponse = await res.json();
    return data.user_about;
  } catch (error: any) {
    console.warn('[accountApi] updateUserAbout error:', error?.message || error);
    throw error;
  }
}

export interface SocialLinkItem {
  platform: string;
  platform_name?: string;
  url: string;
  handle?: string;
}

export interface UserSocialLinksData {
  social_links: SocialLinkItem[];
  show_social_links?: boolean;
}

export interface PublicProfile {
  id: string;
  first_name?: string;
  last_name?: string;
  full_name: string;
  account_type: string;
  verification_status: string;
  profile_link: string | null;
  user_about: string;
  user_tags: string[];
  street?: string | null;
  barangay?: string | null;
  city: string | null;
  province: string | null;
  date_joined: string;
  email?: string;
  contact_number?: string | null;
  show_contact_number?: boolean;
  social_links?: SocialLinkItem[];
  show_social_links?: boolean;
}

export interface VerifiedWorkHistoryJob {
  booking_id: string;
  service_category: string[];
  service_labels: string[];
  booking_type: 'short_term' | 'long_term' | string;
  work_setup: 'stay_in' | 'stay_out' | null;
  area: string;
  start_date: string | null;
  end_date: string | null;
  completed_at: string | null;
  employer_name: string;
  partner_role?: string;
  employer_verified: boolean;
  employer_avatar: string | null;
  rating: number | null;
  would_recommend: boolean | null;
  nlp_sentiment: string | null;
  feedback: string | null;
}

export interface VerifiedWorkHistorySummary {
  completed_jobs_count: number;
  recommended_count: number;
  repeat_employers_count: number;
}

export interface VerifiedWorkHistoryData {
  user_id: string;
  account_type?: string;
  summary: VerifiedWorkHistorySummary;
  jobs: VerifiedWorkHistoryJob[];
}

/**
 * Fetch either participant's verified on-platform completed booking history and referrals.
 * GET /api/v1/accounts/public-profile/<userId>/work-history/
 */
export async function fetchWorkerWorkHistory(token: string, userId: string): Promise<VerifiedWorkHistoryData | null> {
  try {
    const res = await requestResponse(`${ACCOUNTS_BASE}/public-profile/${userId}/work-history/`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error: any) {
    console.warn('[accountApi] fetchWorkerWorkHistory error:', error?.message || error);
    return null;
  }
}

/**
 * Fetch the public profile of any user by their UUID.
 * GET /api/v1/accounts/public-profile/<userId>/
 */
export async function fetchPublicProfile(token: string, userId: string): Promise<PublicProfile> {
  try {
    const res = await requestResponse(`${ACCOUNTS_BASE}/public-profile/${userId}/`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.detail || `Failed to fetch profile (${res.status})`);
    }

    const data: PublicProfile = await res.json();
    return data;
  } catch (error: any) {
    console.warn('[accountApi] fetchPublicProfile error:', error?.message || error);
    throw error;
  }
}

/**
 * Change the authenticated user's password.
 * POST /api/v1/accounts/change-password/
 */
export async function changePassword(
  token: string,
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<{ message: string }> {
  try {
    const res = await requestResponse(`${ACCOUNTS_BASE}/change-password/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.error || errJson?.detail || `Failed to change password (${res.status})`);
    }

    const data = await res.json();
    return data;
  } catch (error: any) {
    console.warn('[accountApi] changePassword error:', error?.message || error);
    throw error;
  }
}

/**
 * Search users by query keyword, role, location, or tag (Tier 2-2).
 * GET /api/v1/accounts/search/
 */
export async function searchUsers(
  token: string,
  params: { q?: string; role?: string; location?: string; tag?: string }
): Promise<{ users: PublicProfile[]; count: number }> {
  try {
    const qs = new URLSearchParams();
    if (params.q) qs.append('q', params.q);
    if (params.role) qs.append('role', params.role);
    if (params.location) qs.append('location', params.location);
    if (params.tag) qs.append('tag', params.tag);

    const res = await requestResponse(`${ACCOUNTS_BASE}/search/?${qs.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { users: [], count: 0 };
    return await res.json();
  } catch (error: any) {
    console.warn('[accountApi] searchUsers error:', error?.message || error);
    return { users: [], count: 0 };
  }
}

/**
 * Deactivate / delete account with password verification (Tier 3-5).
 * POST /api/v1/accounts/delete-account/
 */
export async function deleteAccount(
  token: string,
  password: string
): Promise<{ message: string }> {
  try {
    const res = await requestResponse(`${ACCOUNTS_BASE}/delete-account/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ password }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || data.detail || `Failed to delete account (${res.status})`);
    }
    return data;
  } catch (error: any) {
    console.warn('[accountApi] deleteAccount error:', error?.message || error);
    throw error;
  }
}

/**
 * Export full user data archive (Tier 3-5).
 * GET /api/v1/accounts/export-data/
 */
export async function exportUserData(
  token: string
): Promise<any> {
  try {
    const res = await requestResponse(`${ACCOUNTS_BASE}/export-data/`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      throw new Error(`Failed to export user data (${res.status})`);
    }
    return await res.json();
  } catch (error: any) {
    console.warn('[accountApi] exportUserData error:', error?.message || error);
    throw error;
  }
}

/**
 * Fetch the authenticated user's profile tags from the backend.
 * GET /api/v1/accounts/user-tags/
 */
export async function fetchUserTags(token: string): Promise<string[]> {
  try {
    const res = await requestResponse(`${ACCOUNTS_BASE}/user-tags/`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.detail || `Failed to fetch tags (${res.status})`);
    }

    const data = await res.json();
    return Array.isArray(data.user_tags) ? data.user_tags : [];
  } catch (error: any) {
    console.warn('[accountApi] fetchUserTags error:', error?.message || error);
    throw error;
  }
}

/**
 * Update the authenticated user's profile tags.
 * PATCH /api/v1/accounts/user-tags/
 * Note: Max 10 tags, max 15 chars per tag.
 */
export async function updateUserTags(token: string, tags: string[]): Promise<string[]> {
  try {
    const res = await requestResponse(`${ACCOUNTS_BASE}/user-tags/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_tags: tags }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      if (res.status === 429) {
        throw new Error(errJson?.detail || 'Too many attempts. Please try again later.');
      }
      if (errJson?.user_tags) {
        const fieldError = Array.isArray(errJson.user_tags)
          ? errJson.user_tags.join(' ')
          : errJson.user_tags;
        throw new Error(fieldError);
      }
      throw new Error(errJson?.detail || `Failed to update tags (${res.status})`);
    }

    const data = await res.json();
    return Array.isArray(data.user_tags) ? data.user_tags : [];
  } catch (error: any) {
    console.warn('[accountApi] updateUserTags error:', error?.message || error);
    throw error;
  }
}

/**
 * Fetch the authenticated user's contact privacy setting.
 * GET /api/v1/accounts/contact-privacy/
 */
export async function fetchContactPrivacy(token: string): Promise<boolean> {
  try {
    const res = await requestResponse(`${ACCOUNTS_BASE}/contact-privacy/`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.detail || `Failed to fetch contact privacy (${res.status})`);
    }

    const data = await res.json();
    return Boolean(data.show_contact_number);
  } catch (error: any) {
    console.warn('[accountApi] fetchContactPrivacy error:', error?.message || error);
    throw error;
  }
}

/**
 * Update the authenticated user's contact privacy setting.
 * PATCH /api/v1/accounts/contact-privacy/
 */
export async function updateContactPrivacy(token: string, showContactNumber: boolean): Promise<boolean> {
  try {
    const res = await requestResponse(`${ACCOUNTS_BASE}/contact-privacy/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ show_contact_number: showContactNumber }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.detail || `Failed to update contact privacy (${res.status})`);
    }

    const data = await res.json();
    return Boolean(data.show_contact_number);
  } catch (error: any) {
    console.warn('[accountApi] updateContactPrivacy error:', error?.message || error);
    throw error;
  }
}

/**
 * Fetch the authenticated Kasambahay's current job status (isOnJob).
 * GET /api/v1/accounts/job-status/
 */
export async function fetchJobStatus(token: string): Promise<boolean> {
  try {
    const res = await requestResponse(`${ACCOUNTS_BASE}/job-status/`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.detail || `Failed to fetch job status (${res.status})`);
    }

    const data = await res.json();
    if (typeof data.is_on_job !== 'boolean') throw new Error('Could not load your status. Please try again.');
    return data.is_on_job;
  } catch (error: any) {
    console.warn('[accountApi] fetchJobStatus error:', error?.message || error);
    throw error;
  }
}

/**
 * Update the authenticated Kasambahay's job status (isOnJob).
 * PATCH /api/v1/accounts/job-status/
 */
export async function updateJobStatus(token: string, isOnJob: boolean): Promise<boolean> {
  try {
    const res = await requestResponse(`${ACCOUNTS_BASE}/job-status/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ is_on_job: isOnJob }),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.detail || `Failed to update job status (${res.status})`);
    }

    const data = await res.json();
    if (typeof data.is_on_job !== 'boolean') throw new Error('Could not update your status. Please try again.');
    return data.is_on_job;
  } catch (error: any) {
    console.warn('[accountApi] updateJobStatus error:', error?.message || error);
    throw error;
  }
}

/**
 * Fetch the authenticated user's social links.
 * GET /api/v1/accounts/social-links/
 */
export async function fetchUserSocialLinks(token: string): Promise<UserSocialLinksData> {
  try {
    const res = await requestResponse(`${ACCOUNTS_BASE}/social-links/`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson?.detail || `Failed to fetch social links (${res.status})`);
    }

    return await res.json();
  } catch (error: any) {
    console.log('[accountApi] fetchUserSocialLinks error:', error?.message || error);
    throw error;
  }
}

/**
 * Update the authenticated user's social links.
 * PATCH /api/v1/accounts/social-links/
 */
export async function updateUserSocialLinks(
  token: string,
  payload: {
    social_links: { platform?: string; url: string }[];
    show_social_links?: boolean;
  }
): Promise<UserSocialLinksData> {
  try {
    const res = await requestResponse(`${ACCOUNTS_BASE}/social-links/`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const errDetail =
        data.detail ||
        (Array.isArray(data.social_links) ? data.social_links[0] : null) ||
        data.non_field_errors?.[0] ||
        `Failed to update social links (${res.status})`;
      throw new Error(errDetail);
    }

    return data;
  } catch (error: any) {
    console.warn('[accountApi] updateUserSocialLinks error:', error?.message || error);
    throw error;
  }
}

