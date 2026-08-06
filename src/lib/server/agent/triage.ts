import { readFile } from 'fs/promises';
import { join } from 'path';
import { getFolioAgentModel } from '../env.js';
import { parseInboxFile } from '../inbox/schema.js';
import type { InboxDirs } from '../inbox/scanner.js';
import type { InboxScanItem, InboxScanResult } from '../inbox/types.js';
import { auditAssessment } from './audit.js';
import { getCachedAssessment, hashContent, setCachedAssessment } from './cache.js';
import { buildCampaignContext } from './context.js';
import { commitTriageObjective } from './commit-triage.js';
import { isAutoEligible, normalizeLlmAssessment, runGuardrails } from './guardrails.js';
import { isSourceAutoTrusted } from './trusted-sources.js';
import { callLmStudioJson } from './llm.js';
import { resolveTriageModel } from './preflight.js';
import { buildTriagePrompt, DEFAULT_PROMPT_VARIANT, type PromptVariant } from './prompt.js';
import type { TriageAssessment, TriageRunResult } from './types.js';

async function resolveModelForRun(requested?: string): Promise<string | null> {
	if (requested) return requested;
	if (process.env.FOLIO_AGENT_MOCK_RESPONSE !== undefined) return getFolioAgentModel();
	return (await resolveTriageModel()).model;
}

export async function assessDocument(
	filename: string,
	raw: string,
	options?: {
		model?: string;
		promptVariant?: PromptVariant;
		useCache?: boolean;
		mockResponse?: string | null;
	}
): Promise<TriageAssessment> {
	const model = (await resolveModelForRun(options?.model)) ?? getFolioAgentModel();
	const contentHash = hashContent(raw);
	const useCache = options?.useCache !== false && options?.mockResponse === undefined;

	if (useCache) {
		const cached = await getCachedAssessment(filename, contentHash);
		if (cached) return cached;
	}

	const doc = parseInboxFile(filename, raw);

	let parsed: Record<string, unknown> | null = null;
	if (options?.mockResponse !== undefined) {
		if (options.mockResponse) {
			try {
				parsed = JSON.parse(options.mockResponse) as Record<string, unknown>;
			} catch {
				parsed = null;
			}
		}
	} else {
		const ctx = await buildCampaignContext();
		const prompt = buildTriagePrompt(doc, ctx, options?.promptVariant ?? DEFAULT_PROMPT_VARIANT);
		parsed = await callLmStudioJson<Record<string, unknown>>(prompt, model);
	}

	if (!parsed) {
		const fallback: TriageAssessment = {
			verdict: 'unclear',
			confidence: 0,
			chapter_slug: null,
			objective: null,
			reasoning: 'LLM unavailable or invalid JSON response',
			model
		};
		if (useCache) await setCachedAssessment(filename, contentHash, fallback);
		return fallback;
	}

	const assessment = normalizeLlmAssessment(parsed, model) ?? {
		verdict: 'unclear' as const,
		confidence: 0,
		chapter_slug: null,
		objective: null,
		reasoning: 'LLM response failed normalization',
		model
	};

	assessment.guardrail_violation = await runGuardrails(assessment);
	if (useCache) await setCachedAssessment(filename, contentHash, assessment);
	return assessment;
}

export async function enrichScanWithAssessments(
	scan: InboxScanResult,
	dirs: InboxDirs,
	options?: { model?: string; promptVariant?: PromptVariant }
): Promise<InboxScanResult> {
	const items: InboxScanItem[] = [];
	for (const item of scan.items) {
		if (item.status !== 'valid' || !item.filename) {
			items.push(item);
			continue;
		}
		const raw = await readFile(join(dirs.inbox, item.filename), 'utf-8');
		const assessment = await assessDocument(item.filename, raw, options);
		items.push({ ...item, triage: assessment });
	}
	return { ...scan, items };
}

