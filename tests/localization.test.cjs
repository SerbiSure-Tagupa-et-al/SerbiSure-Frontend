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
const native = { StyleSheet: { create: value => value }, Platform: { OS: 'android' } };
for (const name of ['Text', 'View', 'Pressable', 'Image', 'ScrollView', 'TextInput', 'Switch', 'ActivityIndicator', 'Modal', 'KeyboardAvoidingView']) native[name] = name;
native.FlatList = React.forwardRef((props, ref) => {
  React.useImperativeHandle(ref, () => ({ scrollToOffset() {}, scrollToIndex() {} }), []);
  return React.createElement('FlatList', props);
});
const modules = new Map();
function load(filename) {
  filename = path.resolve(__dirname, '..', filename);
  if (!fs.existsSync(filename)) filename = ['.ts', '.tsx'].map(extension => filename + extension).find(fs.existsSync);
  if (modules.has(filename)) return modules.get(filename);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const module = { exports: {} }; modules.set(filename, module.exports);
  new Function('require', 'module', 'exports', source)(name => {
    if (name === 'react-native') return native;
    if (name === '@expo/vector-icons') return { Ionicons: 'Icon', MaterialCommunityIcons: 'Icon', Feather: 'Icon' };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
    if (name.endsWith('/shared/ui/ProfileAvatar')) return { ProfileAvatar: 'Avatar' };
    return name.startsWith('.') ? load(path.resolve(path.dirname(filename), name)) : require(name);
  }, module, module.exports);
  return module.exports;
}
const { UI_MESSAGES, translateMessage, formatLocalizedDate } = load('src/shared/localization/messages.ts');
const { LanguageProvider, useLanguage, TRANSLATIONS } = load('src/shared/localization/LanguageContext.tsx');
const { HomeFeedFilters, HomeFeedHeader, HomeFeedEmptyState } = load('src/features/feed/components/HomeFeedControls.tsx');
const { SettingsSection } = load('src/features/profile/components/SettingsSection.tsx');
const { ReviewsSection } = load('src/features/profile/components/ReviewsSection.tsx');
const { browseHeaderCopy, quickBrowseFilters } = load('src/features/feed/browsePresentation.ts');
const { WorkScheduleFields } = load('src/features/bookings/components/WorkScheduleFields.tsx');
const { FeedPostCard } = load('src/features/feed/components/FeedPostCard.tsx');

