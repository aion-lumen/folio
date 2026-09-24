import {canonicalHash} from './reconciliation.js';
export interface InvoiceVote { model: string; input_sha256: string; fields_supported: boolean; payment_evidence: 'paid'|'not_proven'|'conflict'; }
export interface ReviewInput {
 id: string; invoice_text: string; invoice: Record<string,unknown>; mail_excerpt: string;
 bank_entries: unknown[]; coverage_complete: boolean; today: string;
}
export function validateInvoiceVote(raw: unknown, model: string, input: ReviewInput): InvoiceVote {
 const r=raw as Record<string,unknown>;
 if(!r || Object.keys(r).sort().join(',')!=='fields_supported,payment_evidence' || typeof r.fields_supported!=='boolean' || !['paid','not_proven','conflict'].includes(String(r.payment_evidence))) throw new Error('invalid_payment_review');
 return {model,input_sha256:canonicalHash(input),fields_supported:r.fields_supported,payment_evidence:r.payment_evidence as InvoiceVote['payment_evidence']};
}
export function reviewsAgree(votes: InvoiceVote[], input: ReviewInput): boolean {
 return Array.isArray(votes) && votes.length===2 && votes.every(v=>v && typeof v.model==='string' && v.model.length>0 && v.input_sha256===canonicalHash(input) && v.fields_supported===true && ['paid','not_proven'].includes(v.payment_evidence)) && votes[0].model!==votes[1].model && votes[0].payment_evidence===votes[1].payment_evidence;
}
