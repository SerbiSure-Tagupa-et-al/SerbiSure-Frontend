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
  prepareForCommit: () => null, resetAfterCommit() { }, shouldSetTextContent: () => false,
  createInstance: (type, props) => ({ type, props, children: [] }), createTextInstance: text => ({ text, children: [] }), getPublicInstance: instance => instance,
  appendInitialChild: append, appendChild: append, appendChildToContainer: append, removeChild: remove, removeChildFromContainer: remove,
  insertBefore(parent, child, before) { remove(parent, child); parent.children.splice(parent.children.indexOf(before), 0, child); },
  insertInContainerBefore(parent, child, before) { remove(parent, child); parent.children.splice(parent.children.indexOf(before), 0, child); },
  prepareUpdate: () => true, commitUpdate(instance, _payload, _type, _old, props) { instance.props = props; }, commitTextUpdate(instance, _old, text) { instance.text = text; },
  finalizeInitialChildren: () => false, clearContainer(parent) { parent.children = []; },
  scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1, detachDeletedInstance() { },
});


const messages = load('src/shared/localization/messages.ts');
const tr = (source, params) => messages.translateMessage('English', source, params);
const content = node => node.text || node.children.map(content).join('');
const descendants = node => [node, ...node.children.flatMap(descendants)];
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); renderer.flushPassiveEffects(); };
function load(file, mocks = {}) {
  const filename = path.resolve(__dirname, '..', file);
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', js)(name => {
    if (name === 'react') return { ...React, default: React };
    if (name in mocks) return mocks[name];
    if (name.endsWith('/utils/rate')) return load('src/shared/utils/rate.ts');
    if (name === './postingConfig') return load('src/features/posting/postingConfig.ts');
    if (name.endsWith('/posting/validation')) return load('src/features/posting/validation.ts');
    if (name.endsWith('/reviews/ratings')) return load('src/features/reviews/ratings.ts');
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}
const rate = load('src/shared/utils/rate.ts');
test('legacy expected-rate phrases are removed for display without altering stored text', () => {
  for (const [amount, period] of [['608','day'], ['5,000.00','day'], ['8,500.00','month']]) {
    const original = `I offer Cleaning in Carmen, with an expected rate of ₱${amount} / ${period}.\n\nReliable worker.`;
    assert.equal(rate.stripLegacyExpectedRate(original), 'I offer Cleaning in Carmen.\n\nReliable worker.');
    assert.ok(original.includes(amount));
  }
  assert.equal(rate.stripLegacyExpectedRate('with an expected rate of ₱608/day.'), '');
  assert.equal(rate.stripLegacyExpectedRate(null), '');
  assert.equal(rate.stripLegacyExpectedRate('Homeowner budget ₱700.00 / day.'), 'Homeowner budget ₱700.00 / day.');
});
function proposals(t, props = {}, data = []) {
  const calls = [], alerts = [], closed = [], updates = [], chats = [];
  let result = { success: true };
  const native = { StyleSheet: { create: s => s }, Alert: { alert: (...args) => alerts.push(args) } };
  for (const name of ['Text','View','TextInput','Pressable','Modal','ActivityIndicator','ScrollView','Image']) native[name] = name;
  const { ProposalsModal } = load('src/features/bookings/components/ProposalsModal.tsx', {
    'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../../../shared/localization/LanguageContext': { useLanguage: () => ({ tr }) },
    '../../../shared/realtime': { realtime: { subscribe: () => () => {} } },
    '../../reviews/components/ReviewModal': { ReviewModal: 'ReviewModal' },
    '../engagementForm': load('src/features/bookings/engagementForm.ts'),
    './WorkScheduleFields': { WorkScheduleFields: 'WorkScheduleFields' },
    '../api/bookingApi': {
      fetchBookingProposals: async () => data,
      submitBookingProposal: async (...args) => { calls.push(['submit', ...args]); return result; },
      respondToProposal: async (...args) => { calls.push(['respond', ...args]); return result; },
      confirmPostRate: async () => {},
    },
  });
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const act = cb => renderer.flushSync(cb);
  act(() => renderer.updateContainer(React.createElement(ProposalsModal, {
    visible: true, bookingId: 'job', token: 'token', isPoster: false, currentRate: '700', ratePeriod: 'day',
    onClose: () => closed.push(true), onUpdated: () => updates.push(true), onMessage: p => chats.push(p.proposer_id), ...props,
  }), root, null)); renderer.flushPassiveEffects();
  t.after(() => { act(() => renderer.updateContainer(null, root, null)); renderer.flushPassiveEffects(); });
  const nodes = () => descendants(container);
  const press = label => act(() => nodes().find(n => n.type === 'Pressable' && content(n) === label).props.onPress());
  return { act, nodes, press, calls, alerts, closed, updates, chats, text: () => content(container), set result(v) { result = v; } };
}
test('counter-bid shows budget, formats commas/cents, enforces daily caps and submits one note', async t => {
  const f = proposals(t); await tick();
  assert.match(f.text(), /Listed Rate₱700.00 \/ day/);
  assert.doesNotMatch(f.text(), /Homeowner's Budget|Open for Offer/);
  const input = () => f.nodes().find(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'Your Proposed Rate');
  for (const invalid of ['599', '5001', 'oops']) {
    f.act(() => input().props.onChangeText(invalid)); f.press('Submit a Bid');
    assert.equal(f.calls.length, 0);
  }
  f.act(() => input().props.onChangeText('1,250'));
  assert.equal(input().props.value, '1,250');
  f.act(() => input().props.onBlur()); assert.equal(input().props.value, '1,250.00');
  f.act(() => f.nodes().find(n => n.type === 'TextInput' && n.props.placeholder === 'e.g., Includes deep kitchen cleaning').props.onChangeText('Includes kitchen cleaning'));
  const submit = f.nodes().find(n => n.type === 'Pressable' && content(n) === 'Submit a Bid').props.onPress;
  f.act(() => { void submit(); void submit(); });
  await tick();
  assert.deepEqual(f.calls, [['submit','token','job',1250,'Includes kitchen cleaning','day']]);
  assert.equal(f.updates.length, 1); assert.equal(f.closed.length, 1);
});
test('monthly bids use monthly guardrails and cap errors leave the sheet available', async t => {
  const f = proposals(t, { currentRate: '8500', ratePeriod: 'month' }); await tick();
  const input = () => f.nodes().find(n => n.type === 'TextInput' && n.props.accessibilityLabel === 'Your Proposed Rate');
  for (const amount of ['6499','50001']) { f.act(() => input().props.onChangeText(amount)); f.press('Submit a Bid'); }
  assert.equal(f.calls.length, 0);
  f.act(() => input().props.onChangeText('6500'));
  f.result = { success: false, code: 'short_term_monthly_cap', error: 'The pair limit was reached.' };
  f.press('Submit a Bid'); await tick();
  assert.equal(f.alerts.at(-1)[0], 'Monthly Booking Limit');
  assert.equal(f.closed.length, 0);
});
test('owner compares verified bidder stats, Messages separately, and Hires only after one confirmation', async t => {
  const bidder = { proposal_id:'bid',proposer_id:'worker',proposer_name:'Ana',proposer_avatar:'photo',proposer_role:'Kasambahay',
    avg_rating:4.8,jobs_done_count:12,recommendation_pct:90,is_verified:true,has_tesda_nc2:true,proposed_rate:'750',rate_period:'day',
    is_budget_accepted:false,status:'Pending',message:'Includes kitchen cleaning' };
  const f = proposals(t, { isPoster:true }, [bidder]); await tick();
  for (const label of ['Applicants & Bids','Ana','Verified','TESDA NC II','4.8','Jobs Done','12','90%','Bid: ₱750.00 / day']) assert.ok(f.text().includes(label),label);
  f.press('Message'); assert.deepEqual(f.chats,['worker']); assert.equal(f.calls.length,0);
  f.press('Hire'); assert.equal(f.calls.length,0); assert.equal(f.alerts.length,1);
  assert.match(f.alerts[0][1], /Ana at ₱750.00 \/ day/);
  f.alerts[0][2][1].onPress(); await tick();
  assert.deepEqual(f.calls,[['respond','token','bid','accept']]); assert.equal(f.closed.length,1); assert.equal(f.updates.length,1);
});
test('budget acceptance and unanswered recommendation statistics are displayed honestly', async t => {
  const f = proposals(t,{isPoster:true},[{proposal_id:'bid',proposer_id:'worker',proposer_name:'New Worker',proposer_role:'Kasambahay',
    proposed_rate:'700',rate_period:'day',is_budget_accepted:true,status:'Pending',jobs_done_count:0,avg_rating:null,recommendation_pct:null}]); await tick();
  assert.match(f.text(),/Accepted Your Budget: ₱700.00 \/ day/); assert.match(f.text(),/Recommended: —/); assert.doesNotMatch(f.text(),/100%/);
});
test('public post hire prompts for start date and schedule pre-filled with posted hours', async t => {
  const bidder = { proposal_id:'bid',proposer_id:'worker',proposer_name:'Ana',proposer_role:'Kasambahay',
    proposed_rate:'600',rate_period:'day',is_budget_accepted:true,status:'Pending',jobs_done_count:1,avg_rating:5,recommendation_pct:100 };
  const f = proposals(t, { isPoster: true, requireScheduleOnHire: true, bookingType: 'short_term', initialWorkHours: '12:00 PM - 05:00 PM' }, [bidder]);
  await tick();
  f.press('Hire');
  assert.equal(f.calls.length, 0);
  assert.match(f.text(), /Confirm Hire & Set Dates/);
  const fields = () => f.nodes().find(n => n.type === 'WorkScheduleFields');
  assert.equal(fields().props.workHours, '12:00 PM - 05:00 PM');
  assert.equal(fields().props.shift, 'afternoon');
  // Attempting to confirm without a start date shows an alert and does not call API.
  f.press('Confirm Hire');
  assert.equal(f.calls.length, 0);
  assert.equal(f.alerts.at(-1)[0], 'Invalid Schedule');
  // Choose a valid future start date and confirm.
  const future = new Date(Date.now() + 3 * 86400000);
  const futureStr = `${String(future.getUTCMonth() + 1).padStart(2, '0')}/${String(future.getUTCDate()).padStart(2, '0')}/${future.getUTCFullYear()}`;
  f.act(() => fields().props.onStartDate(futureStr));
  f.press('Confirm Hire'); await tick();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0][0], 'respond');
  assert.equal(f.calls[0][2], 'bid');
  assert.equal(f.calls[0][3], 'accept');
  assert.equal(f.calls[0][4].daily_start_time, '12:00:00');
  assert.equal(f.calls[0][4].daily_end_time, '17:00:00');
  assert.ok(Array.isArray(f.calls[0][4].work_days) && f.calls[0][4].work_days.length === 1);
  assert.equal(f.closed.length, 1);
  assert.equal(f.updates.length, 1);
});

