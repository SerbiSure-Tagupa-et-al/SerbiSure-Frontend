const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const Reconciler = require('react-reconciler');
const { DefaultEventPriority } = require('react-reconciler/constants');

const append = (parent, child) => { parent.children = parent.children.filter(item => item !== child); parent.children.push(child); };
const remove = (parent, child) => { parent.children = parent.children.filter(item => item !== child); };
const renderer = Reconciler({
  supportsMutation: true, isPrimaryRenderer: true, now: Date.now,
  getRootHostContext: () => null, getChildHostContext: () => null, getCurrentEventPriority: () => DefaultEventPriority,
  prepareForCommit: () => null, resetAfterCommit() {}, shouldSetTextContent: () => false,
  createInstance: (type, props) => ({ type, props, children: [] }), createTextInstance: text => ({ text, children: [] }), getPublicInstance: instance => instance,
  appendInitialChild: append, appendChild: append, appendChildToContainer: append, removeChild: remove, removeChildFromContainer: remove,
  insertBefore(parent, child, before) { remove(parent, child); parent.children.splice(parent.children.indexOf(before), 0, child); },
  insertInContainerBefore(parent, child, before) { remove(parent, child); parent.children.splice(parent.children.indexOf(before), 0, child); },
  prepareUpdate: () => true, commitUpdate(instance, _payload, _type, _old, props) { instance.props = props; }, commitTextUpdate(instance, _old, text) { instance.text = text; },
  finalizeInitialChildren: () => false, clearContainer(parent) { parent.children = []; },
  scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1, detachDeletedInstance() {},
});
function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (name === 'react') return { ...React, default: React };
    if (name in mocks) return mocks[name];
    if (name === 'react-native') return native;
    if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
    if (name.endsWith('LanguageContext')) return { useLanguage: () => ({ tr: text => text, formatDate: text => text }) };
    if (name.endsWith('theme/theme')) return { default: { colors: {}, typography: { fontFamily: {} } } };
    if (name.endsWith('.png')) return 1;
    if (name === 'react-native-qrcode-svg') return { default: 'QRCode' };
    if (name === 'expo-clipboard') return { setStringAsync: async () => true };
    if (name.endsWith('/shared/api/config')) return { API_BASE_URL: 'https://example.test' };
    if (name.startsWith('.')) {
      const target = path.resolve(path.dirname(path.resolve(__dirname, '..', file)), name);
      const resolved = path.extname(target) ? target : ['.ts', '.tsx'].map(extension => target + extension).find(fs.existsSync);
      return load(path.relative(path.resolve(__dirname, '..'), resolved), mocks);
    }
    if (name.endsWith('/utils/rate')) return load('src/shared/utils/rate.ts');
    if (name.endsWith('/reviews/ratings') || name === '../ratings') return load('src/features/reviews/ratings.ts');
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}

const native = { StyleSheet: { create: styles => styles }, Platform: { OS: 'android' },
  Keyboard: { dismiss() {} }, Alert: { alert() {} }, AppState: { addEventListener: () => ({ remove() {} }) } };
for (const name of ['View', 'Text', 'Image', 'ScrollView', 'Pressable', 'Modal', 'TextInput', 'ActivityIndicator', 'KeyboardAvoidingView']) native[name] = name;
const ratings = load('src/features/reviews/ratings.ts');
const rates = load('src/shared/utils/rate.ts');
const text = node => node.text || node.children.map(text).join('');
function mount(t, Component, props) {
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const act = fn => renderer.flushSync(fn);
  const render = () => { act(() => renderer.updateContainer(React.createElement(Component, props), root, null)); renderer.flushPassiveEffects(); };
  t.after(() => act(() => renderer.updateContainer(null, root, null)));
  const nodes = () => { const all = []; const visit = node => { all.push(node); node.children.forEach(visit); }; visit(container); return all; };
  render();
  return { act, render, content: () => text(container), all: type => nodes().filter(node => node.type === type) };
}

