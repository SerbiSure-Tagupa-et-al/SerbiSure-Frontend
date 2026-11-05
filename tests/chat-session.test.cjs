const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const React = require('react');
const Reconciler = require('react-reconciler');
const { DefaultEventPriority } = require('react-reconciler/constants');

// Exercise the real chat component with React reconciliation; replace only native surfaces and I/O.
const append = (parent, child) => {
  parent.children = parent.children.filter(item => item !== child);
  parent.children.push(child);
};
const remove = (parent, child) => { parent.children = parent.children.filter(item => item !== child); };
const renderer = Reconciler({
  supportsMutation: true, isPrimaryRenderer: true, now: Date.now,
  getRootHostContext: () => null, getChildHostContext: () => null,
  getCurrentEventPriority: () => DefaultEventPriority,
  prepareForCommit: () => null, resetAfterCommit() {}, shouldSetTextContent: () => false,
  createInstance: (type, props) => ({ type, props, children: [], scrollToEnd() {}, scrollTo() {}, focus() {} }),
  createTextInstance: text => ({ text, children: [] }), getPublicInstance: instance => instance,
  appendInitialChild: append, appendChild: append, appendChildToContainer: append,
  removeChild: remove, removeChildFromContainer: remove,
  insertBefore(parent, child, before) {
    remove(parent, child); parent.children.splice(parent.children.indexOf(before), 0, child);
  },
  insertInContainerBefore(parent, child, before) {
    remove(parent, child); parent.children.splice(parent.children.indexOf(before), 0, child);
  },
  prepareUpdate: () => true, commitUpdate(instance, _payload, _type, _old, props) { instance.props = props; },
  commitTextUpdate(instance, _old, text) { instance.text = text; }, resetTextContent() {},
  finalizeInitialChildren: () => false, clearContainer(container) { container.children = []; },
  scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1, detachDeletedInstance() {},
});

function compile(relative, mocks) {
  const filename = path.resolve(__dirname, '..', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename, compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (name === 'react') return { ...React, default: React };
    if (name in mocks) return mocks[name];
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const payload = text => ({ messages: [{ chat_message_id: text, message_payload: text, is_sender: false,
  createdAt: '2026-10-15T10:00:00Z' }], partnerIsTyping: false, partnerIsOnline: false });
const tick = async () => { await new Promise(resolve => setImmediate(resolve)); renderer.flushPassiveEffects(); };
const localizationMessages = compile('src/shared/localization/messages.ts', {});
const languageContext = compile('src/shared/localization/LanguageContext.tsx', { './messages': localizationMessages });
const replyRelationships = compile('src/features/chat/replyRelationships.ts', {});

function presenceClient(t) {
  const { RealtimeClient } = compile('src/shared/realtime/RealtimeClient.ts', {
    '../api/httpClient': { requestJson: async () => ({}), notifyAccountSuspension() {} },
  });
  let socket, watched = new Set(), currentAccount = null, currentToken = null;
  const watches = new Set();
  const client = new RealtimeClient('https://test.local', () => {
    socket = { close() {}, send(raw) { const data = JSON.parse(raw); if (data.type === 'presence.watch') watched = new Set(data.partner_ids); } };
    return socket;
  });
  const watch = client.watchPresence.bind(client);
  client.watchPresence = ids => { watches.add(ids); const off = watch(ids); return () => { watches.delete(ids); off(); }; };
  const ready = () => { socket.onopen?.({}); socket.onmessage?.({ data: JSON.stringify({ type: 'ready' }) }); };
  t.after(() => client.stop());
  return { client, watches,
    start(account, token = account) { currentAccount = account; currentToken = token; client.start(token, account); if (token && client.status !== 'connected') ready(); },
    event(event) { socket.onmessage?.({ data: JSON.stringify(event) }); },
    status(status) {
      if (status === 'connected') { client.setActive(true); client.start(currentToken, currentAccount); ready(); }
      else if (status === 'reconnecting') socket.onclose?.({ code: 1006 });
      else client.setActive(false);
    },
    isWatched: id => watched.has(id),
  };
}

function screen(t, options = {}) {
  let user = { id: 'account-one', token: 'token-one', accountType: options.accountType || 'Homeowner' };
  const requests = [], sends = [], removals = [], previews = [], alerts = [], deleted = new Set(), entrances = [], scrolls = [], dialogs = [];
  const bookingResponses = [], bookingModals = [], closedBookings = [];
  const live = presenceClient(t); live.start(user.id, user.token);
  const presenceHook = compile('src/shared/realtime/useChatPresence.ts', { './index': { realtime: live.client } });
  const realtimeStatus = compile('src/shared/realtime/useRealtimeStatus.ts', { './index': { realtime: live.client } });
  const animation = (_value, config) => ({
    start(callback) {
      if (options.deferEntrance && config?.toValue === 0) entrances.push(() => callback?.({ finished: true }));
      else callback?.({ finished: true });
    }, stop() {},
  });
  class Value { setValue() {} interpolate() { return 0; } }
  const native = { StyleSheet: { create: value => value, absoluteFillObject: {}, hairlineWidth: 1 },
    Dimensions: { get: () => ({ width: 390, height: 844 }) }, Platform: { OS: 'android' },
    Animated: { Value, View: 'View', spring: animation, timing: animation, loop: animation, sequence: animation, parallel: animation, delay: animation },
    PanResponder: { create: () => ({ panHandlers: {} }) },
    AppState: { currentState: 'active', addEventListener: () => ({ remove() {} }) },
    Alert: { alert: (...args) => alerts.push(args) }, ToastAndroid: { show() {}, SHORT: 0 }, NativeModules: {},
    Keyboard: { dismiss() {} },
    Modal: function NativeModal(props) {
      React.useLayoutEffect(() => { if (props.visible) props.onShow?.(); }, [props.visible]);
      return props.visible ? React.createElement('Modal', props, props.children) : null;
    },
  };
  for (const type of ['Text', 'View', 'Image', 'TextInput', 'ScrollView', 'Pressable', 'KeyboardAvoidingView', 'ActivityIndicator']) native[type] = type;
  native.FlatList = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      scrollToOffset(args) { scrolls.push({ type: 'offset', ...args }); },
      scrollToIndex(args) { scrolls.push({ type: 'index', ...args }); },
    }), []);
    return React.createElement('FlatList', props, props.ListHeaderComponent,
      ...props.data.slice(0, props.initialNumToRender).map((item, index) =>
        // Native inverted list cells reverse their direct children as well as the item order.
        React.createElement('View', { key: item.id, testID: `list-cell-${item.id}`,
          style: { flexDirection: props.inverted ? 'column-reverse' : 'column' } }, props.renderItem({ item, index }))),
      props.ListFooterComponent);
  });
  const api = {
    fetchChatThreadDetails(token, partnerId) {
      const request = { ...deferred(), token, partnerId }; requests.push(request);
      return request.promise.then(result => {
        // Simulate the server's separate watch snapshot for existing message fixtures.
        if (options.autoPresence !== false && token === user.token && live.isWatched(partnerId) && typeof result.partnerIsOnline === 'boolean') {
          live.event({ type: 'presence.changed', partner_id: partnerId, is_online: result.partnerIsOnline });
        }
        return result;
      });
    },
    sendChatMessage(...args) { const request = { ...deferred(), args }; sends.push(request); return request.promise; },
    deleteChatMessage(token, id) { const request = { ...deferred(), token, id }; removals.push(request); return request.promise; },
    sendChatTyping() {},
  };
  const { createThreadRefreshQueue } = compile('src/features/chat/threadRefreshQueue.ts', {});
  const threadCache = compile('src/features/chat/threadCache.ts', {});
  const { ChatDetailScreen } = compile('src/features/chat/components/ChatDetailScreen.tsx', {
    '../../../shared/localization/LanguageContext': languageContext,
    'react-native': native, '../../../../assets/serbisure-icon.png': 1,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) },
    '@expo/vector-icons': { Ionicons: 'Icon' }, 'expo-image-picker': {},
    '../../auth/session/UserContext': { useUser: () => ({ user }) },
    '../../../shared/theme/theme': { default: { typography: { fontFamily: {} } } },
    '../../../shared/realtime': { realtime: live.client },
    '../../../shared/realtime/useRealtimeStatus': realtimeStatus,
    '../../../shared/realtime/useChatPresence': presenceHook,
    '../bookingCards': { mapBookingCard: () => null }, '../api/bookingOffersApi': {
      respondToBookingOffer: (...args) => { const request = { ...deferred(), args }; bookingResponses.push(request); return request.promise; },
    },
    '../../bookings/postAvailability': compile('src/features/bookings/postAvailability.ts', { './engagementForm': compile('src/features/bookings/engagementForm.ts', {}) }),
    '../../bookings/hooks/useScheduleClock': { useScheduleClock: () => Date.now() },
    '../../bookings/bookingAcceptance': compile('src/features/bookings/bookingAcceptance.ts', { 'react-native': native }),
    '../../bookings/components/BookingModal': { BookingModal: props => { dialogs.push('booking'); bookingModals.push(props); return null; } },
    '../../profile/components/UserProfileView': { UserProfileView: () => { dialogs.push('profile'); return null; } },
    '../../profile/components/OfficialProfileModal': { OfficialProfileModal: () => { dialogs.push('official'); return null; } },
    '../hooks/useChatSafety': { useChatSafety: () => null },
    '../api/chatApi': api, '../threadRefreshQueue': { createThreadRefreshQueue },
    '../threadCache': threadCache,
    '../replyRelationships': replyRelationships,
    '../offensiveLanguage': compile('src/features/chat/offensiveLanguage.ts', {}),
    '../store/chatStore': { chatStore: { isMessageDeleted: id => deleted.has(id), markMessageDeleted: id => deleted.add(id), loadInbox: async () => [], addOrUpdateChat: entry => previews.push(entry) } },
    '../../bookings/store/savedJobsStore': { savedJobsStore: { markJobClosed: id => closedBookings.push(id) } }, '../../../shared/api/config': {}, '../../../shared/api/httpClient': {},
  });
  const originalFrame = global.requestAnimationFrame;
  global.requestAnimationFrame = callback => { callback(); return 0; };
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const update = (partnerId, visible = true, extra = {}) => {
    renderer.flushSync(() => renderer.updateContainer(React.createElement(ChatDetailScreen, {
      partnerId, visible, contactName: partnerId, contactRole: 'Admin', onClose() {}, ...extra,
    }), root, null));
    renderer.flushPassiveEffects();
  };
  const nodes = () => {
    const result = [];
    const visit = node => { result.push(node); node.children.forEach(visit); };
    container.children.forEach(visit); return result;
  };
  t.after(() => {
    renderer.flushSync(() => renderer.updateContainer(null, root, null));
    renderer.flushPassiveEffects(); global.requestAnimationFrame = originalFrame;
  });
  return { update, requests, sends, removals, previews, alerts, nodes, threadCache, deleted, entrances, scrolls, dialogs, live, bookingResponses, bookingModals, closedBookings,
    unmount() { renderer.flushSync(() => renderer.updateContainer(null, root, null)); renderer.flushPassiveEffects(); },
    event(event) { renderer.flushSync(() => live.event(event)); },
    texts: () => nodes().filter(node => node.text !== undefined).map(node => node.text).join(' '),
    changeAccount() { user = { ...user, id: 'account-two', token: 'token-two' }; live.start(user.id, user.token); },
    renewToken() { user = { ...user, token: 'renewed-token' }; live.start(user.id, user.token); },
  };
}

