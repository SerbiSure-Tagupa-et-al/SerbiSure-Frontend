const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const { sanitizeReleaseNotes, DEFAULT_RELEASE_NOTE } = require('../src/shared/utils/releaseNotes');
const { generateReleaseNotes, FALLBACK_NOTE, GROQ_TIMEOUT_MS } = require('../scripts/generate-release-notes.cjs');
const response = notes => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ notes }) } }] }) });
const friendly = ['SerbiSure opens more smoothly when you start your day.', 'Clearer update messages help you follow each step.'];
const config = { apiKey: 'test-key', changes: 'feat(startup): show loading feedback' };

test('friendly notes keep plain sentences, remove markdown and metadata, deduplicate, and cap at three', () => {
  assert.deepEqual(sanitizeReleaseNotes('• **SerbiSure opens more smoothly.**\n- Clearer messages help you update.\nClearer messages help you update.\n3. Better loading on slow connections.\nAnother friendly improvement is available.'),
    ['SerbiSure opens more smoothly.', 'Clearer messages help you update.', 'Better loading on slow connections.']);
  assert.deepEqual(sanitizeReleaseNotes('fix(startup): SerbiSure opens more smoothly by @someone in https://github.com/org/app/pull/56\n**Full Changelog**: https://github.com/org/app/compare/v1...v2'), ['SerbiSure opens more smoothly']);
  assert.deepEqual(sanitizeReleaseNotes('- Read [clearer update messages](https://github.com/org/app) in SerbiSure.'), ['Read clearer update messages in SerbiSure.']);
});

test('empty, technical, malformed and code-only notes use the honest friendly default', () => {
  for (const input of [null, undefined, {}, '', '#56 @someone https://github.com/org/app',
    'feat(ci): change build-and-release-apk.yml', 'Update getUserInfo before calling the API.',
    'Set API_KEY to a different token.', 'Use {"url":"bad"} for better loading.',
    '```js\nconsole.log("data");\n```', '<script>alert("hello")</script>',
    'Visit support.example.com for all changes.', 'A'.repeat(180), 'Tiny', 'Only two',
    'Refreshed gsk_examplecredential012345678901234567890 in the app.',
    '**Full Changelog**: github.com/org/app/compare/v1...v2']) {
    assert.deepEqual(sanitizeReleaseNotes(input), [DEFAULT_RELEASE_NOTE], String(input));
  }
});

test('Groq receives bounded commit data as data, returns two friendly points, and does not log credentials', async t => {
  const logs = []; t.mock.method(console, 'log', value => logs.push(value));
  const notes = await generateReleaseNotes({ ...config, changes: 'x'.repeat(20000), fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    assert.equal(options.redirect, 'error'); assert.ok(options.signal);
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'openai/gpt-oss-20b'); assert.equal(body.reasoning_effort, 'low');
    assert.deepEqual(body.response_format, { type: 'json_object' });
    assert.match(body.messages[0].content, /untrusted data/);
    assert.equal(JSON.parse(body.messages[1].content).changes.length, 12000);
    return response(friendly);
  } });
  assert.deepEqual(notes, friendly); assert.deepEqual(logs, []);
});

test('missing keys and empty changes skip Groq entirely', async () => {
  for (const value of [{ ...config, apiKey: '' }, { ...config, changes: '' }]) {
    assert.deepEqual(await generateReleaseNotes({ ...value, fetchImpl: () => { throw Error('Must not call Groq'); } }), [FALLBACK_NOTE]);
  }
});

test('automatic change collection includes merged PR titles and commits, but excludes the previous release', t => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'serbisure-release-notes-'));
  t.after(() => fs.rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, stdio: 'pipe' });
  git('init', '-q');
  git('config', 'user.name', 'Release test');
  git('config', 'user.email', 'release-test@example.invalid');
  git('commit', '-q', '--allow-empty', '-m', 'Old released change');
  git('tag', 'v1.0.0');
  git('commit', '-q', '--allow-empty', '-m', 'fix(startup): show a clear loading screen');
  git('commit', '-q', '--allow-empty', '-m', 'Merge pull request #56', '-m', 'Make opening SerbiSure easier');
  const script = path.resolve(__dirname, '../scripts/generate-release-notes.cjs');
  const changes = execFileSync(process.execPath, ['-e', `process.stdout.write(require(${JSON.stringify(script)}).collectChanges())`], { cwd, encoding: 'utf8' });
  assert.match(changes, /Make opening SerbiSure easier/);
  assert.match(changes, /fix\(startup\): show a clear loading screen/);
  assert.doesNotMatch(changes, /Old released change/);
});

test('provider errors, invalid JSON, raw changelogs, unsafe text and wrong bullet counts never block a release', async () => {
  for (const fetchImpl of [async () => { throw Error('secret provider diagnostic'); },
    async () => ({ ok: false, status: 429 }), async () => ({ ok: false, status: 401 }),
    async () => ({ ok: true, json: async () => { throw Error('bad JSON'); } }),
    async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: 'feat(api): #56 by @person' } }] }) }),
    async () => response(['Only one friendly point was provided.']),
    async () => response(['feat(api): Update serializers and columns.', 'fix(ci): Edit the workflow for APKs.']),
    async () => response([null, {}]), async () => response([...friendly, ...friendly])]) {
    assert.deepEqual(await generateReleaseNotes({ ...config, fetchImpl }), [FALLBACK_NOTE]);
  }
});

test('the five-second Groq deadline includes reading its response and ignores late completions', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let resolve, signal;
  const body = new Promise(done => { resolve = done; });
  const run = generateReleaseNotes({ ...config, fetchImpl: async (_url, options) => {
    signal = options.signal;
    return { ok: true, json: () => body };
  } });
  await Promise.resolve(); t.mock.timers.tick(GROQ_TIMEOUT_MS - 1); assert.equal(signal.aborted, false);
  t.mock.timers.tick(1); assert.deepEqual(await run, [FALLBACK_NOTE]); assert.equal(signal.aborted, true);
  resolve({ choices: [{ message: { content: JSON.stringify({ notes: friendly }) } }] });
  await Promise.resolve(); assert.deepEqual(await run, [FALLBACK_NOTE]);
});

test('the release workflow replaces generated developer notes and confines the key to the summary step', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/build-and-release-apk.yml'), 'utf8');
  assert.match(workflow, /GROQ_API_KEY: \$\{\{ secrets\.GROQ_API_KEY \}\}/);
  assert.match(workflow, /run: node scripts\/generate-release-notes\.cjs/);
  assert.match(workflow, /body_path: dist\/release-notes\.md/);
  assert.match(workflow, /generate_release_notes: false/);
  assert.doesNotMatch(workflow, /generate_release_notes: true|continue-on-error/);
  const script = fs.readFileSync(path.join(__dirname, '../scripts/generate-release-notes.cjs'), 'utf8');
  assert.doesNotMatch(script, /console\.(?:log|error)\([^\n]*(?:apiKey|GROQ_API_KEY|response|error)/);
  assert.match(script, /--format=%s%n%b/); // Includes the merge's PR title and commit bodies.
});
