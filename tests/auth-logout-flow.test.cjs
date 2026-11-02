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
  const fullPath = path.resolve(__dirname, '..', filename);
  const source = ts.transpileModule(fs.readFileSync(fullPath, 'utf8'), {
    fileName: filename,
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (name === 'react') return { ...React, default: React };
    if (name in mocks) return mocks[name];
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}

const tick = async () => {
  await new Promise(resolve => setImmediate(resolve));
  renderer.flushPassiveEffects();
};

function surfaces() {
  const native = {
    StyleSheet: { create: value => value, hairlineWidth: 1 },
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    Alert: { alert() {} },
    Animated: {
      Value: function (val) {
        this.val = val;
        this.interpolate = () => this;
      },
      spring: () => ({ start: fn => fn && fn({ finished: true }) }),
      timing: () => ({ start: fn => fn && fn({ finished: true }) }),
      multiply: () => 1,
      add: () => 0,
      View: 'AnimatedView',
    },
    Platform: { OS: 'android' },
    BackHandler: { addEventListener: () => ({ remove() {} }) },
    KeyboardAvoidingView: 'KeyboardAvoidingView',
    ScrollView: 'ScrollView',
    TextInput: 'TextInput',
    ActivityIndicator: 'ActivityIndicator',
  };
  for (const name of ['View', 'Text', 'Image', 'Pressable']) {
    native[name] = name;
  }
  return native;
}

function mount(t) {
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const act = callback => renderer.flushSync(callback);
  const render = element => {
    act(() => renderer.updateContainer(element, root, null));
    renderer.flushPassiveEffects();
  };
  const unmount = () => render(null);
  t.after(unmount);
  const all = (type, node = container) => {
    let result = [];
    if (node.type === type) result.push(node);
    if (node.children) {
      for (const child of node.children) {
        result = result.concat(all(type, child));
      }
    }
    return result;
  };
  const textContent = node => {
    if (!node) return '';
    if (typeof node.text === 'string') return node.text;
    if (node.children) return node.children.map(textContent).join('');
    return '';
  };
  return { render, act, all, textContent, container };
}

test('LandingScreen: renders "Welcome back, Daven" view when isLoginView is true and remembered account exists', async t => {
  const native = surfaces();
  const storage = new Map([
    ['serbisure.remembered_account', JSON.stringify({ firstName: 'Maria', identifier: 'maria@serbisure.com' })],
  ]);
  const secureStoreMock = {
    getItemAsync: async key => storage.get(key) || null,
    setItemAsync: async (key, val) => storage.set(key, val),
    deleteItemAsync: async key => storage.delete(key),
  };

  const rememberedAccountModule = load('src/shared/auth/rememberedAccount.ts', {
    'expo-secure-store': secureStoreMock,
  });

  const languageApi = {
    useLanguage: () => ({ tr: text => text, formatDate: d => d }),
  };

  const { LandingScreen } = load('src/features/auth/screens/LandingScreen.tsx', {
    'react-native': native,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '../../../shared/localization/LanguageContext': languageApi,
    '../../../shared/api/config': { API_BASE_URL: 'http://test.local' },
    '../../../shared/api/httpClient': { fetchWithTimeout: async () => ({ ok: true, json: async () => ({}) }) },
    '../../../shared/theme/theme': {
      default: {
        colors: { brand: '#FFB380', brandDark: '#E28B50', ink: '#0D0D11', canvas: '#F6F5F2' },
        roundness: { pill: 9999 },
        typography: { fontFamily: { displayExtraBold: 'DisplayExtraBold', display: 'Display', bodyMedium: 'BodyMedium', body: 'Body' }, tracking: { tighter: -1, tight: -0.5 } },
      },
    },
    '../../../shared/auth/session': { isSessionTokens: () => true },
    '../../../shared/components/AppHeader': { APP_HEADER_BACK_ICON_COLOR: '#2A2925', APP_HEADER_BACK_ICON_SIZE: 26 },
    '../../../shared/auth/rememberedAccount': rememberedAccountModule,
    '../../auth/session/UserContext': { useUser: () => ({ user: { firstName: 'Daven', email: 'daven@serbisure.com' } }) },
    '../../../../assets/serbisure-icon.png': 1,
    '../../../../assets/landingpage1-transparent.png': 2,
  });

  const screen = mount(t);
  let backCount = 0;
  let signUpCount = 0;

  screen.render(
    React.createElement(LandingScreen, {
      isLoginView: true,
      onBackToLanding: () => { backCount++; },
      onSignUp: () => { signUpCount++; },
    })
  );

  await tick();

  // 1. Should display "Welcome back, Maria"
  const allTexts = screen.all('Text').map(screen.textContent);
  assert.ok(
    allTexts.some(t => t.includes('Welcome back,') && t.includes('Maria')),
    'Expected "Welcome back, Maria" to be displayed on screen'
  );

  // 2. In Welcome Back mode, there should only be ONE password TextInput (no email input)
  const textInputs = screen.all('TextInput');
  assert.equal(textInputs.length, 1, 'Expected only 1 TextInput (password) in Welcome Back mode');
  assert.equal(textInputs[0].props.placeholder, 'Password');

  // 3. Bottom links should include "Sign up" and "Switch account"
  assert.ok(allTexts.includes('Sign up'), 'Expected "Sign up" link in Welcome Back mode');
  assert.ok(allTexts.includes('Switch account'), 'Expected "Switch account" link in Welcome Back mode');

  // 4. Tap "Switch account" -> should transition to full login view (Image 2)
  const switchAccountPressable = screen.all('Pressable').find(p => screen.textContent(p).includes('Switch account'));
  assert.ok(switchAccountPressable, 'Expected Switch account pressable to be present');
  screen.act(() => switchAccountPressable.props.onPress());
  await tick();

  // In Switch Account mode:
  // Should have TWO inputs: Email or phone number + Password
  const switchedInputs = screen.all('TextInput');
  assert.equal(switchedInputs.length, 2, 'Expected 2 TextInputs in Switch Account mode');
  assert.equal(switchedInputs[0].props.placeholder, 'Email or phone number');
  assert.equal(switchedInputs[1].props.placeholder, 'Password');

  // "Welcome back, Maria" should NOT be displayed in Switch Account mode
  const switchedTexts = screen.all('Text').map(screen.textContent);
  assert.ok(
    !switchedTexts.some(t => t.includes('Welcome back,')),
    'Expected "Welcome back," not to be displayed in Switch Account mode'
  );
  assert.ok(
    switchedTexts.some(t => t.includes("Don't have an account?")),
    'Expected "Don\'t have an account?" footer in Switch Account mode'
  );

  // 5. User instruction: "then switch account, back button goes back to landingpage"
  // Pressing back button in Switch Account mode should call onBackToLanding
  const backPressable = screen.all('Pressable').find(p => p.props.accessibilityLabel === 'Back to landing page');
  assert.ok(backPressable, 'Expected back button to be present');
  screen.act(() => backPressable.props.onPress());
  await tick();

  assert.equal(backCount, 1, 'Expected onBackToLanding to be called when back button is pressed');
});

test('LandingScreen: back button on Welcome Back view also goes back to landing page', async t => {
  const native = surfaces();
  const secureStoreMock = {
    getItemAsync: async () => JSON.stringify({ firstName: 'Maria', identifier: 'maria@serbisure.com' }),
    setItemAsync: async () => {},
    deleteItemAsync: async () => {},
  };

  const rememberedAccountModule = load('src/shared/auth/rememberedAccount.ts', {
    'expo-secure-store': secureStoreMock,
  });

  const languageApi = {
    useLanguage: () => ({ tr: text => text, formatDate: d => d }),
  };

  const { LandingScreen } = load('src/features/auth/screens/LandingScreen.tsx', {
    'react-native': native,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '../../../shared/localization/LanguageContext': languageApi,
    '../../../shared/api/config': { API_BASE_URL: 'http://test.local' },
    '../../../shared/api/httpClient': { fetchWithTimeout: async () => ({ ok: true, json: async () => ({}) }) },
    '../../../shared/theme/theme': {
      default: {
        colors: { brand: '#FFB380', brandDark: '#E28B50', ink: '#0D0D11', canvas: '#F6F5F2' },
        roundness: { pill: 9999 },
        typography: { fontFamily: { displayExtraBold: 'DisplayExtraBold', display: 'Display', bodyMedium: 'BodyMedium', body: 'Body' }, tracking: { tighter: -1, tight: -0.5 } },
      },
    },
    '../../../shared/auth/session': { isSessionTokens: () => true },
    '../../../shared/components/AppHeader': { APP_HEADER_BACK_ICON_COLOR: '#2A2925', APP_HEADER_BACK_ICON_SIZE: 26 },
    '../../../shared/auth/rememberedAccount': rememberedAccountModule,
    '../../auth/session/UserContext': { useUser: () => ({ user: { firstName: 'Daven' } }) },
    '../../../../assets/serbisure-icon.png': 1,
    '../../../../assets/landingpage1-transparent.png': 2,
  });

  const screen = mount(t);
  let backCount = 0;

  screen.render(
    React.createElement(LandingScreen, {
      isLoginView: true,
      onBackToLanding: () => { backCount++; },
    })
  );

  await tick();

  const backPressable = screen.all('Pressable').find(p => p.props.accessibilityLabel === 'Back to landing page');
  assert.ok(backPressable, 'Expected back button to be present');
  screen.act(() => backPressable.props.onPress());
  await tick();

  assert.equal(backCount, 1, 'Expected back button on Welcome Back screen to navigate to landing page');
});

test('LandingScreen: fresh user with no remembered account shows standard login UI by default', async t => {
  const native = surfaces();
  const secureStoreMock = {
    getItemAsync: async () => null,
    setItemAsync: async () => {},
    deleteItemAsync: async () => {},
  };

  const rememberedAccountModule = load('src/shared/auth/rememberedAccount.ts', {
    'expo-secure-store': secureStoreMock,
  });

  const languageApi = {
    useLanguage: () => ({ tr: text => text, formatDate: d => d }),
  };

  const { LandingScreen } = load('src/features/auth/screens/LandingScreen.tsx', {
    'react-native': native,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@expo/vector-icons': { Ionicons: 'Icon' },
    '../../../shared/localization/LanguageContext': languageApi,
    '../../../shared/api/config': { API_BASE_URL: 'http://test.local' },
    '../../../shared/api/httpClient': { fetchWithTimeout: async () => ({ ok: true, json: async () => ({}) }) },
    '../../../shared/theme/theme': {
      default: {
        colors: { brand: '#FFB380', brandDark: '#E28B50', ink: '#0D0D11', canvas: '#F6F5F2' },
        roundness: { pill: 9999 },
        typography: { fontFamily: { displayExtraBold: 'DisplayExtraBold', display: 'Display', bodyMedium: 'BodyMedium', body: 'Body' }, tracking: { tighter: -1, tight: -0.5 } },
      },
    },
    '../../../shared/auth/session': { isSessionTokens: () => true },
    '../../../shared/components/AppHeader': { APP_HEADER_BACK_ICON_COLOR: '#2A2925', APP_HEADER_BACK_ICON_SIZE: 26 },
    '../../../shared/auth/rememberedAccount': rememberedAccountModule,
    '../../auth/session/UserContext': { useUser: () => ({ user: null }) },
    '../../../../assets/serbisure-icon.png': 1,
    '../../../../assets/landingpage1-transparent.png': 2,
  });

  const screen = mount(t);
  screen.render(
    React.createElement(LandingScreen, {
      isLoginView: true,
      onBackToLanding: () => {},
      onSignUp: () => {},
    })
  );

  await tick();

  // 1. Should NOT display "Welcome back"
  const allTexts = screen.all('Text').map(screen.textContent);
  assert.ok(
    !allTexts.some(t => t.includes('Welcome back')),
    'Expected "Welcome back" NOT to be displayed for fresh user'
  );

  // 2. Should display standard inputs: Email or phone number + Password
  const textInputs = screen.all('TextInput');
  assert.equal(textInputs.length, 2, 'Expected 2 TextInputs (email and password) by default');
  assert.equal(textInputs[0].props.placeholder, 'Email or phone number');
  assert.equal(textInputs[1].props.placeholder, 'Password');

  // 3. Should display standard footer "Don't have an account? Sign up"
  assert.ok(
    allTexts.some(t => t.includes("Don't have an account?")),
    'Expected "Don\'t have an account?" footer by default'
  );
});