test('Android chat pads the full-screen modal above the keyboard without fixing its height', t => {
  const chat = screen(t);
  chat.update('Support');

  const keyboardAvoider = chat.nodes().find(node => node.type === 'KeyboardAvoidingView');
  const chatModal = chat.nodes().find(node => node.type === 'Modal');
  assert.equal(keyboardAvoider.props.behavior, 'padding');
  assert.equal(chatModal.props.statusBarTranslucent, true);
});

for (const accountType of ['Homeowner', 'Kasambahay']) {
  for (const duration of ['short_term', 'fixed_long_term', 'ongoing_long_term']) {
    test(`${accountType}: chat details and quick acceptance use the saved ${duration} booking type`, async t => {
      const role = accountType === 'Homeowner' ? 'homeowner' : 'kasambahay';
      const chat = screen(t, { accountType, deferEntrance: true });
      const bookingType = duration === 'short_term' ? 'short_term' : 'long_term';
      const card = { bookingId: 'booking-one', proposalId: 'proposal-one', title: 'BOOKING OFFER', bookedByName: 'Offer Sender', canRespond: true,
        bookingType, startDate: '10/20/2099', endDate: duration === 'ongoing_long_term' ? '' : duration === 'short_term' ? '10/20/2099' : '11/20/2099' };
      chat.threadCache.cacheThread(JSON.stringify(['account-one', 'Other Person']), [{ id: 'offer-message', sender: 'system', bookingInfo: card, time: 'Now' }], chat.threadCache.threadCacheGeneration());
      chat.update('Other Person', true, { contactRole: accountType === 'Homeowner' ? 'Kasambahay' : 'Homeowner', userRole: role });
      const content = node => node.text || node.children.map(content).join('');
      renderer.flushSync(() => chat.nodes().find(node => node.type === 'Pressable' && content(node).includes('Offer Sender')).props.onPress());
      assert.equal(chat.bookingModals.at(-1).userRole, role);
      assert.equal(chat.bookingModals.at(-1).bookingType, bookingType);
      assert.equal(chat.bookingModals.at(-1).initialDetails.bookingType, bookingType);
      assert.equal(chat.bookingModals.at(-1).canRespond, true);
      renderer.flushSync(() => chat.bookingModals.at(-1).onClose());
      const accept = () => renderer.flushSync(() => chat.nodes().find(node => node.type === 'Pressable' && (content(node) === 'Agree & Accept' || content(node) === 'Accept')).props.onPress({ stopPropagation() {} }));
      accept();
      assert.equal(chat.bookingResponses.length, 0);
      assert.equal(chat.alerts.at(-1)[0], bookingType === 'short_term' ? 'Accept booking?' : 'Confirm Contract Agreement');
      if (bookingType === 'short_term') assert.doesNotMatch(chat.alerts.at(-1)[1], /contract|long-term|registration/i);
      const confirm = chat.alerts.at(-1)[2][1].onPress;
      renderer.flushSync(() => { confirm(); confirm(); });
      assert.equal(chat.bookingResponses.length, 1);
      assert.equal(chat.bookingResponses[0].args[0], 'token-one');
      assert.equal(chat.bookingResponses[0].args[1].bookingType, bookingType);
      assert.equal(chat.bookingResponses[0].args[2], 'accept');
      assert.equal(chat.closedBookings.length, 0);
      chat.bookingResponses[0].resolve(); await tick();
      assert.deepEqual(chat.closedBookings, ['booking-one']);
      assert.ok(!chat.nodes().some(node => node.type === 'Pressable' && (content(node) === 'Agree & Accept' || content(node) === 'Accept')));
    });
  }
}

test('quick booking acceptance keeps the offer available after a connection failure', async t => {
  const chat = screen(t, { accountType: 'Homeowner', deferEntrance: true });
  const card = { bookingId: 'booking-one', title: 'BOOKING OFFER', bookedByName: 'Offer Sender', canRespond: true, bookingType: 'short_term', startDate: '10/20/2099' };
  chat.threadCache.cacheThread(JSON.stringify(['account-one', 'Other Person']), [{ id: 'offer', sender: 'system', bookingInfo: card, time: 'Now' }], chat.threadCache.threadCacheGeneration());
  chat.update('Other Person', true, { contactRole: 'Kasambahay' });
  const content = node => node.text || node.children.map(content).join('');
  renderer.flushSync(() => chat.nodes().find(node => node.type === 'Pressable' && (content(node) === 'Agree & Accept' || content(node) === 'Accept')).props.onPress({ stopPropagation() {} }));
  renderer.flushSync(() => chat.alerts.at(-1)[2][1].onPress());
  chat.bookingResponses[0].reject(new Error('Network request failed')); await tick();
  assert.deepEqual(chat.alerts.at(-1), ['Booking not updated', 'Could not connect. Check your connection and try again.']);
  assert.deepEqual(chat.closedBookings, []);
  assert.ok(chat.nodes().some(node => node.type === 'Pressable' && (content(node) === 'Agree & Accept' || content(node) === 'Accept')));
});