test('invalid ratings are absent and averages use only real ratings', () => {
  for (const value of [undefined, null, '', ' ', 0, -1, 6, NaN, Infinity, true, {}, 'invalid', '0x4', '1e0']) {
    assert.equal(ratings.validRating(value), null);
  }
  assert.equal(ratings.averageReviewRating([]), null);
  assert.equal(ratings.averageReviewRating([{ rating: null }, { rating: 0 }]), null);
  assert.equal(ratings.averageReviewRating([{ rating: 3 }, { rating: 5 }, { rating: 5 }, { rating: null }]), 13 / 3);
  assert.equal(ratings.validRating('4.3'), 4.3);
});

test('missing or malformed rates never become free work or a made-up amount', () => {
  for (const value of [undefined, null, '', ' ', 0, -1, Infinity, NaN, 'wrong', '0x10', '1e3']) assert.equal(rates.formatRate(value), 'Rate not provided');
  assert.equal(rates.formatRate('800.00'), '₱800.00');
  assert.equal(rates.formatRate('800', 'PHP '), 'PHP 800');
});

test('registered location never invents Pagatpat or a city', () => {
  const { formatRegisteredLocation } = load('src/shared/services/locationService.ts');
  assert.equal(formatRegisteredLocation('', '', ''), '');
  assert.equal(formatRegisteredLocation('', 'City of Cagayan De Oro', ''), 'CDO');
  assert.equal(formatRegisteredLocation('Brgy. Agusan', '', ''), 'Agusan');
  assert.equal(formatRegisteredLocation('', '', 'Misamis Oriental'), 'Misamis Oriental');
});

test('all reviews empty state has no invented average or filled stars', t => {
  const { AllReviewsModal } = load('src/features/reviews/components/AllReviewsModal.tsx');
  const screen = mount(t, AllReviewsModal, { visible: true, onClose() {}, reviews: [] });
  assert.match(screen.content(), /No ratings yet/);
  assert.doesNotMatch(screen.content(), /5\.0/);
  assert.equal(screen.all('Icon').filter(node => node.props.name === 'star').length, 0);
});

test('malformed review ratings and sentiments do not become five stars or positive', t => {
  const { AllReviewsModal } = load('src/features/reviews/components/AllReviewsModal.tsx');
  const screen = mount(t, AllReviewsModal, { visible: true, onClose() {}, reviews: [
    { review_id: 'missing', rating: null, nlp_sentiment: null, unstructured_feedback: 'Saved feedback' },
    { review_id: 'real', reviewer_name: 'Real Reviewer', rating: 3, nlp_sentiment: 'Neutral', unstructured_feedback: 'A real review' },
  ] });
  assert.match(screen.content(), /No rating provided/);
  assert.match(screen.content(), /Not analyzed/);
  assert.match(screen.content(), /3\.0/);
  assert.doesNotMatch(screen.content(), /5\.0|Verified Client/);
  assert.equal(screen.all('Icon').filter(node => node.props.name === 'star').length, 6); // Three summary stars + three actual review stars.
});

