const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const Reconciler = require('react-reconciler');
const { DefaultEventPriority } = require('react-reconciler/constants');

function load(file, mocks = {}, timers = global) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'setTimeout', 'clearTimeout', source)(name => {
    if (name === 'react') return { ...React, default: React };
    if (name in mocks) return mocks[name];
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports, timers.setTimeout, timers.clearTimeout);
  return module.exports;
}
const append = (parent, child) => { parent.children = parent.children.filter(item => item !== child); parent.children.push(child); };
const remove = (parent, child) => { parent.children = parent.children.filter(item => item !== child); };
const insertBefore = (parent, child, before) => {
  remove(parent, child);
  parent.children.splice(parent.children.indexOf(before), 0, child);
};
const renderer = Reconciler({
  supportsMutation: true, isPrimaryRenderer: true, now: Date.now,
  getRootHostContext: () => null, getChildHostContext: () => null, getCurrentEventPriority: () => DefaultEventPriority,
  prepareForCommit: () => null, resetAfterCommit() {}, shouldSetTextContent: () => false,
  createInstance: (type, props) => ({ type, props, children: [] }), createTextInstance: text => ({ text, children: [] }), getPublicInstance: instance => instance,
  appendInitialChild: append, appendChild: append, appendChildToContainer: append, removeChild: remove, removeChildFromContainer: remove,
  insertBefore, insertInContainerBefore: insertBefore,
  prepareUpdate: () => true, commitUpdate(instance, _payload, _type, _old, props) { instance.props = props; }, commitTextUpdate(instance, _old, text) { instance.text = text; },
  finalizeInitialChildren: () => false, clearContainer(parent) { parent.children = []; },
  scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1, detachDeletedInstance() {},
});
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); renderer.flushPassiveEffects(); };
const content = node => node.text || node.children.map(content).join('');
function screen(t) {
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const act = callback => renderer.flushSync(callback);
  const render = element => { act(() => renderer.updateContainer(element, root, null)); renderer.flushPassiveEffects(); };
  t.after(() => render(null));
  return { act, render, all(type) { const nodes = []; const visit = node => { if (node.type === type) nodes.push(node); node.children.forEach(visit); }; visit(container); return nodes; } };
}
const rules = load('src/features/bookings/postAvailability.ts', { './engagementForm': load('src/features/bookings/engagementForm.ts') });
const language = { useLanguage: () => ({ tr: text => text, formatDate: stamp => stamp }) };
const post = { booking_id: 'old-post', booking_type: 'short_term', service_category: ['Cleaning'], work_days: ['M'],
  rate_amount: '800', rate_period: 'day', start_time: '2026-10-29T00:00:00Z', booking_status: 'Pending', post_status: 'Expired' };

test('Expired Schedule uses Philippine calendar days and never makes a Pending post unavailable', () => {
  const original = { ...post, post_status: 'Available', start_time: '2026-10-29T00:00:00Z' };
  assert.equal(rules.isScheduleExpired(original, Date.parse('2026-10-29T15:59:59Z')), false);
  assert.equal(rules.isScheduleExpired(original, Date.parse('2026-10-29T16:00:00Z')), true);
  assert.equal(rules.isPostAvailable(original, Date.parse('2030-01-01T00:00:00Z')), true);
  assert.equal(rules.isAcceptanceExpired({ startTime: '2026-10-30T02:00:00Z' }, Date.parse('2026-10-30T02:00:00Z')), true);
  assert.equal(rules.isAcceptanceExpired({ startTime: '2026-10-30T02:00:01Z' }, Date.parse('2026-10-30T02:00:00Z')), false);
});

test('accept API refuses a passed offer without a request, but still permits declining it', async () => {
  const calls = [];
  const api = load('src/features/chat/api/bookingOffersApi.ts', {
    '../../bookings/postAvailability': rules,
    '../../../shared/api/httpClient': { requestResponse: async (...args) => {
      calls.push(args); return { ok: true, json: async () => ({ proposal: { status: 'Rejected' } }) };
    } },
  });
  const card = { bookingId: 'old-post', proposalId: 'application', canRespond: true, startTime: '2000-01-01T00:00:00Z' };
  await assert.rejects(api.respondToBookingOffer('token', card, 'accept'), /Please send a new offer in chat/);
  assert.equal(calls.length, 0);
  await api.respondToBookingOffer('token', card, 'reject');
  assert.equal(calls.length, 1);
});

