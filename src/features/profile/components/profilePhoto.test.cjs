const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const Reconciler = require('react-reconciler');
const { DefaultEventPriority } = require('react-reconciler/constants');
const rootDir = path.resolve(__dirname, '../../../..');
const append = (parent, child) => { parent.children = parent.children.filter(item => item !== child); parent.children.push(child); };
const remove = (parent, child) => { parent.children = parent.children.filter(item => item !== child); };
const renderer = Reconciler({
  supportsMutation: true, isPrimaryRenderer: true, now: Date.now,
  getRootHostContext: () => null, getChildHostContext: () => null, getCurrentEventPriority: () => DefaultEventPriority,
  prepareForCommit: () => null, resetAfterCommit() {}, shouldSetTextContent: () => false,
  createInstance: (type, props) => ({ type, props, children: [] }), createTextInstance: text => ({ text, children: [] }), getPublicInstance: node => node,
  appendInitialChild: append, appendChild: append, appendChildToContainer: append, removeChild: remove, removeChildFromContainer: remove,
  insertBefore(parent, child, before) { remove(parent, child); parent.children.splice(parent.children.indexOf(before), 0, child); },
  insertInContainerBefore(parent, child, before) { remove(parent, child); parent.children.splice(parent.children.indexOf(before), 0, child); },
  prepareUpdate: () => true, commitUpdate(node, _payload, _type, _old, props) { node.props = props; }, commitTextUpdate(node, _old, text) { node.text = text; },
  resetTextContent() {}, finalizeInitialChildren: () => false, clearContainer(node) { node.children = []; },
  scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1, detachDeletedInstance() {},
});
function load(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.join(rootDir, file), 'utf8'), {fileName: file,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (name === 'react') return React;
    if (name in mocks) return mocks[name];
    throw Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}
const helpers = load('src/features/verification/documentStatus.ts');
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); renderer.flushPassiveEffects(); };
const content = node => node.text || node.children.map(content).join('');
const native = { View: 'View', Text: 'Text', Modal: 'Modal', Pressable: 'Pressable', Image: 'Image',
  ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator', StyleSheet: { create: value => value },
  Dimensions: { get: () => ({ width: 360 }) } };
function screen(t, status = 'Rejected', documentsVisible = false) {
  let resolveUpload, rejectUpload, saved = 0;
  const requests = [], alerts = [];
  const { ProfilePhotoSection } = load('src/features/profile/components/ProfilePhotoSection.tsx', {
    'react-native': { ...native, Alert: { alert: (...args) => alerts.push(args) } },
    '../../../shared/localization/LanguageContext': { useLanguage: () => ({ tr: value => value }) },
    '../../verification/components/LivenessScreen': { LivenessScreen: 'LiveCamera' },
    '../../verification/documentStatus': helpers,
    '../../verification/api/selfieUpload': { uploadSelfie: (...args) => { requests.push(args); return new Promise((yes, no) => { resolveUpload = yes; rejectUpload = no; }); } },
  });
  const { VerificationStatusModal } = load('src/features/verification/components/VerificationStatusModal.tsx', {
    'react-native': { ...native, Alert: { alert: (...args) => alerts.push(args) } },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../../../shared/localization/LanguageContext': { useLanguage: () => ({ tr: value => value }) },
    '../../../shared/theme/theme': { __esModule: true, default: { typography: { fontFamily: {} } } },
    '../api/verificationApi': {}, '../documentStatus': helpers,
    './IDPhotoModal': { IDPhotoModal: 'PhotoPicker' },
    '../../../shared/api/config': { API_BASE_URL: 'https://example.test' },
    '../../../shared/api/httpClient': {}, '../../../../assets/serbisure-icon.png': 1,
  });
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const doc = { document_id: 'photo', document_type: 'profile_photo', verification_status: status, rejection_reason: status === 'Rejected' ? 'Please use a brighter place.' : null, created_at: '2026-11-03T00:00:00Z' };
  const props = { info: { documents: [doc], overall_status: status }, token: 'session', role: 'homeowner', open: false, infoOpen: false, documentsVisible,
    onOpenChange: open => { props.open = open; render(); },
    onInfoOpenChange: open => { props.infoOpen = open; render(); },
    onCloseDocuments: () => { props.documentsVisible = false; render(); },
    onSaved: async () => { saved++; props.info = { ...props.info, documents: [{ ...doc, verification_status: 'Pending', rejection_reason: null }] }; render(); },
  };
  const render = () => {
    props.documentsContent = React.createElement(VerificationStatusModal, {
      embedded: true, visible: props.documentsVisible && !props.open && !props.infoOpen, loading: false,
      statusData: props.info, token: props.token, role: props.role, onClose: props.onCloseDocuments,
      onRetakePhoto: () => props.onOpenChange(true),
    });
    renderer.flushSync(() => renderer.updateContainer(React.createElement(ProfilePhotoSection, props), root, null)); renderer.flushPassiveEffects();
  };
  const nodes = () => { const all = []; const visit = node => { all.push(node); node.children.forEach(visit); }; visit(container); return all; };
  t.after(() => { renderer.flushSync(() => renderer.updateContainer(null, root, null)); renderer.flushPassiveEffects(); });
  render();
  return { props, render, nodes, requests, alerts, text: () => content(container),
    get saved() { return saved; }, resolve: () => resolveUpload(), reject: () => rejectUpload(Error('Please check your connection.')) };
}

