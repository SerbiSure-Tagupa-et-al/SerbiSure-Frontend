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
  createInstance: (type, props) => ({ type, props, children: [] }),
  createTextInstance: text => ({ text, children: [] }), getPublicInstance: instance => instance,
  appendInitialChild: append, appendChild: append, appendChildToContainer: append,
  removeChild: remove, removeChildFromContainer: remove,
  insertBefore(parent, child, before) { remove(parent, child); parent.children.splice(parent.children.indexOf(before), 0, child); },
  insertInContainerBefore(parent, child, before) { remove(parent, child); parent.children.splice(parent.children.indexOf(before), 0, child); },
  prepareUpdate: () => true, commitUpdate(instance, _payload, _type, _old, props) { instance.props = props; },
  commitTextUpdate(instance, _old, text) { instance.text = text; }, resetTextContent() { },
  finalizeInitialChildren: () => false, clearContainer(container) { container.children = []; },
  scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1, detachDeletedInstance() { },
});

function harness(t, extraMocks = {}) {
  const alerts = [];
  const native = { StyleSheet: { create: value => value, hairlineWidth: 1 }, Alert: { alert: (...args) => alerts.push(args) } };
  for (const type of ['View', 'Text', 'Pressable', 'Image', 'ActivityIndicator', 'TextInput', 'KeyboardAvoidingView', 'ScrollView', 'Modal']) native[type] = type;
  native.Platform = { OS: 'android', select: values => values.android || values.default };
  native.ScrollView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ scrollTo() { } }));
    return React.createElement('ScrollView', props);
  });
  const mocks = {
    'react-native': native,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '../../verification/components/LivenessScreen': { LivenessScreen: 'Liveness' },
    '../../../shared/theme/theme': { default: { colors: { ink: '#0D0D11', brand: '#FFB380', white: '#FFF', divider: '#E5E7EB' }, roundness: { pill: 9999 }, typography: { fontFamily: {}, tracking: {} } } },
    '../../../shared/localization/LanguageContext': { useLanguage: () => ({ tr: value => value }) },
    '../session/UserContext': { useUser: () => ({ updateUser: () => { } }) },
    '../../../shared/ui/SearchablePickerModal': { SearchablePickerModal: () => null },
    '../../../shared/ui/DateOfBirthPickerModal': { DateOfBirthPickerModal: (props) => React.createElement('BirthPicker', props) },
    '../../../shared/ui/DemographicPickerModal': { DemographicPickerModal: () => null },
    '../../profile/components/PrivacyPolicyModal': { PrivacyPolicyModal: () => null },
    '../../profile/worker/WorkerCvForm': { WorkerCvForm: () => null },
    '../components/RegistrationStepper': { RegistrationStepper: (props) => React.createElement('RegistrationStepper', props) },
    '../components/RegistrationErrorModal': { RegistrationErrorModal: () => null },
    '../../../shared/services/locationService': {
      getRegions: async () => [],
      getProvinces: async () => [],
      getCities: async () => [],
      getBarangays: async () => [],
      getZipCodeForCity: () => '9000',
    },
    '../../../shared/components/AppHeader': { APP_HEADER_SIDE_WIDTH: 44, APP_HEADER_LOGO_SIZE: 44, APP_HEADER_BACK_ICON_SIZE: 26, APP_HEADER_BACK_ICON_COLOR: '#2A2925', AppHeader: () => null },
    '../../../shared/api/config': { API_BASE_URL: 'http://test.local' },
    '../../../shared/api/httpClient': { fetchWithTimeout: async () => ({ json: async () => ({}) }) },
    ...extraMocks,
  };
  const cache = new Map();
  function load(filename) {
    filename = path.resolve(__dirname, '..', filename);
    if (cache.has(filename)) return cache.get(filename);
    const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
      fileName: filename,
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX }
    }).outputText;
    const module = { exports: {} };
    new Function('require', 'module', 'exports', source)(name => {
      if (name in mocks) return mocks[name];
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      if (/\.png$/.test(name)) return 'image';
      if (name.startsWith('.')) {
        const target = path.resolve(path.dirname(filename), name);
        return load(['.ts', '.tsx'].map(extension => target + extension).find(fs.existsSync));
      }
      throw new Error('Unexpected dependency: ' + name);
    }, module, module.exports);
    cache.set(filename, module.exports);
    return module.exports;
  }
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const render = component => { renderer.flushSync(() => renderer.updateContainer(component, root, null)); renderer.flushPassiveEffects(); };
  const unmount = () => render(null);
  t.after(unmount);
  const nodes = () => {
    const result = [];
    const visit = node => { result.push(node); node.children.forEach(visit); };
    container.children.forEach(visit); return result;
  };
  const text = node => node.text || node.children.map(text).join('');
  return { load, render, unmount, alerts, nodes, text, button: label => nodes().find(node => node.type === 'Pressable' && text(node) === label) };
}

