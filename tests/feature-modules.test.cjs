const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Exercise domain modules without mounting native UI or contacting a real backend.
const root = path.resolve(__dirname, '..');
const modules = new Map();
const configPath = path.join(root, 'src/shared/api/config.ts');
modules.set(configPath, {
  API_BASE_URL: 'http://test.local', DEFAULT_TIMEOUT_MS: 15000,
  buildApiUrl: (endpoint) => /^https?:/.test(endpoint) ? endpoint : `http://test.local/${endpoint.replace(/^\/+/, '')}`,
});
modules.set(path.join(root, 'src/shared/auth/session.ts'), { getSession: () => null });
function load(relativePath) {
  const filename = path.resolve(root, relativePath);
  if (modules.has(filename)) return modules.get(filename);
  const output = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS },
    fileName: filename,
  }).outputText;
  const module = { exports: {} };
  modules.set(filename, module.exports);
  const localRequire = (specifier) => {
    if (!specifier.startsWith('.')) return require(specifier);
    const target = path.resolve(path.dirname(filename), specifier);
    return load(fs.existsSync(target) ? target : `${target}.ts`);
  };
  new Function('require', 'module', 'exports', output)(localRequire, module, module.exports);
  return module.exports;
}

const roles = load('src/app/roleConfig.ts');
const mapper = load('src/features/feed/feedMapper.ts');
const filters = load('src/features/feed/feedFilters.ts');
const posting = load('src/features/posting/postingConfig.ts');
const validation = load('src/features/posting/validation.ts');
const http = load('src/shared/api/httpClient.ts');
const feedApi = load('src/features/feed/api/feedApi.ts');
const cache = load('src/features/feed/feedCache.ts');
const postingApi = load('src/features/posting/api/postingApi.ts');
const date = load('src/shared/utils/date.ts');
const browse = load('src/features/feed/browsePresentation.ts');
const bookingApi = load('src/features/bookings/api/bookingApi.ts');
const bookingCards = load('src/features/chat/bookingCards.ts');
const offersApi = load('src/features/chat/api/bookingOffersApi.ts');
const chatApi = load('src/features/chat/api/chatApi.ts');
const safetyApi = load('src/features/chat/api/chatSafetyApi.ts');
const emptyFilters = { categories: [], bookingType: null, maxRate: null, location: '', sortBy: 'newest' };
const dto = {
  booking_id: 'post-1', poster_id: 'author-1', poster_verification_status: 'Verified', name: 'Test User', profile_link: 'https://test.local/avatar.png',
  booking_type: 'short_term', work_setup: 'stay_out', service_category: ['Cleaning', 'Child_care'], rate_amount: '800', rate_period: 'day',
  barangay: 'Nazareth', city: 'Cagayan de Oro', street: 'Test Street', createdAt: new Date().toISOString(),
};
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
async function withFetch(fetch, run) {
  const original = global.fetch;
  global.fetch = fetch;
  try { return await run(); } finally { global.fetch = original; cache.clearExploreFeedCache(); }
}

test('support discovery authenticates the request without accepting a client-selected barangay', async () => {
  const data = { superadmins: [{ id: 'admin', account_type: 'Admin', name: 'Support', avatar: null, barangay: null }],
    barangay: { name: 'Pagatpat', available: false, contacts: [], message: 'Contact SerbiSure Support for help.' } };
  await withFetch(async (url, options) => {
    assert.equal(url, 'http://test.local/api/v1/chat/support-contacts/');
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer resident-token');
    return response(data);
  }, async () => assert.deepEqual(await chatApi.fetchSupportContacts('resident-token'), data));
});

test('chat sends preserve manual restriction errors and never retry denied requests', async () => {
  let calls = 0;
  await withFetch(async () => { calls++; return response({ code: 'messaging_restricted', detail: 'Please edit this message.', policy_version: 'v1' }, 403); }, async () => {
    await assert.rejects(chatApi.sendChatMessage('token', 'recipient', 'unsuitable text'), error => {
      assert.ok(error instanceof http.ApiError);
      assert.equal(error.status, 403);
      assert.equal(error.details.code, 'messaging_restricted');
      assert.equal(error.message, 'Please edit this message.');
      return true;
    });
  });
  assert.equal(calls, 1);
});

test('manual suspension status remains authenticated without a report-case flow', async () => {
  await withFetch(async (url, options) => {
    assert.match(url, /safety\/status\/$/);
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer token');
    return response({ restricted_until: null, support_available: true });
  }, async () => {
    assert.deepEqual(await safetyApi.fetchSafetyStatus('token'), { restricted_until: null, support_available: true });
  });
});

test('successful masked sends preserve sanitized content and sender notice', async () => {
  await withFetch(async () => response({ data: { chat_message_id: 'saved', message_payload: 'g*go' }, language_warning: 'Please communicate respectfully.' }, 201), async () => {
    const result = await chatApi.sendChatMessage('token', 'recipient', 'gago');
    assert.equal(result.data.message_payload, 'g*go');
    assert.equal(result.language_warning, 'Please communicate respectfully.');
  });
});

test('support discovery reports server and malformed-response errors instead of inventing contacts', async () => {
  await withFetch(async () => response({ detail: 'Please sign in again.' }, 401), async () => {
    await assert.rejects(chatApi.fetchSupportContacts('expired-token'), /Please sign in again/);
  });
  await withFetch(async () => response({ superadmins: [] }), async () => {
    await assert.rejects(chatApi.fetchSupportContacts('token'), /could not be loaded/);
  });
});

test('chat presence requires an explicit boolean or recognized header; missing and truthy strings stay unknown', async () => {
  for (const [body, header, expected] of [
    [{ data: [], partner_is_online: false }, 'true', false],
    [{ data: [], partner_is_online: true }, null, true],
    [{ results: [] }, 'true', true],
    [[], 'false', false],
    [{ data: [] }, null, undefined],
    [{ data: [], partner_is_online: 'false' }, null, undefined],
    [{ data: [], partner_is_online: 'true' }, null, undefined],
    [{ data: [], partner_is_online: 1 }, null, undefined],
  ]) {
    await withFetch(async () => new Response(JSON.stringify(body), { status: 200,
      headers: { 'Content-Type': 'application/json', ...(header ? { 'X-Partner-Is-Online': header } : {}) },
    }), async () => {
      assert.equal((await chatApi.fetchChatThreadDetails('token', 'contact')).partnerIsOnline, expected);
    });
  }
});