test('review submission requires a deliberate star selection and a referral choice from both roles', async t => {
  const sent = [];
  const { ReviewModal } = load('src/features/reviews/components/ReviewModal.tsx', {
    '../api/reviewApi': { submitReview: async (_token, payload) => { sent.push(payload); return { data: { ...payload, nlp_sentiment: 'Positive' } }; } },
    '../../auth/session/UserContext': { useUser: () => ({ user: { accountType: 'Homeowner' } }) },
    '../../chat/api/chatApi': { generateUUID: () => 'c44113ea-6392-462f-b55b-2eed6bb9c180' },
  });
  const screen = mount(t, ReviewModal, { visible: true, onClose() {}, bookingId: 'booking', token: 'test-token', revieweeName: 'Maria' });
  assert.match(screen.content(), /Select a star rating/);
  assert.match(screen.content(), /Would you recommend .* to other Homeowners\?/);
  screen.act(() => screen.all('TextInput')[0].props.onChangeText('The work was completed well.'));
  const submit = () => screen.all('Pressable').find(node => text(node).includes('Submit Review'));
  await screen.act(() => submit().props.onPress());
  assert.equal(sent.length, 0);
  assert.match(screen.content(), /Please select a star rating/);
  screen.act(() => screen.all('Pressable').find(node => node.props.accessibilityLabel === 'Rate 3 out of 5 stars').props.onPress());
  // Still blocked until Homeowner answers the required referral question
  await screen.act(() => submit().props.onPress());
  assert.equal(sent.length, 0);
  assert.match(screen.content(), /Please choose whether you would recommend/);
  screen.act(() => screen.all('Pressable').find(node => node.props.accessibilityLabel === 'Yes, I recommend').props.onPress());
  await screen.act(() => submit().props.onPress());
  assert.equal(sent.length, 1);
  assert.equal(sent[0].rating, 3);
  assert.equal(sent[0].would_recommend, true);

  // Kasambahay reviewing a Homeowner must also answer before the full review can be submitted.
  const workerScreen = mount(t, ReviewModal, { visible: true, onClose() {}, bookingId: 'booking-2', token: 'test-token', reviewerRole: 'Kasambahay' });
  assert.match(workerScreen.content(), /KASAMBAHAY REFERRAL/);
  assert.match(workerScreen.content(), /Would you recommend .* to other Kasambahays\?/);
  assert.match(workerScreen.content(), /safe and respectful Homeowners/);
  workerScreen.act(() => workerScreen.all('TextInput')[0].props.onChangeText('Respectful employer and clear instructions.'));
  workerScreen.act(() => workerScreen.all('Pressable').find(node => node.props.accessibilityLabel === 'Rate 5 out of 5 stars').props.onPress());
  await workerScreen.act(() => workerScreen.all('Pressable').find(node => text(node).includes('Submit Review')).props.onPress());
  assert.equal(sent.length, 1);
  assert.match(workerScreen.content(), /Please choose whether you would recommend this Homeowner to other Kasambahays/);
  workerScreen.act(() => workerScreen.all('Pressable').find(node => node.props.accessibilityLabel === 'Yes, I recommend').props.onPress());
  await workerScreen.act(() => workerScreen.all('Pressable').find(node => text(node).includes('Submit Review')).props.onPress());
  assert.equal(sent.length, 2);
  assert.equal(sent[1].would_recommend, true);
  assert.match(workerScreen.content(), /Added as a Verified Kasambahay Referral/);
});

test('No is a complete recommendation answer for either reviewer role', async t => {
  for (const role of ['Homeowner', 'Kasambahay']) {
    const sent = [];
    const { ReviewModal } = load('src/features/reviews/components/ReviewModal.tsx', {
      '../api/reviewApi': { submitReview: async (_token, payload) => {
        sent.push(payload); return { data: { ...payload, nlp_sentiment: 'Neutral' } };
      } },
      '../../auth/session/UserContext': { useUser: () => ({ user: { accountType: role } }) },
      '../../chat/api/chatApi': { generateUUID: () => 'c44113ea-6392-462f-b55b-2eed6bb9c180' },
    });
    const screen = mount(t, ReviewModal, { visible: true, onClose() {}, bookingId: 'booking', token: 'token' });
    screen.act(() => screen.all('TextInput')[0].props.onChangeText('The work was completed as agreed.'));
    screen.act(() => screen.all('Pressable').find(node => node.props.accessibilityLabel === 'Rate 3 out of 5 stars').props.onPress());
    screen.act(() => screen.all('Pressable').find(node => node.props.accessibilityLabel === 'No').props.onPress());
    await screen.act(() => screen.all('Pressable').find(node => text(node).includes('Submit Review')).props.onPress());
    assert.equal(sent.length, 1);
    assert.equal(sent[0].would_recommend, false);
    assert.doesNotMatch(screen.content(), /Added as a Verified .* Referral/);
  }
});

test('review referral badges identify the reviewer role and omit declined or legacy unanswered recommendations', t => {
  const { ReviewsSection } = load('src/features/profile/components/ReviewsSection.tsx', {
    '../styles': { profileStyles: {} },
    '../../../shared/ui/ProfileAvatar': { ProfileAvatar: 'ProfileAvatar' },
    '../../reviews/ratings': ratings,
  });
  for (const role of ['Kasambahay', 'Homeowner', undefined]) {
    for (const recommendation of [true, false, null]) {
      const screen = mount(t, ReviewsSection, { profile: {
        t: {}, isReviewsExpanded: false, setIsReviewsExpanded() {},
        reviews: [{ review_id: 'review', rating: 5, reviewer_account_type: role, would_recommend: recommendation,
          unstructured_feedback: 'A real review.' }],
      } });
      if (recommendation === true) {
        assert.ok(screen.content().includes(role === 'Kasambahay' ? 'Recommended by Kasambahay' : 'Recommended by Homeowner'));
      } else {
        assert.doesNotMatch(screen.content(), /Recommended by/);
      }
    }
  }
});

