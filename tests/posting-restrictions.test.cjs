const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const Reconciler = require('react-reconciler');
const { DefaultEventPriority } = require('react-reconciler/constants');

// Mount the real posting screen and form; replace native surfaces and external I/O.
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

function load(relative, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', relative), 'utf8'), {
    fileName: relative, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (name === 'react') return { ...React, default: React };
    if (name in mocks) return mocks[name];
    if (name.endsWith('.png')) return 1;
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}

const tick = async () => { await new Promise(resolve => setImmediate(resolve)); renderer.flushPassiveEffects(); };
const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes; }); return { promise, resolve }; };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function postingScreen(t, mode = 'service') {
  const requests = [], alerts = [], closed = [], verification = [];
  // A stale client restriction must never override the current API response.
  const user = { token: 'token', verificationStatus: 'Verified', penaltyPoints: 3, isRestricted: true };
  const animation = () => ({ start() {}, stop() {} });
  const native = {
    StyleSheet: { create: value => value }, Platform: { OS: 'android', select: value => value.android || value.default },
    Alert: { alert: (...args) => alerts.push(args) }, Easing: { linear: value => value },
    Animated: { Value: class { setValue() {} interpolate() { return 0; } }, spring: animation, loop: animation, timing: animation, View: 'AnimatedView' },
  };
  for (const name of ['Modal', 'Pressable', 'ScrollView', 'Text', 'View', 'Image', 'StatusBar', 'KeyboardAvoidingView', 'TextInput']) native[name] = name;
  const language = { useLanguage: () => ({ tr: text => text }) };
  const theme = load('src/shared/theme/theme.ts', { 'react-native': native });
  const posting = load('src/features/posting/postingConfig.ts');
  const validation = load('src/features/posting/validation.ts', { './postingConfig': posting });
  const engagement = load('src/features/bookings/engagementForm.ts');
  const location = { selectedRegion: { name: 'Region X' }, selectedProvince: { name: 'Misamis Oriental' },
    selectedCity: { name: 'Cagayan de Oro' }, selectedBarangay: { name: 'Agusan' }, streetAddress: 'Lot 3', floorUnit: '5', zipcode: '9000',
    resetWorkLocation() {}, applyProfileAddress() {} };
  const safeArea = { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
  const { usePostForm } = load('src/features/posting/hooks/usePostForm.ts', {
    'react-native': native, 'react-native-safe-area-context': safeArea,
    '../../bookings/engagementForm': engagement, '../workingHours': load('src/features/posting/workingHours.ts'), '../validation': validation, '../postingConfig': posting,
    '../../bookings/api/bookingApi': { fetchMinimumWage: async (_token, type) => ({ rate_period: type === 'long_term' ? 'month' : 'day', minimum_rate: type === 'long_term' ? '6500' : '600' }) },
    '../api/postingApi': { submitPost: (...args) => { const request = { ...deferred(), args }; requests.push(request); return request.promise; } },
    '../../auth/session/UserContext': { useUser: () => ({ user }) },
    '../../../shared/localization/LanguageContext': language,
    '../../bookings/hooks/useWorkLocation': { useWorkLocation: () => location },
    '../../bookings/workLocation': load('src/features/bookings/workLocation.ts'),
  });
  const restriction = load('src/features/bookings/components/BookingRestrictionModal.tsx', {
    'react-native': native, '../../../shared/localization/LanguageContext': language, '../../../shared/theme/theme': theme,
  });
  const step1 = load('src/features/posting/components/PostStep1.tsx', {
    'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '../../../shared/localization/LanguageContext': language, '../styles': { postingStyles: {} },
  });
  const step2 = load('src/features/posting/components/PostStep2.tsx', {
    'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '../../../shared/localization/LanguageContext': language, '../styles': { postingStyles: {} },
    '../../bookings/components/WorkLocationFields': { WorkLocationFields: () => null },
    './PublicWorkHoursFields': { PublicWorkHoursFields: 'PublicWorkHoursFields' },
    '../../bookings/engagementForm': engagement,
  });
  const step3 = load('src/features/posting/components/PostStep3.tsx', {
    'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '../../../shared/localization/LanguageContext': language, '../styles': { postingStyles: {} },
    '../../profile/components/PrivacyPolicyModal': { PrivacyPolicyModal: () => null },
    '../../bookings/engagementForm': engagement,
  });
  let controller;
  const { PostScreen } = load('src/features/posting/screens/PostScreen.tsx', {
    'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' }, '../../../shared/localization/LanguageContext': language,
    '../../../../assets/serbisure-logo.png': 1, '../styles': { postingStyles: {} },
    '../hooks/usePostForm': { usePostForm: props => { controller = usePostForm(props); return controller; } },
    '../../bookings/components/BookingRestrictionModal': restriction,
    '../../verification/components/VerificationRequiredModal': { VerificationRequiredModal: props => props.visible ? React.createElement('Text', {}, 'Account Verification Required') : null },
    '../components/PostStep1': step1,
    '../components/PostStep2': step2,
    '../components/PostStep3': step3,
  });
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const render = (visible = true) => {
    renderer.flushSync(() => renderer.updateContainer(React.createElement(PostScreen, {
      mode, visible, onClose: () => closed.push(true), onOpenVerification: () => verification.push(true),
    }), root, null));
    renderer.flushPassiveEffects();
  };
  t.after(() => { renderer.flushSync(() => renderer.updateContainer(null, root, null)); renderer.flushPassiveEffects(); });
  const nodes = () => { const result = []; const walk = node => { result.push(node); node.children.forEach(walk); }; container.children.forEach(walk); return result; };
  const set = callback => renderer.flushSync(() => callback(controller));
  const next = async () => { await controller.handleNext(); await tick(); };
  const ready = async (duration = 'short') => {
    render();
    set(form => {
      form.handleToggleService('Cleaning');
      form.handleEngagementChange(duration === 'short' ? 'short' : 'long');
      form.setSetupPreference('stay-out');
      form.setOfferAmount(duration === 'short' ? '800' : '8000');
      form.setSelectedTime('morning'); form.setWorkHours('08:00 AM - 12:00 PM');
      if (duration !== 'short') {
        form.setWorkHours('09:00 AM - 02:00 PM');
      }
    });
    await next();
    await next();
    set(form => form.setAgreedTerms(true));
    assert.equal(controller.step, 3);
    assert.equal(alerts.length, 0);
  };
  const submit = async (status, body) => {
    const pending = controller.handleNext();
    requests.at(-1).resolve(reply(status, body));
    await pending; await tick();
  };
  const text = () => nodes().filter(node => node.text !== undefined).map(node => node.text).join(' ');
  const press = label => {
    const contains = node => node.text === label || node.children.some(contains);
    renderer.flushSync(() => nodes().find(node => node.type === 'Pressable' && contains(node)).props.onPress());
  };
  return { ready, submit, render, text, press, set, next, nodes, requests, alerts, closed, verification, user, get form() { return controller; } };
}