test('malformed thread responses stay errors and permission failures retain their HTTP status', async () => {
  await withFetch(async () => response({ unexpected: [] }), async () => {
    await assert.rejects(chatApi.fetchChatThreadDetails('token', 'partner'), /Could not load messages/);
  });
  await withFetch(async () => response({ detail: 'Not allowed' }, 403), async () => {
    await assert.rejects(chatApi.fetchChatThreadDetails('token', 'partner'), error => error.status === 403);
  });
});

test('account roles select the correct posting mode and verification documents', () => {
  assert.equal(roles.resolveRole('Kasambahay'), 'kasambahay');
  assert.equal(roles.resolveRole('Homeowner'), 'homeowner');
  assert.equal(roles.resolveRole(null, 'kasambahay'), 'kasambahay');
  assert.equal(roles.ROLE_CONFIG.homeowner.postingMode, 'job');
  assert.equal(roles.ROLE_CONFIG.homeowner.workerProfile, false);
  assert.deepEqual(roles.ROLE_CONFIG.homeowner.requiredDocuments, ['national_id_front', 'national_id_back']);
  assert.equal(roles.ROLE_CONFIG.kasambahay.postingMode, 'service');
  assert.equal(roles.ROLE_CONFIG.kasambahay.workerProfile, true);
  assert.deepEqual(roles.ROLE_CONFIG.kasambahay.requiredDocuments, ['nbi_clearance', 'police_clearance', 'tesda_nc2']);
});

test('public-profile posts use the requested author and preserve pending proposal state', async () => {
  const post = { ...dto, booking_status: 'Pending', viewer_proposal: { proposal_id: 'proposal-1', status: 'Pending' } };
  await withFetch(async (url, options) => {
    assert.equal(url, 'http://test.local/api/v1/booking/profile/author-1/pending/');
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer viewer-token');
    return response([post]);
  }, async () => {
    const posts = await bookingApi.fetchPublicPendingPosts('viewer-token', 'author-1');
    assert.deepEqual(posts, [post]);
  });
});

test('public-profile post failures are distinguishable from an empty list', async () => {
  await withFetch(async () => response([]), async () => {
    assert.deepEqual(await bookingApi.fetchPublicPendingPosts('token', 'author'), []);
  });
  await withFetch(async () => response({ detail: 'Profile not found.' }, 404), async () => {
    await assert.rejects(bookingApi.fetchPublicPendingPosts('token', 'author'), /Profile not found/);
  });
  await withFetch(async () => response({ results: [] }), async () => {
    await assert.rejects(bookingApi.fetchPublicPendingPosts('token', 'author'), /Unexpected posts response/);
  });
});

test('Home maps the same DTO into distinct job and worker cards', () => {
  const job = mapper.mapFeedPost(dto, 'kasambahay');
  const worker = mapper.mapFeedPost(dto, 'homeowner');
  assert.equal(job.kind, 'job');
  assert.equal(job.authorRole, 'Homeowner');
  assert.equal(job.partnerId, dto.poster_id);
  assert.equal(job.roleTag, 'Cleaning');
  assert.deepEqual(job.categories, ['Cleaning', 'Child Care']);
  assert.equal(worker.kind, 'service');
  assert.equal(worker.authorRole, 'Kasambahay');
  assert.equal(worker.roleTag, 'Cleaner');
  assert.equal(worker.title, 'Cleaner');
  assert.equal(job.price, '₱800');
  assert.equal(job.unit, '/ day');
  assert.equal(job.location, 'Nazareth, Cagayan de Oro');
  assert.equal(job.aboutText, 'I am looking for Cleaning & Child Care at Test Street, Brgy. Nazareth, Cagayan de Oro, on a stay-out setup.');
  assert.equal(worker.aboutText, 'Available for Cleaner & Child Care work in Nazareth, Cagayan de Oro.');
  assert.deepEqual(job.tags, ['Verified Employer', 'Short-term', 'Stay-out', 'Cleaning', 'Child Care']);
});

test('Home preserves long-term labels, explicit setup, and partial response fallbacks', () => {
  const item = { ...dto, booking_type: 'long_term', service_category: 'Laundry', special_instruction: '  Stay-out laundry help  ' };
  const job = mapper.mapFeedPost(item, 'kasambahay');
  const worker = mapper.mapFeedPost(item, 'homeowner');
  assert.equal(job.termTag, 'Long-term');
  assert.equal(worker.termTag, 'Long-term');
  assert.equal(job.unit, '/ month');
  assert.equal(job.setupTag, 'Stay-out');
  assert.equal(job.aboutText, 'Stay-out laundry help');
  assert.equal(mapper.mapFeedPost({ ...dto, service_category: null }, 'kasambahay').roleTag, 'Household');
  assert.equal(mapper.mapFeedPost({ ...dto, service_category: null }, 'homeowner').roleTag, 'General Service');
  assert.equal(mapper.mapFeedPost({ ...dto, service_category: [] }, 'kasambahay').roleTag, 'Household Service');
  assert.equal(mapper.mapFeedPost({ ...dto, name: null, profile_link: null }, 'homeowner').employerName, 'Kasambahay Worker');
});

test('Explore keeps its own card wording and rate units', () => {
  const worker = mapper.mapWorkerPreview(dto);
  const job = mapper.mapJobPreview({ ...dto, booking_type: 'long_term' });
  assert.equal(worker.name, 'Test User');
  assert.equal(worker.role, 'Cleaning, Child Care');
  assert.equal(worker.years, 'Short-term');
  assert.equal(worker.price, '₱800');
  assert.equal(worker.unit, 'per day');
  assert.equal(mapper.mapWorkerPreview({ ...dto, booking_type: 'long_term' }).unit, 'per month');
  assert.equal(job.price, '₱800');
  assert.equal(job.title, 'Cleaning & Child Care');
  assert.equal(job.unit, 'per month');
  assert.equal(job.termTag, 'Long-term');
  assert.equal(job.image, dto.profile_link);
});

