import { formatRate } from '../../shared/utils/rate';
export { formatRate, formatRateInput } from '../../shared/utils/rate';

export const PART_TIME_MIN = 600;
export const PART_TIME_MAX = 5000;
export const FULL_TIME_MIN = 6500;
export const FULL_TIME_MAX = 50000;

export interface DetectedChatAmount {
  raw: string;
  value: number;
  formatted: string;
  periodHint: 'day' | 'month' | null;
}

export interface ChatCurrencyAnalysis {
  hasAmount: boolean;
  isStandaloneAmount: boolean;
  formattedText: string;
  amounts: DetectedChatAmount[];
  hint: string | null;
  warning: {
    kind: 'below_min' | 'gap_zone' | 'above_max' | 'below_monthly_min' | 'above_daily_max';
    blocking: boolean;
    amountFormatted: string;
    message: string;
  } | null;
}

const PAY_WORDS = 'salary|rate|offer|budget|pay|wage|sweldo|suweldo|bayad|presyo|sahod';
const PAY_BEFORE = new RegExp(`\\b(?:${PAY_WORDS})(?:\\s+(?:is|of|at|for|ko|ay|na|nga|kay|ang|sa|nako|po|about|around|up|to)){0,3}\\s*[:=]?\\s*$`, 'i');
const PAY_AFTER = new RegExp(`^\\s+(?:${PAY_WORDS})\\b`, 'i');
const NON_PAY_BEFORE = /(?:\b(?:call|text|phone|contact|number|gcash|maya|lot|blk|block|phase|purok|zone|sitio|brgy|barangay|unit|floor|room|zip|zipcode|postal)(?:\s+(?:me|us|at|is|no|number|ko|sa|ang|ay|nako))?\s*[#:.=-]?|#)\s*$/i;
const NON_PAY_AFTER = /^\s*(?:call|text|phone|contact|number|gcash|maya)\b/i;

function amountWarning(amount: DetectedChatAmount): ChatCurrencyAnalysis['warning'] {
  const { value, formatted, periodHint } = amount;
  let kind: NonNullable<ChatCurrencyAnalysis['warning']>['kind'];
  let message: string;
  if (value < PART_TIME_MIN) {
    kind = 'below_min';
    message = `${formatted} is below the minimum pay. Part-time / Daily minimum is ₱600.00/day, and Full-time / Monthly (Region X / RA 10361) minimum is ₱6,500.00/month.`;
  } else if (value > FULL_TIME_MAX) {
    kind = 'above_max';
    message = `${formatted} exceeds SerbiSure's realistic pay cap (Part-time / Daily max ₱5,000.00/day · Full-time / Monthly max ₱50,000.00/month).`;
  } else if (value > PART_TIME_MAX && value < FULL_TIME_MIN) {
    kind = 'gap_zone';
    message = `${formatted} is above the Part-time / Daily max (₱5,000.00/day) and below the Full-time / Monthly minimum (₱6,500.00/month under RA 10361).`;
  } else if (periodHint === 'month' && value < FULL_TIME_MIN) {
    kind = 'below_monthly_min';
    message = `${formatted}/month is below the Region X Full-time / Monthly minimum of ₱6,500.00/month (RA 10361).`;
  } else if (periodHint === 'day' && value > PART_TIME_MAX) {
    kind = 'above_daily_max';
    message = `${formatted}/day exceeds the Part-time / Daily maximum of ₱5,000.00/day. Switch to Full-time / Monthly for monthly rates.`;
  } else return null;
  return { kind, blocking: false, amountFormatted: formatted, message };
}

/** Recognize pay context, not arbitrary numbers in ordinary conversation. */
export function analyzeChatCurrency(text: string): ChatCurrencyAnalysis {
  const source = text.trim();
  const protectedRanges = Array.from(source.matchAll(/(?:https?:\/\/|www\.)\S+|\b[^\s@]+@[^\s@]+\.[^\s@]+|\b\d{1,4}[-/]\d{1,2}[-/]\d{1,4}\b|\b\d{1,2}:\d{2}(?::\d{2})?(?:\s*[ap]m)?\b|\b\d{1,2}\s*[ap]m\b/gi), match => [match.index!, match.index! + match[0].length]);
  const tokens = /(₱\s*|PHP\s*|P(?=\d{3}))?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(\s*(?:\/\s*(?:day|month)\b|per\s+(?:day|month)\b|(?:daily|monthly)\b))?/gi;
  const found: (DetectedChatAmount & { start: number; end: number; suffix: string })[] = [];
  for (const match of source.matchAll(tokens)) {
    const start = match.index!;
    const end = start + match[0].length;
    const before = source.slice(0, start);
    const after = source.slice(end);
    const digits = match[2]!.replace(/,/g, '');
    if (/[\w.,+\-]$/.test(before) || /^[\w:\-]/.test(after) || /^[.,]\d/.test(after)) continue;
    if (protectedRanges.some(([a, b]) => start < b! && end > a!)) continue;
    if (/^(?:09|639|088)/.test(digits) || NON_PAY_BEFORE.test(before) || NON_PAY_AFTER.test(after)) continue;
    const value = Number(digits);
    const suffix = match[3] || '';
    const periodHint = /month/i.test(suffix) ? 'month' : /day|daily/i.test(suffix) ? 'day' : null;
    const standalone = start === 0 && end === source.length;
    const explicit = !!match[1];
    const bareAmount = standalone && value >= 100 && !digits.startsWith('0');
    if (!Number.isFinite(value) || !(explicit || periodHint || bareAmount || PAY_BEFORE.test(before) || PAY_AFTER.test(after))) continue;
    found.push({ raw: match[0], value, formatted: value === 0 ? '₱0.00' : formatRate(digits), periodHint, start, end, suffix });
  }
  const isStandaloneAmount = found.length === 1 && found[0]!.start === 0 && found[0]!.end === source.length;
  let formattedText = '';
  let cursor = 0;
  for (const amount of found) {
    const suffix = isStandaloneAmount && amount.periodHint ? ` / ${amount.periodHint}` : amount.suffix;
    formattedText += source.slice(cursor, amount.start) + amount.formatted + suffix;
    cursor = amount.end;
  }
  formattedText += source.slice(cursor);
  const priority = { above_max: 5, below_min: 4, below_monthly_min: 4, gap_zone: 3, above_daily_max: 3 };
  let warning: ChatCurrencyAnalysis['warning'] = null;
  for (const amount of found) {
    const next = amountWarning(amount);
    if (next && (!warning || priority[next.kind] > priority[warning.kind])) warning = next;
  }
  if (warning) warning.blocking = isStandaloneAmount;
  const hint = !warning && found.some(amount => amount.value >= PART_TIME_MIN && amount.value <= PART_TIME_MAX && !amount.periodHint)
    ? 'Valid for Part-time / Daily (₱600.00–₱5,000.00/day). For Full-time / Monthly, Region X minimum is ₱6,500.00/month.' : null;
  return { hasAmount: found.length > 0, isStandaloneAmount, formattedText: found.length ? formattedText : text,
    amounts: found.map(({ raw, value, formatted, periodHint }) => ({ raw, value, formatted, periodHint })), hint, warning };
}

export function buildRateProposalMessage(engagement: 'short_term' | 'long_term', rawAmount: string): string {
  return `Rate proposal (${engagement === 'short_term' ? 'Part-time / Daily' : 'Full-time / Monthly'}): ${formatRate(rawAmount)} / ${engagement === 'short_term' ? 'day' : 'month'}`;
}
