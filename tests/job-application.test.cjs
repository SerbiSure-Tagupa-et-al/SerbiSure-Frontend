const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const Reconciler = require('react-reconciler');
const { DefaultEventPriority } = require('react-reconciler/constants');

function load(file, mocks) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (name === 'react') return { ...React, default: React };
    if (name in mocks) return mocks[name];
    if (name.endsWith('/utils/rate')) return load('src/shared/utils/rate.ts', {});
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}
const deferred = () => {
  let resolve;
  const promise = new Promise(yes => { resolve = yes; });
  return { promise, resolve };
};
const job = { id: 'job-one', partnerId: 'employer', employerName: 'Employer', avatar: '', price: '₱800', unit: '/ day' };
const confirmed = { success: true, proposal: { proposal_id: 'proposal-one' } };
function fixture() {
  let applications = [], saved = [], response = confirmed;
  const calls = [];
  const { savedJobsStore: store } = load('src/features/bookings/store/savedJobsStore.ts', {
    react: {}, '../workSetup': { workSetupLabel: () => 'Stay-out' },
    '../api/bookingApi': {
      fetchSavedPostsApi: async () => await saved,
      fetchMyProposalPosts: async () => await applications,
      formatBookingLocationShort: () => 'Pagatpat',
      applyToJobPost: async (...args) => { calls.push(args); return await response; },
    },
  });
  return { store, calls, set response(value) { response = value; }, set applications(value) { applications = value; } };
}

test('confirmed application immediately updates Applied once and repeat taps reuse it', async () => {
  const f = fixture(); await f.store.initForUser('worker', 'token');
  let notifications = 0; f.store.subscribe(() => notifications++);
  assert.deepEqual(await f.store.applyToJob(job, 'token'), { created: true });
  assert.equal(f.store.getAppliedCount(), 1);
  assert.equal(f.store.getAppliedJobs()[0].id, job.id);
  assert.equal(notifications, 1);
  assert.deepEqual(await f.store.applyToJob(job, 'token'), { created: false });
  assert.equal(f.calls.length, 2); // Recheck availability, even for a previously applied post.
});

const append = (parent, child) => { parent.children = parent.children.filter(item => item !== child); parent.children.push(child); };
const remove = (parent, child) => { parent.children = parent.children.filter(item => item !== child); };
const renderer = Reconciler({
  supportsMutation: true, isPrimaryRenderer: true, now: Date.now,
  getRootHostContext: () => null, getChildHostContext: () => null, getCurrentEventPriority: () => DefaultEventPriority,
  prepareForCommit: () => null, resetAfterCommit() {}, shouldSetTextContent: () => false,
  createInstance: (type, props) => ({ type, props, children: [] }), createTextInstance: text => ({ text, children: [] }), getPublicInstance: instance => instance,
  appendInitialChild: append, appendChild: append, appendChildToContainer: append, removeChild: remove, removeChildFromContainer: remove,
  prepareUpdate: () => true, commitUpdate(instance, _payload, _type, _old, props) { instance.props = props; }, commitTextUpdate(instance, _old, text) { instance.text = text; },
  finalizeInitialChildren: () => false, clearContainer(parent) { parent.children = []; },
  scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1, detachDeletedInstance() {},
});
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); renderer.flushPassiveEffects(); };

function home(t, f) {
  const alerts = [];
  const useJobApplication = load('src/features/bookings/hooks/useJobApplication.ts', {
    'react-native': { Alert: { alert: (...args) => alerts.push(args) } }, '../store/savedJobsStore': { savedJobsStore: f.store },
  }).useJobApplication;
  const post = { ...job, kind: 'job', authorRole: 'Homeowner', categories: ['Cleaning'], tags: [], location: 'Pagatpat', termTag: 'Short-term', aboutText: 'Cleaning job' };
  const { HomeScreen } = load('src/features/feed/screens/HomeScreen.tsx', {
    'react-native': { StyleSheet: { create: value => value }, View: 'View' }, '@expo/vector-icons': {},
    '../../../shared/localization/LanguageContext': { useLanguage: () => ({ tr: text => text, t: {} }) },
    '../../../app/roleConfig': load('src/app/roleConfig.ts', {}),
    '../../auth/session/UserContext': { useUser: () => ({ user: { id: 'worker', token: 'token', accountType: 'Kasambahay' }, getFirstNameOnly: () => 'Worker' }) },
    '../../bookings/store/savedJobsStore': { useJobsActivity: () => ({
      isSaved: () => false, isApplied: id => f.store.isApplied(id), isClosed: () => false,
      refreshSavedFromBackend: async () => {},
    }) },
    '../../bookings/hooks/useJobApplication': { useJobApplication },
    '../../reviews/components/ReviewModal': { ReviewModal: 'ReviewModal' },
    '../../../shared/components/GreetingCard': { GreetingCard: 'GreetingCard' },
    '../../../shared/components/ScreenLayout': { ScreenLayout: 'ScreenLayout' },
    '../../../shared/ui/ErrorNotice': { ErrorNotice: 'ErrorNotice' },
    '../../profile/components/UserProfileModal': { UserProfileModal: 'UserProfileModal' },
    '../../chat/components/ChatDetailScreen': { ChatDetailScreen: 'ChatDetailScreen' },
    '../components/JobDetailSheet': { JobDetailSheet: 'JobDetailSheet' },
    '../components/HomeFeedControls': Object.fromEntries(['HomeFeedFilters', 'HomeFeedHeader', 'HomeFeedEmptyState', 'HomeFeedLoadingState'].map(key => [key, key])),
    '../components/FeedPostCard': { FeedPostCard: 'FeedPostCard' },
    '../hooks/useFeed': { useFeed: () => ({ posts: [post], isLoading: false, refresh: async () => {} }) },
    '../hooks/usePostUpdates': { usePostUpdates: () => ({ canUsePost: () => true, now: Date.now() }) },
    '../feedFilters': { matchesHomeFeedFilters: () => true },
    '../../../shared/theme/theme': { default: { colors: {} } },
  });
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const act = callback => renderer.flushSync(callback);
  act(() => renderer.updateContainer(React.createElement(HomeScreen), root, null)); renderer.flushPassiveEffects();
  t.after(() => { act(() => renderer.updateContainer(null, root, null)); renderer.flushPassiveEffects(); });
  const find = type => {
    const visit = node => node.type === type ? node : node.children.map(visit).find(Boolean);
    return visit(container);
  };
  act(() => find('FeedPostCard').props.onDetails());
  return { act, find, alerts };
}

