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
  createInstance: (type, props) => ({ type, props, children: [] }), createTextInstance: text => ({ text, children: [] }), getPublicInstance: node => node,
  appendInitialChild: append, appendChild: append, appendChildToContainer: append, removeChild: remove, removeChildFromContainer: remove,
  prepareUpdate: () => true, commitUpdate(node, _payload, _type, _old, props) { node.props = props; }, commitTextUpdate(node, _old, text) { node.text = text; },
  finalizeInitialChildren: () => false, clearContainer(node) { node.children = []; },
  scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1, detachDeletedInstance() {},
});
const native = { StyleSheet: { create: styles => styles }, Platform: { OS: 'android' } };
for (const name of ['View', 'Text', 'TextInput', 'Pressable', 'KeyboardAvoidingView']) native[name] = name;
native.Modal = props => props.visible ? React.createElement('Modal', props, props.children) : null;
function load(filename) {
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (name === 'react') return { ...React, default: React };
    if (name === 'react-native') return native;
    if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
    if (name.endsWith('/LanguageContext')) return { useLanguage: () => ({ tr: value => value, formatDate: value => String(value) }) };
    if (name.endsWith('/WorkHoursPickerModal')) return { WorkHoursPickerModal: () => null };
    if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name + '.ts'));
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}
const { WorkScheduleFields } = load(path.resolve(__dirname, '../src/features/bookings/components/WorkScheduleFields.tsx'));
const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
function schedule(t, options = {}) {
  let props = { bookingType: 'short_term', startDate: '10/31/2026', endDate: '10/31/2026', workHours: '08:00 AM - 05:00 PM',
    shift: 'custom', onStartDate() {}, onEndDate() {}, onWorkHours() {}, onShift() {}, ...options };
  let selected;
  const changes = [];
  const endDates = [];
  const startDates = [];
  const onEndDate = value => endDates.push(value);
  const onStartDate = value => startDates.push(value);
  function Form() {
    const [days, setDays] = React.useState(options.days || []);
    selected = days;
    return React.createElement(WorkScheduleFields, { ...props, days, onStartDate, onEndDate,
      onDays: value => { changes.push(value); setDays(value); } });
  }
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const act = callback => { renderer.flushSync(callback); renderer.flushPassiveEffects(); renderer.flushSync(() => {}); renderer.flushPassiveEffects(); };
  const render = patch => { props = { ...props, ...patch }; act(() => renderer.updateContainer(React.createElement(Form), root, null)); };
  t.after(() => act(() => renderer.updateContainer(null, root, null)));
  const nodes = () => { const all = []; const visit = node => { all.push(node); node.children.forEach(visit); }; visit(container); return all; };
  const button = label => nodes().find(node => node.type === 'Pressable' && node.props.accessibilityLabel === label);
  const calendarDay = day => nodes().find(node => node.type === 'Pressable' && !node.props.accessibilityLabel &&
    node.children[0]?.type === 'Text' && node.children[0].children[0]?.text === String(day));
  render();
  return { render, changes, button, endDates, startDates, calendarDay,
    press: label => act(() => button(label).props.onPress()),
    pressDate: day => act(() => calendarDay(day).props.onPress()),
    hasText: value => nodes().some(node => node.text === value),
    enabled: () => labels.filter(label => !button(label).props.disabled), get days() { return selected; } };
}

test('single Saturday auto-selects Saturday, keeps seven visible days, and blocks out-of-range taps', t => {
  const form = schedule(t, { days: ['M', 'F'] });
  assert.deepEqual(form.enabled(), ['Sat']);
  assert.deepEqual(form.days, ['S']);
  assert.equal(form.button('Sat').props.accessibilityState.selected, true);
  assert.equal(form.changes.length, 1);
  for (const label of labels.filter(label => label !== 'Sat')) {
    const button = form.button(label);
    assert.equal(button.props.accessibilityState.disabled, true);
    assert.ok(button.props.style.some(style => style && style.opacity < 1));
    form.press(label);
  }
  form.press('Sat');
  assert.deepEqual(form.days, ['S']);
  assert.equal(form.changes.length, 1); // Required single-day selection cannot toggle itself off.
});

test('Sunday through Thursday enables only those days and cleans invalid selections', t => {
  const form = schedule(t, { startDate: '11/01/2026', endDate: '11/05/2026', days: ['Su', 'M', 'F', 'S'] });
  assert.deepEqual(form.enabled(), ['Mon', 'Tue', 'Wed', 'Thu', 'Sun']);
  assert.deepEqual(form.days, ['Su', 'M']);
  form.press('Tue');
  assert.deepEqual(form.days, ['Su', 'M', 'T']);
  form.press('Fri');
  assert.deepEqual(form.days, ['Su', 'M', 'T']);
});