test('feed requests ignore legacy price sorting and keep the server creation order', async () => {
  const api = load('src/features/feed/api/feedApi.ts', { '../../../shared/api/httpClient': {} });
  const url = api.buildFeedPath({ categories: [], bookingType: null, maxRate: null, location: '', sortBy: 'rate_asc' });
  assert.equal(url, '/api/v1/booking/feed/');
});

test('expiry uses the exact start instant for short/long posts; contract and application history stay distinct', () => {
  const now = Date.parse('2026-10-30T00:00:00Z');
  for (const booking_type of ['short_term', 'long_term']) {
    const upcoming = { booking_type, booking_status: 'Pending', post_status: 'Available', start_time: new Date(now + 1).toISOString() };
    assert.equal(rules.isPostAvailable(upcoming, now), true);
    assert.equal(rules.postDisplayStatus(upcoming, now + 1), 'Available');
    assert.equal(rules.isScheduleExpired(upcoming, now + 86400000), true);
    assert.equal(rules.applicationLabel(upcoming, now + 1), 'Application sent');
  }
  for (const [booking_status, label] of [['Accepted', 'Booked'], ['InProgress', 'Ongoing'], ['Completed', 'Completed'], ['Cancelled', 'Cancelled']]) {
    assert.equal(rules.postDisplayStatus({ ...post, post_status: undefined, booking_status }, now), label);
    assert.equal(rules.isPostAvailable({ ...post, post_status: label }, now), false);
  }
  assert.equal(rules.applicationLabel({ ...post, application_status: 'accepted' }, now), 'Selected');
  assert.equal(rules.applicationLabel({ ...post, application_status: 'not_selected' }, now), 'Closed / Not Selected');
});

test('open screens react immediately to booking events, refresh on resume/reconnect and expire without polling', t => {
  let now = Date.parse('2026-10-30T00:00:00Z'), id = 0, event, appState, refreshes = 0, invalidations = 0, removed = 0;
  t.mock.method(Date, 'now', () => now);
  const tasks = new Map();
  const timers = { setTimeout: (fn, delay) => { const key = ++id; tasks.set(key, { fn, at: now + delay }); return key; }, clearTimeout: key => tasks.delete(key) };
  const { usePostUpdates } = load('src/features/feed/hooks/usePostUpdates.ts', {
    'react-native': { AppState: { addEventListener: (_type, callback) => { appState = callback; return { remove: () => removed++ }; } } },
    '../../../shared/realtime': { realtime: { subscribe: callback => { event = callback; return () => removed++; } } },
    '../feedCache': { clearExploreFeedCache: () => invalidations++ }, '../../bookings/postAvailability': rules,
  }, timers);
  const view = screen(t);
  const listing = { id: 'public-post', post_status: 'Available', start_time: new Date(now + 1000).toISOString() };
  let state;
  function Entry() { state = usePostUpdates([listing], () => refreshes++); return null; }
  view.render(React.createElement(Entry));
  const advance = ms => {
    now += ms;
    view.act(() => { for (const [key, task] of [...tasks]) if (task.at <= now) { tasks.delete(key); task.fn(); } });
    renderer.flushPassiveEffects();
  };
  assert.equal(state.canUsePost(listing), true);
  view.act(() => event({ type: 'feed.changed', booking_id: listing.id, available: false }));
  assert.equal(state.canUsePost(listing), false);
  view.act(() => { event({ type: 'sync' }); appState('active'); });
  advance(150);
  assert.equal(refreshes, 1); // Bursts coalesce into one request.
  view.act(() => event({ type: 'feed.changed', booking_id: listing.id, available: true }));
  advance(150);
  assert.equal(state.canUsePost(listing), true);
  advance(710);
  assert.equal(state.canUsePost(listing), true);
  assert.equal(refreshes, 2);
  advance(86400000);
  assert.equal(rules.isScheduleExpired(listing, state.now), true);
  assert.equal(state.canUsePost(listing), true);
  assert.equal(refreshes, 3);
  assert.ok(invalidations >= 3);
  view.render(null);
  assert.equal(removed, 2);
  assert.equal(tasks.size, 0);
});

