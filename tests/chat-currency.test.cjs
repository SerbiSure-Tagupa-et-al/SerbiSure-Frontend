const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function compile(file, mocks = {}) {
  const source = ts.transpileModule(fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', source)(name => {
    if (name in mocks) return mocks[name];
    throw new Error('Unexpected dependency: ' + name);
  }, module, module.exports);
  return module.exports;
}
const rates = compile('src/shared/utils/rate.ts');
const currency = compile('src/features/chat/chatCurrency.ts', { '../../shared/utils/rate': rates });
const { analyzeChatCurrency, buildRateProposalMessage } = currency;
const { translateMessage } = compile('src/shared/localization/messages.ts');

for (const [text, formatted, kind, periodHint] of [
  ['500', '₱500.00', 'below_min', null],
  ['599.99', '₱599.99', 'below_min', null],
  ['600', '₱600.00', null, null],
  ['800', '₱800.00', null, null],
  ['5000', '₱5,000.00', null, null],
  ['5000/month', '₱5,000.00 / month', 'below_monthly_min', 'month'],
  ['5000 monthly', '₱5,000.00 / month', 'below_monthly_min', 'month'],
  ['5500', '₱5,500.00', 'gap_zone', null],
  ['6000', '₱6,000.00', 'gap_zone', null],
  ['5000.01', '₱5,000.01', 'gap_zone', null],
  ['6499.99', '₱6,499.99', 'gap_zone', null],
  ['6500', '₱6,500.00', null, null],
  ['8500', '₱8,500.00', null, null],
  ['8500/day', '₱8,500.00 / day', 'above_daily_max', 'day'],
  ['50000/month', '₱50,000.00 / month', null, 'month'],
  ['50000.01', '₱50,000.01', 'above_max', null],
  ['99999', '₱99,999.00', 'above_max', null],
  ['999999', '₱999,999.00', 'above_max', null],
  ['1500/day', '₱1,500.00 / day', null, 'day'],
  ['PHP 1,500.50 per day', '₱1,500.50 / day', null, 'day'],
]) {
  test(`standalone currency: ${text}`, () => {
    const result = analyzeChatCurrency(text);
    assert.equal(result.hasAmount, true);
    assert.equal(result.isStandaloneAmount, true);
    assert.equal(result.formattedText, formatted);
    assert.equal(result.amounts[0].periodHint, periodHint);
    assert.equal(result.warning?.kind ?? null, kind);
    if (kind) assert.equal(result.warning.blocking, true);
    else if (!periodHint && Number(text) <= 5000) assert.match(result.hint, /Part-time \/ Daily/);
    // Formatting an already formatted message must not add another peso prefix.
    assert.equal(analyzeChatCurrency(formatted).formattedText, formatted);
  });
}

for (const [text, formatted, kind] of [
  ['My budget is 500', 'My budget is ₱500.00', 'below_min'],
  ['salary 8500', 'salary ₱8,500.00', null],
  ['sweldo 7500', 'sweldo ₱7,500.00', null],
  ['suweldo ko 7500', 'suweldo ko ₱7,500.00', null],
  ['Can we do 99999 monthly?', 'Can we do ₱99,999.00 monthly?', 'above_max'],
  ['PHP 8500 is my rate', '₱8,500.00 is my rate', null],
  ['My budget is PHP 8500.', 'My budget is ₱8,500.00.', null],
  ['My rate: P1500 per day', 'My rate: ₱1,500.00 per day', null],
  ['Offer ₱ 8500, please.', 'Offer ₱8,500.00, please.', null],
  ['I suggest Php 1500', 'I suggest ₱1,500.00', null],
]) {
  test(`sentence currency: ${text}`, () => {
    const result = analyzeChatCurrency(text);
    assert.equal(result.hasAmount, true);
    assert.equal(result.isStandaloneAmount, false);
    assert.equal(result.formattedText, formatted);
    assert.equal(result.warning?.kind ?? null, kind);
    if (kind) assert.equal(result.warning.blocking, false);
  });
}

for (const text of ['09171234567', '+639171234567', '639171234567', '0881234567',
  'call me at 0917-123-4567', 'Phone number 8500', 'Contact 8500', 'text 8500', 'GCash 8500', 'Maya 8500',
  'Lot 3 Blk 12 Zip 9000', 'Block 500 Phase 600 Purok 800', 'Unit 1500 Floor 100 Room 800', '#8500',
  'See you at 8:00 AM', 'Meet at 12:30', '5pm', '11/25/2026', '2026-11-25', 'Worked since 2024',
  '2 kids', '5', '099', '08500', 'https://example.com/rate/8500', 'https://example.com?budget=500',
  'salary8500@example.com', 'Reference ABC8500', '1,23', '8500.123']) {
  test(`ordinary numbers stay untouched: ${text}`, () => {
    const result = analyzeChatCurrency(text);
    assert.equal(result.hasAmount, false);
    assert.equal(result.isStandaloneAmount, false);
    assert.equal(result.formattedText, text);
    assert.equal(result.warning, null);
    assert.equal(result.hint, null);
  });
}

test('mixed text formats only pay, keeping addresses, phones and dates unchanged', () => {
  const text = 'Budget 8500, Lot 500, contact 0917-123-4567 on 2026-11-25 at 8:00 AM';
  assert.equal(analyzeChatCurrency(text).formattedText,
    'Budget ₱8,500.00, Lot 500, contact 0917-123-4567 on 2026-11-25 at 8:00 AM');
});

test('multiple amounts select the most severe warning without blocking a full sentence', () => {
  const result = analyzeChatCurrency('Budget ₱6000 or ₱500 or ₱99999');
  assert.equal(result.amounts.length, 3);
  assert.equal(result.warning.kind, 'above_max');
  assert.equal(result.warning.amountFormatted, '₱99,999.00');
  assert.equal(result.warning.blocking, false);
});

test('rate proposals reuse the existing formatter and keep API engagement values', () => {
  assert.equal(buildRateProposalMessage('short_term', '800'), 'Rate proposal (Part-time / Daily): ₱800.00 / day');
  assert.equal(buildRateProposalMessage('long_term', '8500'), 'Rate proposal (Full-time / Monthly): ₱8,500.00 / month');
  assert.equal(currency.formatRate, rates.formatRate);
  assert.equal(currency.formatRateInput, rates.formatRateInput);
});

test('every zone warning translates in Tagalog and Bisaya without losing the amount', () => {
  for (const text of ['500', '5000/month', '6000', '8500/day', '99999']) {
    const warning = analyzeChatCurrency(text).warning;
    const template = warning.message.replace(warning.amountFormatted, '{amount}');
    for (const language of ['Tagalog', 'Bisaya']) {
      const translated = translateMessage(language, template, { amount: warning.amountFormatted });
      assert.notEqual(translated, warning.message);
      assert.ok(translated.includes(warning.amountFormatted));
      assert.doesNotMatch(translated, /\{\w+\}/);
    }
  }
});
