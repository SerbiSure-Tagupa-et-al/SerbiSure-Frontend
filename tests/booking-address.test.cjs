const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (name in mocks) return mocks[name];
    // Load the real shared pricing code, retaining strict handling of other imports.
    if (name.endsWith('/utils/rate')) return load('src/shared/utils/rate.ts');
    if (name.endsWith('/posting/validation') || name === '../validation') return load('src/features/posting/validation.ts');
    if (name === './postingConfig') return load('src/features/posting/postingConfig.ts');
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}
const api = load('src/features/bookings/api/bookingApi.ts', {
  '../../../shared/api/config': {}, '../../../shared/api/httpClient': {},
});
const { mapBookingCard } = load('src/features/chat/bookingCards.ts', {
  '../bookings/api/bookingApi': api, '../bookings/engagementForm': load('src/features/bookings/engagementForm.ts'),
});
const address = { street: ' Lot 5555 ', floor_number: ' Unit 2B ', barangay: 'Pagatpat',
  city: 'City of Cagayan de Oro', province: 'Misamis Oriental', zip_code: '9000' };
const expected = 'Lot 5555, Unit 2B, Brgy. Pagatpat, City of Cagayan de Oro, Misamis Oriental, 9000';

test('full address retains unit and postal code even when an older API supplies a shortened full_address', () => {
  for (const barangay of ['Pagatpat', 'Brgy. Pagatpat', 'Barangay Pagatpat']) {
    assert.equal(api.formatBookingAddress({ ...address, barangay, full_address: 'Lot 5555, Pagatpat' }), expected);
  }
  assert.equal(api.formatBookingAddress({ ...address, floor_number: null }),
    'Lot 5555, Brgy. Pagatpat, City of Cagayan de Oro, Misamis Oriental, 9000');
});

test('legacy strings and incomplete addresses have safe fallbacks without fake default locations', () => {
  assert.equal(api.formatBookingAddress({ full_address: ' Old saved address ', zip_code: '9000' }), 'Old saved address');
  assert.equal(api.formatBookingAddress({ street: ' Lot 1 ', barangay: null, floor_number: ' ', city: null }), 'Lot 1');
  assert.equal(api.formatBookingAddress(null), 'Address not provided');
  assert.equal(api.formatBookingAddress({}, ''), '');
});

test('pending and confirmed chat cards reconstruct the complete work location from stored components', () => {
  for (const status of ['Pending', 'Confirmed']) {
    for (const full_address of [null, '', 'Lot 5555, Pagatpat, City of Cagayan de Oro, Misamis Oriental']) {
      const booking = { ...address, full_address, booking_id: 'booking', booking_status: status === 'Confirmed' ? 'Accepted' : 'Pending',
        pass_url: 'https://test.local/verify/?token=signed-token',
        booking_type: 'short_term', service_category: ['Cleaning'], rate_amount: '800', rate_period: 'day', start_time: '2099-01-01T00:00:00Z' };
      const card = mapBookingCard({ booking, status, can_respond: status === 'Pending', sender_name: 'Homeowner' });
      assert.equal(card.location, expected);
      assert.equal(card.passUrl, booking.pass_url);
      assert.equal(card.isConfirmed, status === 'Confirmed');
    }
  }
});