test('setup labels use the stored field and never infer from duration or description', () => {
  const item = { ...dto, booking_type: 'long_term', work_setup: 'stay_out', special_instruction: 'Legacy stay-in wording' };
  assert.equal(mapper.mapFeedPost(item, 'kasambahay').setupTag, 'Stay-out');
  assert.equal(mapper.mapFeedPost(item, 'homeowner').setupTag, 'Stay-out');
  assert.equal(mapper.mapJobPreview(item).setupTag, 'Stay-out');
  assert.equal(mapper.mapWorkerPreview(item).setupTag, 'Stay-out');
  const unknown = { ...item, work_setup: null };
  assert.equal(mapper.mapFeedPost(unknown, 'kasambahay').setupTag, 'Not specified');
  assert.equal(mapper.mapFeedPost(unknown, 'homeowner').termTag, 'Long-term');
  assert.ok(!mapper.mapWorkerPreview(unknown).tags.includes('Stay-in'));
});

test('missing data cannot create a verified feed badge or default contract terms', () => {
  const item = { ...dto, poster_verification_status: 'Pending' };
  assert.ok(!mapper.mapFeedPost(item, 'kasambahay').tags.includes('Verified Employer'));
  assert.equal(bookingCards.mapBookingCard(null), null);
  const booking = { ...dto, service_category: ['Cleaning'], booking_status: 'Pending', start_time: '2026-10-13T00:00:00Z' };
  const card = bookingCards.mapBookingCard({ booking, proposal_id: null, proposed_rate: null, status: 'Pending', can_respond: true, sender_name: 'Sender' });
  assert.equal(card.startDate, '10/13/2026');
  assert.equal(card.endDate, '');
  assert.equal(card.workHours, '');
  assert.equal(card.location, 'Test Street, Brgy. Nazareth, Cagayan de Oro');
  assert.equal(card.isConfirmed, false);
  assert.equal(bookingCards.mapBookingCard({ booking, status: 'Confirmed', can_respond: false, sender_name: 'Sender' }).isConfirmed, true);
});

test('booking schedules preserve Philippine time and reject invalid dates or clocks', () => {
  assert.deepEqual(bookingCards.bookingSchedule('10/13/2026', '08:00 AM'), { iso: '2026-10-13T00:00:00.000Z', clock: '08:00:00' });
  assert.equal(bookingCards.bookingSchedule('10/13/2026', '05:00 PM').iso, '2026-10-13T09:00:00.000Z');
  assert.throws(() => bookingCards.bookingSchedule('02/30/2026', '08:00 AM'), /calendar/);
  assert.throws(() => bookingCards.bookingSchedule('10/13/2026', '13:70 PM'), /hours/);
});

test('chat offers use durable request keys and acceptance waits for authoritative endpoints', async () => {
  const payload = { recipient_id: 'partner-1', rate_amount: '8000' };
  await withFetch(async (url, options) => {
    assert.equal(url, 'http://test.local/api/v1/booking/chat-offers/');
    assert.equal(options.headers.get('Idempotency-Key'), 'draft-key');
    assert.deepEqual(JSON.parse(options.body), payload);
    return response({ booking: { booking_id: 'booking-1' }, chat_message: { chat_message_id: 'message-1' } }, 201);
  }, async () => assert.equal((await offersApi.sendBookingOffer('session', payload, 'draft-key')).booking.booking_id, 'booking-1'));
  const card = { bookingId: 'booking-1', canRespond: true, startTime: '2099-01-01T00:00:00Z' };
  await withFetch(async (url, options) => {
    assert.equal(url, 'http://test.local/api/v1/booking/booking-1/accept/');
    assert.equal(options.method, 'PATCH');
    return response({ booking: { booking_status: 'Accepted' } });
  }, () => offersApi.respondToBookingOffer('session', card, 'accept'));
  await withFetch(async (url) => {
    assert.equal(url, 'http://test.local/api/v1/booking/proposals/proposal-1/respond/');
    return response({ rate_amount: ['The amount is below the minimum.'] }, 400);
  }, () => assert.rejects(offersApi.respondToBookingOffer('session', { ...card, proposalId: 'proposal-1' }, 'accept'), /below the minimum/));
  await withFetch(async () => response({ booking: { booking_status: 'Pending' } }),
    () => assert.rejects(offersApi.respondToBookingOffer('session', card, 'accept'), /did not confirm/));
  await withFetch(async () => response({ detail: { code: 'booking_restricted', detail: 'Booking and posting are restricted until next month.' } }, 403),
    () => assert.rejects(offersApi.respondToBookingOffer('session', card, 'accept'), error => {
      assert.equal(error.message, 'Booking and posting are restricted until next month.');
      return true;
    }));
});

test('booking lists distinguish empty results from server failures and malformed responses', async () => {
  await withFetch(async () => response([]), async () => assert.deepEqual(await bookingApi.fetchMyBookings('session', 'active'), []));
  await withFetch(async () => response({ detail: 'Service unavailable' }, 503),
    () => assert.rejects(bookingApi.fetchMyAssignedBookings('session', 'active'), /Service unavailable/));
  await withFetch(async () => response({ results: 'invalid' }),
    () => assert.rejects(bookingApi.fetchMyBookings('session'), /Unexpected booking response/));
});

test('saved posts and applications stay server-backed and preserve failure states', async () => {
  await withFetch(async () => response({ detail: 'Please reconnect' }, 503),
    () => assert.rejects(bookingApi.fetchSavedPostsApi('session'), /reconnect/));
  await withFetch(async (url) => {
    assert.equal(url, 'http://test.local/api/v1/booking/my-proposals/');
    return response([dto]);
  }, async () => assert.equal((await bookingApi.fetchMyProposalPosts('session'))[0].booking_id, 'post-1'));
});

test('category filters include secondary categories and combine with search', () => {
  const matches = filters.matchesHomeFeedFilters;
  assert.equal(matches(['Cleaning', 'Child_care'], ['Test User', 'Nazareth'], 'Child Care', ' nazareth '), true);
  assert.equal(matches(['Cooking'], ['Test User'], 'Cleaning', ''), false);
  assert.equal(matches(['All-around'], ['Test User'], 'Laundry', ''), true);
  assert.equal(matches(['Caregiver'], ['Test User'], null, ''), true);
  assert.equal(matches(['Laundry'], ['Test User'], 'Laundry', 'missing'), false);
});