function publicPostActions(t, status = null, withDetails = true) {
  const calls = [];
  const native = { StyleSheet: { create: value => value }, Platform: { OS: 'android', select: value => value.android || value.default }, Alert: { alert() {} } };
  for (const name of ['Text', 'View', 'TextInput', 'Pressable', 'Modal', 'ActivityIndicator', 'ScrollView', 'Image', 'KeyboardAvoidingView']) native[name] = name;
  const language = { useLanguage: () => ({ tr }) };
  const { FeedPostCard } = load('src/features/feed/components/FeedPostCard.tsx', {
    'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '../../../shared/localization/LanguageContext': language,
    '../../../shared/ui/ProfileAvatar': { ProfileAvatar: 'Avatar' },
    '../../../shared/components/icons/LucideIcons': { MapPinIcon: 'MapPin' },
    '../../../shared/theme/theme': load('src/shared/theme/theme.ts', { 'react-native': native }),
  });
  const { PublicPostsSection } = load('src/features/profile/components/PublicPostsSection.tsx', {
    'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../../../shared/localization/LanguageContext': language, '../styles': { profileStyles: {} },
    '../../auth/session/UserContext': { useUser: () => ({ user: { id: 'worker', token: 'token', accountType: 'Kasambahay' },
      refreshVerificationStatus: async () => { calls.push('verify'); return 'Verified'; } }) },
    '../../bookings/api/bookingApi': { submitBookingProposal: async () => { calls.push('submit'); return { success: true }; } },
    '../../reviews/components/ReviewModal': { ReviewModal: 'ReviewModal' },
    './PendingPostCard': { PendingPostCard: ({ post, children, onDetails }) => React.createElement(FeedPostCard, {
      post: { id: post.booking_id, kind: 'job', authorRole: 'Homeowner', employerName: 'Employer',
        roleTag: 'Cleaning', termTag: 'Part-time', price: rate.formatRate(post.rate_amount), unit: '/ day' },
      saved: false, onToggleSave: () => calls.push('save'), onDetails: () => onDetails?.(post), leftActionButton: children,
    }) },
  });
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const act = cb => renderer.flushSync(cb);
  act(() => renderer.updateContainer(React.createElement(PublicPostsSection, {
    posts: [{ booking_id: 'job', rate_amount: '600', rate_period: 'day', viewer_proposal: status ? { status } : null }],
    loading: false, error: null, token: 'token', ownerId: 'owner', ownerRole: 'Homeowner', onRefresh() {}, onSubmitted() {},
    onApplyJob: post => calls.push(['accept', post.booking_id]), onMessage: post => calls.push(['message', post.booking_id]),
    onDetails: withDetails ? post => calls.push(['details', post.booking_id]) : undefined,
  }), root, null)); renderer.flushPassiveEffects();
  t.after(() => { act(() => renderer.updateContainer(null, root, null)); renderer.flushPassiveEffects(); });
  const nodes = () => descendants(container);
  const button = label => nodes().find(node => node.type === 'Pressable' && node.props.accessibilityLabel === label);
  return { act, nodes, button, calls };
}

