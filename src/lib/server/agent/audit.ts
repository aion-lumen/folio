import { appendFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import { getTriageLogPath } from '../env.js';
import type { TriageAssessment } from './types.js';

export interface TriageAuditEntry {
	ts: string;
	document_id: string;
	filename: string;
	model: string;
	verdict: string;
	confidence: number;
	chapter_slug: string | null;
	auto_committed: boolean;
	committed_objective_id?: string | null;
	reasoning: string;
	guardrail_violation?: string | null;
}

export async function appendTriageAudit(entry: Omit<TriageAuditEntry, 'ts'>): Promise<void> {
	const path = getTriageLogPath();
	await mkdir(dirname(path), { recursive: true });
	const line = JSON.stringify({ ...entry, ts: new Date().toISOString() }) + '\n';
	await appendFile(path, line, 'utf-8');
}

export async function auditAssessment(
	filename: string,
	documentId: string,
	model: string,
	assessment: TriageAssessment
): Promise<void> {
	await appendTriageAudit({
		document_id: documentId,
		filename,
		model,
		verdict: assessment.verdict,
		confidence: assessment.confidence,
		chapter_slug: assessment.chapter_slug,
		auto_committed: assessment.auto_committed ?? false,
		committed_objective_id: assessment.committed_objective_id ?? null,
		reasoning: assessment.reasoning,
		guardrail_violation: assessment.guardrail_violation ?? null
	});
}