test('Browse distinguishes an empty database, filtered results, reviewed posts, and errors', () => {
  assert.equal(browse.browseEmptyCopy('kasambahay', 0, false).title, 'No jobs available yet');
  assert.equal(browse.browseEmptyCopy('homeowner', 0, false).title, 'No services available yet');
  assert.equal(browse.browseEmptyCopy('homeowner', 0, true).action, 'Clear Filters');
  assert.equal(browse.browseEmptyCopy('kasambahay', 4, true).title, "You're all caught up!");
  const failure = browse.browseEmptyCopy('homeowner', 4, true, 'Request failed');
  assert.equal(failure.title, 'Could not load posts');
  assert.equal(failure.description, 'Request failed');
  assert.equal(failure.action, 'Try Again');
});

test('both Browse roles share clear header counts without claiming distance matching', () => {
  assert.equal(browse.browseHeaderCopy('homeowner', 'explore', 1, false).subtitle, '1 service post to explore');
  assert.equal(browse.browseHeaderCopy('kasambahay', 'explore', 2, false).subtitle, '2 job posts to explore');
  assert.equal(browse.browseHeaderCopy('kasambahay', 'applied', 1, false).subtitle, '1 submitted application');
  assert.equal(browse.browseHeaderCopy('homeowner', 'saved', 0, false).title, 'Saved Kasambahay');
  assert.equal(browse.browseHeaderCopy('homeowner', 'explore', 0, true).subtitle, 'Finding service posts...');
  assert.equal(browse.browseHeaderCopy('kasambahay', 'explore', 0, false, 'Offline').subtitle, 'Unable to load posts');
});

test('Browse quick filters work identically for jobs and services and preserve advanced options', () => {
  const advanced = { ...emptyFilters, maxRate: 900, location: 'Nazareth', sortBy: 'rate_asc' };
  const stayIn = browse.quickBrowseFilters(advanced, 'Stay-in');
  assert.equal(stayIn.bookingType, null);
  assert.equal(stayIn.workSetup, 'stay_in');
  assert.equal(browse.quickBrowseFilters(advanced, 'Stay-out').workSetup, 'stay_out');
  assert.equal(browse.quickBrowseFilters(advanced, 'Long-term').bookingType, 'long_term');
  assert.deepEqual(stayIn.categories, []);
  assert.equal(stayIn.location, 'Nazareth');
  assert.equal(stayIn.maxRate, 900);
  assert.equal(browse.activeBrowseChip(stayIn), 'Stay-in');
  const category = browse.quickBrowseFilters(stayIn, 'Child Care');
  assert.equal(category.bookingType, null);
  assert.deepEqual(category.categories, ['Child Care']);
  const all = browse.quickBrowseFilters(category, 'All');
  assert.deepEqual(all.categories, []);
  assert.equal(all.bookingType, null);
  assert.equal(all.workSetup, null);
  assert.equal(all.sortBy, 'rate_asc');
  assert.equal(browse.countBrowseFilters(all), 3);
  assert.equal(browse.activeBrowseChip({ ...category, bookingType: 'short_term' }), '');
});

test('posting does not invent amounts when engagement changes', () => {
  for (const config of Object.values(posting.POSTING_CONFIG)) {
    assert.equal(config.dailyDefault, undefined);
    assert.equal(config.monthlyDefault, undefined);
  }
});

test('generated descriptions preserve role and engagement wording', () => {
  const input = { service: 'Cleaning', location: 'Nazareth', setup: 'stay-out', time: '8 AM to 5 PM', shortTerm: true, instructions: '  Pet-friendly  ' };
  assert.equal(posting.buildPostDescription('job', input), 'I am looking for Cleaning at Nazareth, available 8 AM to 5 PM.\n\nSpecific instructions:\nPet-friendly');
  assert.equal(posting.buildPostDescription('service', input), 'I am offering Cleaning service in Nazareth, available 8 AM to 5 PM.\n\nAbout my experience:\nPet-friendly');
  assert.equal(posting.buildPostDescription('service', { ...input, shortTerm: false, instructions: '' }), 'I am looking for long-term Cleaning work in Nazareth on a stay-out arrangement.');
  const location = posting.buildPostLocation({ street: 'Lot 3', floorUnit: '5', barangay: 'Brgy. Agusan', city: 'City of Cagayan De Oro', zipcode: '9000' });
  assert.equal(location, 'Lot 3, Floor/Unit 5, Brgy. Agusan, City of Cagayan De Oro (9000)');
  assert.equal(posting.buildPostDescription('service', { ...input, location, rate: '₱600' }), 'I am offering Cleaning service in Lot 3, Floor/Unit 5, Brgy. Agusan, City of Cagayan De Oro (9000), available 8 AM to 5 PM with an expected rate of ₱600 / day.\n\nAbout my experience:\nPet-friendly');
  assert.equal(posting.buildPostLocation({ street: '  ', floorUnit: '', barangay: null, city: 'Cagayan de Oro', zipcode: '9000' }), 'Cagayan de Oro (9000)');
});

test('rate validation handles empty values, formatted amounts, and existing limits', () => {
  assert.ok(validation.validatePostingRate('job', 'short', ''));
  assert.ok(validation.validatePostingRate('service', 'short', 'abc'));
  assert.ok(validation.validatePostingRate('service', 'short', '599', { rate_period: 'day', minimum_rate: '600' }));
  assert.equal(validation.validatePostingRate('job', 'short', '600', { rate_period: 'day', minimum_rate: '600' }), null);
  assert.ok(validation.validatePostingRate('job', 'long', '6499', { rate_period: 'month', minimum_rate: '6500' }));
  assert.equal(validation.validatePostingRate('service', 'long', '6500', { rate_period: 'month', minimum_rate: '6500' }), null);
});

test('feed query serialization includes selected filters and no empty defaults', () => {
  assert.equal(feedApi.buildFeedPath(emptyFilters), '/api/v1/booking/feed/');
  const query = new URL(feedApi.buildFeedPath({ ...emptyFilters, categories: ['Cleaning', 'Cooking'], bookingType: 'short_term', workSetup: 'stay_out', maxRate: 900, location: ' Nazareth ', sortBy: 'rate_asc' }), 'http://test.local').searchParams;
  assert.equal(query.get('category'), 'Cleaning,Cooking');
  assert.equal(query.get('booking_type'), 'short_term');
  assert.equal(query.get('work_setup'), 'stay_out');
  assert.equal(query.get('max_rate'), '900');
  assert.equal(query.get('location'), 'Nazareth');
  assert.equal(query.get('sort'), null); // Feed ordering is always newest first.
  assert.equal(query.get('rate_period'), 'day');
  const monthly = new URL(feedApi.buildFeedPath({ ...emptyFilters, bookingType: 'long_term', maxRate: 8000 }), 'http://test.local').searchParams;
  assert.equal(monthly.get('rate_period'), 'month');
  assert.equal(monthly.get('max_rate'), '8000');
});

