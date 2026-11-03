import type { DocumentStatusItem } from './api/verificationApi';

export function documentIsExpired(document: DocumentStatusItem, now = Date.now()): boolean {
  // An expiry date is valid through that day in the Philippines (UTC+8).
  const today = new Date(now + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return document.valid_until ? document.valid_until.slice(0, 10) < today : document.is_expired === true;
}

export function canReplaceDocument(document: DocumentStatusItem): boolean {
  if (document.document_type === 'profile_photo') return document.verification_status === 'Rejected';
  return ['Unverified', 'Rejected'].includes(document.verification_status) ||
    (document.verification_status === 'Verified' && documentIsExpired(document));
}

export function currentDocuments(documents: DocumentStatusItem[] = []): DocumentStatusItem[] {
  const latest = new Map<string, DocumentStatusItem>();
  for (const document of documents) {
    const previous = latest.get(document.document_type);
    if (!previous || document.created_at > previous.created_at ||
      (document.created_at === previous.created_at && document.document_id > previous.document_id)) {
      latest.set(document.document_type, document);
    }
  }
  return [...latest.values()];
}