test('passed chat offer disables Accept with a helper while keeping Decline available', async t => {
  const chat = screen(t, { accountType: 'Homeowner', deferEntrance: true });
  const card = { bookingId: 'old-booking', proposalId: 'old-proposal', title: 'BOOKING OFFER', bookedByName: 'Applicant',
    canRespond: true, bookingType: 'short_term', startDate: '01/01/2000', startTime: '2000-01-01T00:00:00Z' };
  chat.threadCache.cacheThread(JSON.stringify(['account-one', 'Other Person']), [{ id: 'old-offer', sender: 'system', bookingInfo: card, time: 'Now' }], chat.threadCache.threadCacheGeneration());
  chat.update('Other Person', true, { contactRole: 'Kasambahay' });
  const text = node => node.text || node.children.map(text).join('');
  const accept = chat.nodes().find(node => node.type === 'Pressable' && text(node) === 'Accept');
  assert.equal(accept.props.disabled, true);
  assert.ok(accept.props.style({ pressed: false }).some(style => style?.backgroundColor === '#9CA3AF'));
  assert.ok(chat.nodes().some(node => node.type === 'Text' && text(node).includes('Please send a new offer in chat')));
  renderer.flushSync(() => accept.props.onPress({ stopPropagation() {} }));
  assert.equal(chat.bookingResponses.length, 0);
  const decline = chat.nodes().find(node => node.type === 'Pressable' && text(node) === 'Decline');
  assert.equal(decline.props.disabled, false);
  renderer.flushSync(() => decline.props.onPress({ stopPropagation() {} }));
  assert.equal(chat.bookingResponses[0].args[2], 'reject');
  chat.bookingResponses[0].resolve(); await tick();
});

test('reply relationships cover incoming, outgoing and self replies', () => {
  const relationship = replyRelationships.getReplyRelationship;
  assert.equal(relationship({ currentIsMine: false, quotedIsMine: true, partnerName: 'Chrislyn Jewel' }), 'Chrislyn Jewel replied to you');
  assert.equal(relationship({ currentIsMine: false, quotedIsMine: false, partnerName: 'Chrislyn Jewel' }), 'Chrislyn Jewel replied to themself');
  assert.equal(relationship({ currentIsMine: true, quotedIsMine: false, partnerName: 'Chrislyn Jewel' }), 'You replied to Chrislyn Jewel');
  assert.equal(relationship({ currentIsMine: true, quotedIsMine: true, partnerName: 'Chrislyn Jewel' }), 'You replied to yourself');
  assert.equal(relationship({ currentIsMine: false, quotedAuthor: 'You', partnerName: 'Chrislyn Jewel' }), 'Chrislyn Jewel replied to themself');
  assert.equal(replyRelationships.isGenericPhotoReply('📷 Photo', 'https://test.local/photo.jpg'), true);
  assert.equal(replyRelationships.isGenericPhotoReply('Receipt photo', 'https://test.local/photo.jpg'), false);
  assert.equal(replyRelationships.isGenericPhotoReply('📷 Photo'), false);
});

test('photo-only replies render the picture without a camera-and-Photo label', t => {
  const chat = screen(t, { deferEntrance: true });
  const history = [
    { id: 'photo-original', sender: 'other', imageUri: 'https://test.local/original.jpg', time: 'Now' },
    { id: 'photo-reply', sender: 'me', text: 'Looks good', time: 'Now', replyTo: { author: 'Photo User', text: '📷 Photo', imageUri: 'https://test.local/original.jpg', messageId: 'photo-original' } },
  ];
  chat.threadCache.cacheThread(JSON.stringify(['account-one', 'Photo User']), history, chat.threadCache.threadCacheGeneration());
  chat.update('Photo User');
  assert.ok(chat.nodes().some(node => node.type === 'Image' && node.props.source?.uri === 'https://test.local/original.jpg' && node.props.style?.width === 84));
  assert.doesNotMatch(chat.texts(), /📷 Photo/);
});

for (const sender of ['me', 'other']) {
  test(`mobile removal confirms and saves privately for ${sender} messages, retaining the message on failure`, async t => {
    const chat = screen(t, { deferEntrance: true });
    const id = 'c348ce19-1000-4000-8000-000000000001';
    const history = [{ id, sender, text: 'Keep this evidence', time: 'Now' }];
    chat.threadCache.cacheThread(JSON.stringify(['account-one', 'A']), history, chat.threadCache.threadCacheGeneration());
    chat.update('A');
    const press = label => renderer.flushSync(() => chat.nodes().find(node => node.props?.accessibilityLabel === label).props.onPress());
    const start = () => {
      renderer.flushSync(() => chat.nodes().find(node => node.type === 'Pressable' && node.props.onLongPress).props.onLongPress());
      assert.doesNotMatch(chat.texts(), /Unsend|Delete for everyone/);
      assert.match(chat.texts(), /Reply/);
      assert.match(chat.texts(), /Copy Text/);
      press('Remove message');
      assert.match(chat.texts(), /Remove for you\?/);
      assert.match(chat.texts(), /This message will be removed from your screen. Other participants will still be able to see it./);
    };
    start(); press('Cancel removal');
    assert.equal(chat.removals.length, 0); assert.equal(chat.deleted.has(id), false);
    start(); press('Confirm removal'); press('Confirm removal');
    assert.equal(chat.removals.length, 1);
    assert.equal(chat.deleted.has(id), false, 'Do not hide evidence before server success');
    chat.removals[0].reject(new Error('Offline')); await tick();
    assert.match(chat.texts(), /Could not remove the message. Try again./);
    assert.match(chat.texts(), /Keep this evidence/);
    press('Confirm removal');
    chat.removals[1].resolve({ message: 'Message removed for you.' }); await tick();
    assert.equal(chat.deleted.has(id), true);
    assert.doesNotMatch(chat.texts(), /Keep this evidence/);
    assert.deepEqual(chat.alerts, [], 'Use in-app confirmation and error text');
  });
}

test('mobile chat renders all four Messenger reply headers for every shared chat role', t => {
  const chat = screen(t, { deferEntrance: true });
  const history = [
    { id: 'mine-original', sender: 'me', text: 'My original', time: 'Now' },
    { id: 'incoming-to-me', sender: 'other', text: 'Incoming answer', time: 'Now', replyTo: { author: 'Mobile User', text: 'My original', messageId: 'mine-original' } },
    { id: 'other-original', sender: 'other', text: 'Their original', time: 'Now' },
    { id: 'incoming-self', sender: 'other', text: 'Their follow-up', time: 'Now', replyTo: { author: 'You', text: 'Their original', messageId: 'other-original' } },
    { id: 'outgoing-to-user', sender: 'me', text: 'My answer', time: 'Now', replyTo: { author: 'Chrislyn Jewel', text: 'Their original', messageId: 'other-original' } },
    { id: 'outgoing-self', sender: 'me', text: 'My follow-up', time: 'Now', replyTo: { author: 'You', text: 'My original', messageId: 'mine-original' } },
  ];
  chat.threadCache.cacheThread(JSON.stringify(['account-one', 'Chrislyn Jewel']), history, chat.threadCache.threadCacheGeneration());
  chat.update('Chrislyn Jewel');
  const expected = {
    'incoming-to-me': 'Chrislyn Jewel replied to you',
    'incoming-self': 'Chrislyn Jewel replied to themself',
    'outgoing-to-user': 'You replied to Chrislyn Jewel',
    'outgoing-self': 'You replied to yourself',
  };
  for (const [id, label] of Object.entries(expected)) {
    const node = chat.nodes().find(item => item.props?.testID === `reply-relationship-${id}`);
    assert.ok(node, `${id} relationship label should render`);
    assert.equal(node.children.map(child => child.text || '').join(''), label);
  }
});