test('legacy amount confirmation sends an explicit period and shows server wage errors', async () => {
  await withFetch(async (url, options) => {
    assert.equal(url, 'http://test.local/api/v1/booking/booking-1/rate/');
    assert.equal(options.method, 'PATCH');
    assert.equal(options.headers.get('Authorization'), 'Bearer test-session');
    assert.deepEqual(JSON.parse(options.body), { rate_amount: '6500', rate_period: 'month' });
    return response({ booking_id: 'booking-1', rate_amount: '6500.00', rate_period: 'month' });
  }, async () => {
    const result = await bookingApi.confirmPostRate('test-session', 'booking-1', '6500', 'month');
    assert.equal(result.rate_period, 'month');
  });
  await withFetch(async () => response({ rate_amount: ['Minimum compensation is PHP 6,500.00/month.'] }, 400),
    async () => assert.rejects(bookingApi.confirmPostRate('test-session', 'booking-1', '500', 'month'), /6,500.00\/month/));
});

test('HTTP client adds bearer and JSON headers and preserves request metadata', async () => {
  await withFetch(async (url, options) => {
    assert.equal(url, 'http://test.local/example/');
    assert.equal(options.headers.get('Authorization'), 'Bearer test-session');
    assert.equal(options.headers.get('Content-Type'), 'application/json');
    assert.equal(options.headers.get('Idempotency-Key'), 'post-key');
    assert.equal(options.method, 'POST');
    assert.ok(options.signal instanceof AbortSignal);
    return response({ ok: true });
  }, async () => {
    assert.deepEqual(await http.requestJson('/example/', { token: 'test-session', method: 'POST', body: '{}', headers: { 'Idempotency-Key': 'post-key' } }), { ok: true });
  });
});

test('HTTP client lets multipart upload set its own content type', async () => {
  const form = new FormData(); form.append('field', 'value');
  await withFetch(async (_, options) => {
    assert.equal(options.body, form);
    assert.equal(options.headers.has('Content-Type'), false);
    return response({});
  }, () => http.requestResponse('/upload/', { method: 'POST', body: form }));
});

test('feed distinguishes empty data, malformed responses, and authentication errors', async () => {
  await withFetch(async () => response([]), async () => assert.deepEqual(await feedApi.fetchFeed('test'), []));
  await withFetch(async () => response({ results: [] }), async () => assert.rejects(feedApi.fetchFeed('test'), /Unexpected feed response/));
  await withFetch(async () => response({ detail: 'Expired session' }, 401), async () => assert.rejects(feedApi.fetchFeed('test'), (error) => error instanceof http.ApiError && error.status === 401 && error.message === 'Expired session'));
  await withFetch(async () => new Response('<html>Unavailable</html>', { status: 503 }), async () => assert.rejects(feedApi.fetchFeed('test'), (error) => error instanceof http.ApiError && error.status === 503));
});

test('Explore cache isolates account, role, and filters and supports forced refresh', async () => {
  let calls = 0;
  await withFetch(async () => { calls++; return response([dto]); }, async () => {
    cache.clearExploreFeedCache();
    await cache.loadExploreFeed('homeowner', 'session-a', emptyFilters);
    await cache.loadExploreFeed('homeowner', 'session-a', emptyFilters);
    assert.equal(calls, 1);
    await cache.loadExploreFeed('homeowner', 'session-b', emptyFilters);
    await cache.loadExploreFeed('kasambahay', 'session-a', emptyFilters);
    await cache.loadExploreFeed('homeowner', 'session-a', { ...emptyFilters, categories: ['Cleaning'] });
    assert.equal(calls, 4);
    await cache.loadExploreFeed('homeowner', 'session-a', emptyFilters, true);
    assert.equal(calls, 5);
  });
});

test('logout clears cached data and prevents an old request repopulating it', async () => {
  let release; let calls = 0;
  await withFetch(async () => {
    calls++;
    if (calls === 1) return new Promise((resolve) => { release = () => resolve(response([dto])); });
    return response([]);
  }, async () => {
    const old = cache.loadExploreFeed('homeowner', 'session', emptyFilters);
    cache.clearExploreFeedCache();
    release(); await old;
    assert.deepEqual(await cache.loadExploreFeed('homeowner', 'session', emptyFilters), []);
    assert.equal(calls, 2);
  });
});

test('an older feed response cannot overwrite a newer forced refresh', async () => {
  let release; let calls = 0;
  await withFetch(async () => {
    calls++;
    if (calls === 1) return new Promise((resolve) => { release = () => resolve(response([dto])); });
    return response([]);
  }, async () => {
    const old = cache.loadExploreFeed('homeowner', 'session', emptyFilters);
    await cache.loadExploreFeed('homeowner', 'session', emptyFilters, true);
    release(); await old;
    assert.deepEqual(await cache.loadExploreFeed('homeowner', 'session', emptyFilters), []);
    assert.equal(calls, 2);
  });
});

test('successful posting invalidates Explore and preserves idempotency', async () => {
  let calls = 0;
  await withFetch(async (url, options) => {
    calls++;
    if (url.endsWith('/post/')) assert.equal(options.headers.get('Idempotency-Key'), 'unique-key');
    return response([]);
  }, async () => {
    await cache.loadExploreFeed('homeowner', 'session', emptyFilters);
    await postingApi.submitPost('session', {}, 'unique-key');
    await cache.loadExploreFeed('homeowner', 'session', emptyFilters);
    assert.equal(calls, 3);
  });
});

test('invalid timestamps render a safe fallback', () => {
  assert.equal(date.formatTimeAgo('invalid-date'), 'Recently');
});

test('shared modules have no dependencies on app or feature modules', () => {
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(filename);
      else if (/\.tsx?$/.test(filename)) {
        const source = ts.createSourceFile(filename, fs.readFileSync(filename, 'utf8'), ts.ScriptTarget.Latest, true);
        for (const node of source.statements) {
          if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
            const specifier = node.moduleSpecifier?.text;
            if (specifier?.startsWith('.')) {
              const target = path.relative(root, path.resolve(path.dirname(filename), specifier)).replace(/\\/g, '/');
              assert.ok(!/^src\/(features|app)\//.test(target), `${path.relative(root, filename)} imports ${specifier}`);
            }
          }
        }
      }
    }
  }
  visit(path.join(root, 'src/shared'));
});