test('own history keeps lifecycle states and only the cancel action, with no rescheduling', t => {
  const { OwnPostsSection } = load('src/features/profile/components/OwnPostsSection.tsx', {
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../../bookings/engagementForm': load('src/features/bookings/engagementForm.ts'),
    '../../bookings/workSetup': load('src/features/bookings/workSetup.ts'),
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', Alert: { alert() {} } },
    '../../../shared/localization/LanguageContext': language,
    '../../bookings/api/bookingApi': { formatBookingAddress: () => 'Pagatpat' }, '../../bookings/postAvailability': rules,
    '../../bookings/components/RepostModal': { RepostModal: 'RepostModal' },
    '../../bookings/components/ScheduleBadge': { ScheduleBadge: 'ScheduleBadge' },
  });
  const view = screen(t);
  view.render(React.createElement(OwnPostsSection, { posts: [post, ...['Booked', 'Ongoing', 'Completed', 'Cancelled'].map((post_status, i) => ({ ...post, booking_id: String(i), post_status }))],
    token: 'token', now: Date.now(), loading: false, error: null, onRefresh() {} }));
  const buttons = view.all('Pressable').filter(node => ['Cancel Post', 'Reschedule'].includes(node.props.accessibilityLabel));
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].props.accessibilityLabel || content(buttons[0]), 'Cancel Post');
  assert.equal(view.all('RepostModal').length, 0);
  assert.equal(view.all('ScheduleBadge').length, 0);
});

test('Cancel Post requires confirmation and blocks duplicate submissions before updating owner history', async t => {
  const alerts = [], calls = [];
  let resolve, refreshes = 0;
  const { OwnPostsSection } = load('src/features/profile/components/OwnPostsSection.tsx', {
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 0 }) },
    '../../bookings/engagementForm': load('src/features/bookings/engagementForm.ts'),
    '../../bookings/workSetup': load('src/features/bookings/workSetup.ts'),
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ActivityIndicator: 'ActivityIndicator', Alert: { alert: (...args) => alerts.push(args) } },
    '../../../shared/localization/LanguageContext': language,
    '../../bookings/api/bookingApi': { formatBookingAddress: () => 'Pagatpat', cancelBooking: (...args) => {
      calls.push(args); return new Promise(yes => { resolve = yes; });
    } },
    '../../bookings/postAvailability': rules,
    '../../bookings/components/RepostModal': { RepostModal: 'RepostModal' },
    '../../bookings/components/ScheduleBadge': { ScheduleBadge: 'ScheduleBadge' },
  });
  const view = screen(t);
  view.render(React.createElement(OwnPostsSection, { posts: [post], token: 'token', now: Date.now(), loading: false, error: null, onRefresh: () => refreshes++ }));
  view.act(() => view.all('Pressable').find(node => (node.props.accessibilityLabel || content(node)) === 'Cancel Post').props.onPress());
  assert.equal(calls.length, 0);
  const confirm = alerts[0][2].find(button => button.text === 'Cancel Post').onPress;
  view.act(() => { confirm(); confirm(); });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][2], { reason: 'Other', expected_points: 0, pending_only: true });
  resolve({ success: true }); await tick();
  assert.equal(refreshes, 1);
  assert.equal(view.all('Pressable').filter(node => ['Cancel Post', 'Reschedule'].includes(node.props.accessibilityLabel)).length, 0);
  assert.ok(view.all('Text').some(node => content(node) === 'Cancelled'));
});

