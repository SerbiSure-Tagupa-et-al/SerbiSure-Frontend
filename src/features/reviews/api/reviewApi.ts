import { API_BASE_URL } from '../../../shared/api/config';
import { requestResponse } from '../../../shared/api/httpClient';
import { generateUUID } from '../../chat/api/chatApi';

const REVIEW_BASE = `${API_BASE_URL}/api/v1/reviews`;

export type SentimentType = 'Positive' | 'Neutral' | 'Negative';

export interface SentimentAnalysis {
  label: SentimentType;
  confidence: number;
  probabilities: Record<SentimentType, number>;
  source: 'huggingface';
  model: string;
  analyzed_at: string;
}

export class ReviewSubmissionError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message);
    this.name = 'ReviewSubmissionError';
  }
}

export interface ReviewItem {
  review_id: string;
  booking_id: string;
  booking_service_category: string[];
  reviewer_id: string;
  reviewer_name: string;
  reviewer_account_type: string;
  reviewer_profile_link: string | null;
  reviewee_id: string;
  reviewee_name: string;
  reviewee_account_type: string;
  reviewee_profile_link: string | null;
  rating: number;
  would_recommend?: boolean | null;
  unstructured_feedback: string;
  nlp_sentiment: SentimentType;
  sentiment_analysis?: SentimentAnalysis | Record<string, never>;
  createdAt: string;
}

export interface ReviewSummaryData {
  user_id: string;
  user_name: string;
  account_type: string;
  profile_link: string | null;
  average_rating: number;
  total_reviews: number;
  sentiment_breakdown: {
    Positive: number;
    Neutral: number;
    Negative: number;
  };
  rating_breakdown: {
    '5': number;
    '4': number;
    '3': number;
    '2': number;
    '1': number;
  };
}

export interface CreateReviewParams {
  booking_id: string;
  rating: number; // 1 to 5
  unstructured_feedback: string; // Min 10 chars, max 1000 chars
  would_recommend?: boolean | null;
}

/** Django validates, analyzes, and saves the review before returning success. */
export async function submitReview(
  token: string,
  params: CreateReviewParams,
  idempotencyKey: string = generateUUID(),
): Promise<{ message: string; data: ReviewItem }> {
  let res: Response;
  try {
    const payload: Record<string, unknown> = {
      booking_id: params.booking_id,
      rating: params.rating,
      unstructured_feedback: params.unstructured_feedback.trim(),
    };
    if (typeof params.would_recommend === 'boolean') {
      payload.would_recommend = params.would_recommend;
    }
    res = await requestResponse(`${REVIEW_BASE}/create/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
    }, 60000);
  } catch {
    throw new ReviewSubmissionError('We could not confirm your submission. Your feedback is still here. Tap Try Again to check safely.', 'connection');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = data.detail || data.booking_id?.[0] || data.rating?.[0] ||
      data.would_recommend?.[0] || data.unstructured_feedback?.[0] || 'Could not submit your review. Please try again.';
    throw new ReviewSubmissionError(String(message), data.code);
  }
  if (!data.data?.review_id || !['Positive', 'Neutral', 'Negative'].includes(data.data.nlp_sentiment)) {
    throw new ReviewSubmissionError('We could not confirm your submission. Please try again.', 'connection');
  }
  return data;
}

/**
 * GET /api/v1/reviews/received/
 * Retrieves all reviews received by the authenticated user.
 */
export async function fetchReceivedReviews(token: string): Promise<ReviewItem[]> {
  const res = await requestResponse(`${REVIEW_BASE}/received/`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to fetch received reviews (${res.status})`);
  }

  const json = await res.json();
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.results)) return json.results;
  return [];
}

/**
 * GET /api/v1/reviews/given/
 * Retrieves all reviews authored by the authenticated user.
 */
export async function fetchGivenReviews(token: string): Promise<ReviewItem[]> {
  const res = await requestResponse(`${REVIEW_BASE}/given/`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to fetch given reviews (${res.status})`);
  }

  const json = await res.json();
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.results)) return json.results;
  return [];
}

/**
 * GET /api/v1/reviews/summary/<uuid:user_id>/
 * Retrieves aggregated review metrics for a user.
 */
export async function fetchReviewSummary(token: string, userId: string): Promise<ReviewSummaryData | null> {
  const res = await requestResponse(`${REVIEW_BASE}/summary/${userId}/`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to fetch review summary (${res.status})`);
  }

  const responseJson = await res.json();
  return responseJson.data || responseJson;
}

/**
 * GET /api/v1/reviews/user/<uuid:user_id>/
 * Retrieves public list of reviews for a target user.
 */
export async function fetchUserReviews(token: string, userId: string): Promise<ReviewItem[]> {
  const res = await requestResponse(`${REVIEW_BASE}/user/${userId}/`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 404) {
    return [];
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.detail || `Failed to fetch user reviews (${res.status})`);
  }

  const json = await res.json();
  if (Array.isArray(json)) return json;
  if (Array.isArray(json?.data)) return json.data;
  if (Array.isArray(json?.results)) return json.results;
  return [];
}

export interface ReviewAnalyticsData {
  user_id: string;
  user_name: string;
  account_type: string;
  total_jobs_completed: number;
  total_reviews: number;
  average_rating: number;
  positive_percentage: number;
  sentiment_breakdown: {
    Positive: number;
    Neutral: number;
    Negative: number;
  };
  rating_breakdown: {
    '5': number;
    '4': number;
    '3': number;
    '2': number;
    '1': number;
  };
  recent_reviews: ReviewItem[];
}

/**
 * GET /api/v1/reviews/analytics/
 * Retrieves reputation analytics for the authenticated user (Tier 2-5).
 */
export async function fetchReviewAnalytics(token: string): Promise<ReviewAnalyticsData | null> {
  try {
    const res = await requestResponse(`${REVIEW_BASE}/analytics/`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.data || null;
  } catch (err) {
    console.warn('[reviewApi] fetchReviewAnalytics failed:', err);
    return null;
  }
}

