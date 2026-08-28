import { createHash, randomUUID } from 'node:crypto';
import { getFolioDb } from '../folio-db/init.js';
import { CAREER_FIT_POLICY_VERSION, evaluateCareerFit, validateCareerRequirements } from './fit.js';
import type {
	CareerAssessmentRow,
	CareerAssessmentView,
	CareerCaseRow,
	CareerPositionInput,
	CareerRequirement
} from './types.js';

const IDENTITY = /^[a-z0-9][a-z0-9:_-]{2,255}$/;

export class CareerStoreError extends Error {}

function required(value: string, label: string): string {
	const clean = value.trim();
	if (!clean) throw new CareerStoreError(`${label} must not be empty`);
	return clean;
}

function optional(value?: string | null): string | null {
	return value?.trim() || null;
}

export function careerIdentityKey(sourceKind: string, externalId?: string | null, sourceUrl?: string | null): string {
	const source = required(sourceKind, 'source_kind').toLocaleLowerCase('en-US').replace(/[^a-z0-9]+/g, '-');
	const stable = optional(externalId) ?? optional(sourceUrl);
	if (!stable) throw new CareerStoreError('external_id or source_url is required');
	return `${source}:${createHash('sha256').update(stable).digest('hex').slice(0, 24)}`;
}

export function ensureCareerCase(input: CareerPositionInput): CareerCaseRow {
	if (!IDENTITY.test(input.identity_key)) throw new CareerStoreError('invalid identity_key');
	if (!Number.isFinite(Date.parse(input.checked_at))) throw new CareerStoreError('checked_at must be ISO-8601');
	const db = getFolioDb();
	const existing = db.prepare('SELECT * FROM career_cases WHERE identity_key = ?').get(input.identity_key) as CareerCaseRow | undefined;
	if (existing) return existing;
	const row: CareerCaseRow = {
		case_id: randomUUID(),
		identity_key: input.identity_key,
		source_kind: required(input.source_kind, 'source_kind'),
		source_ref: required(input.source_ref, 'source_ref'),
		external_id: optional(input.external_id),
		employer: required(input.employer, 'employer'),
		title: required(input.title, 'title'),
		source_url: optional(input.source_url),
		checked_at: input.checked_at,
		created_at: new Date().toISOString()
	};
	db.prepare(
		`INSERT INTO career_cases
		 (case_id, identity_key, source_kind, source_ref, external_id, employer, title, source_url, checked_at, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		row.case_id,
		row.identity_key,
		row.source_kind,
		row.source_ref,
		row.external_id,
		row.employer,
		row.title,
		row.source_url,
		row.checked_at,
		row.created_at
	);
	return row;
}

function confirmedFactIds(requirements: CareerRequirement[]): string[] {
	const ids = [...new Set(requirements.flatMap((item) => item.evidence_fact_ids))];
	if (!ids.length) return [];
	const placeholders = ids.map(() => '?').join(',');
	const rows = getFolioDb()
		.prepare(`SELECT fact_id FROM memory_facts WHERE fact_id IN (${placeholders}) AND domain = 'career' AND status = 'confirmed'`)
		.all(...ids) as Array<{ fact_id: string }>;
	const confirmed = new Set(rows.map((row) => row.fact_id));
	const invalid = ids.filter((id) => !confirmed.has(id));
	if (invalid.length) throw new CareerStoreError('assessment references non-confirmed career facts');
	return ids;
}

export function recordCareerAssessment(
	caseId: string,
	requirementInput: CareerRequirement[],
	recordedBy: string
): CareerAssessmentView {
	const db = getFolioDb();
	const careerCase = db.prepare('SELECT case_id FROM career_cases WHERE case_id = ?').get(caseId);
	if (!careerCase) throw new CareerStoreError('unknown career case');
	const requirements = validateCareerRequirements(requirementInput);
	const factIds = confirmedFactIds(requirements);
	const verdict = evaluateCareerFit(requirements);
	const row: CareerAssessmentRow = {
		assessment_id: randomUUID(),
		case_id: caseId,
		requirements_json: JSON.stringify(requirements),
		decision: verdict.decision,
		blockers_json: JSON.stringify(verdict.blockers),
		reason: verdict.reason,
		context_fact_ids_json: JSON.stringify(factIds),
		policy_version: CAREER_FIT_POLICY_VERSION,
		recorded_by: required(recordedBy, 'recorded_by'),
		recorded_at: new Date().toISOString()
	};
	db.prepare(
		`INSERT INTO career_assessments
		 (assessment_id, case_id, requirements_json, decision, blockers_json, reason,
		  context_fact_ids_json, policy_version, recorded_by, recorded_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		row.assessment_id,
		row.case_id,
		row.requirements_json,
		row.decision,
		row.blockers_json,
		row.reason,
		row.context_fact_ids_json,
		row.policy_version,
		row.recorded_by,
		row.recorded_at
	);
	return assessmentView(row);
}

function assessmentView(row: CareerAssessmentRow): CareerAssessmentView {
	return {
		assessment_id: row.assessment_id,
		case_id: row.case_id,
		decision: row.decision,
		reason: row.reason,
		policy_version: row.policy_version,
		recorded_by: row.recorded_by,
		recorded_at: row.recorded_at,
		requirements: JSON.parse(row.requirements_json) as CareerRequirement[],
		blockers: JSON.parse(row.blockers_json) as string[],
		context_fact_ids: JSON.parse(row.context_fact_ids_json) as string[]
	};
}

export function latestCareerAssessment(caseId: string): CareerAssessmentView | null {
	const row = getFolioDb()
		.prepare('SELECT * FROM career_assessments WHERE case_id = ? ORDER BY recorded_at DESC, rowid DESC LIMIT 1')
		.get(caseId) as CareerAssessmentRow | undefined;
	return row ? assessmentView(row) : null;
}