test('verified photos are locked and pending photos cannot open a retake camera', t => {
  const verified = screen(t, 'Verified'); assert.equal(verified.text(), '');
  const pending = screen(t, 'Pending'); assert.match(pending.text(), /waiting for review/);
  assert.equal(pending.nodes().some(node => node.type === 'Pressable' || node.type === 'LiveCamera'), false);
});

test('rejected photo explains the reason and reuses live registration capture, without gallery selection', async t => {
  const view = screen(t);
  assert.match(view.text(), /Profile Photo Rejected.*brighter place/);
  renderer.flushSync(() => view.nodes().find(node => node.type === 'Pressable').props.onPress());
  const camera = view.nodes().find(node => node.type === 'LiveCamera');
  assert.equal(camera.props.mode, 'profile'); assert.equal(camera.props.onSkip, undefined);
  camera.props.onVerified({ verified: false, selfiePath: 'invalid.jpg' }); assert.equal(view.requests.length, 0);
  const result = { verified: true, selfiePath: 'live-selfie.jpg' };
  camera.props.onVerified(result); camera.props.onVerified(result);
  assert.deepEqual(view.requests, [['session', 'live-selfie.jpg']]);
  view.resolve(); await tick(); await tick();
  assert.equal(view.saved, 1); assert.equal(view.props.open, false);
  assert.equal(view.alerts[0][0], 'Photo submitted for review.');
  assert.equal(view.nodes().some(node => node.type === 'LiveCamera'), false);
  assert.match(view.text(), /waiting for review/);
});

test('failed photo submission keeps the capture for retry and never claims approval', async t => {
  const view = screen(t);
  renderer.flushSync(() => view.nodes().find(node => node.type === 'Pressable').props.onPress());
  view.nodes().find(node => node.type === 'LiveCamera').props.onVerified({ verified: true, selfiePath: 'retry.jpg' });
  view.reject(); await tick();
  const camera = view.nodes().find(node => node.type === 'LiveCamera');
  assert.equal(camera.props.submissionFailed, true); assert.equal(camera.props.submitting, false);
  assert.equal(view.saved, 0); assert.equal(view.props.open, true);
  assert.equal(view.alerts[0][0], 'Photo not saved');
  camera.props.onRetrySubmission(); assert.equal(view.requests.length, 2);
  view.resolve(); await tick(); assert.equal(view.saved, 1);
});

test('profile photo replacement requires rejection even if an unrelated expiry field is present', () => {
  for (const status of ['Pending', 'Verified', 'Unverified']) assert.equal(helpers.canReplaceDocument({ document_type: 'profile_photo', verification_status: status, valid_until: '2000-01-01' }), false);
  assert.equal(helpers.canReplaceDocument({ document_type: 'profile_photo', verification_status: 'Rejected' }), true);
});

test('a saved photo stays pending when the follow-up refresh fails', async t => {
  const view = screen(t);
  view.props.onSaved = async () => { throw Error('Connection lost while refreshing.'); };
  view.render();
  renderer.flushSync(() => view.nodes().find(node => node.type === 'Pressable').props.onPress());
  view.nodes().find(node => node.type === 'LiveCamera').props.onVerified({ verified: true, selfiePath: 'saved.jpg' });
  view.resolve(); await tick(); await tick();
  assert.equal(view.props.open, false);
  assert.match(view.text(), /Photo waiting for review/);
  assert.doesNotMatch(view.text(), /Profile Photo Rejected|brighter place/);
  assert.equal(view.nodes().some(node => node.type === 'Pressable' || node.type === 'LiveCamera'), false);
  assert.equal(view.alerts[0][0], 'Photo submitted for review.');
});

