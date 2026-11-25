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
    if (name.endsWith('/utils/rate')) return load('src/shared/utils/rate.ts');
    if (name.endsWith('/reviews/ratings') || name === '../ratings') return load('src/features/reviews/ratings.ts');
    if (name.endsWith('/bookings/components/ProposalsModal')) return { ProposalsModal: 'ProposalsModal' };
    if (name.endsWith('/chat/components/ChatDetailScreen')) return { ChatDetailScreen: 'ChatDetailScreen' };
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}
const ownerId = 'fc3a6110-f39d-4c80-b279-25c855ae5f90';
const workerId = 'a3118126-e90f-44a6-8be9-346bd395d4ac';
const sourcePost = { id: '63212905-719c-444b-b42a-c0cc56790846', partnerId: workerId, employerName: 'Naruto',
  title: 'Caregiver', price: '₱8000', unit: '/ month', termTag: 'Long-term', location: 'Pagatpat', aboutText: 'Original service post' };
const details = { bookingType: 'long_term', startDate: '12/01/2099', endDate: '01/02/2100', ongoing: false,
  workHours: '08:00 AM - 05:00 PM', days: ['M'], serviceCategory: ['Cleaning'], workSetup: 'stay_out',
  salary: '8000', region: 'Region X', province: 'Misamis Oriental', city: 'Cagayan de Oro', barangay: 'Pagatpat', street: 'Lot 555', floorUnit: 'Unit 2B', zipCode: '9000' };
const { translateMessage } = load('src/shared/localization/messages.ts');