test('changing dates cleans selections, auto-selects a single day, and widening retains choices', t => {
  const form = schedule(t, { startDate: '11/01/2026', endDate: '11/08/2026', days: ['M', 'W', 'F'] });
  form.render({ endDate: '11/05/2026' });
  assert.deepEqual(form.days, ['M', 'W']);
  form.render({ startDate: '11/04/2026', endDate: '11/04/2026' });
  assert.deepEqual(form.days, ['W']);
  form.render({ startDate: '11/01/2026', endDate: '11/08/2026' });
  assert.deepEqual(form.enabled(), labels);
  assert.deepEqual(form.days, ['W']);
  form.press('Fri');
  assert.deepEqual(form.days, ['W', 'F']);
});

test('short-term ranges spanning the full week enable every weekday', t => {
  const form = schedule(t, { startDate: '11/01/2026', endDate: '11/06/2026' });
  assert.deepEqual(form.enabled(), ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sun']);
  for (const endDate of ['11/07/2026', '11/08/2026']) {
    form.render({ endDate });
    assert.deepEqual(form.enabled(), labels);
  }
});

test('short-term end calendar allows Nov 18 through Nov 25 and shades earlier and later dates', t => {
  const form = schedule(t, { startDate: '11/18/2099', endDate: '11/18/2099' });
  form.press('End date');
  assert.ok(form.hasText('The end date for a short-term booking can be up to 7 days after the start date.'));
  for (let day = 1; day <= 30; day++) {
    const disabled = day < 18 || day > 25;
    const props = form.calendarDay(day).props;
    assert.equal(props.disabled, disabled);
    assert.equal(props.accessibilityState.disabled, disabled);
    if (disabled) assert.ok(props.style.some(style => style && style.opacity < 1));
  }
  form.pressDate(17);
  form.pressDate(26);
  assert.deepEqual(form.endDates, []);
  form.pressDate(25);
  assert.deepEqual(form.endDates, ['11/25/2099']);
});

test('changing the start date or switching to short-term replaces an invalid end date', t => {
  const form = schedule(t, { startDate: '11/18/2099', endDate: '11/25/2099' });
  form.press('Service date');
  form.pressDate(17);
  assert.deepEqual(form.startDates, ['11/17/2099']);
  assert.deepEqual(form.endDates, ['11/17/2099']);
  form.render({ bookingType: 'long_term', startDate: '11/18/2099', endDate: '12/18/2099' });
  form.render({ bookingType: 'short_term' });
  assert.deepEqual(form.endDates, ['11/17/2099', '']);
});

test('ongoing work enables every day without auto-selecting extras', t => {
  const form = schedule(t, { bookingType: 'long_term', ongoing: true, endDate: '', days: ['M', 'F'] });
  assert.deepEqual(form.enabled(), labels);
  assert.deepEqual(form.days, ['M', 'F']);
  form.press('Sun');
  assert.deepEqual(form.days, ['M', 'F', 'Su']);
  form.render({ bookingType: 'short_term', ongoing: false, endDate: '10/31/2026' });
  assert.deepEqual(form.enabled(), ['Sat']);
  assert.deepEqual(form.days, ['S']);
});

for (const lock of ['readOnly', 'disabled']) {
  test(`${lock} never changes saved schedule data and unlock cleans it once`, t => {
    const form = schedule(t, { [lock]: true, days: ['M'] });
    assert.deepEqual(form.enabled(), []);
    form.press('Sat');
    assert.deepEqual(form.days, ['M']);
    assert.deepEqual(form.changes, []);
    form.render({ [lock]: false });
    assert.deepEqual(form.days, ['S']);
    assert.equal(form.changes.length, 1);
  });
}

test('calendar calculation handles year boundaries, leap day, and short jobs without an explicit end date', t => {
  const form = schedule(t, { startDate: '12/31/2026', endDate: '01/01/2027' });
  assert.deepEqual(form.enabled(), ['Thu', 'Fri']);
  form.render({ startDate: '02/28/2028', endDate: '03/01/2028' });
  assert.deepEqual(form.enabled(), ['Mon', 'Tue', 'Wed']);
  form.render({ startDate: '02/29/2028', endDate: '' });
  assert.deepEqual(form.enabled(), ['Tue']);
  assert.deepEqual(form.days, ['T']);
});

test('incomplete or reversed ranges preserve choices until valid dates are supplied', t => {
  const form = schedule(t, { bookingType: 'long_term', startDate: '11/01/2026', endDate: '', days: ['M', 'F'] });
  assert.deepEqual(form.enabled(), labels);
  assert.deepEqual(form.days, ['M', 'F']);
  form.render({ endDate: '10/31/2026' });
  assert.deepEqual(form.enabled(), labels);
  assert.deepEqual(form.days, ['M', 'F']);
  form.render({ bookingType: 'short_term', endDate: '11/05/2026' });
  assert.deepEqual(form.days, ['M']);
});
