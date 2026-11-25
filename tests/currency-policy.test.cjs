const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file) {
  const output = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(name => {
    if (name.endsWith('/utils/rate')) return load('src/shared/utils/rate.ts');
    if (name === './postingConfig') return load('src/features/posting/postingConfig.ts');
    if (name.endsWith('/posting/validation')) return load('src/features/posting/validation.ts');
    if (name.endsWith('/bookings/engagementForm')) return load('src/features/bookings/engagementForm.ts');
    if (name === '../locationFilter') return load('src/features/feed/locationFilter.ts');
    if (name.endsWith('theme/theme')) return load('src/shared/theme/theme.ts');
    if (name === 'react') return require('react');
    if (name === 'react-native') return { Dimensions: { get: () => ({ height: 800 }) }, StyleSheet: { create: value => value }, Platform: { OS: 'android' } };
    if (name.endsWith('LanguageContext') || name === 'react-native-safe-area-context' || name === '@expo/vector-icons' || name.endsWith('BottomSheetHandle')) return {};
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}
const { formatRate, formatRateInput } = load('src/shared/utils/rate.ts');
const { validatePostingRate, PART_TIME_MAX_RATE, FULL_TIME_MAX_RATE } = load('src/features/posting/validation.ts');
const { translateMessage } = load('src/shared/localization/messages.ts');

test('currency displays use peso, commas and two cents digits, including cached formatted rates', () => {
  for (const [value, expected] of [[800, '₱800.00'], [6500, '₱6,500.00'], [1250.5, '₱1,250.50'],
    ['PHP 6,500.00', '₱6,500.00'], ['₱1,250.5', '₱1,250.50'], ['1250.50', '₱1,250.50']]) {
    assert.equal(formatRate(value), expected);
  }
  assert.equal(formatRate('800', 'PHP '), 'PHP 800.00');
  for (const value of [0, -5, null, undefined, Infinity, 'NaN', '1e3', '1,00', '12abc', 'PHP -5', '1.234']) {
    assert.equal(formatRate(value), 'Rate not provided');
  }
});

test('grouped amount inputs preserve unfinished decimal entry', () => {
  assert.equal(formatRateInput(''), '');
  assert.equal(formatRateInput('5000'), '5,000');
  assert.equal(formatRateInput('5000.'), '5,000.');
  assert.equal(formatRateInput('5000.5'), '5,000.5');
  assert.equal(formatRateInput('5000.50'), '5,000.50');
});

test('posting and offer validation enforce exact daily and monthly boundaries', () => {
  assert.equal(PART_TIME_MAX_RATE, 5000);
  assert.equal(FULL_TIME_MAX_RATE, 50000);
  for (const [engagement, minimum, maximum, label, period] of [
    ['short', '600.00', '5000.00', 'Part-time / Daily', 'day'],
    ['long', '6500.00', '50000.00', 'Full-time / Monthly', 'month'],
  ]) {
    const policy = { rate_period: period, minimum_rate: minimum, maximum_rate: maximum };
    for (const value of [minimum, maximum]) assert.equal(validatePostingRate('job', engagement, value, policy), null);
    for (const value of [String(Number(minimum) - 0.01), String(Number(maximum) + 0.01)]) {
      const error = validatePostingRate('job', engagement, value, policy);
      assert.ok(error.message.includes(label));
      assert.ok(error.message.includes('₱'));
      assert.doesNotMatch(error.message, /short.term|long.term/i);
    }
    const fallback = validatePostingRate('job', engagement, String(Number(maximum) + 1));
    assert.equal(fallback.title, 'Maximum Rate Exceeded');
    assert.equal(validatePostingRate('job', engagement, maximum), null);
  }
});

test('live policy bounds override fallbacks and retain the NCR minimum', () => {
  const policy = { rate_period: 'month', minimum_rate: '7800.00', maximum_rate: '45000.00' };
  assert.equal(validatePostingRate('job', 'long', '7800', policy), null);
  assert.equal(validatePostingRate('job', 'long', '45000', policy), null);
  assert.match(validatePostingRate('job', 'long', '7799.99', policy).message, /₱7,800.00/);
  assert.match(validatePostingRate('job', 'long', '45000.01', policy).message, /₱45,000.00/);
  assert.equal(validatePostingRate('job', 'short', '800', policy).title, 'Rate Policy Changed');
});

test('all daily filter presets respect the platform minimum', () => {
  const { RATE_PRESETS } = load('src/features/feed/components/FilterModal.tsx');
  assert.deepEqual(RATE_PRESETS, [600, 800, 1000, 1500, 2000]);
  assert.ok(RATE_PRESETS.every(value => value >= 600));
});

test('worker CV expected rates reject excess values while allowing exact caps', () => {
  const { emptyWorkerDraft, validateWorkerPage } = load('src/features/profile/worker/workerCv.ts');
  const valid = { ...emptyWorkerDraft(), service_categories: ['Cleaning'], engagement_preference: 'both',
    work_setup: 'stay_out', languages: ['English'], desired_daily_rate: '5000.00', desired_monthly_rate: '50000.00' };
  assert.equal(validateWorkerPage(valid, 0), null);
  assert.match(validateWorkerPage({ ...valid, desired_daily_rate: '5000.01' }, 0), /Part-time \/ Daily.*₱5,000.00/);
  assert.match(validateWorkerPage({ ...valid, desired_monthly_rate: '50000.01' }, 0), /Full-time \/ Monthly.*₱50,000.00/);
});

test('range, zero fee and dynamic cap messages translate without losing the amount', () => {
  for (const language of ['Tagalog', 'Bisaya']) {
    const english = 'Maximum compensation for Part-time / Daily bookings is ₱5,000.00 / day.';
    const translated = translateMessage(language, english);
    assert.notEqual(translated, english);
    assert.match(translated, /₱5,000.00/);
    const template = 'Allowed range: {minimum} – {maximum} / {period} ({engagement})';
    const range = translateMessage(language, template, { minimum: '₱600.00', maximum: '₱5,000.00', period: 'day', engagement: 'Part-time / Daily' });
    assert.match(range, /₱600.00.*₱5,000.00/);
    assert.doesNotMatch(range, /\{\w+\}/);
    const fee = 'Direct payment between Homeowner and Kasambahay · ₱0.00 SerbiSure fee.';
    assert.notEqual(translateMessage(language, fee), fee);
    assert.match(translateMessage(language, fee), /₱0.00/);
  }
});
