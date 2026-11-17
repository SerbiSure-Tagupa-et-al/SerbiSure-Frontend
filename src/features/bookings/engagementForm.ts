/** Shared form rules for public posts and private chat offers. Times are Philippine time. */
export const BASE_SERVICES = ['Cleaning', 'Child_care', 'Cooking', 'Caregiver', 'Laundry'] as const;
export const SERVICE_OPTIONS = [...BASE_SERVICES, 'All-around'];
export const SERVICE_CHOICES = [
  { id: 'Cleaning', label: 'Cleaning', icon: 'sparkles' },
  { id: 'Child_care', label: 'Child Care', icon: 'happy' },
  { id: 'Cooking', label: 'Cooking', icon: 'restaurant' },
  { id: 'Caregiver', label: 'Caregiver', icon: 'heart' },
  { id: 'Laundry', label: 'Laundry', icon: 'shirt' },
  { id: 'All-around', label: 'All-around', icon: 'home' },
] as const;

export function normalizeServices(values: readonly string[]): string[] {
  const unique = [...new Set(values)].filter(value => SERVICE_OPTIONS.includes(value));
  return unique.includes('All-around') || BASE_SERVICES.every(value => unique.includes(value))
    ? ['All-around'] : unique;
}

export function toggleService(values: readonly string[], value: string): string[] {
  if (!SERVICE_OPTIONS.includes(value)) return normalizeServices(values);
  const current = normalizeServices(values);
  if (value === 'All-around') return current.includes(value) ? [] : [value];
  if (current.includes('All-around')) return [value];
  return normalizeServices(current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
}

export const WORK_DAYS = [
  { value: 'M', label: 'Mon' }, { value: 'T', label: 'Tue' }, { value: 'W', label: 'Wed' },
  { value: 'Th', label: 'Thu' }, { value: 'F', label: 'Fri' }, { value: 'S', label: 'Sat' },
  { value: 'Su', label: 'Sun' },
] as const;

export const WORK_SHIFTS = [
  { value: 'morning', label: 'Morning', hours: '08:00 AM - 12:00 PM' },
  { value: 'afternoon', label: 'Afternoon', hours: '12:00 PM - 05:00 PM' },
  { value: 'night', label: 'Night', hours: '05:00 PM - 09:00 PM' },
] as const;
export type WorkShift = typeof WORK_SHIFTS[number]['value'] | 'custom';

export const LONG_TERM_MINIMUM_MESSAGE = 'SerbiSure requires at least 30 days for long-term posts. Choose a later end date.';
export const SHORT_TERM_MAX_DAYS = 7;
export const SHORT_TERM_MAXIMUM_MESSAGE = 'The end date for a short-term booking can be up to 7 days after the start date.';
const DAY_MS = 86400000;

function calendarDateAfter(startDate: string, days: number): string {
  const start = bookingSchedule(startDate, '12:00 PM');
  const date = new Date(Date.parse(start.iso) + days * DAY_MS);
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

export function earliestLongTermEnd(startDate: string): string {
  return calendarDateAfter(startDate, 30);
}

export function latestShortTermEnd(startDate: string): string {
  return calendarDateAfter(startDate, SHORT_TERM_MAX_DAYS);
}

export function calendarDaysBetween(startDate: string, endDate: string): number {
  const start = Date.parse(bookingSchedule(startDate, '12:00 PM').iso);
  const end = Date.parse(bookingSchedule(endDate, '12:00 PM').iso);
  return (end - start) / DAY_MS;
}

export function bookingSchedule(date: string, clockText: string): { iso: string; clock: string } {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(date);
  const time = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(clockText.trim());
  if (!match || !time) throw new Error('Select valid dates and working hours.');
  const [, month = '', day = '', year = ''] = match;
  const hour = Number(time[1]); const minute = Number(time[2]);
  if (hour < 1 || hour > 12 || minute > 59) throw new Error('Select valid working hours.');
  const hour24 = hour % 12 + (time[3]?.toUpperCase() === 'PM' ? 12 : 0);
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (calendar.getUTCFullYear() !== Number(year) || calendar.getUTCMonth() + 1 !== Number(month) || calendar.getUTCDate() !== Number(day)) throw new Error('Select a valid calendar date.');
  const clockValue = String(hour24).padStart(2, '0') + ':' + String(minute).padStart(2, '0') + ':00';
  return { iso: new Date(year + '-' + month + '-' + day + 'T' + clockValue + '+08:00').toISOString(), clock: clockValue };
}

export function dayForDate(date: string): string {
  const stamp = bookingSchedule(date, '12:00 PM');
  return ['Su', 'M', 'T', 'W', 'Th', 'F', 'S'][new Date(stamp.iso).getUTCDay()]!;
}

export interface EngagementSchedule {
  bookingType: 'short_term' | 'long_term';
  startDate: string;
  endDate: string;
  workHours: string;
  days: readonly string[];
  shift: WorkShift | null;
  ongoing?: boolean;
}

export function buildEngagementSchedule(form: EngagementSchedule, now = Date.now()) {
  const short = form.bookingType === 'short_term';
  const shift = WORK_SHIFTS.find(item => item.value === form.shift);
  if (short && !shift && form.shift !== 'custom') throw new Error('Choose a preset or set your own working hours.');
  const hours = short && shift ? shift.hours : form.workHours;
  if (!form.startDate) throw new Error('Choose a start date.');
  if (!short && !form.ongoing && !form.endDate) throw new Error('Choose an end date or select No end date.');
  if (!hours.trim()) throw new Error('Choose your working hours before continuing.');
  const [startClock = '', endClock = ''] = hours.split(' - ');
  const start = bookingSchedule(form.startDate, startClock);
  const endDate = short ? (form.endDate || form.startDate) : form.ongoing ? form.startDate : form.endDate;
  const end = bookingSchedule(endDate, endClock);
  if (start.clock >= end.clock) throw new Error('Daily work hours must end after they start.');
  if (end.iso <= start.iso) throw new Error('The end date must be on or after the start date.');
  const latestAllowed = short ? Date.parse(bookingSchedule(form.startDate, endClock).iso) : Date.parse(bookingSchedule(form.startDate, '11:59 PM').iso);
  if (latestAllowed <= now) throw new Error('Choose a start date and shift that have not passed.');
  if (!short && !form.ongoing && bookingSchedule(form.endDate, '12:00 PM').iso < bookingSchedule(earliestLongTermEnd(form.startDate), '12:00 PM').iso) throw new Error(LONG_TERM_MINIMUM_MESSAGE);
  const days = WORK_DAYS.filter(item => form.days.includes(item.value)).map(item => item.value);
  const daySpan = calendarDaysBetween(form.startDate, endDate);
  if (short && daySpan > SHORT_TERM_MAX_DAYS) throw new Error(SHORT_TERM_MAXIMUM_MESSAGE);
  if (short && daySpan > 0) {
    if (!days.length) throw new Error('Select at least one working day.');
    const startDay = WORK_DAYS.findIndex(item => item.value === dayForDate(form.startDate));
    if (!Array.from({ length: Math.min(daySpan + 1, 7) }, (_, index) => WORK_DAYS[(startDay + index) % 7]!.value).some(day => days.includes(day))) {
      throw new Error('Select a working day within the date range.');
    }
  }
  if (!short && !days.length) throw new Error('Select at least one working day.');
  if (!short && !days.includes(dayForDate(form.startDate) as typeof days[number])) throw new Error('The start date must fall on a selected working day.');
  return {
    start_time: start.iso, end_time: !short && form.ongoing ? null : end.iso, daily_start_time: start.clock, daily_end_time: end.clock,
    work_days: short && daySpan === 0 ? [dayForDate(form.startDate)] : days,
  };
}