test('Home Apply Now waits for persistence, blocks rapid taps, then opens chat without resending the backend message', async t => {
  const f = fixture(); const pending = deferred(); f.response = pending.promise;
  const screen = home(t, f);
  screen.act(() => { void screen.find('JobDetailSheet').props.onApply(); });
  assert.equal(screen.find('JobDetailSheet').props.isApplying, true);
  assert.equal(screen.find('ChatDetailScreen'), undefined);
  screen.act(() => { void screen.find('JobDetailSheet').props.onApply(); });
  assert.equal(f.calls.length, 1);
  pending.resolve(confirmed); await tick();
  assert.equal(f.store.getAppliedCount(), 1);
  assert.equal(screen.find('ChatDetailScreen').props.partnerId, 'employer');
  assert.equal(screen.find('ChatDetailScreen').props.initialMessage, '');
});

test('failed Home application keeps the detail sheet open and never opens chat or marks Applied', async t => {
  const f = fixture(); f.response = { success: false, error: 'This post has expired.' };
  const screen = home(t, f);
  screen.act(() => { void screen.find('JobDetailSheet').props.onApply(); }); await tick();
  assert.equal(screen.find('ChatDetailScreen'), undefined);
  assert.equal(screen.find('JobDetailSheet').props.visible, true);
  assert.equal(f.store.getAppliedCount(), 0);
  assert.deepEqual(screen.alerts[0], ['Application not confirmed', 'This post has expired.']);
});

test('rapid repeated taps share one submission and do not produce another navigation result', async () => {
  const f = fixture(); const pending = deferred(); f.response = pending.promise;
  const first = f.store.applyToJob(job, 'token');
  assert.equal(await f.store.applyToJob(job, 'token'), null);
  assert.equal(f.calls.length, 1);
  assert.equal(f.store.getAppliedCount(), 0);
  pending.resolve(confirmed); await first;
  assert.equal(f.store.getAppliedCount(), 1);
});

test('failure and malformed success never mark a job applied and allow a retry', async () => {
  const f = fixture();
  for (const response of [{ success: false, error: 'The post has expired.' }, { success: true }]) {
    f.response = response;
    await assert.rejects(f.store.applyToJob(job, 'token'));
    assert.equal(f.store.getAppliedCount(), 0);
  }
  f.response = confirmed;
  await f.store.applyToJob(job, 'token');
  assert.equal(f.store.getAppliedCount(), 1);
});

test('a lost-response retry can restore an existing server application without resubmitting chat', async () => {
  const f = fixture();
  f.response = { ...confirmed, already_applied: true };
  assert.deepEqual(await f.store.applyToJob(job, 'token'), { created: false });
  assert.equal(f.store.getAppliedCount(), 1);
});

test('an earlier background refresh cannot erase a newly submitted application', async () => {
  const f = fixture(); await f.store.initForUser('worker', 'token');
  const older = deferred(); f.applications = older.promise;
  const refresh = f.store.refreshFromBackend('token');
  await f.store.applyToJob(job, 'token');
  older.resolve([]); await refresh;
  assert.equal(f.store.getAppliedCount(), 1);
  f.applications = [];
  await f.store.refreshFromBackend('token');
  assert.equal(f.store.getAppliedCount(), 0, 'A fresh authoritative snapshot can remove resolved applications');
});

test('logout and account switch discard an application response from the previous session', async () => {
  const f = fixture(); await f.store.initForUser('worker', 'token');
  const pending = deferred(); f.response = pending.promise;
  const application = f.store.applyToJob(job, 'token');
  f.store.clearStore(); await f.store.initForUser('other-worker', 'other-token');
  pending.resolve(confirmed);
  assert.equal(await application, null);
  assert.equal(f.store.getAppliedCount(), 0);
});

test('application API requests the server-posted rate and preserves repeat-success metadata', async () => {
  const requests = [];
  const api = load('src/features/bookings/api/bookingApi.ts', {
    '../../../shared/api/config': { API_BASE_URL: 'https://test.local' },
    '../../../shared/api/httpClient': { requestResponse: async (...args) => {
      requests.push(args);
      return { ok: true, json: async () => ({ proposal: confirmed.proposal, already_applied: true }) };
    } },
  });
  const result = await api.applyToJobPost('token', 'job-one');
  assert.equal(result.success, true);
  assert.equal(result.already_applied, true);
  assert.equal(requests[0][0], 'https://test.local/api/v1/booking/job-one/proposals/');
  assert.deepEqual(JSON.parse(requests[0][1].body), {
    apply_at_posted_rate: true, message: 'I am interested in this job position',
  });
});