test('switching from a loaded chat immediately removes its history and draft before the next fetch resolves', async t => {
  const chat = screen(t);
  chat.update('A'); chat.requests[0].resolve(payload('dogs')); await tick();
  assert.match(chat.texts(), /dogs/);
  chat.nodes().find(node => node.type === 'TextInput').props.onChangeText('private draft');
  chat.update('B');
  assert.doesNotMatch(chat.texts(), /dogs/);
  assert.ok(chat.nodes().some(node => node.type === 'ActivityIndicator'));
  assert.equal(chat.nodes().find(node => node.type === 'TextInput').props.value, '');
  chat.requests[1].resolve(payload('cats')); await tick();
  assert.match(chat.texts(), /cats/); assert.doesNotMatch(chat.texts(), /dogs/);
});

test('a late response from a closed chat cannot replace the next conversation', async t => {
  const chat = screen(t);
  chat.update('A'); chat.update('A', false); chat.update('B');
  chat.requests[1].resolve(payload('cats')); await tick();
  chat.requests[0].resolve(payload('late dogs')); await tick();
  assert.match(chat.texts(), /cats/); assert.doesNotMatch(chat.texts(), /dogs/);
});

test('reopening before the first load finishes ignores the previous opening response', async t => {
  const chat = screen(t);
  chat.update('A'); chat.update('A', false); chat.update('A');
  chat.requests[0].resolve(payload('old opening')); await tick();
  assert.doesNotMatch(chat.texts(), /old opening/);
  assert.ok(chat.nodes().some(node => node.type === 'ActivityIndicator'));
  chat.requests[1].resolve(payload('current opening')); await tick();
  assert.match(chat.texts(), /current opening/);
});

test('switching signed-in accounts clears the same partner history and ignores an old send completion', async t => {
  const chat = screen(t);
  chat.update('A'); chat.requests[0].resolve(payload('private history')); await tick();
  chat.nodes().find(node => node.type === 'TextInput').props.onChangeText('private outgoing');
  chat.nodes().find(node => node.type === 'Pressable' && node.children.some(child => child.type === 'Icon' && child.props.name === 'send')).props.onPress();
  chat.changeAccount(); chat.update('A');
  assert.doesNotMatch(chat.texts(), /private history|private outgoing/);
  assert.equal(chat.requests[1].token, 'token-two');
  chat.sends[0].resolve({ data: { chat_message_id: 'saved-old-message' } }); await tick();
  assert.deepEqual(chat.previews, []); assert.deepEqual(chat.alerts, []);
  chat.requests[1].resolve(payload('new account')); await tick();
  assert.match(chat.texts(), /new account/);
});

test('a failed new conversation shows its own error and never restores the previous messages', async t => {
  const chat = screen(t);
  chat.update('A'); chat.requests[0].resolve(payload('dogs')); await tick();
  chat.update('B'); chat.requests[1].reject(new Error('Could not load this chat.')); await tick();
  assert.match(chat.texts(), /Could not load messages/); assert.doesNotMatch(chat.texts(), /dogs/);
});

test('a blocked send removes its optimistic bubble, restores the editable draft and leaves recipient previews unchanged', async t => {
  const chat = screen(t);
  chat.update('A'); chat.requests[0].resolve(payload('Earlier message')); await tick();
  chat.nodes().find(node => node.type === 'TextInput').props.onChangeText('Unsuitable outgoing text');
  chat.nodes().find(node => node.type === 'Pressable' && node.children.some(child => child.type === 'Icon' && child.props.name === 'send')).props.onPress();
  assert.match(chat.texts(), /Unsuitable outgoing text/);
  chat.sends[0].reject(new Error('This message may contain inappropriate language. Please edit it before sending.'));
  await tick();
  assert.doesNotMatch(chat.texts(), /Unsuitable outgoing text/);
  assert.equal(chat.nodes().find(node => node.type === 'TextInput').props.value, 'Unsuitable outgoing text');
  assert.equal(chat.alerts.length, 1);
  assert.match(chat.alerts[0][1], /Please edit it/);
  assert.deepEqual(chat.previews, []);
});

test('repeated send taps while a request is pending create only one attempt', async t => {
  const chat = screen(t);
  chat.update('A'); chat.requests[0].resolve(payload('Earlier message')); await tick();
  chat.nodes().find(node => node.type === 'TextInput').props.onChangeText('One outgoing message');
  const send = chat.nodes().find(node => node.type === 'Pressable' && node.children.some(child => child.type === 'Icon' && child.props.name === 'send')).props.onPress;
  send(); send();
  assert.equal(chat.sends.length, 1);
  assert.equal(chat.nodes().find(node => node.type === 'TextInput').props.editable, false);
  chat.sends[0].reject(new Error('Please edit this message.')); await tick();
  assert.equal(chat.nodes().find(node => node.type === 'TextInput').props.editable, true);
});

test('a late blocked-send response cannot restore a draft into a different conversation', async t => {
  const chat = screen(t);
  chat.update('A'); chat.requests[0].resolve(payload('Earlier message')); await tick();
  chat.nodes().find(node => node.type === 'TextInput').props.onChangeText('Private blocked draft');
  chat.nodes().find(node => node.type === 'Pressable' && node.children.some(child => child.type === 'Icon' && child.props.name === 'send')).props.onPress();
  chat.update('B');
  chat.sends[0].reject(new Error('Blocked message')); await tick();
  assert.equal(chat.nodes().find(node => node.type === 'TextInput').props.value, '');
  assert.deepEqual(chat.alerts, []);
});

test('an offline contact never flashes online on opening or reopening, even with a legacy online hint', async t => {
  const chat = screen(t);
  const isGreen = () => chat.nodes().some(node => node.props?.testID === 'chat-presence-online');
  chat.update('offline', true, { isOnline: true });
  assert.equal(isGreen(), false);
  assert.doesNotMatch(chat.texts(), /Active now|Inactive/);
  chat.requests[0].resolve(payload('hello')); await tick();
  assert.equal(isGreen(), false); assert.match(chat.texts(), /Inactive/);
  chat.update('offline', false); chat.update('offline', true, { isOnline: true });
  assert.equal(isGreen(), false); assert.match(chat.texts(), /Inactive/);
  chat.requests[1].resolve(payload('hello')); await tick();
  assert.equal(isGreen(), false); assert.match(chat.texts(), /Inactive/);
});

test('only a confirmed online response shows the green dot and it is not carried to another chat', async t => {
  const chat = screen(t);
  const isGreen = () => chat.nodes().some(node => node.props?.testID === 'chat-presence-online');
  chat.update('online');
  assert.equal(isGreen(), false);
  chat.requests[0].resolve({ ...payload('hello'), partnerIsOnline: true }); await tick();
  assert.equal(isGreen(), true); assert.match(chat.texts(), /Active now/);
  chat.update('other');
  assert.equal(isGreen(), false); assert.doesNotMatch(chat.texts(), /Active now/);
  chat.requests[1].resolve(payload('goodbye')); await tick();
  assert.equal(isGreen(), false); assert.match(chat.texts(), /Inactive/);
});

test('missing presence data stays neutral and a late online result cannot change a different contact', async t => {
  const chat = screen(t);
  chat.update('A'); chat.update('B');
  const result = payload('cats'); delete result.partnerIsOnline;
  chat.requests[1].resolve(result); await tick();
  chat.requests[0].resolve({ ...payload('dogs'), partnerIsOnline: true }); await tick();
  assert.doesNotMatch(chat.texts(), /Active now|Inactive/);
  assert.equal(chat.nodes().some(node => node.props?.testID === 'chat-presence-online'), false);
});