test('document retake opens the live camera inside the same visible native modal', async t => {
  const view = screen(t, 'Rejected', true);
  const modal = view.nodes().find(node => node.type === 'Modal');
  assert.equal(modal.props.visible, true);
  assert.match(view.text(), /Profile Photo/);
  assert.doesNotMatch(view.text(), /profile_photo/);
  assert.equal(view.nodes().filter(node => node.type === 'Modal').length, 1);
  const action = view.nodes().filter(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Retake Photo').at(-1);
  assert.ok(action, 'The document card exposes a Retake Photo action');
  renderer.flushSync(() => action.props.onPress());
  assert.equal(view.nodes().find(node => node.type === 'Modal'), modal);
  assert.equal(modal.props.visible, true);
  const camera = view.nodes().find(node => node.type === 'LiveCamera');
  assert.ok(camera);
  assert.equal(view.nodes().filter(node => node.type === 'Modal').length, 1);
  camera.props.onVerified({ verified: true, selfiePath: 'document-retake.jpg' });
  view.resolve(); await tick(); await tick();
  assert.equal(view.props.documentsVisible, false);
  assert.equal(modal.props.visible, false);
  assert.match(view.text(), /waiting for review/);
});

test('avatar info explains approved and pending states without offering photo changes', t => {
  for (const [status, title, message, button] of [
    ['Verified', 'Profile Photo Verified', /locked.*barangay office.*SerbiSure admin/, 'Got it'],
    ['Pending', 'Photo Under Review', /waiting for your barangay official/, 'Okay'],
  ]) {
    const view = screen(t, status);
    view.props.infoOpen = true; view.render();
    assert.match(view.text(), new RegExp(title));
    assert.match(view.text(), message);
    assert.equal(view.nodes().some(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Retake Photo'), false);
    assert.equal(view.nodes().some(node => node.type === 'LiveCamera'), false);
    renderer.flushSync(() => view.nodes().find(node => node.type === 'Pressable' && content(node) === button).props.onPress());
    assert.equal(view.props.infoOpen, false);
  }
});

test('rejected avatar info shows the reviewer note and switches directly to the camera', t => {
  const view = screen(t);
  view.props.infoOpen = true; view.render();
  const modal = view.nodes().find(node => node.type === 'Modal');
  assert.match(view.text(), /Profile Photo Needs Retake.*brighter place/);
  const visibility = [];
  for (const name of ['onOpenChange', 'onInfoOpenChange']) {
    const original = view.props[name];
    view.props[name] = value => { original(value); visibility.push(modal.props.visible); };
  }
  view.render();
  const buttons = view.nodes().filter(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Retake Photo');
  renderer.flushSync(() => buttons.at(-1).props.onPress());
  assert.equal(view.nodes().find(node => node.type === 'Modal'), modal);
  assert.ok(visibility.length > 0 && visibility.every(Boolean), 'The shared window stays visible during every view transition');
  assert.equal(view.props.infoOpen, false);
  assert.ok(view.nodes().find(node => node.type === 'LiveCamera'));
});

test('avatar badges follow the photo status independently of expired clearances and open photo info', t => {
  const { ProfilePhotoAvatar } = load('src/features/profile/components/ProfilePhotoAvatar.tsx', {
    'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    '../../../shared/ui/ProfileAvatar': { ProfileAvatar: 'Avatar' },
    '../../../shared/localization/LanguageContext': { useLanguage: () => ({ tr: value => value }) },
    '../../verification/documentStatus': helpers,
  });
  for (const [status, color, label] of [['Verified', '#16A34A', 'Profile Photo Verified'],
    ['Pending', '#FACC15', 'Photo Under Review'], ['Rejected', '#DC2626', 'Profile Photo Needs Retake']]) {
    const container = { children: [] };
    const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
    let opened = false;
    renderer.flushSync(() => renderer.updateContainer(React.createElement(ProfilePhotoAvatar, {
      info: { overall_status: 'Unverified', documents: [{ document_type: 'nbi_clearance', verification_status: 'Verified', valid_until: '2000-01-01' },
        { document_type: 'profile_photo', verification_status: status }] }, name: 'Sample Worker', uri: '/face.jpg', size: 68,
      onPress: () => { opened = true; },
    }), root, null));
    const button = container.children[0];
    assert.equal(button.props.accessibilityLabel, label);
    const badge = button.children.find(node => node.props.testID === 'profile-photo-status');
    assert.equal(badge.props.style[1].backgroundColor, color);
    button.props.onPress(); assert.equal(opened, true);
    t.after(() => renderer.flushSync(() => renderer.updateContainer(null, root, null)));
  }
});

test('photo labels and replacement rules do not inherit clearance expiry', () => {
  assert.equal(helpers.documentLabel('profile_photo'), 'Profile Photo');
  assert.equal(helpers.documentIsExpired({ document_type: 'profile_photo', verification_status: 'Verified', valid_until: '2000-01-01' }), false);
});
