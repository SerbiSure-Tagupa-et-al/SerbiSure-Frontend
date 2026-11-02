const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function loadHttpClient() {
  const filename = path.resolve(__dirname, '../src/shared/api/httpClient.ts');
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    fileName: filename,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (name === './config') return { buildApiUrl: path => `https://api.test${path}`, DEFAULT_TIMEOUT_MS: 1000 };
    if (name === '../auth/session') return {
      getSession: () => null,
      refreshSession: async () => { throw new Error('Suspension tests must not refresh a session'); },
      SessionError: class extends Error {},
    };
    throw new Error(`Unexpected dependency: ${name}`);
  }, module, module.exports);
  return module.exports;
}

test('requestJson publishes one suspension event for both direct and nested server error shapes', async () => {
  const http = loadHttpClient();
  const messages = [];
  const unsubscribe = http.subscribeAccountSuspension(message => messages.push(message));
  const originalFetch = global.fetch;
  global.fetch = async () => new Response(JSON.stringify({ detail: { code: 'account_suspended', detail: 'Account access is suspended.' } }), {
    status: 403,
    headers: { 'content-type': 'application/json' },
  });
  try {
    await assert.rejects(() => http.requestJson('/protected', { token: 'token' }), /Request failed/);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(messages, ['Account access is suspended.']);
  } finally {
    unsubscribe();
    global.fetch = originalFetch;
  }
});

test('lower-level fetchWithTimeout calls also publish suspension events, while ordinary errors do not', async () => {
  const http = loadHttpClient();
  const messages = [];
  const unsubscribe = http.subscribeAccountSuspension(message => messages.push(message));
  const originalFetch = global.fetch;
  let status = 403;
  global.fetch = async () => new Response(JSON.stringify(status === 403
    ? { code: 'account_suspended' }
    : { code: 'permission_denied' }), { status, headers: { 'content-type': 'application/json' } });
  try {
    await http.fetchWithTimeout('https://api.test/protected');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(messages.length, 1);
    status = 400;
    await http.fetchWithTimeout('https://api.test/other');
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(messages.length, 1);
  } finally {
    unsubscribe();
    global.fetch = originalFetch;
  }
});
