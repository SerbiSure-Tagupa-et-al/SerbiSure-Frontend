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
  resetTextContent() {}, finalizeInitialChildren: () => false, clearContainer(parent) { parent.children = []; },
  scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1, detachDeletedInstance() {},
});
function load(filename, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', filename), 'utf8'), {
    fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (name === 'react') return { ...React, default: React };
    if (name in mocks) return mocks[name];
    // Load the real shared pricing code, retaining strict handling of other imports.
    if (name.endsWith('/utils/rate')) return load('src/shared/utils/rate.ts');
    if (name.endsWith('/posting/validation') || name === '../validation') return load('src/features/posting/validation.ts');
    if (name === './postingConfig') return load('src/features/posting/postingConfig.ts');
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); renderer.flushPassiveEffects(); };
const jwt = (role, status, version = 1, id = role) => `header.${Buffer.from(JSON.stringify({ user_id: id, account_type: role, verification_status: status, version })).toString('base64url')}.signature`;
const content = node => node.text || node.children.map(content).join('');
function screen(t, role, withProfile = false, history = null) {
  const requests = [], alerts = [], submissions = [], listeners = new Set();
  const historyRequests = [];
  const native = { StyleSheet: { create: value => value }, Platform: { OS: 'android' }, Alert: { alert: (...args) => alerts.push(args) },
    AppState: { addEventListener: (_event, callback) => { listeners.add(callback); return { remove: () => listeners.delete(callback) }; } } };
  for (const name of ['Text', 'View', 'Pressable', 'ScrollView', 'TextInput', 'KeyboardAvoidingView', 'ActivityIndicator']) native[name] = name;
  native.Modal = props => props.visible ? React.createElement('Modal', props, props.children) : null;
  const context = load('src/features/auth/session/UserContext.tsx', {
    'react-native': native, '../../bookings/store/savedJobsStore': { savedJobsStore: { initForUser() {}, clearStore() {} } },
    '../../verification/api/verificationApi': { fetchVerificationStatus: token => { const request = { ...deferred(), token }; requests.push(request); return request.promise; } },
  });
  let session, profile;
  const useProfile = withProfile ? load('src/features/profile/hooks/useProfile.ts', {
    'react-native': native,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../../../shared/localization/LanguageContext': { useLanguage: () => ({ tr: text => text }) },
    '../../auth/session/UserContext': context,
    '../../../app/roleConfig': load('src/app/roleConfig.ts'),
    '../profileConfig': { localizeProfileCopy: () => ({}) },
    '../worker/useWorkerProfile': { useWorkerProfile: () => ({ refreshWorkerProfile: async () => {} }) },
    '../../reviews/api/reviewApi': { fetchReceivedReviews: async () => [], fetchReviewSummary: async () => null },
    '../api/accountApi': {
      fetchUserAbout: async () => '', fetchUserTags: async () => [], fetchContactPrivacy: async () => false,
      fetchUserSocialLinks: async () => ({ social_links: [] }),
      ...(history ? { fetchWorkerWorkHistory: async (...args) => { historyRequests.push(args); return history; } } : {}),
    },
    '../../notifications/api/notificationsApi': { fetchNotifications: async () => ({ unread_count: 0 }) },
    '../../bookings/api/bookingApi': { fetchMyPosts: async () => [] },
    '../../feed/hooks/usePostUpdates': { usePostUpdates: () => ({ now: Date.now() }) },
  }).useProfile : null;
  const post = { booking_id: 'post', rate_amount: '800', rate_period: 'day', viewer_proposal: null };
  const { PublicPostsSection } = load('src/features/profile/components/PublicPostsSection.tsx', {
    'react-native': native, 'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) }, '@expo/vector-icons': { Ionicons: 'Icon' },
    '../../../shared/localization/LanguageContext': { useLanguage: () => ({ tr: text => text }) }, '../../auth/session/UserContext': context,
    '../../bookings/api/bookingApi': { submitBookingProposal: async (...args) => { submissions.push(args); return { success: true, proposal: { proposal_id: 'proposal' } }; } },
    '../../reviews/components/ReviewModal': { ReviewModal: 'ReviewModal' },
    './PendingPostCard': { PendingPostCard: props => React.createElement('View', {}, props.children) }, '../styles': { profileStyles: {} },
  });
  function Entry() {
    session = context.useUser();
    if (useProfile) {
      profile = useProfile({});
      return React.createElement('Text', {}, profile.getFullName());
    }
    return React.createElement(PublicPostsSection, { posts: [post], loading: false, error: null, token: session.user.token,
      ownerId: 'other', ownerRole: role === 'Homeowner' ? 'Kasambahay' : 'Homeowner', onRefresh() {}, onSubmitted() {} });
  }
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const act = callback => renderer.flushSync(callback);
  const render = token => { act(() => renderer.updateContainer(React.createElement(context.UserProvider, { token }, React.createElement(Entry)), root, null)); renderer.flushPassiveEffects(); };
  const unmount = () => { act(() => renderer.updateContainer(null, root, null)); renderer.flushPassiveEffects(); };
  t.after(unmount);
  const nodes = () => { const result = []; const visit = node => { result.push(node); node.children.forEach(visit); }; visit(container); return result; };
  const press = label => act(() => nodes().find(node => node.type === 'Pressable' && (node.props.accessibilityLabel === label || content(node) === label)).props.onPress());
  return { render, unmount, act, nodes, press, requests, alerts, submissions, historyRequests,
    apply: () => press(role === 'Homeowner' ? 'Offer to Hire' : 'Submit a Bid'),
    foreground: () => act(() => listeners.forEach(callback => callback('active'))),
    get context() { return session; }, get profile() { return profile; }, get listenerCount() { return listeners.size; } };
}

