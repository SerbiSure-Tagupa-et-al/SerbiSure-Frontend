export type Role = 'homeowner' | 'kasambahay';

export function resolveRole(accountType?: string | null, fallback: Role = 'homeowner'): Role {
  const value = accountType?.toLowerCase();
  return value === 'homeowner' || value === 'kasambahay' ? value : fallback;
}

export const ROLE_CONFIG = {
  homeowner: {
    accountType: 'Homeowner', partnerType: 'Kasambahay', postingMode: 'job',
    searchKey: 'searchWorkers', browseLabelKey: 'tabServices',
    workerProfile: false, requiredDocuments: ['national_id_front', 'national_id_back'],
  },
  kasambahay: {
    accountType: 'Kasambahay', partnerType: 'Homeowner', postingMode: 'service',
    searchKey: 'searchJobs', browseLabelKey: 'tabJobs',
    workerProfile: true, requiredDocuments: ['nbi_clearance', 'police_clearance', 'tesda_nc2'],
  },
} as const;
