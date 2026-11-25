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
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}

const helpers = load('src/features/verification/documentStatus.ts');
const doc = (type, status = 'Verified', until = '2099-10-28', id = type, created = '2026-10-01T00:00:00Z') => ({
  document_id: id, document_type: type, verification_status: status, valid_until: until,
  created_at: created, document_image_url: null, extracted_data: {}, ocr_discrepancies: [], ocr_processed_at: created,
});
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); renderer.flushPassiveEffects(); };
const content = node => node.text || node.children.map(content).join('');
function screen(t, initial) {
  const alerts = [], requests = [];
  let refreshed = 0;
  const native = { StyleSheet: { create: value => value }, Dimensions: { get: () => ({ width: 360 }) },
    Alert: { alert: (...args) => alerts.push(args) } };
  for (const name of ['Modal', 'Text', 'View', 'Pressable', 'Image', 'ScrollView', 'ActivityIndicator']) native[name] = name;
  const { VerificationStatusModal } = load('src/features/verification/components/VerificationStatusModal.tsx', {
    'react-native': native, '@expo/vector-icons': { Ionicons: 'Icon' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '../../../shared/localization/LanguageContext': { useLanguage: () => ({ tr: value => value }) },
    '../../../shared/theme/theme': { default: { typography: { fontFamily: {} } } },
    '../api/verificationApi': {}, '../documentStatus': helpers,
    './IDPhotoModal': { IDPhotoModal: 'PhotoPicker' },
    '../../profile/components/PrivacyPolicyModal': { VerificationPrivacyNotice: 'VerificationPrivacyNotice' },
    '../../../shared/api/config': { API_BASE_URL: 'https://test.local' },
    '../../../shared/api/httpClient': { fetchWithTimeout: (...args) => {
      let resolve; const promise = new Promise(yes => { resolve = yes; }); requests.push({ args, resolve }); return promise;
    } },
    '../../../../assets/serbisure-icon.png': 1,
  });
  const previous = global.FormData;
  global.FormData = class { constructor() { this.values = []; } append(...args) { this.values.push(args); } };
  t.after(() => { global.FormData = previous; });
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const act = callback => renderer.flushSync(callback);
  const render = data => { act(() => renderer.updateContainer(React.createElement(VerificationStatusModal, {
    visible: true, loading: false, token: 'token', role: 'kasambahay', statusData: data,
    onClose() {}, onRefresh: () => refreshed++,
  }), root, null)); renderer.flushPassiveEffects(); };
  t.after(() => { act(() => renderer.updateContainer(null, root, null)); renderer.flushPassiveEffects(); });
  const nodes = () => { const result = []; const visit = node => { result.push(node); node.children.forEach(visit); }; visit(container); return result; };
  const press = label => act(() => nodes().find(node => node.type === 'Pressable' && content(node).includes(label)).props.onPress());
  render(initial);
  return { render, nodes, press, alerts, requests, act, text: () => content(container), get refreshed() { return refreshed; } };
}

test('expiry starts after the Philippine expiry day; pending stays locked and missing dates are not invented', () => {
  const clearance = doc('police_clearance', 'Verified', '2026-10-28');
  assert.equal(helpers.documentIsExpired(clearance, Date.parse('2026-10-28T15:59:59Z')), false);
  assert.equal(helpers.documentIsExpired(clearance, Date.parse('2026-10-28T16:00:00Z')), true);
  assert.equal(helpers.canReplaceDocument(doc('police_clearance', 'Verified', '2000-01-01')), true);
  assert.equal(helpers.canReplaceDocument(doc('police_clearance', 'Pending', '2000-01-01')), false);
  assert.equal(helpers.canReplaceDocument(doc('police_clearance', 'Verified', null)), false);
  assert.equal(helpers.canReplaceDocument(doc('police_clearance', 'Rejected', null)), true);
  assert.equal(helpers.canReplaceDocument(doc('police_clearance', 'Unverified', null)), true);
});

test('expired approval exposes renewal action while valid companion stays approved; double taps upload once', async t => {
  const app = screen(t, { overall_status: 'Unverified', renewal_required: true, documents: [
    doc('police_clearance', 'Verified', '2000-01-01'), doc('nbi_clearance'),
  ] });
  assert.ok(app.text().includes('Renewal needed'));
  assert.ok(app.text().includes('Upload renewed clearance'));
  assert.equal(app.nodes().filter(node => node.type === 'Text' && content(node) === 'Approved').length, 1);
  app.press('Upload renewed clearance');
  app.act(() => app.nodes().find(node => node.type === 'PhotoPicker').props.onPickedImage('file://renewal.jpg'));
  const submit = app.nodes().find(node => node.type === 'Pressable' && content(node).includes('Submit Documents')).props.onPress;
  app.act(() => { void submit(); void submit(); });
  assert.equal(app.requests.length, 1);
  assert.deepEqual(app.requests[0].args[1].body.values[0], ['document_type', 'police_clearance']);
  app.requests[0].resolve({ ok: true, status: 201 }); await tick();
  assert.equal(app.alerts.at(-1)[0], 'Success');
  assert.ok(app.refreshed > 0);
});

test('only current submissions are displayed; historical expired approval cannot unlock another upload', t => {
  const app = screen(t, { overall_status: 'Pending', renewal_pending: true, documents: [
    doc('police_clearance', 'Verified', '2000-01-01', 'old'),
    doc('police_clearance', 'Pending', null, 'renewed', '2026-10-02T00:00:00Z'), doc('nbi_clearance'),
    doc('tesda_nc2'),
  ] });
  assert.ok(app.text().includes('Renewal under review'));
  assert.ok(!app.text().includes('Upload renewed clearance'));
  assert.ok(!app.text().includes('Upload Documents'));
  assert.equal(helpers.currentDocuments([doc('police_clearance', 'Pending', null, 'renewed', '2026-10-02T00:00:00Z'), doc('police_clearance')]).length, 1);
});

test('a concurrent submission conflict refreshes the screen and never reports upload success', async t => {
  const app = screen(t, { overall_status: 'Unverified', documents: [doc('police_clearance', 'Verified', '2000-01-01'), doc('nbi_clearance')] });
  app.press('Upload renewed clearance');
  app.act(() => app.nodes().find(node => node.type === 'PhotoPicker').props.onPickedImage('file://renewal.jpg'));
  app.press('Submit Documents');
  app.requests[0].resolve({ ok: false, status: 409 }); await tick();
  assert.equal(app.alerts.at(-1)[0], 'Upload Failed');
  assert.ok(app.alerts.at(-1)[1].includes('already submitted'));
  assert.ok(app.refreshed > 0);
});

test('existing worker keeps all three approvals and can upload only the missing skill certificate', async t => {
  const app = screen(t, { overall_status: 'Pending', documents: [
    doc('profile_photo'), doc('police_clearance'), doc('nbi_clearance'),
  ] });
  assert.ok(app.text().includes('Complete your verification'));
  assert.ok(app.text().includes('Upload your remaining required documents below'));
  assert.equal(app.nodes().filter(node => node.type === 'Text' && content(node) === 'Approved').length, 3);
  assert.equal(app.nodes().filter(node => node.type === 'Pressable' && content(node).includes('Tap to take or choose a photo')).length, 1);
  app.press('TESDA NC II');
  app.act(() => app.nodes().find(node => node.type === 'PhotoPicker').props.onPickedImage('file://tesda_nc2.jpg'));
  app.press('Submit Documents');
  assert.equal(app.requests.length, 1);
  assert.deepEqual(app.requests[0].args[1].body.values[0], ['document_type', 'tesda_nc2']);
  app.requests[0].resolve({ ok: true, status: 201 }); await tick();
  assert.equal(app.alerts.at(-1)[0], 'Success');
  app.render({ overall_status: 'Pending', documents: [doc('profile_photo'), doc('police_clearance'), doc('nbi_clearance'), doc('tesda_nc2', 'Pending', null)] });
  assert.ok(!app.text().includes('Complete your verification'));
  assert.ok(!app.text().includes('Upload Documents'));
});

test('skill certificate renewals respect expiry dates; equivalent certificates can have no expiry', () => {
  assert.equal(helpers.documentLabel('tesda_nc2'), 'TESDA NC II');
  assert.equal(helpers.canReplaceDocument(doc('tesda_nc2', 'Verified', null)), false);
  assert.equal(helpers.canReplaceDocument(doc('tesda_nc2', 'Verified', '2000-01-01')), true);
});