const namedJwt = (role, version = 1) => `header.${Buffer.from(JSON.stringify({
  user_id: role, account_type: role, verification_status: 'Verified', version,
  first_name: 'Jerry', middle_name: 'Testing', last_name: 'Doloriel', date_of_birth: '1988-06-22',
})).toString('base64url')}.signature`;

test('own profiles load verified history for both roles on mount and pull-to-refresh', async t => {
  for (const role of ['Homeowner', 'Kasambahay']) {
    const history = { user_id: role, account_type: role,
      summary: { completed_jobs_count: 2, recommended_count: 1, repeat_employers_count: 1 }, jobs: [] };
    const app = screen(t, role, true, history);
    app.render(jwt(role, 'Verified'));
    await tick();
    assert.ok(app.historyRequests.length > 0);
    assert.deepEqual(app.profile.workHistory, history);
    const before = app.historyRequests.length;
    const refresh = app.profile.handleRefresh();
    for (const request of app.requests) request.resolve({ overall_status: 'Verified', documents: [] });
    await refresh;
    await tick();
    assert.ok(app.historyRequests.length > before);
    assert.equal(app.profile.totalReviews, 0);
    assert.equal(app.profile.positivePercentage, null);
  }
});

test('expiry and renewal refresh remove stale green badges despite historical approvals', async t => {
  const app = screen(t, 'Kasambahay', true);
  app.render(jwt('Kasambahay', 'Verified'));
  app.requests[0].resolve({ overall_status: 'Unverified', renewal_required: true, documents: [
    { document_type: 'nbi_clearance', verification_status: 'Verified' },
    { document_type: 'police_clearance', verification_status: 'Verified' },
  ] }); await tick();
  assert.equal(app.profile.isVerified, false);
  assert.equal(app.profile.verificationLabel, 'Renewal needed');
  assert.equal(app.profile.effectiveVerificationStatus, 'Unverified');
  app.foreground();
  app.requests[1].resolve({ overall_status: 'Pending', renewal_required: false, renewal_pending: true }); await tick();
  assert.equal(app.profile.isVerified, false);
  assert.equal(app.profile.verificationLabel, 'Renewal under review');
  app.foreground();
  app.requests[2].resolve({ overall_status: 'Verified', renewal_required: false, renewal_pending: false }); await tick();
  assert.equal(app.profile.isVerified, true);
  assert.equal(app.profile.verificationLabel, 'Verified');
});