function presenceScreen(t) {
  const live = presenceClient(t);
  const { useChatPresence } = compile('src/shared/realtime/useChatPresence.ts', { './index': { realtime: live.client } });
  function Probe({ account, ids }) {
    const presence = useChatPresence(account, ids);
    return React.createElement('View', { a: presence('A'), b: presence('B') });
  }
  const container = { children: [] };
  const root = renderer.createContainer(container, 0, null, false, null, '', error => { throw error; }, null);
  const update = (account, ids = ['A', 'B']) => {
    live.start(account);
    renderer.flushSync(() => renderer.updateContainer(React.createElement(Probe, { account, ids }), root, null));
    renderer.flushPassiveEffects();
  };
  t.after(() => {
    renderer.flushSync(() => renderer.updateContainer(null, root, null)); renderer.flushPassiveEffects();
    assert.equal(live.watches.size, 0);
  });
  return { update, watches: live.watches, value: () => container.children[0].props,
    event(event) { renderer.flushSync(() => live.event(event)); },
    status(status) { renderer.flushSync(() => live.status(status)); },
  };
}

test('mobile avatar presence uses only confirmed booleans for the correct contact and resets on disconnect or account change', t => {
  const screen = presenceScreen(t);
  screen.update('first-account');
  assert.equal(screen.value().a, undefined);
  screen.event({ type: 'presence.changed', partner_id: 'A', is_online: 'true' });
  assert.equal(screen.value().a, undefined);
  screen.event({ type: 'presence.changed', partner_id: 'A', is_online: false });
  assert.equal(screen.value().a, false); assert.equal(screen.value().b, undefined);
  screen.event({ type: 'presence.changed', partner_id: 'A', is_online: true });
  assert.equal(screen.value().a, true);
  screen.status('reconnecting'); assert.equal(screen.value().a, undefined);
  screen.status('connected'); assert.equal(screen.value().a, undefined);
  screen.event({ type: 'presence.changed', partner_id: 'A', is_online: true });
  screen.update('second-account'); assert.equal(screen.value().a, undefined);
  screen.event({ type: 'presence.changed', partner_id: 'B', is_online: false });
  assert.equal(screen.value().b, false);
  screen.update(null); assert.equal(screen.value().b, undefined); assert.equal(screen.watches.size, 0);
});

test('mobile avatar presence expires, does not resubscribe on a list reorder, and removes watches when contacts leave', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 10000 });
  const screen = presenceScreen(t);
  screen.update('account');
  const watch = [...screen.watches][0];
  screen.event({ type: 'presence.changed', partner_id: 'A', is_online: true });
  screen.update('account', ['B', 'A']);
  assert.equal([...screen.watches][0], watch); assert.equal(screen.value().a, true);
  renderer.flushSync(() => t.mock.timers.tick(65000));
  assert.equal(screen.value().a, undefined);
  screen.update('account', []); assert.equal(screen.watches.size, 0);
});


test('a flagged mobile draft waits for consent, Close preserves it, and Send Anyway sends original text once', async t => {
  const chat = screen(t);
  chat.update('A'); chat.requests[0].resolve(payload('Earlier message')); await tick();
  chat.nodes().find(node => node.type === 'TextInput').props.onChangeText('gago');
  chat.nodes().find(node => node.type === 'Pressable' && node.children.some(child => child.type === 'Icon' && child.props.name === 'send')).props.onPress();
  assert.equal(chat.sends.length, 0);
  assert.ok(chat.texts().includes('This message may contain offensive content. Please consider using different words. Offensive or inappropriate language can be reported to the Barangay or SuperAdmin, which may lead to a temporary messaging ban or account suspension.'));
  assert.equal(chat.nodes().find(node => node.type === 'TextInput').props.value, 'gago');
  renderer.flushSync(() => chat.nodes().find(node => node.props?.accessibilityLabel === 'Close').props.onPress());
  assert.equal(chat.nodes().find(node => node.type === 'TextInput').props.value, 'gago');
  renderer.flushSync(() => chat.nodes().find(node => node.type === 'Pressable' && node.children.some(child => child.type === 'Icon' && child.props.name === 'send')).props.onPress());
  const confirm = chat.nodes().find(node => node.props?.accessibilityLabel === 'Send Anyway').props.onPress;
  renderer.flushSync(() => { confirm(); confirm(); });
  assert.equal(chat.sends.length, 1);
  assert.deepEqual(chat.sends[0].args, ['token-one', 'A', 'gago', undefined, true]);
  chat.sends[0].resolve({ data: { chat_message_id: 'saved', message_payload: 'gago', is_sensitive: true } });
  await tick();
  assert.match(chat.texts(), /gago/);
  assert.equal(chat.alerts.length, 0);
  assert.equal(chat.previews[0].message, 'gago');
});

test('mobile retains the sender Notice when the server returns a language warning', async t => {
  const chat = screen(t);
  chat.update('A'); chat.requests[0].resolve(payload('Earlier message')); await tick();
  renderer.flushSync(() => chat.nodes().find(node => node.type === 'TextInput').props.onChangeText('kill'));
  renderer.flushSync(() => chat.nodes().find(node => node.type === 'Pressable' && node.children.some(child => child.type === 'Icon' && child.props.name === 'send')).props.onPress());
  assert.match(chat.texts(), /Review your message/);
  renderer.flushSync(() => chat.nodes().find(node => node.props?.accessibilityLabel === 'Send Anyway').props.onPress());
  const notice = 'Inappropriate or threatening language was detected. Harassment can be reported to your Barangay or SerbiSure Support.';
  chat.sends[0].resolve({ data: { chat_message_id: 'saved-notice', message_payload: 'kill', is_sensitive: true }, language_warning: notice });
  await tick();
  assert.deepEqual(chat.alerts, [['Notice', notice]]);
});

test('a received sensitive message stays hidden until Show Message, and Close preserves concealment', async t => {
  const chat = screen(t);
  chat.update('A');
  chat.requests[0].resolve({ ...payload('gago ka'), messages: [{ ...payload('gago ka').messages[0], is_sensitive: true }] }); await tick();
  assert.doesNotMatch(chat.texts(), /gago ka/);
  renderer.flushSync(() => chat.nodes().find(node => node.props?.accessibilityLabel === 'Open sensitive message').props.onPress());
  assert.match(chat.texts(), /Would you like to show it/);
  renderer.flushSync(() => chat.nodes().find(node => node.props?.accessibilityLabel === 'Close').props.onPress());
  assert.doesNotMatch(chat.texts(), /gago ka/);
  renderer.flushSync(() => chat.nodes().find(node => node.props?.accessibilityLabel === 'Open sensitive message').props.onPress());
  renderer.flushSync(() => chat.nodes().find(node => node.props?.accessibilityLabel === 'Show Message').props.onPress());
  assert.match(chat.texts(), /gago ka/);
  chat.unmount(); chat.update('A');
  assert.doesNotMatch(chat.texts(), /gago ka/);
});