for (const mode of ['job', 'service']) {
test(`${mode}: short-term replaces a previous Stay-in choice with Stay-out`, async t => {
  const screen = postingScreen(t, mode); await screen.ready();
  screen.set(form => form.handleBack());
  screen.set(form => form.handleBack());
  assert.equal(screen.form.step, 1);
  screen.press('Long-term');
  screen.press('Stay-in');
  assert.equal(screen.form.setupPreference, 'stay-in');
  screen.press('Short-term');
  assert.equal(screen.form.setupPreference, 'stay-out');
  await screen.next(); await screen.next();
  assert.equal(screen.form.step, 2); // Changing engagement must not invent replacement work hours.
  screen.set(form => form.setSelectedTime('morning'));
  await screen.next();
  assert.equal(screen.form.step, 3);
  await screen.submit(403, { code: 'booking_restricted' });
  assert.equal(screen.requests[0].args[1].work_setup, 'stay_out');
  assert.doesNotMatch(screen.requests[0].args[1].special_instruction, /stay-out/);
});
}

for (const mode of ['job', 'service']) {
  for (const duration of ['fixed', 'ongoing']) {
    test(`${mode}: long-term ads send hours without calendar terms (${duration} legacy case)`, async t => {
      const screen = postingScreen(t, mode); await screen.ready(duration);
      await screen.submit(403, { code: 'booking_restricted' });
      const payload = screen.requests[0].args[1];
      assert.equal(payload.booking_type, 'long_term');
      for (const field of ['start_time', 'end_time', 'work_days']) assert.equal(field in payload, false, field);
      assert.equal(payload.daily_start_time, '09:00:00');
      assert.equal(payload.daily_end_time, '14:00:00');
    });
  }
  test(mode + ': penalty restriction shows the notice and preserves the form for retry', async t => {
    const screen = postingScreen(t, mode); await screen.ready();
    await screen.submit(403, { code: 'booking_restricted', detail: 'Booking and posting are restricted until next month.' });
    assert.match(screen.text(), /Booking & Posting Restricted/);
    assert.match(screen.text(), /3\/3 penalty points this month/);
    assert.match(screen.text(), /until the 1st of next month/);
    assert.doesNotMatch(screen.text(), /Account Verification Required/);
    assert.equal(screen.form.showVerificationRequired, false);
    assert.equal(screen.form.postedSuccess, false);
    assert.equal(screen.form.isPosting, false);
    assert.equal(screen.alerts.length, 0);
    screen.press('Understood');
    assert.equal(screen.form.showBookingRestricted, false);
    assert.equal(screen.form.step, 3);
    assert.equal(screen.closed.length, 0);
    assert.equal(screen.verification.length, 0);
    await screen.submit(201, { data: { booking_id: 'new-post' } });
    assert.equal(screen.form.postedSuccess, true);
    assert.deepEqual(screen.requests[1].args[1], screen.requests[0].args[1]);
  });

  test(mode + ': explicit verification errors retain the verification modal', async t => {
    const screen = postingScreen(t, mode); await screen.ready();
    await screen.submit(403, { code: 'account_not_verified', verification_status: 'Pending' });
    assert.equal(screen.form.showBookingRestricted, false);
    assert.match(screen.text(), /Account Verification Required/);
    assert.equal(screen.form.verificationStatus, 'Pending');
    assert.equal(screen.form.isPosting, false);
  });
}

test('a server restriction flag takes priority over verification wording', async t => {
  const screen = postingScreen(t); await screen.ready();
  await screen.submit(403, { is_restricted: true, detail: 'Verified accounts can still be restricted.' });
  assert.equal(screen.form.showBookingRestricted, true);
  assert.equal(screen.form.showVerificationRequired, false);
});

test('other forbidden responses never become verification or penalty notices', async t => {
  const screen = postingScreen(t); await screen.ready();
  await screen.submit(403, { code: 'account_suspended', detail: 'Your verified account is suspended. Contact Support.' });
  assert.equal(screen.form.showBookingRestricted, false);
  assert.equal(screen.form.showVerificationRequired, false);
  assert.deepEqual(screen.alerts, [['Unable to Post', 'Your verified account is suspended. Contact Support.']]);
});

test('closing the form ignores a late restriction response', async t => {
  const screen = postingScreen(t); await screen.ready();
  const pending = screen.form.handleNext();
  screen.render(false);
  screen.requests[0].resolve(reply(403, { code: 'booking_restricted' }));
  await pending; await tick();
  assert.equal(screen.form.showBookingRestricted, false);
  assert.equal(screen.form.showVerificationRequired, false);
});