function setupKasambahayStep2(t) {
  const h = harness(t);
  const { RegistrationScreen } = h.load('src/features/auth/screens/RegistrationScreen.tsx');
  h.render(React.createElement(RegistrationScreen, { role: 'kasambahay' }));
  const act = callback => { renderer.flushSync(callback); renderer.flushPassiveEffects(); };
  const input = (placeholder, value) => act(() => h.nodes().find(node => node.type === 'TextInput' && node.props.placeholder === placeholder).props.onChangeText(value));

  // Fill Step 1
  input('First Name', 'Maria');
  input('Last Name', 'Santos');
  input('Email', 'maria@example.com');
  input('Password (min. 8 characters)', 'password123');
  input('Confirm Password', 'password123');
  act(() => h.nodes().find(item => item.type === 'TextInput' && item.props.keyboardType === 'phone-pad').props.onChangeText('9123456789'));
  act(() => h.button('Female').props.onPress());
  act(() => h.nodes().find(item => item.type === 'BirthPicker').props.onSelect('1995-05-15', 30));
  act(() => h.button('Next').props.onPress());

  return { ...h, act, input };
}

test('Step 2: Kasambahay registration displays "Step 2: Worker Profile" and validates empty fields with red outline errors', t => {
  const h = setupKasambahayStep2(t);

  const stepper = h.nodes().find(n => n.type === 'RegistrationStepper');
  assert.equal(stepper.props.currentStep, 2);
  assert.equal(stepper.props.title, 'Step 2: Worker Profile');

  // Attempt to proceed from Step 2 with empty fields
  h.act(() => h.button('Next').props.onPress());

  // Error messages should be visible
  const allTexts = h.nodes().filter(n => n.type === 'Text').map(n => n.children.map(c => c.text || c).join(''));
  assert.ok(allTexts.includes('Please choose at least one service.'));
  assert.ok(allTexts.includes('Please choose the work you are looking for.'));
  assert.ok(allTexts.includes('Please choose at least one language.'));
  assert.ok(allTexts.includes('Please choose your household work experience.'));
  assert.ok(allTexts.includes('Please select your TESDA NC II certification status.'));
  assert.ok(allTexts.includes('Please choose your civil status.'));
  assert.ok(allTexts.includes('Please choose the number of children.'));
});