test('sensitive incoming bubbles share normal avatar grouping and alignment before and after reveal', t => {
  const chat = screen(t);
  const avatar = 'https://test.local/sender-avatar.jpg';
  const history = [
    { id: 'plain-first', sender: 'other', text: 'Hello', time: 'Now', avatar },
    { id: 'hidden-last', sender: 'other', text: 'kill', isSensitive: true, time: 'Now', avatar },
    { id: 'own-divider', sender: 'me', text: 'Okay', time: 'Now' },
    { id: 'hidden-first', sender: 'other', text: 'gago', isSensitive: true, time: 'Now', avatar },
    { id: 'plain-last', sender: 'other', text: 'Goodbye', time: 'Now', avatar },
  ];
  chat.threadCache.cacheThread(JSON.stringify(['account-one', 'A']), history, chat.threadCache.threadCacheGeneration());
  chat.update('A', true, { contactRole: 'Kasambahay', contactAvatar: avatar });
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const cell = id => chat.nodes().find(node => node.props?.testID === `list-cell-${id}`);
  const avatars = id => descendants(cell(id)).filter(node => node.type === 'Image' && node.props.source?.uri === avatar);
  const row = id => descendants(cell(id)).find(node => node.type === 'View' && Array.isArray(node.props.style) && node.props.style[0]?.flexDirection === 'row');

  assert.equal(avatars('plain-first').length, 0);
  assert.equal(avatars('hidden-last').length, 1, 'last concealed bubble must display the sender avatar');
  assert.equal(avatars('hidden-first').length, 0);
  assert.equal(avatars('plain-last').length, 1);
  assert.deepEqual(row('hidden-last').props.style[0], row('plain-last').props.style[0]);
  assert.deepEqual(row('hidden-last').children[1].props.style, row('plain-last').children[1].props.style);
  assert.deepEqual(row('hidden-first').children[0].children[0].props.style, row('plain-first').children[0].children[0].props.style);
  assert.doesNotMatch(chat.texts(), /\bkill\b|\bgago\b/);
  const hidden = descendants(cell('hidden-last')).find(node => node.props?.accessibilityLabel === 'Open sensitive message');
  assert.equal(hidden.props.style.marginLeft, undefined, 'the avatar column supplies spacing');
  renderer.flushSync(() => hidden.props.onPress());
  renderer.flushSync(() => chat.nodes().find(node => node.props?.accessibilityLabel === 'Show Message').props.onPress());
  assert.equal(avatars('hidden-last').length, 1);
  assert.match(chat.texts(), /\bkill\b/);
});

test('support messages keep the official logo when a sensitive bubble is concealed or revealed', t => {
  const chat = screen(t);
  const history = [
    { id: 'support-first', sender: 'other', text: 'Hello', time: 'Now' },
    { id: 'support-hidden', sender: 'other', text: 'kill', isSensitive: true, time: 'Now' },
  ];
  chat.threadCache.cacheThread(JSON.stringify(['account-one', 'Support']), history, chat.threadCache.threadCacheGeneration());
  chat.update('Support', true, { contactRole: 'Admin' });
  const descendants = node => [node, ...node.children.flatMap(descendants)];
  const cell = id => chat.nodes().find(node => node.props?.testID === `list-cell-${id}`);
  const logos = id => descendants(cell(id)).filter(node => node.type === 'Image' && node.props.source === 1);
  assert.equal(logos('support-first').length, 0);
  assert.equal(logos('support-hidden').length, 1);
  assert.doesNotMatch(chat.texts(), /\bkill\b/);
  renderer.flushSync(() => descendants(cell('support-hidden')).find(node => node.props?.accessibilityLabel === 'Open sensitive message').props.onPress());
  renderer.flushSync(() => chat.nodes().find(node => node.props?.accessibilityLabel === 'Show Message').props.onPress());
  assert.equal(logos('support-hidden').length, 1);
  assert.match(chat.texts(), /\bkill\b/);
});

test('a server-only language match restores the draft and requires explicit mobile consent', async t => {
  const chat = screen(t); chat.update('A'); chat.requests[0].resolve(payload('Earlier message')); await tick();
  renderer.flushSync(() => chat.nodes().find(node => node.type === 'TextInput').props.onChangeText('Newly flagged wording'));
  renderer.flushSync(() => chat.nodes().find(node => node.type === 'Pressable' && node.children.some(child => child.type === 'Icon' && child.props.name === 'send')).props.onPress());
  chat.sends[0].reject(Object.assign(new Error('Review message'), { status: 409, details: { code: 'offensive_language_warning' } })); await tick();
  assert.equal(chat.nodes().find(node => node.type === 'TextInput').props.value, 'Newly flagged wording');
  renderer.flushSync(() => chat.nodes().find(node => node.props?.accessibilityLabel === 'Send Anyway').props.onPress());
  assert.deepEqual(chat.sends[1].args, ['token-one', 'A', 'Newly flagged wording', undefined, true]);
});

test('a sensitive initial draft is never automatically sent, and stale confirmation cannot send after switching', async t => {
  const chat = screen(t);
  chat.update('A', true, { initialMessage: 'putangina' });
  chat.requests[0].resolve({ messages: [], partnerIsTyping: false, partnerIsOnline: false }); await tick();
  assert.equal(chat.sends.length, 0);
  assert.equal(chat.nodes().find(node => node.type === 'TextInput').props.value, 'putangina');
  renderer.flushSync(() => chat.nodes().find(node => node.type === 'Pressable' && node.children.some(child => child.type === 'Icon' && child.props.name === 'send')).props.onPress());
  const confirm = chat.nodes().find(node => node.props?.accessibilityLabel === 'Send Anyway').props.onPress;
  chat.update('B'); renderer.flushSync(confirm);
  assert.equal(chat.sends.length, 0);
});

test('a confirmed sensitive-send response from an old thread never affects another chat', async t => {
  const chat = screen(t);
  chat.update('A'); chat.requests[0].resolve(payload('Earlier message')); await tick();
  chat.nodes().find(node => node.type === 'TextInput').props.onChangeText('gago');
  chat.nodes().find(node => node.type === 'Pressable' && node.children.some(child => child.type === 'Icon' && child.props.name === 'send')).props.onPress();
  renderer.flushSync(() => chat.nodes().find(node => node.props?.accessibilityLabel === 'Send Anyway').props.onPress());
  chat.update('B');
  chat.sends[0].resolve({ data: { chat_message_id: 'saved', message_payload: 'gago', is_sensitive: true } });
  await tick();
  assert.deepEqual(chat.alerts, []); assert.deepEqual(chat.previews, []);
});

test('a fully unmounted thread reopens immediately from cache and silently loads newer messages', async t => {
  const chat = screen(t);
  chat.update('A'); chat.requests[0].resolve(payload('Earlier message')); await tick();
  chat.nodes().find(node => node.type === 'TextInput').props.onChangeText('Unsent private draft');
  chat.unmount(); chat.update('A');
  assert.match(chat.texts(), /Earlier message/);
  assert.equal(chat.nodes().some(node => node.type === 'ActivityIndicator'), false);
  assert.equal(chat.nodes().find(node => node.type === 'TextInput').props.value, '');
  assert.equal(chat.requests.length, 2);
  chat.requests[1].resolve({ ...payload('Earlier message'), messages: [...payload('Earlier message').messages, ...payload('New message').messages] }); await tick();
  assert.match(chat.texts(), /Earlier message/); assert.match(chat.texts(), /New message/);
  assert.equal(chat.nodes().filter(node => node.text === 'Earlier message').length, 1);
});

test('offline reopen preserves cached messages and retries without blocking the thread', async t => {
  const chat = screen(t);
  chat.update('A'); chat.requests[0].resolve(payload('Saved history')); await tick();
  chat.update('A', false); chat.update('A');
  chat.requests[1].reject(new Error('Network request failed: private.internal.host')); await tick();
  assert.match(chat.texts(), /Saved history/);
  assert.match(chat.texts(), /Could not refresh messages. Please retry./);
  assert.doesNotMatch(chat.texts(), /private.internal.host/);
  chat.nodes().find(node => node.type === 'Pressable' && node.children.some(child => child.text === 'Retry conversation' || child.children?.some(text => text.text === 'Retry conversation'))).props.onPress();
  await tick();
  assert.equal(chat.nodes().some(node => node.type === 'ActivityIndicator'), false);
  chat.requests[2].resolve(payload('Refreshed history')); await tick();
  assert.match(chat.texts(), /Refreshed history/); assert.doesNotMatch(chat.texts(), /Could not refresh messages/);
});

test('a successfully loaded empty thread is cached and later receives messages without an opening spinner', async t => {
  const chat = screen(t);
  chat.update('A'); chat.requests[0].resolve({ messages: [], partnerIsTyping: false }); await tick();
  chat.unmount(); chat.update('A');
  assert.equal(chat.nodes().some(node => node.type === 'ActivityIndicator'), false);
  assert.match(chat.texts(), /No messages yet/);
  chat.requests[1].resolve(payload('First incoming')); await tick();
  assert.match(chat.texts(), /First incoming/);
});