const engagementForm = load('src/features/bookings/engagementForm.ts');

test('service selections collapse all five roles and All-around stays mutually exclusive', () => {
  let selected = [];
  for (const value of engagementForm.BASE_SERVICES) selected = engagementForm.toggleService(selected, value);
  assert.deepEqual(selected, ['All-around']);
  assert.deepEqual(engagementForm.toggleService(selected, 'Cooking'), ['Cooking']);
  assert.deepEqual(engagementForm.toggleService(['Cooking'], 'All-around'), ['All-around']);
  assert.deepEqual(engagementForm.toggleService(['All-around'], 'All-around'), []);
  assert.deepEqual(engagementForm.toggleService(['Cleaning', 'Cooking'], 'Cooking'), ['Cleaning']);
  assert.deepEqual(engagementForm.normalizeServices(['All-around', 'Laundry']), ['All-around']);
  assert.deepEqual(engagementForm.normalizeServices(['Laundry', 'Laundry']), ['Laundry']);
});

test('all short-term shifts persist the explicitly chosen Philippine date, never tomorrow', () => {
  const now = Date.parse('2029-01-01T00:00:00Z');
  for (const [shift, start, end] of [['morning', '08:00:00', '12:00:00'], ['afternoon', '12:00:00', '17:00:00'], ['night', '17:00:00', '21:00:00']]) {
    const terms = engagementForm.buildEngagementSchedule({ bookingType: 'short_term', startDate: '01/07/2030', endDate: '', workHours: '', days: [], shift }, now);
    assert.equal(terms.daily_start_time, start);
    assert.equal(terms.daily_end_time, end);
    assert.equal(bookingCards.philippinesDate(terms.start_time), '01/07/2030');
    assert.equal(bookingCards.philippinesDate(terms.end_time), '01/07/2030');
    assert.deepEqual(terms.work_days, ['M']);
  }
});

test('long-term schedules need explicit ordered dates, daily hours and matching working days', () => {
  const form = { bookingType: 'long_term', startDate: '01/07/2030', endDate: '02/07/2030', workHours: '08:00 AM - 05:00 PM', days: ['F', 'M', 'W'], shift: null };
  const now = Date.parse('2029-01-01T00:00:00Z');
  assert.deepEqual(engagementForm.buildEngagementSchedule(form, now).work_days, ['M', 'W', 'F']);
  for (const updates of [{startDate: ''}, {endDate: ''}, {endDate: form.startDate}, {days: []}, {days: ['F']}, {workHours: '05:00 PM - 08:00 AM'}]) {
    assert.throws(() => engagementForm.buildEngagementSchedule({...form, ...updates}, now));
  }
  assert.throws(() => engagementForm.buildEngagementSchedule(form, Date.parse('2030-03-01T00:00:00Z')));
  assert.throws(() => engagementForm.buildEngagementSchedule({...form, bookingType:'short_term'}, now));
  assert.equal(engagementForm.dayForDate('01/06/2030'), 'Su');
});

test('fixed terms require 30 calendar days while ongoing terms retain hours without a fake end date', () => {
  const form = { bookingType: 'long_term', startDate: '10/21/2030', endDate: '11/20/2030', workHours: '09:00 AM - 02:00 PM', days: ['M'], shift: null };
  const now = Date.parse('2030-10-01T00:00:00Z');
  assert.equal(engagementForm.earliestLongTermEnd(form.startDate), '11/20/2030');
  assert.equal(engagementForm.earliestLongTermEnd('01/31/2030'), '03/02/2030');
  assert.throws(() => engagementForm.buildEngagementSchedule({ ...form, endDate: '11/19/2030' }, now), /30 days/);
  assert.equal(engagementForm.buildEngagementSchedule(form, now).end_time, '2030-11-20T06:00:00.000Z');
  const ongoing = engagementForm.buildEngagementSchedule({ ...form, ongoing: true, endDate: '' }, now);
  assert.equal(ongoing.end_time, null);
  assert.equal(ongoing.daily_end_time, '14:00:00');
  assert.throws(() => engagementForm.buildEngagementSchedule({ ...form, workHours: '' }, now), /Choose your working hours/);
});

test('short-term custom hours use the selected day and reject missing or reversed times', () => {
  const form = { bookingType: 'short_term', startDate: '01/07/2030', endDate: '', workHours: '09:00 AM - 02:00 PM', days: [], shift: 'custom', ongoing: true };
  const now = Date.parse('2030-01-01T00:00:00Z');
  const saved = engagementForm.buildEngagementSchedule(form, now);
  assert.equal(saved.start_time, '2030-01-07T01:00:00.000Z');
  assert.equal(saved.end_time, '2030-01-07T06:00:00.000Z');
  assert.throws(() => engagementForm.buildEngagementSchedule({ ...form, workHours: '' }, now), /Choose your working hours/);
  assert.throws(() => engagementForm.buildEngagementSchedule({ ...form, workHours: '05:00 PM - 08:00 AM' }, now), /end after/);
});

test('short-term schedules accept seven days after the start date and reject day eight', () => {
  const now = Date.parse('2026-10-30T00:00:00Z');
  const form = { bookingType: 'short_term', startDate: '10/31/2026', endDate: '11/07/2026',
    workHours: '08:00 AM - 05:00 PM', days: ['M', 'T', 'W', 'Th', 'F'], shift: 'custom' };
  const schedule = engagementForm.buildEngagementSchedule(form, now);
  assert.equal(schedule.start_time, '2026-10-31T00:00:00.000Z');
  assert.equal(schedule.end_time, '2026-11-07T09:00:00.000Z');
  assert.equal(engagementForm.latestShortTermEnd('12/28/2026'), '01/04/2027');
  assert.throws(() => engagementForm.buildEngagementSchedule({ ...form, endDate: '11/08/2026' }, now), /up to 7 days/);
  assert.deepEqual(schedule.work_days, form.days);
  assert.throws(() => engagementForm.buildEngagementSchedule({ ...form, endDate: '10/30/2026' }, now), /on or after/);
  assert.throws(() => engagementForm.buildEngagementSchedule({ ...form, days: [] }, now), /working day/);
  assert.throws(() => engagementForm.buildEngagementSchedule({ ...form, endDate: '11/01/2026', days: ['M'] }, now), /within the date range/);
});

