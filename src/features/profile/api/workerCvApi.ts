import { requestJson } from '../../../shared/api/httpClient';
import { API_BASE_URL } from '../../../shared/api/config';
import { workerPayload, type WorkerDraft } from '../worker/workerCv';
import type { VerifiedWorkHistoryJob } from './accountApi';

export interface WorkerCv {
  user_id: string; name: string; location: string; languages: string; profile_image_url: string | null;
  verification_status: string; contact_number: string | null; email?: string | null; generated_at: string; notice: string;
  details: Record<string, any>;
  presentation?: {
    name: string; services: string; location: string; phone: string; email?: string; verified: boolean;
    facts: { label: string; value: string }[];
    sections: { title: string; kind: 'text' | 'chips' | 'pairs'; items: any[] }[];
    trust: string[]; notice: string; generated_date: string;
  };
  performance: {
    completed_jobs: number; review_count: number;
    recommended_count?: number; repeat_employers_count?: number;
    average_rating: number | null; positive_percentage: number | null;
  };
  work_history?: VerifiedWorkHistoryJob[];
}
export function fetchWorkerCv(token: string, id: string): Promise<WorkerCv> {
  return requestJson(`/api/v1/accounts/worker-cv/${encodeURIComponent(id)}/`, { token });
}
export function fetchWorkerDetails(token: string): Promise<Record<string, any>> {
  return requestJson('/api/v1/accounts/worker-profile/', { token });
}
export function saveWorkerDetails(token: string, value: WorkerDraft): Promise<Record<string, any>> {
  return requestJson('/api/v1/accounts/worker-profile/', { token, method: 'PATCH', body: JSON.stringify({ ...workerPayload(value), languages: value.languages }) });
}
export function workerCvExportUrl(id: string, format: 'pdf' | 'csv') {
  return `${API_BASE_URL}/api/v1/accounts/worker-cv/${encodeURIComponent(id)}/export/?file_format=${format}`;
}
