import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPublicProfile, fetchWorkerWorkHistory, type PublicProfile, type VerifiedWorkHistoryData } from '../api/accountApi';
import { fetchReviewSummary, fetchUserReviews, type ReviewItem, type ReviewSummaryData } from '../../reviews/api/reviewApi';
import { fetchPublicPendingPosts, type PublicPendingPost } from '../../bookings/api/bookingApi';
import { usePostUpdates } from '../../feed/hooks/usePostUpdates';

export function usePublicProfile(visible: boolean, userId?: string, token?: string | null) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [reviews, setReviews] = useState<ReviewItem[]>([]);
  const [summary, setSummary] = useState<ReviewSummaryData | null>(null);
  const [workHistory, setWorkHistory] = useState<VerifiedWorkHistoryData | null>(null);
  const [posts, setPosts] = useState<PublicPendingPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [postsLoading, setPostsLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [postsError, setPostsError] = useState<string | null>(null);
  const generation = useRef(0);
  const postsRequest = useRef(0);

  const refreshPosts = useCallback(async () => {
    if (!visible || !userId || !token) return;
    const session = generation.current;
    const request = ++postsRequest.current;
    setPostsLoading(true);
    setPostsError(null);
    try {
      const data = await fetchPublicPendingPosts(token, userId);
      if (generation.current === session && request === postsRequest.current) setPosts(data);
    } catch (error) {
      if (generation.current === session && request === postsRequest.current) setPostsError(error instanceof Error ? error.message : 'Please try again.');
    } finally {
      if (generation.current === session && request === postsRequest.current) setPostsLoading(false);
    }
  }, [visible, userId, token]);

  useEffect(() => {
    const session = ++generation.current;
    setProfile(null); setReviews([]); setSummary(null); setWorkHistory(null); setPosts([]);
    setProfileError(null); setPostsError(null); setPostsLoading(false); setLoading(false);
    if (!visible || !userId || !token) return;
    setLoading(true);
    refreshPosts();
    Promise.allSettled([
      fetchPublicProfile(token, userId),
      fetchReviewSummary(token, userId),
      fetchUserReviews(token, userId),
      typeof fetchWorkerWorkHistory === 'function' ? fetchWorkerWorkHistory(token, userId) : Promise.resolve(null),
    ]).then(([identity, sentiment, feedback, history]) => {
      if (generation.current !== session) return;
      if (identity.status === 'fulfilled') setProfile(identity.value);
      else setProfileError('Unable to load this profile. Please reopen it to try again.');
      if (sentiment.status === 'fulfilled') setSummary(sentiment.value);
      if (feedback.status === 'fulfilled') setReviews(feedback.value || []);
      if (history.status === 'fulfilled') setWorkHistory(history.value);
      setLoading(false);
    });
    return () => { generation.current++; };
  }, [visible, userId, token, refreshPosts]);

  const updates = usePostUpdates(posts.map(post => ({ ...post, id: post.booking_id })), refreshPosts, visible);

  const markSubmitted = (postId: string, proposal: NonNullable<PublicPendingPost['viewer_proposal']>) => {
    postsRequest.current++;
    setPostsLoading(false);
    setPostsError(null);
    setPosts(current => current.map(post => post.booking_id === postId ? { ...post, viewer_proposal: proposal } : post));
  };
  return { profile, reviews, summary, workHistory, posts: posts.filter(post => updates.canUsePost({ ...post, id: post.booking_id })),
    canUsePost: updates.canUsePost, loading, postsLoading, profileError, postsError, refreshPosts, markSubmitted };
}