test('both forms require a complete PSGC hierarchy and a real street and ZIP code', () => {
  const locations = load('src/features/bookings/workLocation.ts');
  const address = { selectedRegion: {name:'NCR'}, selectedProvince:{name:'Metro Manila'}, selectedCity:{name:'Quezon City'}, selectedBarangay:{name:'Test Barangay'}, streetAddress:'123 Test Street', zipcode:'1100' };
  assert.equal(locations.workLocationError(address), null);
  for (const field of ['selectedRegion', 'selectedProvince', 'selectedCity', 'selectedBarangay']) {
    assert.ok(locations.workLocationError({...address, [field]:null}));
  }
  assert.ok(locations.workLocationError({...address, streetAddress:' '}));
  assert.ok(locations.workLocationError({...address, zipcode:'123'}));
  assert.ok(locations.workLocationError({...address, zipcode:'11a0'}));
});
const reviewApi = load('src/features/reviews/api/reviewApi.ts');

test('review submission routes only to Django and never sends a client sentiment or HF token', async () => {
  const params = { booking_id: 'booking-1', rating: 1, unstructured_feedback: '  Dili kabalo mo lipyo  ', nlp_sentiment: 'Positive' };
  await withFetch(async (url, options) => {
    assert.equal(url, 'http://test.local/api/v1/reviews/create/');
    const headers = new Headers(options.headers);
    assert.equal(headers.get('Authorization'), 'Bearer session-token');
    assert.equal(headers.get('Idempotency-Key'), 'retry-key');
    assert.deepEqual(JSON.parse(options.body), { booking_id: 'booking-1', rating: 1, unstructured_feedback: 'Dili kabalo mo lipyo' });
    return response({ message: 'Saved', data: { review_id: 'review-1', nlp_sentiment: 'Negative', sentiment_analysis: { source: 'huggingface', confidence: .7271 } } }, 201);
  }, async () => {
    const saved = await reviewApi.submitReview('session-token', params, 'retry-key');
    assert.equal(saved.data.nlp_sentiment, 'Negative');
    assert.equal(saved.data.sentiment_analysis.confidence, .7271);
  });
});

test('provider failure stays an actionable review error without invented Neutral', async () => {
  await withFetch(async () => response({ detail: 'Please try again.', code: 'sentiment_unavailable' }, 503), async () => {
    await assert.rejects(reviewApi.submitReview('token', { booking_id: 'b', rating: 5, unstructured_feedback: 'Syada siya mo hatag ug sweldo' }, 'same-key'), error => {
      assert.equal(error.code, 'sentiment_unavailable');
      assert.equal(error.message, 'Please try again.');
      return true;
    });
  });
});

test('successful HTTP response without a saved review is never presented as submission success', async () => {
  await withFetch(async () => response({ message: 'OK' }), async () => {
    await assert.rejects(reviewApi.submitReview('token', { booking_id: 'b', rating: 5, unstructured_feedback: 'The service was good' }, 'same-key'), error => error.code === 'connection');
  });
});
const workerCv = load('src/features/profile/worker/workerCv.ts');
const workerCvApi = load('src/features/profile/api/workerCvApi.ts');
const cvDownload = load('src/features/profile/worker/downloadWorkerCv.ts');
const cvViewer = load('src/features/profile/worker/viewWorkerCvPdf.ts');