for (const role of ['Homeowner', 'Kasambahay']) {
  test(`${role}: pull-to-refresh updates the displayed name and birthdate without logging out`, async t => {
    const app = screen(t, role, true);
    app.render(namedJwt(role));
    assert.equal(app.context.getFullName(), 'Jerry Testing Doloriel');
    assert.equal(app.requests.length, 1, 'Profile shares the startup request');
    app.requests[0].resolve({ overall_status: 'Verified', user_info: {
      first_name: 'Jerry', middle_name: 'Testing', last_name: 'Doloriel', date_of_birth: '1988-06-22',
    } }); await tick();

    const refresh = app.profile.handleRefresh();
    assert.equal(app.requests.length, 2);
    app.requests[1].resolve({ overall_status: 'Verified', user_info: {
      first_name: 'Jeremiah', middle_name: '123', last_name: 'Doloriel', date_of_birth: '1988-06-23',
    } });
    await refresh; await tick();
    assert.equal(content(app.nodes().find(node => node.type === 'Text')), 'Jeremiah 123 Doloriel');
    assert.equal(app.context.user.dateOfBirth, '1988-06-23');
    assert.equal(app.profile.isRefreshing, false);

    app.render(namedJwt(role, 2));
    assert.equal(app.context.getFullName(), 'Jeremiah 123 Doloriel', 'Token renewal cannot restore stale login names');
    assert.equal(app.context.user.dateOfBirth, '1988-06-23');
    app.requests[2].reject(new Error('offline')); await tick();
    assert.equal(app.context.getFullName(), 'Jeremiah 123 Doloriel');

    app.foreground();
    app.requests[3].resolve({ overall_status: 'Verified', user_info: {
      first_name: 'Jeremiah', middle_name: null, last_name: 'Doloriel', date_of_birth: null,
    } }); await tick();
    assert.equal(app.context.getFullName(), 'Jeremiah Doloriel');
    assert.equal(app.context.user.dateOfBirth, undefined);

    app.foreground();
    app.requests[4].resolve({ overall_status: 'Verified' }); await tick();
    assert.equal(app.context.getFullName(), 'Jeremiah Doloriel', 'Missing identity data preserves the current name');
  });
}

test('late identity refresh cannot restore the old account after switching accounts or logging out', async t => {
  const app = screen(t, 'Homeowner', true);
  app.render(namedJwt('Homeowner'));
  app.render(jwt('Homeowner', 'Pending', 1, 'another-owner'));
  app.requests[0].resolve({ overall_status: 'Verified', user_info: { first_name: 'Old account' } }); await tick();
  assert.equal(app.context.user.id, 'another-owner');
  assert.equal(app.context.user.firstName, '');
  app.render(null);
  app.requests[1].resolve({ overall_status: 'Verified', user_info: { first_name: 'Logged out account' } }); await tick();
  assert.equal(app.context.user.token, null);
  assert.equal(app.context.user.firstName, '');
});

