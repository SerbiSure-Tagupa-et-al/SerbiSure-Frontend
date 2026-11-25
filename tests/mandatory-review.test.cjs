const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

function loadTs(relPath, mocks = {}) {
  const file = path.join(ROOT, relPath);
  const { outputText } = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', outputText)(name => {
    if (name in mocks) return mocks[name];
    throw new Error('Unexpected dependency: ' + name);
  }, mod, mod.exports);
  return mod.exports;
}

const bookingApi = loadTs('src/features/bookings/api/bookingApi.ts', {
  '../../../shared/api/config': { API_BASE_URL: 'https://api.test' },
  '../../../shared/api/httpClient': { requestJson: async () => ({}), requestResponse: async () => ({ ok: true, json: async () => ({}) }) },
});

test('extractPendingReview parses pending_mandatory_review responses and ignores others', () => {
  const extracted = bookingApi.extractPendingReview({
    code: 'pending_mandatory_review',
    detail: 'Please submit your review first.',
    pending_review: {
      booking_id: '11111111-1111-4111-8111-111111111111',
      reviewee_name: 'Maria Reyes',
      service_category: ['Cleaning'],
    },
  });
  assert.deepEqual(extracted, {
    booking_id: '11111111-1111-4111-8111-111111111111',
    reviewee_name: 'Maria Reyes',
    service_category: ['Cleaning'],
  });
  assert.equal(bookingApi.extractPendingReview({ code: 'account_not_verified' }), null);
  assert.equal(bookingApi.extractPendingReview({ code: 'pending_mandatory_review', pending_review: {} }), null);
  assert.equal(bookingApi.extractPendingReview(null), null);
});

test('PendingReviewError preserves pendingReview metadata across throws', () => {
  const info = { booking_id: '22222222-2222-4222-8222-222222222222', reviewee_name: 'Ana Santos' };
  const err = new bookingApi.PendingReviewError('Review required', info);
  assert.equal(err.message, 'Review required');
  assert.deepEqual(bookingApi.getPendingReviewFromError(err), info);
  assert.equal(bookingApi.getPendingReviewFromError(new Error('Plain error')), null);
});