test('token renewal preserves cached history and account changes isolate the same contact', async t => {
  const chat = screen(t);
  chat.update('A'); chat.requests[0].resolve(payload('Private history')); await tick();
  chat.unmount(); chat.renewToken(); chat.update('A');
  assert.match(chat.texts(), /Private history/);
  assert.equal(chat.nodes().some(node => node.type === 'ActivityIndicator'), false);
  assert.equal(chat.requests[1].token, 'renewed-token');
  chat.changeAccount(); chat.update('A');
  assert.doesNotMatch(chat.texts(), /Private history/);
  assert.equal(chat.nodes().some(node => node.type === 'ActivityIndicator'), true);
  chat.requests[1].resolve(payload('Late private history')); await tick();
  assert.doesNotMatch(chat.texts(), /Late private history/);
});

test('loss of conversation access removes cached history and shows a concise error', async t => {
  const chat = screen(t);
  chat.update('A'); chat.requests[0].resolve(payload('Private history')); await tick();
  chat.update('A', false); chat.update('A');
  chat.requests[1].reject(Object.assign(new Error('Forbidden internal detail'), { status: 403 })); await tick();
  assert.doesNotMatch(chat.texts(), /Private history|internal detail/);
  assert.match(chat.texts(), /This conversation is unavailable/);
  chat.update('A', false); chat.update('A');
  assert.equal(chat.nodes().some(node => node.type === 'ActivityIndicator'), true);
});

test('confirmed sends stay cached, and unsent optimistic bubbles are never restored', async t => {
  const chat = screen(t);
  chat.update('A'); chat.requests[0].resolve(payload('Earlier')); await tick();
  const send = text => {
    chat.nodes().find(node => node.type === 'TextInput').props.onChangeText(text);
    chat.nodes().find(node => node.type === 'Pressable' && node.children.some(child => child.type === 'Icon' && child.props.name === 'send')).props.onPress();
  };
  send('Confirmed outgoing');
  chat.sends[0].resolve({ data: { chat_message_id: 'saved-send', message_payload: 'Confirmed outgoing' } }); await tick();
  chat.unmount(); chat.update('A');
  assert.match(chat.texts(), /Confirmed outgoing/);
  send('Not saved yet');
  chat.unmount(); chat.update('A');
  assert.match(chat.texts(), /Confirmed outgoing/); assert.doesNotMatch(chat.texts(), /Not saved yet/);
  chat.sends[1].reject(new Error('offline')); await tick();
  assert.doesNotMatch(chat.texts(), /Not saved yet/);
});

test('background updates replace deleted messages and reactions without duplicating the cached thread', async t => {
  const chat = screen(t);
  chat.update('A');
  chat.requests[0].resolve({ messages: [...payload('Keep me').messages, ...payload('Remove me').messages] }); await tick();
  chat.event({ type: 'chat.changed', partner_id: 'A' });
  chat.requests[1].resolve({ messages: [{ ...payload('Keep me').messages[0], my_reaction: '👍', reaction_summary: { '👍': 1 } }] }); await tick();
  assert.doesNotMatch(chat.texts(), /Remove me/); assert.match(chat.texts(), /👍/);
  chat.unmount(); chat.update('A');
  assert.match(chat.texts(), /Keep me/); assert.doesNotMatch(chat.texts(), /Remove me/);
  assert.equal(chat.nodes().filter(node => node.text === 'Keep me').length, 1);
  assert.match(chat.texts(), /👍/);
});

test('messages deleted locally are not restored from cache or background responses', async t => {
  const chat = screen(t);
  chat.update('A'); chat.requests[0].resolve(payload('Hidden message')); await tick();
  chat.deleted.add('Hidden message');
  chat.unmount(); chat.update('A');
  assert.doesNotMatch(chat.texts(), /Hidden message/);
  chat.requests[1].resolve(payload('Hidden message')); await tick();
  assert.doesNotMatch(chat.texts(), /Hidden message/);
});

test('logout clears history and older cache writes cannot repopulate it; retained threads are bounded', () => {
  const cache = compile('src/features/chat/threadCache.ts', {});
  const generation = cache.threadCacheGeneration();
  const history = [{ id: 'saved', text: 'Saved', sender: 'me', time: 'Now' }, { id: 'temp-1', text: 'Pending' }, { id: 'typing', isTyping: true }];
  cache.cacheThread('account:A', history, generation);
  assert.deepEqual(cache.getCachedThread('account:A').map(message => message.id), ['saved']);
  cache.clearThreadCache();
  cache.cacheThread('account:A', history, generation);
  assert.equal(cache.getCachedThread('account:A'), null);
  const next = cache.threadCacheGeneration();
  for (let index = 0; index < 21; index++) cache.cacheThread(`account:${index}`, history, next);
  assert.equal(cache.getCachedThread('account:0'), null);
  assert.ok(cache.getCachedThread('account:20'));
});

test('a long cached conversation renders only the latest opening batch before network sync or hidden dialogs', t => {
  const chat = screen(t, { deferEntrance: true });
  const history = Array.from({ length: 2000 }, (_, index) => ({ id: `message-${index}`, sender: 'other', text: `History ${index}`, time: 'Now' }));
  chat.threadCache.cacheThread(JSON.stringify(['account-one', 'A']), history, chat.threadCache.threadCacheGeneration());
  chat.update('A');
  assert.match(chat.texts(), /History 1999/); assert.doesNotMatch(chat.texts(), /History 100\b/);
  assert.equal(chat.nodes().filter(node => node.text?.startsWith('History ')).length, 12);
  assert.equal(chat.nodes().some(node => node.type === 'ActivityIndicator'), false);
  const list = chat.nodes().find(node => node.type === 'FlatList');
  assert.equal(list.props.inverted, true);
  assert.equal(list.props.data.length, 2000);
  assert.deepEqual(list.props.maintainVisibleContentPosition, { minIndexForVisible: 0, autoscrollToTopThreshold: 40 });
  assert.equal(chat.requests.length, 0);
  assert.deepEqual(chat.dialogs, []);
  renderer.flushSync(() => chat.entrances[0]()); renderer.flushPassiveEffects();
  assert.equal(chat.requests.length, 1);
});

test('inverted chat cells display timestamps above incoming, outgoing, photo and system messages', t => {
  const chat = screen(t, { deferEntrance: true });
  const today = new Date();
  const at = (dayOffset, hour, minute) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset, hour, minute).toISOString();
  const history = [
    { id: 'first', sender: 'other', text: 'Earlier message', createdAtRaw: at(-1, 23, 55) },
    { id: 'new-day', sender: 'me', text: 'New day message', createdAtRaw: at(0, 0, 1) },
    { id: 'grouped', sender: 'me', text: 'Same group message', createdAtRaw: at(0, 0, 3) },
    { id: 'photo', sender: 'other', imageUri: 'https://test.local/photo.jpg', createdAtRaw: at(0, 0, 25) },
    { id: 'caption', sender: 'me', text: 'Photo caption', imageUri: 'https://test.local/caption.jpg', createdAtRaw: at(0, 0, 50) },
    { id: 'booking', sender: 'system', bookingInfo: { title: 'BOOKING CONFIRMED', isConfirmed: true, bookedByName: 'Test Worker' }, createdAtRaw: at(0, 1, 15) },
    { id: 'closed', sender: 'system', text: '[LISTING_CLOSED] Position filled', createdAtRaw: at(0, 1, 40) },
  ].map(message => ({ ...message, time: message.createdAtRaw }));
  chat.threadCache.cacheThread(JSON.stringify(['account-one', 'A']), history, chat.threadCache.threadCacheGeneration());
  chat.update('A');

  // Read top-to-bottom within each native cell, respecting column-reverse layout.
  const visualTokens = node => {
    if (node.text !== undefined) return [node.text];
    if (node.type === 'Image' && node.props.source?.uri?.startsWith('https://test.local/')) return [node.props.source.uri];
    const children = node.props?.style?.flexDirection === 'column-reverse' ? [...node.children].reverse() : node.children;
    return children.flatMap(visualTokens);
  };
  const expected = [
    ['first', 'Yesterday 11:55 PM', 'Earlier message'],
    ['new-day', 'Today 12:01 AM', 'New day message'],
    ['photo', 'Today 12:25 AM', 'https://test.local/photo.jpg'],
    ['caption', 'Today 12:50 AM', 'https://test.local/caption.jpg'],
    ['booking', 'Today 1:15 AM', 'Test Worker'],
    ['closed', 'Today 1:40 AM', 'Job Position Acquired'],
  ];
  for (const [id, timestamp, content] of expected) {
    const cell = chat.nodes().find(node => node.props?.testID === `list-cell-${id}`);
    const tokens = visualTokens(cell);
    assert.equal(tokens[0], timestamp, `${id}: timestamp must precede the message`);
    assert.ok(tokens.indexOf(content) > 0, `${id}: content follows the timestamp`);
  }
  const groupedCell = chat.nodes().find(node => node.props?.testID === 'list-cell-grouped');
  assert.deepEqual(visualTokens(groupedCell), ['Same group message']);
  const list = chat.nodes().find(node => node.type === 'FlatList');
  assert.deepEqual(list.props.data.map(message => message.id), history.map(message => message.id).reverse());
});