test('job and service feed cards share the full layout, actions and live translations', t => {
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const render = element => renderer.flushSync(() => renderer.updateContainer(element, root, null));
  t.after(() => render(null));
  let changeLanguage;
  const calls = [];
  const content = node => node.text || node.children.map(content).join('');
  const nodes = () => { const found = []; const visit = node => { found.push(node); node.children.forEach(visit); }; container.children.forEach(visit); return found; };
  function Screen({ kind, applied, saved }) {
    changeLanguage = useLanguage().setLanguage;
    return React.createElement(FeedPostCard, {
      post: { kind, employerName: 'Poster Name', roleTag: 'Cleaning', time: 'Posted 3h ago', avatar: 'https://test.local/avatar.png',
        location: 'Agusan, Cagayan de Oro', termTag: 'Long-term', price: '₱8000', unit: '/ month', aboutText: 'Original listing description.' },
      applied, saved, onViewProfile: () => calls.push('profile'), onDetails: () => calls.push('details'), onToggleSave: () => calls.push('save'),
    });
  }
  const show = (kind, applied = false, saved = false) => render(React.createElement(LanguageProvider, null, React.createElement(Screen, { kind, applied, saved })));
  let serviceLayout;
  for (const kind of ['service', 'job']) {
    show(kind);
    for (const language of ['English', 'Tagalog', 'Bisaya']) {
      renderer.flushSync(() => changeLanguage(language));
      const text = content(container);
      for (const source of ['Profile', 'Details']) assert.ok(nodes().some(node => node.props?.accessibilityLabel === translateMessage(language, source)), `${kind}: ${language}: ${source}`);
      for (const value of ['Poster Name', 'Agusan, Cagayan de Oro', '₱ 8,000.00', 'Original listing description.']) assert.ok(text.includes(value));
    }
    renderer.flushSync(() => changeLanguage('English'));
    const layout = nodes().map(node => node.type || node.text);
    if (kind === 'service') serviceLayout = layout;
    else assert.deepEqual(layout, serviceLayout);
    const press = label => nodes().find(node => node.type === 'Pressable' && node.props.accessibilityLabel === label).props.onPress();
    press('Profile'); press('Details');
    nodes().find(node => node.type === 'Pressable' && node.children.some(child => child.type === 'Icon' && child.props.name === 'bookmark-outline')).props.onPress();
  }
  assert.deepEqual(calls, ['profile', 'details', 'save', 'profile', 'details', 'save']);
  show('job', true, true);
  assert.ok(nodes().some(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Details' && node.children.some(child => child.type === 'Icon' && child.props.name === 'checkmark-circle')));
  assert.ok(nodes().some(node => node.type === 'Icon' && node.props.name === 'bookmark'));
});

test('every UI message has both translations and preserves the same interpolation fields', () => {
  const fields = value => [...value.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
  for (const [source, translations] of Object.entries(UI_MESSAGES)) {
    assert.equal(translations.length, 2, source);
    for (const text of translations) { assert.ok(text.trim(), source); assert.deepEqual(fields(text), fields(source), source); }
  }
  assert.deepEqual(Object.keys(TRANSLATIONS.Tagalog).sort(), Object.keys(TRANSLATIONS.English).sort());
  assert.deepEqual(Object.keys(TRANSLATIONS.Bisaya).sort(), Object.keys(TRANSLATIONS.English).sort());
});

test('Cebuano shares Bisaya translations, interpolation is safe, and unknown content is preserved', () => {
  assert.equal(translateMessage('Cebuano', 'No Recent Posts'), translateMessage('Bisaya', 'No Recent Posts'));
  assert.equal(translateMessage('Tagalog', 'Based on {count} reviews', { count: 3 }), 'Batay sa 3 rebyu');
  assert.equal(translateMessage('Bisaya', 'My own review, exactly as written'), 'My own review, exactly as written');
  assert.equal(translateMessage('Tagalog', 'constructor'), 'constructor');
  assert.equal(translateMessage('Tagalog', 'Posted 3h ago'), 'Na-post 3 oras ang nakalipas');
  assert.equal(translateMessage('Bisaya', '2d ago'), '2 adlaw ang milabay');
});

test('dates use explicit local names, including Android Cebuano without Intl support', () => {
  const friday = new Date(2026, 9, 16, 12);
  assert.equal(formatLocalizedDate('English', friday, 'greeting'), 'Friday, October 16');
  assert.equal(formatLocalizedDate('Tagalog', friday, 'greeting'), 'Biyernes, Oktubre 16');
  assert.equal(formatLocalizedDate('Bisaya', friday, 'monthYear'), 'Oktubre 2026');
  assert.equal(formatLocalizedDate('Cebuano', friday, 'greeting'), 'Biyernes, Oktubre 16');
  assert.equal(formatLocalizedDate('English', '10/25/2026', 'compact'), 'Oct 25, 2026');
  assert.equal(formatLocalizedDate('Tagalog', '10/25/2026', 'compact'), 'Okt 25, 2026');
  assert.equal(formatLocalizedDate('English', '2026-10-25', 'compact'), 'Oct 25, 2026');
  assert.equal(formatLocalizedDate('Tagalog', 'invalid'), '');
});

test('switching the live provider updates home, settings and reviews while preserving reviewer content and API filter keys', t => {
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const render = element => renderer.flushSync(() => renderer.updateContainer(element, root, null));
  t.after(() => render(null));
  let switchLanguage; let selectedCategory;
  const review = { review_id: 'review-1', reviewer_name: 'James Christopher Tagupa', reviewer_profile_link: null,
    unstructured_feedback: 'This is my own English review.', rating: 5, nlp_sentiment: 'Positive', createdAt: '2026-10-16T12:00:00+08:00' };
  function Screen() {
    const { language, setLanguage, t, tr } = useLanguage(); switchLanguage = setLanguage;
    return React.createElement(React.Fragment, null,
      React.createElement(HomeFeedHeader, { onViewAll() {} }),
      React.createElement(HomeFeedFilters, { placeholder: t.searchJobs, searchQuery: '', selectedCategory: null, onSearchChange() {}, onCategoryChange: value => { selectedCategory = value; } }),
      React.createElement(HomeFeedEmptyState, { role: 'kasambahay', hasActiveFilters: false, onResetFilters() {} }),
      React.createElement(SettingsSection, { profile: { language, setLanguage, t, copy: { bookingTitle: 'My Jobs & Contracts', bookingIcon: 'briefcase' },
        effectiveVerificationStatus: 'Verified', isLanguageExpanded: false, showContactNumber: false } }),
      React.createElement(ReviewsSection, { profile: { t, copy: { reviewer: tr('Verified Client') }, reviews: [review], isReviewsExpanded: false, setIsReviewsExpanded() {} } }),
    );
  }
  const nodes = () => { const found = []; const visit = node => { found.push(node); node.children.forEach(visit); }; container.children.forEach(visit); return found; };
  const content = node => node.text || node.children.map(content).join('');
  render(React.createElement(LanguageProvider, null, React.createElement(Screen)));
  assert.match(content(container), /Recent Posts/);
  for (const language of ['Tagalog', 'Bisaya', 'English']) {
    renderer.flushSync(() => switchLanguage(language));
    const text = content(container);
    for (const source of ['Recent Posts', 'No Recent Posts', 'Tags & Socials', 'Show Contact Number', 'Positive']) assert.ok(text.includes(translateMessage(language, source)), `${language}: ${source}`);
    assert.ok(text.includes('James Christopher Tagupa'));
    assert.ok(text.includes(review.unstructured_feedback));
    const childCare = nodes().find(node => node.type === 'Pressable' && node.props.accessibilityLabel === translateMessage(language, 'Filter: {category}', { category: translateMessage(language, 'Child Care') }));
    assert.ok(childCare, language); childCare.props.onPress(); assert.equal(selectedCategory, 'Child Care');
    if (language !== 'English') {
      for (const english of ['Recent Posts', 'No Recent Posts', 'Tags & Socials', 'Show Contact Number', 'October']) assert.ok(!text.includes(english), `${language} leaked ${english}`);
    }
  }
  assert.equal(review.nlp_sentiment, 'Positive');
});

test('browse counts translate without changing canonical filter values', () => {
  const tr = (source, params) => translateMessage('Bisaya', source, params);
  assert.deepEqual(browseHeaderCopy('kasambahay', 'saved', 2, false, null, tr), { title: 'Mga Na-save nga Trabaho', subtitle: '2 na-save nga post' });
  assert.equal(quickBrowseFilters({ categories: [] }, 'Child Care').categories[0], 'Child Care');
});

test('schedule fields translate live and preserve wheel-selected hours and duration terms', t => {
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const render = element => renderer.flushSync(() => renderer.updateContainer(element, root, null));
  t.after(() => render(null));
  let language, setType, terms;
  function Screen() {
    const context = useLanguage(); language = context.setLanguage;
    const [bookingType, changeType] = React.useState('long_term'); setType = changeType;
    const [ongoing, onOngoing] = React.useState(false);
    const [endDate, onEndDate] = React.useState('');
    const [workHours, onWorkHours] = React.useState('');
    const [shift, onShift] = React.useState(null);
    terms = { ongoing, endDate, workHours, shift };
    return React.createElement(WorkScheduleFields, { bookingType, ongoing, onOngoing, startDate: '12/01/2099', onStartDate() {},
      endDate, onEndDate, workHours, onWorkHours, days: ['T'], onDays() {}, shift, onShift });
  }
  const nodes = () => { const result = []; const visit = node => {
    if (node.type === 'Modal' && !node.props.visible) return;
    result.push(node); node.children.forEach(visit);
  }; container.children.forEach(visit); return result; };
  const text = () => nodes().filter(node => node.text !== undefined).map(node => node.text).join(' ');
  const content = node => node.text || node.children.map(content).join('');
  const press = label => renderer.flushSync(() => nodes().find(node => node.type === 'Pressable' && content(node) === label).props.onPress());
  render(React.createElement(LanguageProvider, null, React.createElement(Screen)));
  for (const name of ['English', 'Tagalog', 'Bisaya']) {
    renderer.flushSync(() => language(name));
    for (const source of ['START DATE TO END DATE', 'With an end date', 'No end date', 'Select daily working hours']) {
      assert.ok(text().includes(translateMessage(name, source)), `${name}: ${source}`);
    }
  }
  renderer.flushSync(() => nodes().find(node => node.type === 'Pressable' && node.props.accessibilityLabel === translateMessage('Bisaya', 'End date')).props.onPress());
  assert.equal(nodes().find(node => node.type === 'Pressable' && content(node) === '30').props.disabled, true);
  assert.equal(nodes().find(node => node.type === 'Pressable' && content(node) === '31').props.disabled, false);
  press('31');
  assert.equal(terms.endDate, '12/31/2099');
  press(translateMessage('Bisaya', 'No end date'));
  assert.equal(terms.ongoing, true);
  assert.equal(terms.endDate, '');
  renderer.flushSync(() => { setType('short_term'); language('Tagalog'); });
  press(translateMessage('Tagalog', 'Select daily working hours'));
  const wheel = (column, value) => renderer.flushSync(() => {
    const list = nodes().filter(node => node.type === 'FlatList')[column];
    const index = list.props.data.indexOf(value); assert.ok(index >= 0);
    list.props.renderItem({ item: value, index }).props.onPress();
  });
  wheel(0, '9'); press('Next'); wheel(0, '2'); wheel(2, 'PM'); press('Done');
  assert.equal(terms.shift, 'custom');
  assert.equal(terms.workHours, '09:00 AM - 02:00 PM');
  renderer.flushSync(() => language('Bisaya'));
  assert.ok(text().includes(translateMessage('Bisaya', 'WORK HOURS')));
  assert.ok(text().includes('09:00 AM - 02:00 PM'));
});
