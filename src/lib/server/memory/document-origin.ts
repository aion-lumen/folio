import { isAbsolute, join } from 'node:path';
import { documentBytes } from '../file-intake/document-security.js';

interface DocumentOrigin {
 schema: 'folio/reorg-pilot-result/v2';
 run_id: string;
 documents: Array<{ document_id: string; source_ref: string; sha256: string; review_extract?: { text: string; truncated: boolean } }>;
}
/** Read existing document evidence from an explicitly configured import archive. */
export function readReorgPilotResult(runId: string): DocumentOrigin | null {
 const root = process.env.FOLIO_REORG_STATE_ROOT?.trim();
 if (!root || !isAbsolute(root) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(runId)) return null;
 try {
  const value = JSON.parse(documentBytes(join(root, 'results', `${runId}.json`), 8 * 1024 * 1024).toString());
  if (value?.schema !== 'folio/reorg-pilot-result/v2' || value.run_id !== runId || !Array.isArray(value.documents)
   || !Array.isArray(value.reviewers) || !Array.isArray(value.control?.assessments)) return null;
  if (value.documents.some((d: any) => !d || typeof d.document_id !== 'string' || typeof d.source_ref !== 'string'
   || typeof d.sha256 !== 'string' || (d.review_extract && (typeof d.review_extract.text !== 'string' || typeof d.review_extract.truncated !== 'boolean')))) return null;
  return value;
 } catch { return null; }
}
