export type LocationScope = 'same_barangay' | 'radius' | 'same_city' | 'all';

export interface LocationFilterState {
  scope: LocationScope;
  radiusKm: number;
  city: string;
  barangay: string;
}

export const RADIUS_OPTIONS = [3, 5, 10] as const;

export function defaultLocationFilter(user?: { city?: string | null; barangay?: string | null } | null): LocationFilterState {
  const city = (user?.city || '').trim();
  const barangay = (user?.barangay || '').trim();
  if (barangay && city) {
    return { scope: 'radius', radiusKm: 5, city, barangay };
  }
  if (city) {
    return { scope: 'same_city', radiusKm: 5, city, barangay: '' };
  }
  return { scope: 'all', radiusKm: 5, city: '', barangay: '' };
}

export function shortCityLabel(city?: string | null): string {
  const trimmed = (city || '').trim();
  if (!trimmed) return '';
  const cleaned = trimmed.replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const lower = cleaned.toLowerCase();
  if (lower.includes('cagayan de oro') || lower === 'cdo') return 'CDO';
  return cleaned.replace(/^city of\s+/i, '').replace(/^municipality of\s+/i, '').trim();
}

export function isSameCity(a?: string | null, b?: string | null): boolean {
  const left = shortCityLabel(a).toLowerCase();
  const right = shortCityLabel(b).toLowerCase();
  return !!left && left === right;
}

export function resolveBarangayForScope(
  scope: LocationScope,
  city: string,
  barangay: string,
  userLocation?: { city?: string | null; barangay?: string | null } | null,
): string {
  if (scope !== 'same_barangay' && scope !== 'radius') return '';
  const trimmed = barangay.trim();
  if (trimmed) return trimmed;
  const profileBarangay = (userLocation?.barangay || '').trim();
  if (!profileBarangay) return '';
  const profileCity = (userLocation?.city || 'City of Cagayan De Oro').trim();
  if (!city.trim() || isSameCity(city, profileCity)) {
    return profileBarangay;
  }
  return '';
}

export function formatBarangayShort(barangay?: string | null): string {
  const trimmed = (barangay || '').trim();
  if (!trimmed) return '';
  const cleaned = trimmed.replace(/\s*\(pob\.?\)$/i, '').trim();
  if (/^(?:brgy\.?|barangay)\s/i.test(cleaned)) return cleaned;
  return `Brgy. ${cleaned}`;
}

export function formatLocationChipLabel(
  state: LocationFilterState,
  tr: (source: string, params?: Record<string, string | number>) => string = (s, p) =>
    p ? Object.entries(p).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)), s) : s,
): string {
  if (state.scope === 'all') return tr('All Areas');
  const cityShort = shortCityLabel(state.city);
  const brgyShort = formatBarangayShort(state.barangay);
  if (state.scope === 'same_barangay') {
    if (brgyShort) return `${brgyShort} · ${tr('Same Barangay')}`;
    return cityShort ? `${cityShort} · ${tr('All City')}` : tr('All Areas');
  }
  if (state.scope === 'radius') {
    const anchor = brgyShort || cityShort;
    if (!anchor) return tr('All Areas');
    return `${anchor} · ${tr('Within {km} km', { km: state.radiusKm })}`;
  }
  if (state.scope === 'same_city') {
    return cityShort ? tr('All {city}', { city: cityShort }) : tr('All Areas');
  }
  return tr('All Areas');
}

export function formatLocationWithProximity(location?: string | null, proximityLabel?: string | null): string {
  const base = (location || '').trim();
  const prox = (proximityLabel || '').trim();
  if (!prox) return base;
  if (!base) return prox;
  const shortened = base.replace(/City of Cagayan De Oro/gi, 'CDO').replace(/Cagayan De Oro City/gi, 'CDO');
  return `${shortened} · ${prox}`;
}

export function isNonDefaultLocation(
  current: LocationFilterState,
  baseline: LocationFilterState,
): boolean {
  return (
    current.scope !== baseline.scope ||
    current.radiusKm !== baseline.radiusKm ||
    current.city.trim().toLowerCase() !== baseline.city.trim().toLowerCase() ||
    current.barangay.trim().toLowerCase() !== baseline.barangay.trim().toLowerCase()
  );
}

export interface LocationEmptyExpansion {
  title: string;
  description: string;
  actions: Array<{ label: string; next: LocationFilterState }>;
}

export function locationEmptyPrompt(
  state: LocationFilterState,
  tr: (source: string, params?: Record<string, string | number>) => string = (s, p) =>
    p ? Object.entries(p).reduce((acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)), s) : s,
): LocationEmptyExpansion | null {
  if (state.scope === 'all') return null;
  const brgy = formatBarangayShort(state.barangay);
  const city = shortCityLabel(state.city) || state.city || tr('City');

  if (state.scope === 'same_barangay') {
    const area = brgy || city;
    return {
      title: tr('No posts in {area} right now', { area }),
      description: tr('Expand your search area to see nearby posts.'),
      actions: [
        { label: tr('Expand to 5 km'), next: { ...state, scope: 'radius', radiusKm: 5 } },
        ...(state.city ? [{ label: tr('Show All {city}', { city }), next: { ...state, scope: 'same_city' as const } }] : []),
      ],
    };
  }

  if (state.scope === 'radius') {
    const area = brgy || city;
    const actions: Array<{ label: string; next: LocationFilterState }> = [];
    if (state.radiusKm < 10) {
      actions.push({ label: tr('Expand to 10 km'), next: { ...state, scope: 'radius', radiusKm: 10 } });
    }
    if (state.city) {
      actions.push({ label: tr('Show All {city}', { city }), next: { ...state, scope: 'same_city' } });
    }
    if (state.radiusKm >= 10) {
      actions.push({ label: tr('Show All Areas'), next: { ...state, scope: 'all' } });
    }
    return {
      title: tr('No posts near {area} right now', { area }),
      description: tr('Nothing matched within {km} km. Try widening your distance.', { km: state.radiusKm }),
      actions,
    };
  }

  if (state.scope === 'same_city') {
    return {
      title: tr('No posts in {city} right now', { city }),
      description: tr('Try viewing posts from nearby cities and municipalities.'),
      actions: [{ label: tr('Show All Areas'), next: { ...state, scope: 'all' } }],
    };
  }

  return null;
}
