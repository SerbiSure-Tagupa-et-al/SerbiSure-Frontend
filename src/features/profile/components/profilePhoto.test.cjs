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
function screen(t, status = 'Rejected') {
  let resolveUpload, rejectUpload, saved = 0;
  const requests = [], alerts = [];
  const { ProfilePhotoSection } = load('src/features/profile/components/ProfilePhotoSection.tsx', {
    'react-native': { View: 'View', Text: 'Text', Modal: 'Modal', Pressable: 'Pressable', StyleSheet: { create: value => value }, Alert: { alert: (...args) => alerts.push(args) } },
    '../../../shared/localization/LanguageContext': { useLanguage: () => ({ tr: value => value }) },
    '../../verification/components/LivenessScreen': { LivenessScreen: 'LiveCamera' },
    '../../verification/documentStatus': helpers,
    '../../verification/api/selfieUpload': { uploadSelfie: (...args) => { requests.push(args); return new Promise((yes, no) => { resolveUpload = yes; rejectUpload = no; }); } },
  });
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const doc = { document_id: 'photo', document_type: 'profile_photo', verification_status: status, rejection_reason: status === 'Rejected' ? 'Please use a brighter place.' : null, created_at: '2026-11-03T00:00:00Z' };
  const props = { info: { documents: [doc], overall_status: status }, token: 'session', role: 'homeowner', open: false,
    onOpenChange: open => { props.open = open; render(); },
    onSaved: async () => { saved++; props.info = { ...props.info, documents: [{ ...doc, verification_status: 'Pending', rejection_reason: null }] }; render(); },
  };
  const render = () => { renderer.flushSync(() => renderer.updateContainer(React.createElement(ProfilePhotoSection, props), root, null)); renderer.flushPassiveEffects(); };
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
