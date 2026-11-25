import { PART_TIME_MAX_RATE, FULL_TIME_MAX_RATE } from '../../posting/validation';
import { normalizeServices } from '../../bookings/engagementForm';

export const CV_PAGES = ['Work preferences', 'Experience & family', 'Availability', 'Extras & sharing'];
export const PRACTICAL_SKILLS = ['Meal preparation', 'Ironing', 'Deep cleaning', 'Infant care', 'Child supervision', 'Older adult assistance', 'Laundry care', 'Household organization'];
export const TESDA_NC2_CERTIFICATES = [
  'TESDA NC II – Domestic Work',
  'TESDA NC II – Housekeeping',
  'TESDA NC II – Caregiving',
  'TESDA NC II – Cookery',
] as const;
export const TESDA_NOT_YET_CERTIFIED = 'Not yet certified (will upload before booking)';
export const TESDA_NC2_DROPDOWN_OPTIONS = [...TESDA_NC2_CERTIFICATES, TESDA_NOT_YET_CERTIFIED] as const;
export const TESDA_NC2_HELPER_NOTE =
  'You must upload your TESDA NC II certificate in Step 5 or Document Verification before you can post, apply, or accept bookings.';
export interface Training { name: string; provider: string; year: string }

function isTesdaNc2Entry(item: Training): boolean {
  const name = (item.name || '').trim().toLowerCase();
  if (!name) return false;
  if (TESDA_NC2_CERTIFICATES.some(cert => cert.toLowerCase() === name)) return true;
  return (item.provider || '').trim().toUpperCase() === 'TESDA' && name.startsWith('tesda nc ii');
}

export function getTesdaCertSelection(training: Training[] = []): string {
  const match = training.find(isTesdaNc2Entry);
  if (!match) return '';
  const canonical = TESDA_NC2_CERTIFICATES.find(cert => cert.toLowerCase() === match.name.trim().toLowerCase());
  return canonical || match.name.trim();
}

export function applyTesdaCertSelection(training: Training[] = [], selection: string): Training[] {
  const others = training.filter(item => !isTesdaNc2Entry(item));
  const trimmed = selection.trim();
  if (!trimmed || trimmed === TESDA_NOT_YET_CERTIFIED) return others;
  return [{ name: trimmed, provider: 'TESDA', year: '' }, ...others];
}
export interface WorkerDraft {
  service_categories: string[]; work_setup: string; engagement_preference: string;
  desired_monthly_rate: string; desired_daily_rate: string; civil_status: string; number_of_children: string;
  experience_level: string; experience_duration: string; experience_summary: string; practical_skills: string[];
  available_from: string; available_days: string[]; preferred_shifts: string[]; preferred_work_areas: string;
  education: string; training: Training[]; references_available: boolean;
  share_family_details: boolean; share_contact_details: boolean; languages: string[];
}
export function emptyWorkerDraft(): WorkerDraft {
  return { service_categories: [], work_setup: '', engagement_preference: '', desired_monthly_rate: '', desired_daily_rate: '',
    civil_status: '', number_of_children: '', experience_level: '', experience_duration: '', experience_summary: '', practical_skills: [],
    available_from: '', available_days: [], preferred_shifts: [], preferred_work_areas: '', education: '', training: [],
    references_available: false, share_family_details: false, share_contact_details: false, languages: [] };
}
export function workerDraft(data: Record<string, any>, tags: string[] = [], language = ''): WorkerDraft {
  const aliases: Record<string, string> = { 'Child Care': 'Child_care', Childcare: 'Child_care', Cook: 'Cooking' };
  return { ...emptyWorkerDraft(), ...data,
    service_categories: normalizeServices(data.service_categories?.length ? data.service_categories : tags.map(tag => aliases[tag] || tag)),
    work_setup: data.work_setup || (tags.includes('Stay-In') ? 'stay_in' : tags.includes('Stay-Out') ? 'stay_out' : ''),
    desired_monthly_rate: data.desired_monthly_rate == null ? '' : String(data.desired_monthly_rate),
    desired_daily_rate: data.desired_daily_rate == null ? '' : String(data.desired_daily_rate),
    number_of_children: data.number_of_children == null ? '' : String(data.number_of_children),
    available_from: data.available_from || '', preferred_work_areas: (data.preferred_work_areas || []).join(', '),
    training: (data.training || []).map((item: any) => ({ ...item, year: item.year == null ? '' : String(item.year) })),
    languages: data.languages || language.split(',').map(value => value.trim()).filter(Boolean),
  };
}
const DAY_CODE_ALIASES: Record<string, string> = {
  TH: 'Th',
  SA: 'S',
  SU: 'Su',
};
const VALID_DAY_CODES = new Set(['M', 'T', 'W', 'Th', 'F', 'S', 'Su']);
const SKILL_ALIASES: Record<string, string> = {
  'Senior assistance': 'Older adult assistance',
};
const VALID_SKILLS = new Set(PRACTICAL_SKILLS);

