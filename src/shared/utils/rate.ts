export function formatRate(value: unknown, prefix = '₱'): string {
  if (typeof value !== 'number' && typeof value !== 'string') return 'Rate not provided';
  const raw = String(value).trim().replace(/^(?:₱|PHP)\s*/i, '');
  // Accept correctly grouped display values without turning malformed input into money.
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(raw)) return 'Rate not provided';
  const amount = Number(raw.replace(/,/g, ''));
  return Number.isFinite(amount) && amount > 0
    ? `${prefix}${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : 'Rate not provided';
}

/** Group while typing, preserving a trailing decimal point and unfinished cents. */
export function formatRateInput(value: string): string {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value)) return value;
  const [whole, fraction] = value.split('.');
  return Number(whole).toLocaleString('en-US', { maximumFractionDigits: 0 })
    + (fraction === undefined ? '' : `.${fraction}`);
}