function ownDetailsScreen(t, options = {}) {
  const alerts = [], calls = [];
  let refreshes = 0;
  const messages = load('src/shared/localization/messages.ts');
  const copy = { useLanguage: () => ({ tr: value => messages.translateMessage(options.language || 'English', value),
    formatDate: (value, style) => messages.formatLocalizedDate(options.language || 'English', value, style) }) };
  const native = { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator',
    StyleSheet: { create: value => value, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } },
    Modal: props => props.visible ? React.createElement('Modal', props, props.children) : null,
    Alert: { alert: (...args) => alerts.push(args) } };
  const { ScheduleBadge } = load('src/features/bookings/components/ScheduleBadge.tsx', {
    'react-native': native, '../../../shared/localization/LanguageContext': copy, '../postAvailability': rules,
    '../../../shared/theme/theme': { default: { typography: { fontFamily: { secondaryMedium: 'Geist-Medium' } } } },
  });
  const { OwnPostsSection } = load('src/features/profile/components/OwnPostsSection.tsx', {
    'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ bottom: 12 }) },
    '../../../shared/localization/LanguageContext': copy, '../../bookings/postAvailability': rules,
    '../../bookings/engagementForm': load('src/features/bookings/engagementForm.ts'),
    '../../bookings/workSetup': load('src/features/bookings/workSetup.ts'),
    '../../bookings/components/ScheduleBadge': { ScheduleBadge },
    '../../bookings/components/RepostModal': { RepostModal: 'RepostModal' },
    '../../bookings/api/bookingApi': { formatBookingAddress: value => value.full_address || 'Full address not provided',
      cancelBooking: (...args) => { calls.push(args); return options.cancel ? options.cancel(...args) : Promise.resolve({ success: true }); } },
  });
  const item = { ...post, work_setup: 'stay_out', end_time: '2026-10-29T09:00:00Z',
    daily_start_time: '08:00:00', daily_end_time: '17:00:00', work_days: ['Th'],
    full_address: 'Block 12, Lot 3, Brgy. Canito-an, Cagayan de Oro, 9000', special_instruction: 'Please bring gloves.', ...options.post };
  const view = screen(t);
  let props = { posts: [item], token: 'token', now: Date.parse('2026-10-31T04:00:00Z'), loading: false, error: null,
    onRefresh: () => refreshes++, ...options.props };
  const render = patch => { props = { ...props, ...patch }; view.render(React.createElement(OwnPostsSection, props)); };
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const modal = () => view.all('Modal')[0];
  const actions = () => modal() ? descendants(modal()).filter(node => node.type === 'Pressable') : [];
  const card = () => view.all('Pressable').find(node => node.props.accessibilityLabel?.startsWith(messages.translateMessage(options.language || 'English', 'Post Details') + ':'));
  render();
  return { ...view, render, alerts, calls, item, modal, card, actions, text: () => modal() ? content(modal()) : '',
    open: () => view.act(() => card().props.onPress()), get refreshes() { return refreshes; } };
}

test('tapping an own post opens essential details without profile or technical clutter and Close dismisses it', t => {
  const view = ownDetailsScreen(t);
  assert.equal(view.modal(), undefined);
  view.open();
  assert.equal(view.modal().props.animationType, 'slide');
  assert.equal(view.modal().props.transparent, true);
  for (const expected of ['Cleaning', 'Available', '₱ 800.00 / day', 'Short-term', 'Stay-out',
    '08:00 AM – 05:00 PM', view.item.full_address, 'Please bring gloves.']) {
    assert.ok(view.text().includes(expected), expected);
  }
  assert.doesNotMatch(view.text(), /reviews|rating|sentiment|Apply|Message|old-post|T00:00:00Z|Expired|Work Dates|Work days|Reschedule|Oct 29/i);
  view.act(() => view.actions().filter(node => node.props.accessibilityLabel === 'Close').at(-1).props.onPress());
  assert.equal(view.modal(), undefined);
  view.open();
  view.act(() => view.modal().props.onRequestClose());
  assert.equal(view.modal(), undefined);
});

test('trash stops event propagation and neither card nor details offers rescheduling', t => {
  const view = ownDetailsScreen(t);
  let stops = 0;
  const event = { stopPropagation() { stops++; } };
  view.act(() => view.all('Pressable').find(node => node.props.accessibilityLabel === 'Cancel Post').props.onPress(event));
  assert.equal(stops, 1);
  assert.equal(view.alerts.length, 1);
  assert.equal(view.modal(), undefined);
  view.open();
  assert.equal(view.actions().some(node => node.props.accessibilityLabel === 'Reschedule'), false);
  assert.equal(view.all('RepostModal').length, 0);
});

test('details cancellation reuses confirmation, blocks duplicates, and updates the visible status', async t => {
  let resolve;
  const view = ownDetailsScreen(t, { cancel: () => new Promise(yes => { resolve = yes; }) });
  view.open();
  view.act(() => view.actions().find(node => node.props.accessibilityLabel === 'Cancel Post').props.onPress());
  assert.equal(view.calls.length, 0);
  const confirm = view.alerts[0][2].find(button => button.style === 'destructive').onPress;
  view.act(() => { confirm(); confirm(); });
  assert.equal(view.calls.length, 1);
  assert.deepEqual(view.calls[0][2], { reason: 'Other', expected_points: 0, pending_only: true });
  assert.equal(view.actions().find(node => node.props.accessibilityLabel === 'Cancel Post').props.disabled, true);
  resolve({ success: true }); await tick();
  assert.match(view.text(), /Cancelled/);
  assert.equal(view.actions().some(node => ['Cancel Post', 'Reschedule'].includes(node.props.accessibilityLabel)), false);
  assert.equal(view.refreshes, 1);
});