function profile(t, { publicProfile = {}, openOffer = true } = {}) {
  const requests = [], alerts = [];
  let fail = true, refreshes = 0;
  const native = { StyleSheet: { create: value => value }, Alert: { alert: (...args) => alerts.push(args) } };
  for (const name of ['Text', 'View', 'ScrollView', 'Pressable', 'Modal', 'ActivityIndicator', 'Image', 'RefreshControl']) native[name] = name;
  const api = load('src/features/chat/api/bookingOffersApi.ts', {
    '../../bookings/postAvailability': load('src/features/bookings/postAvailability.ts', { './engagementForm': load('src/features/bookings/engagementForm.ts', {}) }),
    '../../../shared/api/httpClient': { requestResponse: async (...args) => {
      requests.push(args);
      return { ok: !fail, json: async () => fail ? { detail: 'Network timeout' } : {
        booking: { booking_id: 'saved-offer' }, chat_message: { chat_message_id: 'saved-message' },
      } };
    } },
  });
  // Use the app's UUID generator without loading its unrelated chat networking imports.
  const chatSource = fs.readFileSync(path.resolve(__dirname, '../src/features/chat/api/chatApi.ts'), 'utf8');
  const generator = chatSource.slice(chatSource.indexOf('export function generateUUID()'), chatSource.indexOf('export interface ConversationPartner'));
  const module = { exports: {} };
  new Function('exports', ts.transpileModule(generator, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(module.exports);
  const { UserProfileView } = load('src/features/profile/components/UserProfileView.tsx', {
    'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
    '../../../../assets/serbisure-icon.png': 1,
    '../../../shared/localization/LanguageContext': { useLanguage: () => ({ tr: (text, params) => translateMessage('English', text, params), t: {} }) },
    '../hooks/usePublicProfile': { usePublicProfile: () => ({ profile: { full_name: 'Naruto', account_type: 'Kasambahay' },
      reviews: [], posts: [], canUsePost: () => true, refreshPosts: async () => { refreshes++; }, ...publicProfile }) },
    '../../auth/session/UserContext': { useUser: () => ({ user: { id: ownerId, token: 'token', accountType: 'Homeowner' } }) },
    '../../bookings/store/savedJobsStore': { useJobsActivity: () => ({ isSaved: () => false, isApplied: () => false }) },
    '../../bookings/hooks/useJobApplication': { useJobApplication: () => ({}) },
    '../../reviews/components/ReviewModal': { ReviewModal: 'ReviewModal' },
    '../../feed/feedMapper': {}, '../styles': { profileStyles: {} },
    './ProfileTabs': { ProfileTabs: 'ProfileTabs' }, './PublicPostsSection': { PublicPostsSection: 'PublicPostsSection' },
    '../../../shared/ui/ProfileAvatar': { ProfileAvatar: 'ProfileAvatar' }, '../profileConfig': { localizeProfileCopy: () => ({}) },
    './ReviewsSection': { ReviewsSection: 'ReviewsSection', WorkHistorySection: 'WorkHistorySection' }, '../worker/WorkerCvModal': { WorkerCvModal: 'WorkerCvModal' },
    '../../feed/components/JobDetailSheet': { JobDetailSheet: 'JobDetailSheet' },
    '../../bookings/components/BookingModal': { BookingModal: 'BookingModal' }, '../../chat/api/bookingOffersApi': api,
    '../../chat/api/chatApi': module.exports, '../../bookings/engagementForm': load('src/features/bookings/engagementForm.ts'),
    '../../bookings/api/bookingApi': {}, '../../../shared/services/locationService': { formatRegisteredLocation: () => 'Pagatpat' },
    './PendingPostCard': { CATEGORY_LABELS: {} }, './SocialIconsRow': { SocialIconsRow: 'SocialIconsRow' },
    '../../../shared/theme/theme': { default: { typography: { fontFamily: {} } } },
  });
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const act = callback => renderer.flushSync(callback);
  const render = () => { act(() => renderer.updateContainer(React.createElement(UserProfileView, {
    visible: true, userId: workerId, token: 'token', onMessage() {},
  }), root, null)); renderer.flushPassiveEffects(); };
  t.after(() => { act(() => renderer.updateContainer(null, root, null)); renderer.flushPassiveEffects(); });
  const find = type => { const visit = node => node.type === type ? node : node.children.map(visit).find(Boolean); return visit(container); };
  render();
  if (openOffer) {
    act(() => find('PublicPostsSection').props.onDetails(sourcePost));
    act(() => { void find('JobDetailSheet').props.onApply(); });
  }
  const content = () => {
    const visit = node => node.text || node.children.map(visit).join('');
    return visit(container);
  };
  return { requests, alerts, find, render, act, content, set fail(value) { fail = value; }, get refreshes() { return refreshes; } };
}

test('homeowner referral pills use the summary or review fallback and enable role-aware job history', t => {
  for (const [count, reviews, expected] of [
    [1, [], 'Recommended by 1 Kasambahay'],
    [2, [], 'Recommended by 2 Kasambahays'],
    [undefined, [{ would_recommend: true }, { would_recommend: true }, { would_recommend: false }], 'Recommended by 2 Kasambahays'],
    [0, [{ would_recommend: true }], null],
  ]) {
    const screen = profile(t, { openOffer: false, publicProfile: {
      profile: { full_name: 'Actual Homeowner', account_type: 'Homeowner' }, reviews,
      workHistory: count === undefined ? undefined : { summary: { recommended_count: count, completed_jobs_count: 0, repeat_employers_count: 0 }, jobs: [] },
    } });
    assert.equal(screen.find('ProfileTabs').props.showHistory, true);
    assert.equal(screen.find('WorkHistorySection'), undefined);
    assert.doesNotMatch(screen.content(), /Completed Job|Rehired by|Recommended by (?:\d+|\{count\}) Homeowners?/);
    if (expected) assert.ok(screen.content().includes(expected));
    else assert.doesNotMatch(screen.content(), /Recommended by/);
    screen.act(() => screen.find('ProfileTabs').props.onChange('history'));
    assert.equal(screen.find('WorkHistorySection').props.profileRole, 'Homeowner');
  }
});

test('public job history is available to both participant roles and hidden for desk accounts', t => {
  for (const role of ['Kasambahay', 'Homeowner', 'Admin', 'Barangay']) {
    const screen = profile(t, { openOffer: false, publicProfile: {
      profile: { full_name: 'Actual Person', account_type: role },
      workHistory: { summary: { completed_jobs_count: 2, recommended_count: 1, repeat_employers_count: 1 }, jobs: [] },
    } });
    const allowed = role === 'Kasambahay' || role === 'Homeowner';
    assert.equal(screen.find('ProfileTabs').props.showHistory, allowed);
    if (allowed) {
      assert.match(screen.content(), /2 Completed Jobs/);
      assert.ok(screen.content().includes(role === 'Kasambahay' ? 'Rehired by 1' : 'Rehired 1'));
    } else assert.doesNotMatch(screen.content(), /Completed Jobs|Recommended by|Rehired/);
    screen.act(() => screen.find('ProfileTabs').props.onChange('history'));
    if (allowed) assert.equal(screen.find('WorkHistorySection').props.profileRole, role);
    else assert.equal(screen.find('WorkHistorySection'), undefined);
  }
});

test('profile offer preserves source details and a valid UUID across failed-send retry and parent refresh', async t => {
  const screen = profile(t);
  const modal = screen.find('BookingModal');
  assert.equal(modal.props.bookingType, 'long_term');
  assert.equal(modal.props.jobPost.role, 'Caregiver');
  await assert.rejects(modal.props.onConfirm(details), /Network timeout/);
  assert.equal(screen.find('BookingModal').props.visible, true);
  assert.equal(screen.refreshes, 1);
  screen.render();
  assert.equal(screen.find('BookingModal').props.jobPost, modal.props.jobPost, 'Refresh must not reset the form through a new jobPost object');
  screen.fail = false;
  await screen.find('BookingModal').props.onConfirm(details);
  const [first, retry] = screen.requests;
  const key = first[1].headers['Idempotency-Key'];
  assert.match(key, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(retry[1].headers['Idempotency-Key'], key);
  assert.equal('source_post_id' in JSON.parse(first[1].body), false);
  assert.equal(JSON.parse(first[1].body).recipient_id, workerId);
  for (const [field, value] of Object.entries({ street: 'Lot 555', floor_number: 'Unit 2B', barangay: 'Pagatpat',
    city: 'Cagayan de Oro', province: 'Misamis Oriental', zip_code: '9000', region: 'Region X' })) {
    assert.equal(JSON.parse(first[1].body)[field], value);
  }
  assert.equal(screen.find('BookingModal'), undefined);
});

test('changing offer terms after failure generates a fresh UUID', async t => {
  const screen = profile(t);
  await assert.rejects(screen.find('BookingModal').props.onConfirm(details));
  await assert.rejects(screen.find('BookingModal').props.onConfirm({ ...details, salary: '9000' }));
  assert.notEqual(screen.requests[0][1].headers['Idempotency-Key'], screen.requests[1][1].headers['Idempotency-Key']);
});

test('short-term range is sent as the actual start/end timestamps and selected weekdays', async t => {
  const screen = profile(t);
  screen.fail = false;
  await screen.find('BookingModal').props.onConfirm({ ...details, bookingType: 'short_term',
    startDate: '10/31/2099', endDate: '11/13/2099', days: ['M', 'T', 'W', 'Th', 'F'] });
  const payload = JSON.parse(screen.requests[0][1].body);
  assert.equal(payload.start_time, '2099-10-31T00:00:00.000Z');
  assert.equal(payload.end_time, '2099-11-13T09:00:00.000Z');
  assert.deepEqual(payload.work_days, ['M', 'T', 'W', 'Th', 'F']);
});