export async function runInboxTriage(
	scan: InboxScanResult,
	dirs: InboxDirs,
	options?: {
		model?: string;
		promptVariant?: PromptVariant;
		autoCommit?: boolean;
		ledgerPath?: string;
		mockResponse?: string | null;
	}
): Promise<{ scan: InboxScanResult; result: TriageRunResult }> {
	const model = (await resolveModelForRun(options?.model)) ?? getFolioAgentModel();
	const autoCommit = options?.autoCommit !== false;
	const validItems = scan.items.filter((i) => i.status === 'valid');

	const auto_committed: TriageRunResult['auto_committed'] = [];
	const awaiting_review: string[] = [];
	const skipped: TriageRunResult['skipped'] = [];
	const enrichedItems: InboxScanItem[] = [...scan.items.filter((i) => i.status !== 'valid')];

	let assessed = 0;
	for (const item of validItems) {
		const raw = await readFile(join(dirs.inbox, item.filename), 'utf-8');
		let assessment = await assessDocument(item.filename, raw, {
			model,
			promptVariant: options?.promptVariant,
			mockResponse: options?.mockResponse
		});
		assessed++;

		// Trust gate: only trusted, non-derived sources may auto-commit. Untrusted source OR
		// derived_from_external:true → always manual review, regardless of confidence.
		if (
			autoCommit &&
			isAutoEligible(assessment) &&
			isSourceAutoTrusted(item.source, item.derived_from_external)
		) {
			const commit = await commitTriageObjective(dirs, item.filename, assessment, options?.ledgerPath);
			if (commit.ok) {
				assessment = {
					...assessment,
					auto_committed: true,
					committed_objective_id: commit.objective_id ?? null
				};
				await auditAssessment(item.filename, item.id ?? item.filename, model, assessment, {
				source: item.source,
				derived_from_external: item.derived_from_external
			});
				auto_committed.push(commit);
				continue;
			}
			skipped.push(commit);
			assessment = {
				...assessment,
				guardrail_violation: commit.message
			};
		}

		await auditAssessment(item.filename, item.id ?? item.filename, model, assessment);

		if (assessment.verdict === 'unclear' || assessment.verdict === 'task') {
			awaiting_review.push(item.filename);
		}

		enrichedItems.push({ ...item, triage: assessment });
	}

	const valid = enrichedItems.filter((i) => i.status === 'valid').length;
	return {
		scan: {
			...scan,
			pending: enrichedItems.filter((i) => i.status !== 'invalid').length,
			valid,
			items: enrichedItems,
			triage: {
				auto_committed: auto_committed.length,
				awaiting_review: awaiting_review.length
			}
		},
		result: { assessed, auto_committed, awaiting_review, skipped }
	};
}

/** Build a one-document scan for request-scoped triage without accepting arbitrary paths. */
export function selectInboxItemForTriage(
	scan: InboxScanResult,
	filename: string
): InboxScanResult | null {
	const item = scan.items.find((candidate) => candidate.filename === filename);
	if (!item || item.status !== 'valid') return null;

	return {
		...scan,
		pending: 1,
		valid: 1,
		invalid: 0,
		duplicate: 0,
		items: [item],
		byType: item.type ? { [item.type]: 1 } : {}
	};
}

/** Attach cached assessments only (no LLM calls). */
export async function attachCachedAssessments(
	scan: InboxScanResult,
	dirs: InboxDirs
): Promise<InboxScanResult> {
	const items: InboxScanItem[] = [];
	for (const item of scan.items) {
		if (item.status !== 'valid') {
			items.push(item);
			continue;
		}
		const raw = await readFile(join(dirs.inbox, item.filename), 'utf-8');
		const cached = await getCachedAssessment(item.filename, hashContent(raw));
		items.push({ ...item, triage: cached ?? undefined });
	}
	return {
		...scan,
		items,
		triage: {
			auto_committed: items.filter((item) => item.triage?.auto_committed).length,
			awaiting_review: items.filter(
				(item) =>
					item.status === 'valid' &&
					(!item.triage || item.triage.verdict === 'unclear' || item.triage.verdict === 'task')
			).length
		}
	};
}