test('standalone cards without a details screen retain their inline action fallback', async t => {
  const f = publicPostActions(t, null, false); await tick();
  const footer = f.nodes().find(node => node.type === 'View' && node.children.some(child => child.props?.accessibilityLabel === 'Save post'));
  const buttons = descendants(footer).filter(node => node.type === 'Pressable');
  assert.deepEqual(buttons.map(node => node.props.accessibilityLabel), ['Save post', 'Accept ₱600.00', 'Submit a Bid', 'Message', 'Details']);
  assert.deepEqual(buttons.map(node => descendants(node).find(child => child.type === 'Icon').props.name),
    ['bookmark-outline', 'checkmark-circle-outline', 'pricetag-outline', 'chatbubble-ellipses-outline', 'eye-outline']);
  for (const button of buttons) {
    const style = Object.assign({}, ...button.props.style({ pressed: false }));
    assert.equal(style.width, 36); assert.equal(style.height, 36); assert.equal(button.props.hitSlop, 6);
    assert.equal(style.backgroundColor, undefined); assert.equal(style.borderRadius, undefined);
    assert.equal(content(button), '');
    assert.equal(descendants(button).find(child => child.type === 'Icon').props.color, '#4B5563');
  }
  const actionGroup = f.nodes().find(node => node.children.includes(f.button('Accept ₱600.00')));
  assert.equal(actionGroup.props.style.flexDirection, 'row'); assert.equal(actionGroup.props.style.flexWrap, undefined);
  f.act(() => f.button('Accept ₱600.00').props.onPress());
  assert.deepEqual(f.calls, [['accept', 'job']]);
  f.act(() => f.button('Message').props.onPress());
  assert.deepEqual(f.calls, [['accept', 'job'], ['message', 'job']]);
  f.act(() => { void f.button('Submit a Bid').props.onPress(); }); await tick();
  assert.deepEqual(f.calls, [['accept', 'job'], ['message', 'job'], 'verify']);
  assert.ok(f.nodes().some(node => node.type === 'Modal' && node.props.visible));
});

for (const status of [null, 'Pending', 'Accepted']) {
  test(`profile card (${status || 'not applied'}) shows only Save and Details and preserves their actions`, async t => {
    const f = publicPostActions(t, status); await tick();
    const footer = f.nodes().find(node => node.type === 'View' && node.children.some(child => child.props?.accessibilityLabel === 'Save post'));
    const buttons = descendants(footer).filter(node => node.type === 'Pressable');
    assert.deepEqual(buttons.map(node => node.props.accessibilityLabel), ['Save post', 'Details']);
    assert.deepEqual(buttons.map(node => descendants(node).find(child => child.type === 'Icon').props.name), ['bookmark-outline', 'eye-outline']);
    f.act(() => f.button('Save post').props.onPress());
    f.act(() => f.button('Details').props.onPress());
    assert.deepEqual(f.calls, ['save', ['details', 'job']]);
    assert.equal(f.button('Submit a Bid'), undefined); assert.equal(f.button('Message'), undefined);
  });
}
