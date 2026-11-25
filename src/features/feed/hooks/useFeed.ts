import { useCallback, useEffect, useRef, useState } from 'react';
import type { Role } from '../../../app/roleConfig';
import { fetchFeed } from '../api/feedApi';
import { mapFeedPost } from '../feedMapper';
import type { LocationFilterState } from '../locationFilter';
import type { FeedPost, FeedQuery } from '../types';

export function useFeed(role: Role, token?: string | null, userId?: string | null, locationFilter?: LocationFilterState) {
  const [posts, setPosts] = useState<FeedPost[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const scope = locationFilter?.scope;
  const radiusKm = locationFilter?.radiusKm;
  const originCity = locationFilter?.city || '';
  const originBarangay = locationFilter?.barangay || '';

  const load = useCallback(async (refresh = false) => {
    const request = ++generation.current;
    if (!token) { setPosts([]); setIsLoading(false); setIsRefreshing(false); return; }
    if (refresh) setIsRefreshing(true);
    else { setIsLoading(true); setPosts([]); }
    setError(null);
    try {
      const query: FeedQuery | undefined = scope
        ? {
            categories: [],
            bookingType: null,
            maxRate: null,
            location: '',
            locationScope: scope,
            radiusKm,
            originCity,
            originBarangay,
            sortBy: 'newest',
          }
        : undefined;
      const items = await fetchFeed(token, query);
      if (request === generation.current) setPosts(items.map((item) => mapFeedPost(item, role)));
    } catch (failure) {
      if (request === generation.current) setError(failure instanceof Error ? failure.message : 'Could not load posts. Please try again.');
    } finally {
      if (request === generation.current) { setIsLoading(false); setIsRefreshing(false); }
    }
  }, [role, token, userId, scope, radiusKm, originCity, originBarangay]);

  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  return { posts, isLoading, isRefreshing, error, refresh: useCallback(() => load(true), [load]) };
}