test('PDF viewing opens an authenticated temporary file without a folder save', async () => {
  const f = cvDownloadFixture();
  let viewed;
  await cvViewer.viewWorkerCvPdf({ ...f.options, openPdf: async path => { viewed = path; } });
  assert.match(viewed, /^file:\/\/\/cache\/SerbiSure_CV_\d+\.pdf$/);
  assert.equal(f.requests[0][2].headers.Authorization, 'Bearer private-token');
  assert.equal(f.creates.length, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(f.deleted.length, 0);
});

test('PDF viewing handles missing native support before downloading', async () => {
  const f = cvDownloadFixture();
  await assert.rejects(cvViewer.viewWorkerCvPdf({ ...f.options, openPdf: null }), /install the updated/);
  assert.equal(f.requests.length, 0);
});

test('PDF viewing cleans failed downloads and never opens a server error', async () => {
  const f = cvDownloadFixture();
  f.options.fs.downloadAsync = async () => ({ status: 503 });
  await assert.rejects(cvViewer.viewWorkerCvPdf({ ...f.options, openPdf: async () => assert.fail('must not open') }), /Could not generate/);
  assert.equal(f.deleted.length, 1);
});

test('PDF viewing cleans a file when no PDF application can open it', async () => {
  const f = cvDownloadFixture();
  await assert.rejects(cvViewer.viewWorkerCvPdf({ ...f.options, openPdf: async () => { throw new Error('No activity found'); } }), /No activity/);
  assert.equal(f.deleted.length, 1);
});

function cvDownloadFixture(format = 'pdf') {
  const deleted = [], writes = [], requests = [], creates = [];
  const bytes = Buffer.from(format === 'pdf' ? '%PDF-1.4\n\x00\xff' : '\ufeffName\r\nMaría').toString('base64');
  const fs = {
    cacheDirectory: 'file:///cache/', EncodingType: { Base64: 'base64' },
    readDirectoryAsync: async () => [],
    downloadAsync: async (...args) => { requests.push(args); return { status: 200 }; },
    deleteAsync: async uri => { deleted.push(uri); },
    readAsStringAsync: async (uri, options) => { assert.equal(options.encoding, 'base64'); return bytes; },
    StorageAccessFramework: {
      requestDirectoryPermissionsAsync: async () => ({ granted: true, directoryUri: 'content://selected-folder' }),
      createFileAsync: async (...args) => { creates.push(args); return 'content://saved-cv'; },
      writeAsStringAsync: async (...args) => { writes.push(args); },
    },
  };
  const options = { platform: 'android', format, fs, token: 'private-token', url: 'http://test.local/export/', isCurrent: () => true,
    getSharing: () => { throw new Error('Android must not import ExpoSharing'); } };
  return { options, deleted, writes, requests, creates, bytes };
}

test('Android PDF and CSV exports save exact bytes without loading ExpoSharing', async () => {
  for (const format of ['pdf', 'csv']) {
    const f = cvDownloadFixture(format);
    assert.equal(await cvDownload.downloadWorkerCv(f.options), 'saved');
    assert.equal(f.requests[0][0], f.options.url);
    assert.deepEqual(f.requests[0][2], { headers: { Authorization: 'Bearer private-token' } });
    assert.deepEqual(f.creates[0], ['content://selected-folder', 'SerbiSure_CV', format === 'pdf' ? 'application/pdf' : 'text/csv']);
    assert.deepEqual(f.writes[0], ['content://saved-cv', f.bytes, { encoding: 'base64' }]);
    assert.equal(f.deleted.length, 1);
    assert.match(f.deleted[0], /^file:\/\/\/cache\/SerbiSure_CV_\d+\.(pdf|csv)$/);
  }
});

test('cancelling the folder picker is quiet and cleans the temporary CV', async () => {
  const f = cvDownloadFixture();
  f.options.fs.StorageAccessFramework.requestDirectoryPermissionsAsync = async () => ({ granted: false });
  assert.equal(await cvDownload.downloadWorkerCv(f.options), 'cancelled');
  assert.equal(f.creates.length, 0);
  assert.equal(f.deleted.length, 1);
});

test('export HTTP failure never creates a saved file and cleans the error download', async () => {
  const f = cvDownloadFixture();
  f.options.fs.downloadAsync = async () => ({ status: 401 });
  await assert.rejects(cvDownload.downloadWorkerCv(f.options), /session expired/);
  assert.equal(f.creates.length, 0);
  assert.equal(f.writes.length, 0);
  assert.equal(f.deleted.length, 1);
});

test('failed Android writes clean both the partial destination and temporary export', async () => {
  const f = cvDownloadFixture();
  f.options.fs.StorageAccessFramework.writeAsStringAsync = async () => { throw new Error('Disk full'); };
  await assert.rejects(cvDownload.downloadWorkerCv(f.options), /Disk full/);
  assert.equal(f.deleted[0], 'content://saved-cv');
  assert.equal(f.deleted.length, 2);
});

test('closing or switching CVs during a download prevents the file picker and save', async () => {
  const f = cvDownloadFixture();
  let current = true;
  f.options.isCurrent = () => current;
  f.options.fs.downloadAsync = async () => { current = false; return { status: 200 }; };
  assert.equal(await cvDownload.downloadWorkerCv(f.options), 'cancelled');
  assert.equal(f.creates.length, 0);
  assert.equal(f.deleted.length, 1);
});

test('iOS without the sharing native module shows an actionable error before downloading', async () => {
  const f = cvDownloadFixture();
  f.options.platform = 'ios'; f.options.getSharing = () => null;
  await assert.rejects(cvDownload.downloadWorkerCv(f.options), /install the latest SerbiSure app/);
  assert.equal(f.requests.length, 0);
});

test('iOS sharing preserves its temporary file for the receiving app', async () => {
  const f = cvDownloadFixture();
  f.options.platform = 'ios';
  let shared;
  f.options.getSharing = () => ({ isAvailableAsync: async () => true, shareAsync: async (...args) => { shared = args; } });
  assert.equal(await cvDownload.downloadWorkerCv(f.options), 'shared');
  assert.equal(shared[1].mimeType, 'application/pdf');
  assert.equal(f.deleted.length, 0);
});

test('CV form preserves zero children and explicit daily/monthly rate units', () => {
  const draft = { ...workerCv.emptyWorkerDraft(), civil_status: 'Married', number_of_children: '0', desired_monthly_rate: '8000', desired_daily_rate: '800', service_categories: ['Cleaning'], engagement_preference: 'both', work_setup: 'stay_out', languages: ['Bisaya'], experience_level: 'new' };
  const payload = workerCv.workerPayload(draft);
  assert.equal(payload.number_of_children, 0);
  assert.equal(payload.desired_monthly_rate, '8000');
  assert.equal(payload.desired_daily_rate, '800');
  assert.equal(payload.share_family_details, false);
  assert.equal(workerCv.validateWorkerPage(draft, 0), null);
  assert.equal(workerCv.validateWorkerPage(draft, 1), null);
  assert.equal(workerCv.validateWorkerPage({ ...draft, number_of_children: '6' }, 1), null);
  assert.ok(workerCv.validateWorkerPage({ ...draft, number_of_children: '2.5' }, 1));
});

test('legacy CV drafts never infer experience, salary or children from a biography', () => {
  const draft = workerCv.workerDraft({}, ['Cook', 'Child Care', 'Family Driver', 'Stay-In'], 'Bisaya, English');
  assert.deepEqual(draft.service_categories, ['Cooking', 'Child_care']);
  assert.equal(draft.work_setup, 'stay_in');
  assert.equal(draft.number_of_children, '');
  assert.equal(draft.desired_monthly_rate, '');
  assert.equal(draft.experience_level, '');
  assert.deepEqual(draft.languages, ['Bisaya', 'English']);
});

test('CV availability validates real dates and optional training without fabricating defaults', () => {
  const draft = { ...workerCv.emptyWorkerDraft(), engagement_preference: 'short_term', available_days: ['M'], preferred_shifts: ['morning'], available_from: '2027-02-30' };
  assert.ok(workerCv.validateWorkerPage(draft, 2));
  assert.equal(workerCv.validateWorkerPage({ ...draft, available_from: '2027-02-28' }, 2), null);
  assert.ok(workerCv.validateWorkerPage({ ...draft, training: [{ name: '', provider: 'TESDA', year: '2026' }] }, 3));
});

test('CV save persists family details, availability and sharing choices through the real owner endpoint', async () => {
  const draft = { ...workerCv.emptyWorkerDraft(), civil_status: 'Married', number_of_children: '2', share_family_details: true, available_days: ['M'], languages: ['English'] };
  await withFetch(async (url, options) => {
    assert.equal(url, 'http://test.local/api/v1/accounts/worker-profile/');
    assert.equal(options.method, 'PATCH');
    assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer token');
    const body = JSON.parse(options.body);
    assert.equal(body.number_of_children, 2);
    assert.equal(body.civil_status, 'Married');
    assert.equal(body.share_family_details, true);
    assert.deepEqual(body.available_days, ['M']);
    assert.deepEqual(body.languages, ['English']);
    return response(body);
  }, () => workerCvApi.saveWorkerDetails('token', draft));
});
