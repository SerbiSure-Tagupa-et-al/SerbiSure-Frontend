const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, mocks = {}) {
  const output = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(name => {
    if (name in mocks) return mocks[name];
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}

const locationFilter = load('src/features/feed/locationFilter.ts');
const locationService = load('src/shared/services/locationService.ts');
const feedApi = load('src/features/feed/api/feedApi.ts', {
  '../../../shared/api/httpClient': { httpClient: { get: async () => [] } },
  '../../bookings/api/bookingApi': {
    bookingLocationText: () => '',
    bookingServiceSummary: () => '',
    formatBookingLocationShort: () => '',
    parseBookingRate: () => null,
  },
});

test('defaultLocationFilter derives smart defaults from user barangay and city', () => {
  assert.deepEqual(
    locationFilter.defaultLocationFilter({ city: 'City of Cagayan De Oro', barangay: 'Bugo' }),
    { scope: 'radius', radiusKm: 5, city: 'City of Cagayan De Oro', barangay: 'Bugo' },
  );
  assert.deepEqual(
    locationFilter.defaultLocationFilter({ city: 'City of Cagayan De Oro', barangay: '' }),
    { scope: 'same_city', radiusKm: 5, city: 'City of Cagayan De Oro', barangay: '' },
  );
  assert.deepEqual(
    locationFilter.defaultLocationFilter({ city: '', barangay: '' }),
    { scope: 'all', radiusKm: 5, city: '', barangay: '' },
  );
  assert.deepEqual(
    locationFilter.defaultLocationFilter(null),
    { scope: 'all', radiusKm: 5, city: '', barangay: '' },
  );
});

test('formatLocationChipLabel renders user-friendly labels for every scope', () => {
  assert.equal(
    locationFilter.formatLocationChipLabel({ scope: 'radius', radiusKm: 5, city: 'City of Cagayan De Oro', barangay: 'Bugo' }),
    'Brgy. Bugo · Within 5 km',
  );
  assert.equal(
    locationFilter.formatLocationChipLabel({ scope: 'same_barangay', radiusKm: 5, city: 'City of Cagayan De Oro', barangay: 'Pagatpat' }),
    'Brgy. Pagatpat · Same Barangay',
  );
  assert.equal(
    locationFilter.formatLocationChipLabel({ scope: 'same_city', radiusKm: 5, city: 'City of Cagayan De Oro', barangay: '' }),
    'All CDO',
  );
  assert.equal(
    locationFilter.formatLocationChipLabel({ scope: 'all', radiusKm: 5, city: '', barangay: '' }),
    'All Areas',
  );
});

test('formatLocationWithProximity combines location and proximity label cleanly', () => {
  assert.equal(
    locationFilter.formatLocationWithProximity('Carmen, City of Cagayan De Oro', '~4.3 km away'),
    'Carmen, CDO · ~4.3 km away',
  );
  assert.equal(
    locationFilter.formatLocationWithProximity('Pagatpat, City of Cagayan De Oro', 'Same Barangay'),
    'Pagatpat, CDO · Same Barangay',
  );
  assert.equal(
    locationFilter.formatLocationWithProximity('Pagatpat, City of Cagayan De Oro', null),
    'Pagatpat, City of Cagayan De Oro',
  );
});

test('locationEmptyPrompt offers one-tap widening options and returns null for All Areas', () => {
  const sameBrgy = locationFilter.locationEmptyPrompt({
    scope: 'same_barangay', radiusKm: 5, city: 'City of Cagayan De Oro', barangay: 'Bugo',
  });
  assert.ok(sameBrgy);
  assert.equal(sameBrgy.actions[0].label, 'Expand to 5 km');
  assert.equal(sameBrgy.actions[0].next.scope, 'radius');
  assert.equal(sameBrgy.actions[0].next.radiusKm, 5);
  assert.equal(sameBrgy.actions[1].label, 'Show All CDO');
  assert.equal(sameBrgy.actions[1].next.scope, 'same_city');

  const radius5 = locationFilter.locationEmptyPrompt({
    scope: 'radius', radiusKm: 5, city: 'City of Cagayan De Oro', barangay: 'Bugo',
  });
  assert.ok(radius5);
  assert.equal(radius5.actions[0].label, 'Expand to 10 km');
  assert.equal(radius5.actions[0].next.radiusKm, 10);
  assert.equal(radius5.actions[1].label, 'Show All CDO');

  const radius10 = locationFilter.locationEmptyPrompt({
    scope: 'radius', radiusKm: 10, city: 'City of Cagayan De Oro', barangay: 'Bugo',
  });
  assert.ok(radius10);
  assert.ok(radius10.actions.some(a => a.label === 'Show All Areas' && a.next.scope === 'all'));

  const sameCity = locationFilter.locationEmptyPrompt({
    scope: 'same_city', radiusKm: 5, city: 'City of Cagayan De Oro', barangay: '',
  });
  assert.ok(sameCity);
  assert.equal(sameCity.actions.length, 1);
  assert.equal(sameCity.actions[0].next.scope, 'all');

  assert.equal(
    locationFilter.locationEmptyPrompt({ scope: 'all', radiusKm: 5, city: '', barangay: '' }),
    null,
  );
});

test('buildFeedPath forwards proximity scope, radius, origin, and sort=nearest while preserving legacy sort behavior', () => {
  const radiusUrl = feedApi.buildFeedPath({
    categories: [],
    bookingType: null,
    maxRate: null,
    location: '',
    locationScope: 'radius',
    radiusKm: 5,
    originCity: 'City of Cagayan De Oro',
    originBarangay: 'Bugo',
    sortBy: 'nearest',
  });
  const radiusParams = new URLSearchParams(radiusUrl.split('?')[1]);
  assert.equal(radiusParams.get('scope'), 'radius');
  assert.equal(radiusParams.get('radius_km'), '5');
  assert.equal(radiusParams.get('origin_city'), 'City of Cagayan De Oro');
  assert.equal(radiusParams.get('origin_barangay'), 'Bugo');
  assert.equal(radiusParams.get('sort'), 'nearest');

  const newestUrl = feedApi.buildFeedPath({
    categories: [],
    bookingType: null,
    maxRate: null,
    location: '',
    locationScope: 'same_barangay',
    originCity: 'City of Cagayan De Oro',
    originBarangay: 'Pagatpat',
    sortBy: 'newest',
  });
  const newestParams = new URLSearchParams(newestUrl.split('?')[1]);
  assert.equal(newestParams.get('scope'), 'same_barangay');
  assert.equal(newestParams.get('radius_km'), null);
  assert.equal(newestParams.get('sort'), null);
});

test('every Misamis Oriental city has instant offline PSGC barangay fallbacks with corrected codes', () => {
  assert.equal(locationService.FALLBACK_MISAMIS_ORIENTAL_CITIES.length, 26);
  for (const city of locationService.FALLBACK_MISAMIS_ORIENTAL_CITIES) {
    const brgys = locationService.getFallbackBarangays(city.code);
    assert.ok(brgys.length > 0, `Expected offline barangays for ${city.name} (${city.code})`);
  }
  const elSalvador = locationService.FALLBACK_MISAMIS_ORIENTAL_CITIES.find(c => c.name === 'City of El Salvador');
  assert.equal(elSalvador.code, '104307000');
  const elSalvadorBrgys = locationService.getFallbackBarangays(elSalvador.code).map(b => b.name);
  assert.ok(elSalvadorBrgys.includes('Molugan'));
  assert.ok(elSalvadorBrgys.includes('Amoros'));

  const opol = locationService.FALLBACK_MISAMIS_ORIENTAL_CITIES.find(c => c.name === 'Opol');
  assert.equal(opol.code, '104321000');
  assert.ok(locationService.getFallbackBarangays(opol.code).some(b => b.name === 'Igpit'));
});