for (const role of ['Homeowner', 'Kasambahay']) {
  test(`${role}: fresh login keeps the token verification claim and immediate action waits for the live status`, async t => {
    const app = screen(t, role); app.render(jwt(role, 'Verified'));
    assert.equal(app.context.user.verificationStatus, 'Verified');
    assert.equal(app.requests.length, 1);
    app.apply();
    assert.equal(app.requests.length, 1, 'Action shares the startup request');
    assert.equal(app.nodes().filter(node => node.type === 'Modal').length, 0);
    assert.equal(app.alerts.length, 0);
    app.requests[0].resolve({ overall_status: 'Verified' }); await tick();
    assert.equal(app.context.user.verificationStatus, 'Verified');
    assert.equal(app.nodes().filter(node => node.type === 'Modal').length, 1);
    app.press(role === 'Homeowner' ? 'Send Offer' : 'Send Application'); await tick();
    assert.equal(app.submissions.length, 1);
  });

  test(`${role}: restored session refreshes a stale verification claim without mounting Profile`, async t => {
    const values = new Map();
    const mocks = {
      'expo-secure-store': { getItemAsync: async key => values.get(key) || null, setItemAsync: async (key, value) => values.set(key, value), deleteItemAsync: async key => values.delete(key) },
      '../api/config': { API_BASE_URL: 'https://test.local', DEFAULT_TIMEOUT_MS: 1000 },
    };
    await load('src/shared/auth/session.ts', mocks).startSession({ access: jwt(role, 'Pending'), refresh: 'saved-refresh' });
    const restored = load('src/shared/auth/session.ts', mocks);
    const originalFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({ access: jwt(role, 'Pending', 2), refresh: 'new-refresh' }), { status: 200 });
    let tokens;
    try { tokens = await restored.restoreSession(); } finally { global.fetch = originalFetch; }
    const app = screen(t, role); app.render(tokens.access);
    assert.equal(app.context.user.verificationStatus, 'Pending');
    app.apply(); void app.context.refreshVerificationStatus();
    assert.equal(app.requests.length, 1);
    assert.deepEqual(app.alerts, []);
    app.requests[0].resolve({ overall_status: 'Verified' }); await tick();
    assert.equal(app.context.user.verificationStatus, 'Verified');
    assert.ok(app.nodes().some(node => node.type === 'Modal'));
  });

  test(`${role}: token rotation preserves live status and foreground refresh applies revocation`, async t => {
    const app = screen(t, role); app.render(jwt(role, 'Unverified'));
    app.requests[0].resolve({ overall_status: 'Verified' }); await tick();
    app.render(jwt(role, 'Unverified', 2));
    assert.equal(app.context.user.verificationStatus, 'Verified');
    app.requests[1].resolve({ overall_status: 'Verified' }); await tick();
    app.foreground(); app.apply();
    assert.equal(app.requests.length, 3);
    app.requests[2].resolve({ overall_status: 'Rejected' }); await tick();
    assert.equal(app.context.user.verificationStatus, 'Rejected');
    assert.equal(app.alerts.at(-1)[0], 'Verification Required');
    assert.ok(!app.nodes().some(node => node.type === 'Modal'));
  });

  test(`${role}: actual Pending, Rejected and Unverified accounts remain blocked despite an old Verified claim`, async t => {
    const app = screen(t, role);
    for (const [index, status] of ['Pending', 'Rejected', 'Unverified'].entries()) {
      app.render(jwt(role, 'Verified', index + 1)); app.apply();
      app.requests[index].resolve({ overall_status: status }); await tick();
      assert.equal(app.context.user.verificationStatus, status);
      assert.equal(app.alerts.at(-1)[0], 'Verification Required');
      assert.ok(!app.nodes().some(node => node.type === 'Modal'));
    }
    assert.equal(app.submissions.length, 0);
  });

  test(`${role}: offline or malformed status is retryable and never claims the account is unverified`, async t => {
    const app = screen(t, role); app.render(jwt(role, undefined)); app.apply();
    app.requests[0].reject(new Error('Network request failed')); await tick();
    assert.equal(app.alerts.at(-1)[0], 'Verification check unavailable');
    assert.equal(app.context.user.verificationStatus, undefined);
    app.apply(); app.requests[1].resolve({ unexpected: true }); await tick();
    assert.equal(app.alerts.at(-1)[0], 'Verification check unavailable');
    assert.ok(!app.nodes().some(node => node.type === 'Modal'));
    app.apply(); app.requests[2].resolve({ overall_status: 'Verified' }); await tick();
    assert.ok(app.nodes().some(node => node.type === 'Modal'));
  });
}

test('logout and account changes discard late verification responses and pending actions', async t => {
  const app = screen(t, 'Homeowner'); app.render(jwt('Homeowner', 'Verified'));
  app.apply();
  app.render(null);
  app.render(jwt('Homeowner', 'Pending', 1, 'another-owner'));
  app.requests[0].resolve({ overall_status: 'Verified' }); await tick();
  assert.equal(app.context.user.id, 'another-owner');
  assert.equal(app.context.user.verificationStatus, 'Pending');
  assert.ok(!app.nodes().some(node => node.type === 'Modal'));
  app.requests[1].resolve({ overall_status: 'Unverified' }); await tick();
  assert.equal(app.context.user.verificationStatus, 'Unverified');
  app.unmount(); assert.equal(app.listenerCount, 0);
});