test('failed cancellation leaves the sheet open and allows retry; refreshed records update or dismiss it', async t => {
  const view = ownDetailsScreen(t, { cancel: async () => ({ success: false, error: 'Please retry later.' }) });
  view.open();
  view.act(() => view.actions().find(node => node.props.accessibilityLabel === 'Cancel Post').props.onPress());
  view.act(() => view.alerts[0][2].find(button => button.style === 'destructive').onPress()); await tick();
  assert.match(view.text(), /Available/);
  assert.equal(view.actions().find(node => node.props.accessibilityLabel === 'Cancel Post').props.disabled, false);
  assert.equal(view.alerts.at(-1)[1], 'Please retry later.');
  view.render({ posts: [{ ...view.item, post_status: 'Booked', booking_status: 'Accepted' }] });
  assert.match(view.text(), /Booked/);
  assert.equal(view.actions().some(node => ['Cancel Post', 'Reschedule'].includes(node.props.accessibilityLabel)), false);
  view.render({ posts: [] });
  assert.equal(view.modal(), undefined);
});

test('own details hide legacy calendar terms and keep honest missing-hour fallbacks', t => {
  const view = ownDetailsScreen(t, { post: { start_time: '2026-10-28T16:00:00Z' } });
  view.open();
  assert.doesNotMatch(view.text(), /Oct 29|Same day|Work Dates|Work days|Expired/);
  assert.match(view.text(), /08:00 AM – 05:00 PM/);
  view.render({ posts: [{ ...view.item, end_time: '2026-11-05T09:00:00Z', special_instruction: ' ' }] });
  assert.doesNotMatch(view.text(), /Oct 29|Nov 5/);
  assert.doesNotMatch(view.text(), /About \/ Instructions/);
  view.render({ posts: [{ ...view.item, booking_type: 'long_term', end_time: null }] });
  assert.doesNotMatch(view.text(), /Ongoing \(No end date\)/);
  view.render({ posts: [{ ...view.item, end_time: undefined, daily_start_time: null, daily_end_time: null, work_days: [] }] });
  assert.doesNotMatch(view.text(), /Date unavailable/);
  assert.match(view.text(), /Not provided/);
  assert.doesNotMatch(view.text(), /Ongoing|Invalid Date|undefined|NaN/);
});

test('own post details use translated labels and omit management actions without a token', t => {
  const view = ownDetailsScreen(t, { language: 'Tagalog', props: { token: null } });
  view.open();
  assert.match(view.text(), /Oras ng trabaho/);
  assert.doesNotMatch(view.text(), /Mga petsa ng trabaho|Huw/);
  assert.match(view.text(), /Isara/);
  assert.equal(view.actions().some(node => ['Kanselahin ang post', 'I-reschedule'].includes(node.props.accessibilityLabel)), false);
});

test('acceptance clock updates at the deadline and cleans up its timer and app listener', t => {
  let now = Date.parse('2026-10-30T00:00:00Z'), callback, removed = false, timer;
  t.mock.method(Date, 'now', () => now);
  const { useScheduleClock } = load('src/features/bookings/hooks/useScheduleClock.ts', {
    'react-native': { AppState: { addEventListener: (_event, fn) => { callback = fn; return { remove: () => { removed = true; } }; } } },
  }, { setTimeout: (fn, delay) => { timer = { fn, delay }; return timer; }, clearTimeout: handle => { if (timer === handle) timer = null; } });
  const start = now + 1000;
  const view = screen(t);
  let clock;
  function Entry() { clock = useScheduleClock([start]); return null; }
  view.render(React.createElement(Entry));
  assert.equal(clock < start, true);
  assert.equal(timer.delay, 1020);
  now += 1020;
  view.act(() => timer.fn()); renderer.flushPassiveEffects();
  assert.equal(clock >= start, true);
  now += 5000;
  view.act(() => callback('active'));
  assert.equal(clock, now);
  view.render(null);
  assert.equal(removed, true);
  assert.equal(timer, null);
});