function normalizeAvailableDays(days: string[] = []): string[] {
  return [...new Set(days.map(day => DAY_CODE_ALIASES[day] || day).filter(day => VALID_DAY_CODES.has(day)))];
}

function normalizePracticalSkills(skills: string[] = []): string[] {
  return [...new Set(skills.map(skill => SKILL_ALIASES[skill] || skill).filter(skill => VALID_SKILLS.has(skill)))];
}

export function workerPayload(value: WorkerDraft) {
  return { service_categories: normalizeServices(value.service_categories), work_setup: value.work_setup, engagement_preference: value.engagement_preference,
    desired_monthly_rate: value.desired_monthly_rate.trim() || null, desired_daily_rate: value.desired_daily_rate.trim() || null,
    civil_status: value.civil_status, number_of_children: value.number_of_children === '' ? null : Number(value.number_of_children),
    experience_level: value.experience_level, experience_duration: value.experience_level === 'new' ? '' : value.experience_duration,
    experience_summary: value.experience_summary.trim(), practical_skills: normalizePracticalSkills(value.practical_skills),
    available_from: value.available_from || null, available_days: normalizeAvailableDays(value.available_days), preferred_shifts: value.preferred_shifts,
    preferred_work_areas: [...new Set(value.preferred_work_areas.split(',').map(area => area.trim()).filter(Boolean))],
    education: value.education.trim(), training: value.training.filter(item => item.name.trim()).map(item => ({ name: item.name.trim(), provider: item.provider.trim(), year: item.year ? Number(item.year) : null })),
    references_available: value.references_available, share_family_details: value.share_family_details, share_contact_details: value.share_contact_details };
}
export function validateWorkerPage(value: WorkerDraft, page: number): string | null {
  if (page === 0) {
    if (!value.service_categories.length) return 'Choose at least one service.';
    if (!value.engagement_preference || !value.work_setup) return 'Choose your engagement and work setup preferences.';
    for (const [amount, needed, label, maximum, capMessage] of [[value.desired_monthly_rate, value.engagement_preference !== 'short_term', 'monthly salary', FULL_TIME_MAX_RATE, 'Maximum expected Full-time / Monthly rate is ₱50,000.00 / month.'], [value.desired_daily_rate, value.engagement_preference !== 'long_term', 'daily rate', PART_TIME_MAX_RATE, 'Maximum expected Part-time / Daily rate is ₱5,000.00 / day.']] as const) {
      if (needed && !amount.trim()) return `Enter your expected ${label}.`;
      if (amount.trim() && (!/^\d+(\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0 || !Number.isFinite(Number(amount)))) return `Enter a valid ${label} with at most two decimal places.`;
      if (amount.trim() && Number(amount) > maximum) return capMessage;
    }
    if (!value.languages.length) return 'Choose at least one spoken language.';
  }
  if (page === 1) {
    if (!value.experience_level) return 'Choose your experience level. First-time workers are welcome.';
    if (value.experience_level !== 'new' && !value.experience_duration) return 'Choose your approximate experience duration.';
    if (!value.civil_status) return 'Choose your civil status.';
    if (!/^\d{1,2}$/.test(value.number_of_children) || Number(value.number_of_children) > 99) return 'Enter the number of children, including 0 if you have none.';
  }
  if (page === 2) {
    if (value.available_from) {
      const parsed = new Date(`${value.available_from}T12:00:00+08:00`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value.available_from) || !Number.isFinite(parsed.getTime()) || new Date(parsed.getTime() + 8 * 3600000).toISOString().slice(0, 10) !== value.available_from) return 'Choose a valid availability date.';
    }
    if (!value.available_days.length) return 'Choose at least one available day.';
    if (value.engagement_preference !== 'long_term' && !value.preferred_shifts.length) return 'Choose at least one preferred shift.';
    if (workerPayload(value).preferred_work_areas.length > 5) return 'Add up to five preferred work areas.';
  }
  if (page === 3 && value.training.some(item => (item.provider || item.year) && !item.name.trim() || item.year && (!/^\d{4}$/.test(item.year) || Number(item.year) < 1900 || Number(item.year) > 2100))) return 'Enter a training name and a valid four-digit completion year, or leave the training blank.';
  return null;
}