test('WorkHistorySection displays verified SerbiSure jobs, referrals, and empty states honestly', t => {
  const { WorkHistorySection } = load('src/features/profile/components/ReviewsSection.tsx', {
    '../styles': { profileStyles: {} },
    '../../../shared/ui/ProfileAvatar': { ProfileAvatar: 'ProfileAvatar' },
    '../../reviews/ratings': load('src/features/reviews/ratings.ts'),
  });
  const empty = mount(t, WorkHistorySection, { workHistory: { user_id: 'w1', summary: { completed_jobs_count: 0, recommended_count: 0, repeat_employers_count: 0 }, jobs: [] } });
  assert.match(empty.content(), /No completed jobs on SerbiSure yet/);

  const populated = mount(t, WorkHistorySection, {
    workHistory: {
      user_id: 'w1',
      summary: { completed_jobs_count: 2, recommended_count: 1, repeat_employers_count: 1 },
      jobs: [{
        booking_id: 'b1',
        service_category: ['Cleaning'],
        service_labels: ['Cleaning'],
        booking_type: 'short_term',
        work_setup: 'stay_out',
        area: 'Agusan, Cagayan de Oro',
        start_date: '2026-10-10',
        end_date: '2026-10-12',
        completed_at: '2026-10-12T10:00:00Z',
        employer_name: 'Ana Cruz',
        employer_verified: true,
        employer_avatar: null,
        rating: 5,
        would_recommend: true,
        nlp_sentiment: 'Positive',
        feedback: 'Very trustworthy and clean.',
      }],
    },
  });
  assert.match(populated.content(), /Verified Job/);
  assert.match(populated.content(), /Agusan, Cagayan de Oro/);
  assert.match(populated.content(), /Hired by Ana Cruz/);
  assert.match(populated.content(), /Employer Referral · Recommended to other Homeowners/);
  assert.match(populated.content(), /Very trustworthy and clean\./);
});

test('homeowner history uses helper referrals and booking language with an honest empty state', t => {
  const { WorkHistorySection } = load('src/features/profile/components/ReviewsSection.tsx', {
    '../styles': { profileStyles: {} },
    '../../../shared/ui/ProfileAvatar': { ProfileAvatar: 'ProfileAvatar' },
    '../../reviews/ratings': ratings,
  });
  const empty = mount(t, WorkHistorySection, { profileRole: 'Homeowner', workHistory: null });
  assert.match(empty.content(), /No completed bookings on SerbiSure yet/);
  assert.match(empty.content(), /once this Homeowner finishes a booking/);
  const screen = mount(t, WorkHistorySection, { profileRole: 'Homeowner', workHistory: {
    account_type: 'Homeowner', summary: { completed_jobs_count: 2, recommended_count: 1, repeat_employers_count: 1 },
    jobs: [{ booking_id: 'job', service_labels: ['Cleaning'], partner_role: 'Kasambahay', employer_name: 'Maria Santos',
      area: 'Agusan, Cagayan de Oro', rating: 5, would_recommend: true, feedback: 'Respectful homeowner.' }],
  } });
  assert.match(screen.content(), /Jobs Done/);
  assert.match(screen.content(), /Kasambahay Referrals/);
  assert.match(screen.content(), /Repeat Helpers/);
  assert.match(screen.content(), /Worked with Maria Santos/);
  assert.match(screen.content(), /Kasambahay Referral · Recommended to other Kasambahays/);
  assert.doesNotMatch(screen.content(), /Hired by|Homeowner Referrals|Repeat Clients/);
});

