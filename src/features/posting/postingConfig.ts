import { formatRate } from '../../shared/utils/rate';
export type PostingMode = 'job' | 'service';

export const POSTING_CONFIG = {
  job: {
    role: 'homeowner', title: 'Post a Job', submitLabel: 'Post Job', successTitle: 'Job posted!',
    defaultService: 'Household Help',
    roleWord: 'role', questionSuffix: 'do you need?', rateHeading: 'offer rate', postHeading: 'job post',
    addressLabel: 'JOB ADDRESS', instructionsLabel: 'SPECIFIC INSTRUCTIONS ABOUT ROLE (OPTIONAL)',
    instructionsPlaceholder: 'e.g. Must be comfortable with large dogs, gentle with infants, or experienced with laundry care.',
    previewLabel: 'LISTING PREVIEW', summaryRoleLabel: 'Role', summaryTypeLabel: 'Type', rateLabel: 'Offer Rate', timeLabel: 'Time',
    notice: 'Your listing will be visible to verified Kasambahays in your area immediately once posted.',
    termsPrefix: 'I agree to the ', termsName: 'SerbiSure Terms of Service', termsSuffix: ' and confirm these household details are accurate.',
    missingTerms: 'Please agree to the Terms of Service to post.',
    missingEngagement: 'Please select an engagement type (Part-time / Daily or Full-time / Monthly).',
    missingSetup: 'Please select your work setup preference (Stay-out or Stay-in).', missingTime: 'Please select what time works best for you.',
    invalidAmount: 'Please provide a valid offer amount.', dailyMinimumMessage: 'The rate cannot be below ₱600/day on a part-time / daily basis.',
    monthlyMinimumTitle: 'Minimum Monthly Salary', errorMessage: 'Failed to post job. Please check your entries.',
  },
  service: {
    role: 'kasambahay', title: 'Post a Service', submitLabel: 'Post Service', successTitle: 'Service posted!',
    defaultService: 'Household Service',
    roleWord: 'service', questionSuffix: 'do you offer?', rateHeading: 'expected rate', postHeading: 'service post',
    addressLabel: 'SERVICE ADDRESS', instructionsLabel: 'SPECIFIC INSTRUCTIONS / SKILLS (OPTIONAL)',
    instructionsPlaceholder: 'e.g. 5+ years experience in housekeeping, gentle with kids, pet-friendly and trustworthy.',
    previewLabel: 'SERVICE LISTING PREVIEW', summaryRoleLabel: 'Service', summaryTypeLabel: 'Work Type', rateLabel: 'Asking Rate', timeLabel: 'Available Time',
    notice: 'Your service post will be visible to homeowners searching for household help in your area.',
    termsPrefix: 'I confirm that my service details and availability are accurate and agree to the ', termsName: 'SerbiSure Terms', termsSuffix: '.',
    missingTerms: 'Please confirm that your service details are accurate.',
    missingEngagement: 'Please select what type of work you want (Part-time / Daily or Full-time / Monthly).',
    missingSetup: 'Please select where you will stay (Stay-out or Stay-in).', missingTime: 'Please select what time you are available.',
    invalidAmount: 'Please provide a valid asking rate.', dailyMinimumMessage: 'The asking rate cannot be below ₱600/day on a part-time / daily basis.',
    monthlyMinimumTitle: 'Minimum Monthly Rate', errorMessage: 'Failed to post service. Please check your entries.',
  },
} as const;

export function buildPostLocation(input: {
  street?: string | null;
  floorUnit?: string | null;
  barangay?: string | null;
  city?: string | null;
  zipcode?: string | null;
}, fallback = 'Location not provided'): string {
  const street = input.street?.trim();
  const floorUnit = input.floorUnit?.trim();
  const barangay = input.barangay?.trim();
  const city = input.city?.trim();
  const zipcode = input.zipcode?.trim();
  const parts = [
    street,
    floorUnit ? `Floor/Unit ${floorUnit}` : undefined,
    barangay,
    city,
  ].filter((part): part is string => Boolean(part));

  if (parts.length === 0) return fallback;
  return `${parts.join(', ')}${zipcode ? ` (${zipcode})` : ''}`;
}

function buildPostRateText(rate: string | undefined, shortTerm: boolean): string {
  const amount = rate?.trim().replace(/^₱\s*/, '');
  return amount ? `${formatRate(amount)} / ${shortTerm ? 'day' : 'month'}` : '';
}

export function buildPostDescription(mode: PostingMode, input: {
  service: string; location: string; setup: string; time: string; shortTerm: boolean; instructions: string; rate?: string;
}): string {
  const { service, location, setup, time, shortTerm, instructions, rate } = input;
  let message = mode === 'job'
    ? shortTerm
      ? `I am looking for ${service} at ${location}, available ${time}.`
      : `I am looking for ${service} at ${location}, capable of working on a ${setup} setup.`
    : `I am offering ${service} service in ${location} for ${shortTerm ? 'Part-time / Daily' : 'Full-time / Monthly'} work, ${setup.toLowerCase().includes('stay-in') ? 'Stay-in (Live-in)' : 'Stay-out (Goes home)'}, available ${time}.`;
  const rateText = mode === 'job' ? buildPostRateText(rate, shortTerm) : '';
  if (rateText) {
    message = `${message.replace(/\.$/, '')} with an offer rate of ${rateText}.`;
  }
  if (instructions.trim()) message += `\n\n${mode === 'job' ? 'Specific instructions' : 'About my experience'}:\n${instructions.trim()}`;
  return message;
}