test('closing or switching contacts during entrance cancels the previous opening work', t => {
  const chat = screen(t, { deferEntrance: true });
  chat.update('A', false);
  assert.equal(chat.entrances.length, 0); assert.equal(chat.nodes().length, 0);
  chat.update('A'); const finishOld = chat.entrances[0];
  chat.update('A', false); finishOld(); renderer.flushPassiveEffects();
  assert.equal(chat.requests.length, 0);
  chat.update('B');
  renderer.flushSync(() => chat.entrances[1]()); renderer.flushPassiveEffects();
  assert.equal(chat.requests.length, 1); assert.equal(chat.requests[0].partnerId, 'B');
});

test('quote jumps use reversed list indices and cancelled jumps cannot scroll a closed chat', async t => {
  const chat = screen(t, { deferEntrance: true });
  const history = Array.from({ length: 50 }, (_, index) => ({ id: `message-${index}`, sender: 'other', text: `History ${index}`, time: 'Now' }));
  history[49].replyTo = { author: 'Someone', text: 'Quoted earlier message', messageId: 'message-0' };
  chat.threadCache.cacheThread(JSON.stringify(['account-one', 'A']), history, chat.threadCache.threadCacheGeneration());
  chat.update('A');
  const contains = (node, value) => node.text === value || node.children?.some(child => contains(child, value));
  const quote = chat.nodes().find(node => node.type === 'Pressable' && contains(node, 'Quoted earlier message'));
  assert.ok(quote); quote.props.onPress();
  assert.deepEqual(chat.scrolls[0], { type: 'index', index: 49, viewPosition: 0.5, animated: true });
  chat.nodes().find(node => node.type === 'FlatList').props.onScrollToIndexFailed({ index: 49, averageItemLength: 80 });
  assert.equal(chat.scrolls.at(-1).offset, 49 * 80);
  chat.unmount();
  const count = chat.scrolls.length;
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(chat.scrolls.length, count);
});

test('counterparty profile mounts only after its button is tapped', t => {
  const chat = screen(t, { deferEntrance: true }); chat.update('A');
  assert.deepEqual(chat.dialogs, []);
  const contains = (node, value) => node.text === value || node.children?.some(child => contains(child, value));
  chat.nodes().find(node => node.type === 'Pressable' && contains(node, 'A')).props.onPress();
  assert.ok(chat.dialogs.includes('official'));
  assert.equal(chat.dialogs.includes('booking'), false);
});

test('a confirmed inbox status appears in the chat header immediately before animation or messages load', t => {
  const chat = screen(t, { autoPresence: false, deferEntrance: true });
  chat.event({ type: 'presence.changed', partner_id: 'A', is_online: true });
  chat.update('A');
  assert.match(chat.texts(), /Active now/); assert.doesNotMatch(chat.texts(), /Checking…|Inactive/);
  assert.equal(chat.nodes().some(node => node.props?.testID === 'chat-presence-online'), true);
  assert.equal(chat.requests.length, 0);
  chat.update('A', false); chat.update('A');
  assert.match(chat.texts(), /Active now/);
});

test('online and offline events update the open header without reopening or refetching messages', async t => {
  const chat = screen(t, { autoPresence: false }); chat.update('A');
  chat.requests[0].resolve(payload('Hello')); await tick();
  assert.match(chat.texts(), /Checking…/);
  chat.event({ type: 'presence.changed', partner_id: 'A', is_online: true });
  assert.match(chat.texts(), /Active now/);
  chat.event({ type: 'presence.changed', partner_id: 'A', is_online: false });
  assert.match(chat.texts(), /Inactive/);
  assert.equal(chat.nodes().some(node => node.props?.testID === 'chat-presence-online'), false);
  chat.event({ type: 'presence.changed', partner_id: 'B', is_online: true });
  assert.match(chat.texts(), /Inactive/);
  assert.equal(chat.requests.length, 1);
});

test('a slow HTTP offline snapshot cannot overwrite a newer live online event', async t => {
  const chat = screen(t, { autoPresence: false }); chat.update('A');
  chat.event({ type: 'presence.changed', partner_id: 'A', is_online: true });
  chat.requests[0].resolve(payload('Hello')); await tick();
  assert.match(chat.texts(), /Active now/); assert.doesNotMatch(chat.texts(), /Inactive/);
  assert.equal(chat.live.client.getPresence('account-one', 'A'), true);
  assert.equal(chat.live.client.getPresence('different-account', 'A'), undefined);
});

test('disconnect and reconnect keep a stable status label and wait for a fresh confirmed presence', t => {
  const chat = screen(t, { autoPresence: false }); chat.update('A');
  chat.event({ type: 'presence.changed', partner_id: 'A', is_online: true });
  const statusNode = chat.nodes().find(node => node.props?.testID === 'chat-presence-status'); const width = Array.isArray(statusNode.props.style) ? statusNode.props.style[1]?.width : statusNode.props.style?.width;
  renderer.flushSync(() => chat.live.status('reconnecting'));
  assert.equal(chat.nodes().find(node => node.props?.testID === 'chat-presence-status').children[0].text, 'Checking…');
  assert.equal(chat.nodes().some(node => node.props?.testID === 'chat-presence-online'), false);
  renderer.flushSync(() => chat.live.status('connected'));
  chat.event({ type: 'presence.changed', partner_id: 'A', is_online: false });
  const label = chat.nodes().find(node => node.props?.testID === 'chat-presence-status');
  assert.equal(label.children[0].text, 'Inactive'); assert.equal(Array.isArray(label.props.style) ? label.props.style[1]?.width : label.props.style?.width, width);
});

test('HTTP presence works as an offline-socket fallback without replacing a newer snapshot', async t => {
  const chat = screen(t, { autoPresence: false }); chat.live.status('reconnecting'); chat.update('A');
  chat.requests[0].resolve({ ...payload('Hello'), partnerIsOnline: true }); await tick();
  assert.match(chat.texts(), /Active now/);
  const version = chat.live.client.getPresenceRevision();
  chat.live.client.recordPresence('account-one', 'A', false);
  chat.live.client.recordPresence('account-one', 'A', true, version);
  assert.equal(chat.live.client.getPresence('account-one', 'A'), false);
});

test('expired online snapshots return to Checking instead of showing a stale green dot', t => {
  t.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 10000 });
  const chat = screen(t, { autoPresence: false }); chat.update('A');
  chat.event({ type: 'presence.changed', partner_id: 'A', is_online: true });
  assert.match(chat.texts(), /Active now/);
  renderer.flushSync(() => t.mock.timers.tick(65000));
  assert.equal(chat.nodes().find(node => node.props?.testID === 'chat-presence-status').children[0].text, 'Checking…');
  assert.equal(chat.nodes().some(node => node.props?.testID === 'chat-presence-online'), false);
});