test('reputation metrics use loaded history counts and never invent a percentage for zero reviews', t => {
  const metricVal = {};
  const { ReputationSection } = load('src/features/profile/worker/ReputationSection.tsx', {
    '../styles': { profileStyles: { metricVal } },
  });
  const base = { totalReviews: 0, summary: { total_reviews: 0, average_rating: 0 }, positivePercentage: 0,
    isVerified: false, verificationLabel: 'Pending' };
  for (const isWorker of [true, false]) {
    const zero = mount(t, ReputationSection, { profile: { ...base, isWorker,
      workHistory: { summary: { completed_jobs_count: 0, recommended_count: 0 } } } });
    assert.deepEqual(zero.all('Text').filter(node => node.props.style === metricVal).map(text), ['—', '0', '—']);
    assert.doesNotMatch(zero.content(), /0%/);
    const loaded = mount(t, ReputationSection, { profile: { ...base, isWorker, totalReviews: 2,
      summary: { total_reviews: 2, average_rating: 4.5 }, positivePercentage: 50,
      workHistory: { summary: { completed_jobs_count: 3, recommended_count: 1 } } } });
    assert.deepEqual(loaded.all('Text').filter(node => node.props.style === metricVal).map(text), ['4.5', '3', '50%']);
    assert.ok(loaded.content().includes(isWorker ? 'Recommended by 1 Homeowner' : 'Recommended by 1 Kasambahay'));
  }
  const unavailable = mount(t, ReputationSection, { profile: base });
  assert.deepEqual(unavailable.all('Text').filter(node => node.props.style === metricVal).map(text), ['—', '—', '—']);
  const analytics = mount(t, ReputationSection, { profile: { ...base,
    analyticsData: { total_reviews: 3, average_rating: 4, positive_percentage: 67, total_jobs_completed: 0 },
    workHistory: { summary: { completed_jobs_count: 3 } } } });
  assert.deepEqual(analytics.all('Text').filter(node => node.props.style === metricVal).map(text), ['4.0', '0', '67%']);
});

test('CV preview and exported PDF do not invent worker qualifications or personal details', t => {
  const cv = { name: 'Actual Worker', details: {}, languages: '', location: '', contact_number: '', verification_status: 'Pending' };
  const { WorkerCvPreview } = load('src/features/profile/worker/WorkerCvPreview.tsx');
  const screen = mount(t, WorkerCvPreview, { cv });
  const { generateWorkerCvPdf } = load('src/features/profile/worker/generateWorkerCvPdf.ts');
  const forbidden = /Cagayan de Oro|3\+ years|Meal preparation|Infant care|Secondary Education|Single|Available now|Dedicated and reliable/;
  assert.doesNotMatch(screen.content(), forbidden);
  assert.doesNotMatch(generateWorkerCvPdf(cv), forbidden);
  assert.match(screen.content(), /Not provided/);
});

test('unsaved booking tickets do not invent a name, region, price, schedule or booking code', t => {
  const { BookingOfferReview } = load('src/features/bookings/components/BookingOfferReview.tsx');
  const screen = mount(t, BookingOfferReview, { bookingType: 'short_term', contactName: '', serviceCategory: [],
    salary: '', region: '', days: [], startDate: '', endDate: '', workHours: '', location: '' });
  assert.match(screen.content(), /QR Pass will be generated once booking is sent/);
  assert.doesNotMatch(screen.content(), /158EEE|Shennie|Northern Mindanao|Mon - Sun|08:00|₱600/);
});

test('empty user sessions never seed a developer identity or address', t => {
  const { UserProvider, useUser } = load('src/features/auth/session/UserContext.tsx', {
    '../../bookings/store/savedJobsStore': { savedJobsStore: { initForUser() {}, clearStore() {} } },
    '../../verification/api/verificationApi': { fetchVerificationStatus: async () => null },
  });
  const snapshots = [];
  function Consumer() {
    const context = useUser();
    snapshots.push({ ...context.user });
    return React.createElement('Text', null, context.getFullName());
  }
  const screen = mount(t, props => React.createElement(UserProvider, props, React.createElement(Consumer)), {});
  assert.equal(screen.content(), 'User');
  for (const user of snapshots) {
    assert.equal(user.firstName, ''); assert.equal(user.street, '');
    assert.equal(user.city, ''); assert.equal(user.zipcode, '');
  }
});
