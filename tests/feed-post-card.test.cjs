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

const native = { StyleSheet: { create: value => value }, Platform: { OS: 'android' } };
for (const name of ['Text', 'View', 'Image', 'Pressable']) native[name] = name;
let language = 'English';
function load(file) {
  const filename = path.resolve(__dirname, '..', file);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (name === 'react') return { ...React, default: React };
    if (name === 'react-native') return native;
    if (name === '@expo/vector-icons') return { Ionicons: 'Icon' };
    if (name.endsWith('LucideIcons')) return { MapPinIcon: 'MapPin' };
    if (name.endsWith('ProfileAvatar')) return { ProfileAvatar: 'Avatar' };
    if (name.endsWith('LanguageContext')) return { useLanguage: () => ({ tr: text => messages.translateMessage(language, text) }) };
    if (name.startsWith('.')) {
      let target = path.resolve(path.dirname(filename), name);
      if (!path.extname(target)) target += fs.existsSync(target + '.ts') ? '.ts' : '.tsx';
      return load(path.relative(path.resolve(__dirname, '..'), target));
    }
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}
const messages = load('src/shared/localization/messages.ts');
const dates = load('src/shared/utils/date.ts');
const { FeedPostCard } = load('src/features/feed/components/FeedPostCard.tsx');
const content = node => node.text || node.children.map(content).join('');
const descendants = node => [node, ...node.children.flatMap(descendants)];
const post = {
  id: 'fixture', employerName: 'Example Poster', avatar: null, roleTag: 'Cleaning',
  location: 'Canitoan, CDO', time: '12h', price: '₱600', unit: '/ day', aboutText: 'A real listing description.',
  booking_status: 'Pending', start_time: '2099-12-31T00:00:00Z', kind: 'service'
};

function card(t, props = {}) {
  const rootNode = { children: [] };
  const root = renderer.createContainer(rootNode, 0, null, false, null, '', error => { throw error; }, null);
  const calls = [];
  const options = {
    post, saved: false, onViewProfile: () => calls.push('profile'),
    onDetails: () => calls.push('details'), onToggleSave: () => calls.push('save'), ...props
  };
  const render = () => renderer.flushSync(() => renderer.updateContainer(React.createElement(FeedPostCard, options), root, null));
  t.after(() => renderer.flushSync(() => renderer.updateContainer(null, root, null)));
  render();
  return { rootNode, calls, options, render, nodes: () => descendants(rootNode) };
}

test('compact timestamps cover minute/hour/day boundaries and omit unknown dates', t => {
  const now = Date.parse('2026-10-30T12:00:00Z');
  t.mock.method(Date, 'now', () => now);
  for (const [minutes, expected] of [[0, 'Now'], [1, '1m'], [59, '59m'], [60, '1h'], [540, '9h'], [720, '12h'], [1440, '1d'], [4320, '3d']]) {
    assert.equal(dates.formatCompactTimeAgo(new Date(now - minutes * 60000).toISOString()), expected);
  }
  assert.equal(dates.formatCompactTimeAgo('invalid'), '');
  assert.equal(dates.formatCompactTimeAgo(), '');
});

for (const kind of ['job', 'service']) {
  test(`${kind}: bottom actions retain callbacks, save toggles, and metadata has no clock`, t => {
    const screen = card(t, { post: { ...post, kind } });
    const actions = screen.nodes().filter(node => node.type === 'View').find(node =>
      node.children.some(child => child.props?.accessibilityLabel === 'Save post'));
    assert.ok(actions);
    const buttons = descendants(actions).filter(node => node.type === 'Pressable');
    assert.deepEqual(buttons.map(node => node.props.accessibilityLabel || content(node)), ['Save post', 'Profile', 'Details']);
    assert.ok(descendants(buttons[1]).some(node => node.type === 'Icon' && node.props.name === 'person-outline' && node.props.size === 20));
    assert.ok(buttons.every(button => content(button) === ''));
    assert.ok(buttons.every(button => {
      const style = button.props.style({ pressed: false })[0];
      return style.width === 36 && style.height === 36 && !style.backgroundColor && !style.borderRadius;
    }));
    assert.ok(descendants(buttons[2]).some(node => node.type === 'Icon' && node.props.name === 'eye-outline'));
    assert.ok(buttons.every(button => button.props.hitSlop === 6));
    for (const action of buttons) action.props.onPress();
    assert.deepEqual(screen.calls, ['save', 'profile', 'details']);
    assert.match(content(screen.rootNode), /Canitoan, CDO/);
    assert.match(content(screen.rootNode), /Cleaning· 12h/);
    assert.match(content(screen.rootNode), /₱ 600\.00\/day/);
    assert.equal(screen.nodes().some(node => node.type === 'Icon' && /time|clock/.test(node.props.name)), false);
    const snippet = screen.nodes().find(node => node.type === 'Text' && content(node) === post.aboutText);
    assert.equal(snippet.props.numberOfLines, 2);
    assert.equal(snippet.props.ellipsizeMode, 'tail');
    screen.options.saved = true; screen.render();
    assert.ok(screen.nodes().some(node => node.type === 'Icon' && node.props.name === 'bookmark'));
    assert.ok(screen.nodes().some(node => node.props?.accessibilityLabel === 'Unsave post' && node.props.accessibilityState.selected));
  });
}

test('old public schedules never show expired notices and action translations remain live', t => {
  const screen = card(t, { post: { ...post, start_time: '2020-01-01T00:00:00Z' } });
  const outerCard = screen.rootNode.children[0];
  assert.doesNotMatch(content(outerCard), /Expired/);
  const actions = outerCard.children.find(node => descendants(node).some(child => child.props?.accessibilityLabel === 'Save post'));
  assert.equal(actions.children.length, 1);
  assert.equal(descendants(actions.children[0]).some(node => node.props?.accessibilityLabel === 'Save post'), true);
  for (const value of ['English', 'Tagalog', 'Bisaya']) {
    language = value; screen.render();
    assert.ok(screen.nodes().some(node => node.props?.accessibilityLabel === messages.translateMessage(language, 'Details')));
    assert.equal(content(screen.rootNode).includes(messages.translateMessage(language, 'Expired')), false);
    assert.ok(content(screen.rootNode).includes('12h'));
  }
  language = 'English';
});

test('custom action slots and missing metadata do not create invented values', t => {
  const screen = card(t, {
    post: { ...post, time: '', price: 'Rate not provided' },
    leftActionButton: React.createElement('Text', null, 'Cancel Post'),
    rightActionButton: React.createElement('Text', null, 'Repost')
  });
  assert.match(content(screen.rootNode), /Cancel Post/);
  assert.match(content(screen.rootNode), /Repost/);
  assert.doesNotMatch(content(screen.rootNode), /Recently|Rate not provided\/day|· /);
});