function repostForm(t) {
  const requests = [], alerts = [];
  let count = 0, successes = 0, closes = 0;
  const { RepostModal } = load('src/features/bookings/components/RepostModal.tsx', {
    'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', Modal: 'Modal', ActivityIndicator: 'Spinner', Alert: { alert: (...args) => alerts.push(args) } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../../../shared/localization/LanguageContext': language, '../../chat/api/chatApi': { generateUUID: () => `request-${++count}` },
    '../engagementForm': load('src/features/bookings/engagementForm.ts'), './WorkScheduleFields': { WorkScheduleFields: 'Schedule' },
    '../api/bookingApi': { repostBooking: (...args) => new Promise((resolve, reject) => requests.push({ args, resolve, reject })) },
  });
  const view = screen(t);
  view.render(React.createElement(RepostModal, { post, token: 'token', onSuccess: () => successes++, onClose: () => closes++ }));
  const schedule = () => view.all('Schedule')[0].props;
  const publish = () => view.all('Pressable').find(node => content(node) === 'Publish New Post');
  return { ...view, requests, alerts, schedule, publish, counts: () => ({ successes, closes }) };
}

test('repost keeps form after failure, blocks double taps and retries the same schedule with the same request key', async t => {
  const form = repostForm(t);
  form.act(() => { form.schedule().onStartDate('12/31/2099'); form.schedule().onShift('morning'); });
  const tap = form.publish().props.onPress;
  form.act(() => { tap(); tap(); });
  assert.equal(form.requests.length, 1);
  assert.equal(form.schedule().disabled, true);
  assert.equal(form.requests[0].args[1], post.booking_id);
  assert.equal(form.requests[0].args[2].start_time, '2099-12-31T00:00:00.000Z');
  form.requests[0].reject(new Error('Connection lost')); await tick();
  assert.equal(form.alerts[0][1], 'Connection lost');
  assert.deepEqual(form.counts(), { successes: 0, closes: 0 });
  assert.equal(form.schedule().startDate, '12/31/2099');
  form.act(() => form.publish().props.onPress());
  assert.equal(form.requests[1].args[3], form.requests[0].args[3]);
  form.requests[1].resolve({ booking_id: 'fresh-post' }); await tick();
  assert.deepEqual(form.counts(), { successes: 1, closes: 1 });
});

test('repost rejects missing or past schedules before making any request', async t => {
  const form = repostForm(t);
  form.act(() => form.publish().props.onPress()); await tick();
  assert.equal(form.requests.length, 0);
  form.act(() => { form.schedule().onStartDate('01/01/2000'); form.schedule().onShift('morning'); });
  form.act(() => form.publish().props.onPress()); await tick();
  assert.equal(form.requests.length, 0);
  assert.equal(form.alerts.length, 2);
});

test('owner posts and repost API use authenticated routes and forward the stable request key', async () => {
  const calls = [];
  const api = load('src/features/bookings/api/bookingApi.ts', {
    '../../../shared/api/config': { API_BASE_URL: 'https://test.local' },
    '../../../shared/api/httpClient': {
      requestJson: async (...args) => { calls.push(args); return [post]; },
      requestResponse: async (...args) => { calls.push(args); return { ok: true, json: async () => ({ booking_id: 'fresh-post' }) }; },
    },
  });
  assert.equal((await api.fetchMyPosts('token')).length, 1);
  assert.equal(calls[0][0], '/api/v1/booking/mine/?public_only=true');
  const schedule = { start_time: '2099-12-31T00:00:00Z', end_time: '2099-12-31T04:00:00Z', daily_start_time: '08:00:00', daily_end_time: '12:00:00', work_days: ['Th'] };
  assert.equal((await api.repostBooking('token', 'old-post', schedule, 'stable-key')).booking_id, 'fresh-post');
  assert.equal(calls[1][0], '/api/v1/booking/old-post/repost/');
  assert.equal(calls[1][1].token, 'token');
  assert.equal(calls[1][1].headers['Idempotency-Key'], 'stable-key');
  assert.deepEqual(JSON.parse(calls[1][1].body), schedule);
});

test('realtime client forwards public feed updates only after authenticating the socket', t => {
  let socket;
  const { RealtimeClient } = load('src/shared/realtime/RealtimeClient.ts', {
    '../api/httpClient': { requestJson: async () => ({}), notifyAccountSuspension() {} },
  });
  const client = new RealtimeClient('https://test.local', () => {
    socket = { send() {}, close() {} }; return socket;
  });
  t.after(() => client.stop());
  const received = [];
  client.subscribe(event => received.push(event));
  client.start('token', 'viewer');
  const event = { type: 'feed.changed', booking_id: 'public-post', available: false };
  socket.onmessage({ data: JSON.stringify(event) });
  assert.equal(received.length, 0);
  socket.onmessage({ data: JSON.stringify({ type: 'ready' }) });
  socket.onmessage({ data: JSON.stringify(event) });
  assert.deepEqual(received.at(-1), event);
});