test('Step 2: Interactive dropdown selections, conditional fields, and advancing to Step 3', t => {
  const h = setupKasambahayStep2(t);

  // 1. SERVICES YOU OFFER: Select Cleaning and Childcare
  // Find SERVICES trigger
  const servicesTrigger = h.nodes().find(n => n.type === 'Pressable' && h.text(n).includes('Choose all that apply'));
  assert.ok(servicesTrigger);
  h.act(() => servicesTrigger.props.onPress());

  // Click Cleaning
  const cleaningOpt = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === 'Cleaning');
  assert.ok(cleaningOpt);
  h.act(() => cleaningOpt.props.onPress());

  // Click Childcare
  const childcareOpt = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === 'Childcare');
  assert.ok(childcareOpt);
  h.act(() => childcareOpt.props.onPress());

  // 2. WORK YOU ARE LOOKING FOR: Select "Part-time / Daily (1–7 days) · Stay-out (Goes home)"
  const workTrigger = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === 'Choose');
  assert.ok(workTrigger);
  h.act(() => workTrigger.props.onPress());

  const shortTermStayOut = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === 'Part-time / Daily (1–7 days) · Stay-out (Goes home)');
  assert.ok(shortTermStayOut);
  h.act(() => shortTermStayOut.props.onPress());

  // 3. EXPECTED DAILY RATE: Enter 800
  h.input('e.g. ₱800', '800');

  // 4. SPOKEN LANGUAGES: Select English & Tagalog
  const langTrigger = h.nodes().find(n => n.type === 'Pressable' && h.text(n).includes('Choose all that apply'));
  assert.ok(langTrigger);
  h.act(() => langTrigger.props.onPress());

  const tagalogOpt = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === 'Tagalog');
  assert.ok(tagalogOpt);
  h.act(() => tagalogOpt.props.onPress());

  // 5. HOUSEHOLD WORK BEFORE: Select "First-time worker"
  const hwTrigger = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === 'Choose');
  assert.ok(hwTrigger);
  h.act(() => hwTrigger.props.onPress());

  const firstTimeOpt = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === 'First-time worker');
  assert.ok(firstTimeOpt);
  h.act(() => firstTimeOpt.props.onPress());

  // Verify Approximate experience is NOT shown
  let texts = h.nodes().filter(n => n.type === 'Text').map(n => n.children.map(c => c.text || c).join(''));
  assert.ok(!texts.includes('APPROXIMATE EXPERIENCE'));

  // Switch HOUSEHOLD WORK BEFORE to "In my household"
  const hwTriggerSelected = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === 'First-time worker');
  assert.ok(hwTriggerSelected);
  h.act(() => hwTriggerSelected.props.onPress());

  const inMyHouseholdOpt = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === 'In my household');
  assert.ok(inMyHouseholdOpt);
  h.act(() => inMyHouseholdOpt.props.onPress());

  // Now Approximate experience IS shown!
  texts = h.nodes().filter(n => n.type === 'Text').map(n => n.children.map(c => c.text || c).join(''));
  assert.ok(texts.includes('APPROXIMATE EXPERIENCE'));

  // Select Approximate Experience: "1-3 years"
  const approxTrigger = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === 'Choose');
  assert.ok(approxTrigger);
  h.act(() => approxTrigger.props.onPress());

  const oneToThreeOpt = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === '1-3 years');
  assert.ok(oneToThreeOpt);
  h.act(() => oneToThreeOpt.props.onPress());

  // 5b. TESDA NC II CERTIFICATION: Select "TESDA NC II – Housekeeping"
  const tesdaTrigger = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === 'Choose');
  assert.ok(tesdaTrigger);
  h.act(() => tesdaTrigger.props.onPress());

  const tesdaOpt = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === 'TESDA NC II – Housekeeping');
  assert.ok(tesdaOpt);
  h.act(() => tesdaOpt.props.onPress());

  // 6. CIVIL STATUS: Select "Single"
  const civilTrigger = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === 'Choose');
  assert.ok(civilTrigger);
  h.act(() => civilTrigger.props.onPress());

  const singleOpt = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === 'Single');
  assert.ok(singleOpt);
  h.act(() => singleOpt.props.onPress());

  // 7. NUMBER OF CHILDREN: Select "None"
  const childrenTrigger = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === 'Choose');
  assert.ok(childrenTrigger);
  h.act(() => childrenTrigger.props.onPress());

  const noneOpt = h.nodes().find(n => n.type === 'Pressable' && h.text(n) === 'None');
  assert.ok(noneOpt);
  h.act(() => noneOpt.props.onPress());

  // Press Next -> should advance to Step 3!
  h.act(() => h.button('Next').props.onPress());

  const stepper = h.nodes().find(n => n.type === 'RegistrationStepper');
  assert.equal(stepper.props.currentStep, 3);
  assert.equal(stepper.props.title, 'Step 3: Where do you live?');
});

test('Step 2: TESDA NC II helpers map selected certificate to training and WorkerCvForm shows Practical Skills label', t => {
  const h = harness(t);
  const workerCv = h.load('src/features/profile/worker/workerCv.ts');
  const base = [{ name: 'First Aid Workshop', provider: 'Red Cross', year: '2024' }];
  const withTesda = workerCv.applyTesdaCertSelection(base, 'TESDA NC II – Caregiving');
  assert.equal(workerCv.getTesdaCertSelection(withTesda), 'TESDA NC II – Caregiving');
  assert.equal(withTesda.length, 2);
  assert.deepEqual(withTesda[0], { name: 'TESDA NC II – Caregiving', provider: 'TESDA', year: '' });
  const cleared = workerCv.applyTesdaCertSelection(withTesda, workerCv.TESDA_NOT_YET_CERTIFIED);
  assert.equal(workerCv.getTesdaCertSelection(cleared), '');
  assert.deepEqual(cleared, base);
  assert.equal(workerCv.TESDA_NC2_DROPDOWN_OPTIONS.length, 5);
  assert.ok(!workerCv.TESDA_NC2_DROPDOWN_OPTIONS.some(o => /Other Equivalent/i.test(o)));

  const { WorkerCvForm } = h.load('src/features/profile/worker/WorkerCvForm.tsx');
  h.render(React.createElement(WorkerCvForm, { value: workerCv.emptyWorkerDraft(), onChange: () => { } }));
  const labels = h.nodes().filter(n => n.type === 'Text').map(n => h.text(n));
  assert.equal(labels.filter(label => label === 'APPROXIMATE EXPERIENCE').length, 1);
  assert.ok(labels.includes('PRACTICAL SKILLS'));
  assert.ok(labels.includes('TESDA NC II CERTIFICATION'));

  const payload = workerCv.workerPayload({
    ...workerCv.emptyWorkerDraft(),
    available_days: ['M', 'T', 'W', 'TH', 'F', 'SA', 'SU'],
    practical_skills: ['Senior assistance', 'Ironing'],
  });
  assert.deepEqual(payload.available_days, ['M', 'T', 'W', 'Th', 'F', 'S', 'Su']);
  assert.deepEqual(payload.practical_skills, ['Older adult assistance', 'Ironing']);
});
