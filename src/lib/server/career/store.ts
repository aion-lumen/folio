import { createHash, randomUUID } from 'node:crypto';
import { getFolioDb } from '../folio-db/init.js';
import { CAREER_FIT_POLICY_VERSION, evaluateCareerFit, validateCareerRequirements } from './fit.js';
import type {
	CareerAssessmentRow,
	CareerAssessmentView,
	CareerCaseRow,
	CareerLeadAction,
	CareerLeadAvailability,
	CareerLeadEventRow,
	CareerLeadView,
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
	recordedBy: string,
	fitScore: number | null = null
): CareerAssessmentView {
	const db = getFolioDb();
	const careerCase = db.prepare('SELECT case_id FROM career_cases WHERE case_id = ?').get(caseId);
	if (!careerCase) throw new CareerStoreError('unknown career case');
	const requirements = validateCareerRequirements(requirementInput);
	const factIds = confirmedFactIds(requirements);
	const verdict = evaluateCareerFit(requirements);
	if (fitScore !== null && (!Number.isSafeInteger(fitScore) || fitScore < 0 || fitScore > 10)) {
		throw new CareerStoreError('fit_score must be an integer from 0 to 10');
	}
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
		recorded_at: new Date().toISOString(),
		fit_score: fitScore
	};
	db.prepare(
		`INSERT INTO career_assessments
		 (assessment_id, case_id, requirements_json, decision, blockers_json, reason,
			  context_fact_ids_json, policy_version, recorded_by, recorded_at, fit_score)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
		row.recorded_at,
		row.fit_score
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
		fit_score: row.fit_score,
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

const LEAD_SCHEMA = 'folio/career-lead-event/v1' as const;
const SHA256 = /^[a-f0-9]{64}$/;
const STABLE_ID = /^[a-z0-9][a-z0-9:_-]{2,255}$/;

interface CreateCareerLeadInput {
	case_id: string;
	assessment_id: string;
	fit_score: number;
	availability: CareerLeadAvailability;
	availability_event_id: string;
	availability_checked_at: string;
	source_snapshot_ref: string;
	source_snapshot_hash: string;
	strongest_fact_ids: string[];
	clarify_question?: string | null;
	location?: string | null;
	workload?: string | null;
	contract_type?: string | null;
	next_step: string;
	idempotency_key: string;
	run_id_or_correlation_id?: string | null;
	occurred_at: string;
}

export interface CareerLeadActionInput {
	action: CareerLeadAction;
	lead_id: string;
	case_id: string;
	assessment_id: string;
	expected_revision: number;
	availability_event_id: string;
	source_snapshot_hash: string;
	idempotency_key: string;
	snooze_until?: string;
	reason_code?: string;
	note?: string;
	submitted_at?: string;
	application_channel?: string;
	artifact_refs?: string[];
}

function validIso(value: string): boolean {
	return Boolean(value) && Number.isFinite(Date.parse(value));
}

function cleanLimited(value: string | null | undefined, max: number): string | null {
	const cleaned = value?.trim() || null;
	if (cleaned && cleaned.length > max) throw new CareerStoreError('career lead text is too long');
	return cleaned;
}

function existingIdempotentEvent(key: string): CareerLeadEventRow | null {
	return (getFolioDb().prepare('SELECT * FROM career_lead_events WHERE idempotency_key = ?').get(key) as CareerLeadEventRow | undefined) ?? null;
}

function insertLeadEvent(row: CareerLeadEventRow): CareerLeadEventRow {
	getFolioDb().prepare(
		`INSERT INTO career_lead_events
		 (event_id, schema_version, event_type, lead_id, case_id, assessment_id, expected_revision,
		  previous_event_id, availability_event_id, source_snapshot_ref, source_snapshot_hash,
		  policy_version, occurred_at, recorded_at, actor_kind, actor_id, idempotency_key,
		  run_id_or_correlation_id, payload_json)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	).run(
		row.event_id, row.schema_version, row.event_type, row.lead_id, row.case_id, row.assessment_id,
		row.expected_revision, row.previous_event_id, row.availability_event_id, row.source_snapshot_ref,
		row.source_snapshot_hash, row.policy_version, row.occurred_at, row.recorded_at, row.actor_kind,
		row.actor_id, row.idempotency_key, row.run_id_or_correlation_id, row.payload_json
	);
	return row;
}

function confirmedCareerFacts(ids: string[]): CareerLeadView['strongest_facts'] {
	const unique = [...new Set(ids)];
	if (unique.length < 2 || unique.length > 3) throw new CareerStoreError('two or three strongest facts are required');
	const placeholders = unique.map(() => '?').join(',');
	const rows = getFolioDb().prepare(
		`SELECT fact_id, subject, predicate, value_text AS value
		 FROM memory_facts WHERE fact_id IN (${placeholders}) AND domain = 'career' AND status = 'confirmed'`
	).all(...unique) as CareerLeadView['strongest_facts'];
	if (rows.length !== unique.length) throw new CareerStoreError('career lead references non-confirmed facts');
	return unique.map((id) => rows.find((row) => row.fact_id === id)!);
}

export function createCareerLead(input: CreateCareerLeadInput, actorId = 'career-intake'): CareerLeadEventRow {
	const prior = existingIdempotentEvent(input.idempotency_key);
	if (prior) {
		if (prior.event_type === 'HIGH_FIT_LEAD_CREATED' && prior.case_id === input.case_id && prior.assessment_id === input.assessment_id) return prior;
		throw new CareerStoreError('idempotency key already belongs to another career event');
	}
	if (
		!STABLE_ID.test(input.case_id) || !STABLE_ID.test(input.assessment_id) ||
		!STABLE_ID.test(input.availability_event_id) || !SHA256.test(input.source_snapshot_hash) ||
		!validIso(input.availability_checked_at) || !validIso(input.occurred_at) ||
		!Number.isSafeInteger(input.fit_score) || input.fit_score < 9 || input.fit_score > 10 ||
		input.availability !== 'OPEN'
	) throw new CareerStoreError('invalid high-fit lead');
	const db = getFolioDb();
	const careerCase = db.prepare('SELECT case_id FROM career_cases WHERE case_id = ?').get(input.case_id);
	const assessment = latestCareerAssessment(input.case_id);
	if (!careerCase || !assessment || assessment.assessment_id !== input.assessment_id) {
		throw new CareerStoreError('lead must bind the latest career assessment');
	}
	if (!['APPLY', 'APPLY_WITH_GAPS', 'CLARIFY'].includes(assessment.decision)) {
		throw new CareerStoreError('assessment is not eligible for a career lead');
	}
	if (assessment.fit_score !== input.fit_score) {
		throw new CareerStoreError('fit score does not match the assessment');
	}
	const facts = confirmedCareerFacts(input.strongest_fact_ids);
	const clarify = cleanLimited(input.clarify_question, 500);
	if ((assessment.decision === 'CLARIFY') !== Boolean(clarify)) {
		throw new CareerStoreError('CLARIFY leads require exactly one question');
	}
	const recordedAt = new Date().toISOString();
	return insertLeadEvent({
		event_id: randomUUID(), schema_version: LEAD_SCHEMA, event_type: 'HIGH_FIT_LEAD_CREATED',
		lead_id: randomUUID(), case_id: input.case_id, assessment_id: input.assessment_id, expected_revision: 1,
		previous_event_id: null, availability_event_id: input.availability_event_id,
		source_snapshot_ref: required(input.source_snapshot_ref, 'source_snapshot_ref'),
		source_snapshot_hash: input.source_snapshot_hash, policy_version: assessment.policy_version,
		occurred_at: input.occurred_at, recorded_at: recordedAt, actor_kind: 'import', actor_id: required(actorId, 'actor_id'),
		idempotency_key: required(input.idempotency_key, 'idempotency_key'),
		run_id_or_correlation_id: cleanLimited(input.run_id_or_correlation_id, 160),
		payload_json: JSON.stringify({
			fit_score: input.fit_score, availability: input.availability,
			availability_checked_at: input.availability_checked_at, strongest_facts: facts,
			clarify_question: clarify, location: cleanLimited(input.location, 160),
			workload: cleanLimited(input.workload, 80), contract_type: cleanLimited(input.contract_type, 100),
			next_step: required(input.next_step, 'next_step')
		})
	});
}

function allLeadEvents(): CareerLeadEventRow[] {
	// SQLite row order is the append order; occurred_at may legitimately point to
	// an earlier owner-confirmed business time and must not reorder the ledger.
	return getFolioDb().prepare('SELECT * FROM career_lead_events ORDER BY rowid').all() as CareerLeadEventRow[];
}

export function listCareerLeads(now = new Date()): CareerLeadView[] {
	const db = getFolioDb();
	const projected = new Map<string, CareerLeadView>();
	for (const event of allLeadEvents()) {
		const payload = JSON.parse(event.payload_json) as Record<string, unknown>;
		if (event.event_type === 'HIGH_FIT_LEAD_CREATED') {
			const careerCase = db.prepare('SELECT * FROM career_cases WHERE case_id = ?').get(event.case_id) as CareerCaseRow;
			const assessmentRow = db.prepare('SELECT * FROM career_assessments WHERE assessment_id = ?').get(event.assessment_id) as CareerAssessmentRow;
			const assessment = assessmentView(assessmentRow);
			const availability = payload.availability as CareerLeadAvailability;
			projected.set(event.lead_id, {
				lead_id: event.lead_id, case_id: event.case_id, assessment_id: event.assessment_id,
				revision: 1, latest_event_id: event.event_id, availability_event_id: event.availability_event_id,
				source_snapshot_hash: event.source_snapshot_hash, source_snapshot_ref: event.source_snapshot_ref,
				employer: careerCase.employer, title: careerCase.title, source_url: careerCase.source_url,
				location: payload.location as string | null, workload: payload.workload as string | null,
				contract_type: payload.contract_type as string | null, fit_score: payload.fit_score as number,
				decision: assessment.decision, policy_version: event.policy_version,
				high_fit_recorded_at: event.occurred_at, availability,
				availability_checked_at: payload.availability_checked_at as string,
				status: availability === 'CLOSED' ? 'closed' : 'unacknowledged', snooze_until: null,
				clarify_question: payload.clarify_question as string | null, next_step: payload.next_step as string,
				strongest_facts: payload.strongest_facts as CareerLeadView['strongest_facts'],
				requirements: assessment.requirements, submitted_at: null, time_to_apply_ms: null
			});
			continue;
		}
		const lead = projected.get(event.lead_id);
		if (!lead) continue;
		lead.revision += 1;
		lead.latest_event_id = event.event_id;
		if (event.event_type === 'ALERT_ACKNOWLEDGED') lead.status = 'acknowledged';
		else if (event.event_type === 'ALERT_SNOOZED') {
			lead.status = Date.parse(payload.snooze_until as string) > now.getTime() ? 'snoozed' : 'unacknowledged';
			lead.snooze_until = payload.snooze_until as string;
		} else if (event.event_type === 'APPLICATION_STARTED') lead.status = 'started';
		else if (event.event_type === 'APPLICATION_SUBMITTED') {
			lead.status = 'submitted';
			lead.submitted_at = payload.submitted_at as string;
			lead.time_to_apply_ms = Date.parse(lead.submitted_at) - Date.parse(lead.high_fit_recorded_at);
		} else if (event.event_type === 'LEAD_DECLINED') lead.status = 'declined';
	}
	const priority: Record<CareerLeadView['status'], number> = {
		unacknowledged: 0, started: 1, acknowledged: 2, snoozed: 3, closed: 4, submitted: 5, declined: 6
	};
	return [...projected.values()].sort((a, b) => priority[a.status] - priority[b.status] || b.high_fit_recorded_at.localeCompare(a.high_fit_recorded_at));
}

export function appendCareerLeadAction(input: CareerLeadActionInput, actorId = 'owner', now = new Date()): CareerLeadEventRow {
	const prior = existingIdempotentEvent(input.idempotency_key);
	const actionType: Record<CareerLeadAction, CareerLeadEventRow['event_type']> = {
		acknowledge: 'ALERT_ACKNOWLEDGED', snooze: 'ALERT_SNOOZED',
		start_application: 'APPLICATION_STARTED', confirm_submitted: 'APPLICATION_SUBMITTED', decline: 'LEAD_DECLINED'
	};
	if (!Object.hasOwn(actionType, input.action)) throw new CareerStoreError('invalid career lead action');
	if (prior) {
		if (prior.event_type === actionType[input.action] && prior.lead_id === input.lead_id && prior.case_id === input.case_id && prior.assessment_id === input.assessment_id) return prior;
		throw new CareerStoreError('idempotency key already belongs to another career event');
	}
	if (!STABLE_ID.test(input.lead_id) || !STABLE_ID.test(input.case_id) || !STABLE_ID.test(input.assessment_id) ||
		!STABLE_ID.test(input.availability_event_id) || !SHA256.test(input.source_snapshot_hash) ||
		!Number.isSafeInteger(input.expected_revision) || input.expected_revision < 1) {
		throw new CareerStoreError('invalid career lead action');
	}
	const lead = listCareerLeads(now).find((item) => item.lead_id === input.lead_id);
	const latestAssessment = latestCareerAssessment(input.case_id);
	if (!lead || !latestAssessment || lead.case_id !== input.case_id || lead.assessment_id !== input.assessment_id ||
		lead.assessment_id !== latestAssessment.assessment_id || lead.revision !== input.expected_revision ||
		lead.availability_event_id !== input.availability_event_id || lead.source_snapshot_hash !== input.source_snapshot_hash ||
		['submitted', 'declined', 'closed'].includes(lead.status)) {
		throw new CareerStoreError('career lead changed or is no longer actionable');
	}
	if (input.action === 'start_application' && lead.decision === 'CLARIFY') throw new CareerStoreError('CLARIFY lead cannot start an application');
	if (input.action === 'acknowledge' && !['unacknowledged', 'snoozed'].includes(lead.status)) {
		throw new CareerStoreError('lead cannot be acknowledged from its current state');
	}
	if (input.action === 'snooze' && !['unacknowledged', 'acknowledged', 'snoozed'].includes(lead.status)) {
		throw new CareerStoreError('lead cannot be snoozed from its current state');
	}
	if (input.action === 'start_application' && !['unacknowledged', 'acknowledged', 'snoozed'].includes(lead.status)) {
		throw new CareerStoreError('application cannot start from the current state');
	}
	if (input.action === 'confirm_submitted' && (lead.status !== 'started' || lead.availability !== 'OPEN')) {
		throw new CareerStoreError('application is not ready for submission confirmation');
	}
	const payload: Record<string, unknown> = {};
	let eventType: CareerLeadEventRow['event_type'];
	let occurredAt = now.toISOString();
	if (input.action === 'acknowledge') eventType = 'ALERT_ACKNOWLEDGED';
	else if (input.action === 'snooze') {
		if (!input.snooze_until || !validIso(input.snooze_until) || Date.parse(input.snooze_until) <= now.getTime()) throw new CareerStoreError('snooze_until must be in the future');
		eventType = 'ALERT_SNOOZED'; payload.snooze_until = input.snooze_until;
		payload.reason_code = cleanLimited(input.reason_code, 80);
	} else if (input.action === 'start_application') eventType = 'APPLICATION_STARTED';
	else if (input.action === 'confirm_submitted') {
		if (!input.submitted_at || !validIso(input.submitted_at) || Date.parse(input.submitted_at) > now.getTime() + 60_000) throw new CareerStoreError('invalid submitted_at');
		eventType = 'APPLICATION_SUBMITTED'; occurredAt = input.submitted_at;
		payload.submitted_at = input.submitted_at;
		payload.application_channel = required(input.application_channel ?? '', 'application_channel');
		payload.artifact_refs = [...new Set(input.artifact_refs ?? [])].map((item) => required(item, 'artifact_ref'));
	} else {
		eventType = 'LEAD_DECLINED'; payload.reason_code = required(input.reason_code ?? '', 'reason_code');
		payload.note = cleanLimited(input.note, 500);
	}
	return insertLeadEvent({
		event_id: randomUUID(), schema_version: LEAD_SCHEMA, event_type: eventType,
		lead_id: lead.lead_id, case_id: lead.case_id, assessment_id: lead.assessment_id,
		expected_revision: input.expected_revision, previous_event_id: lead.latest_event_id,
		availability_event_id: lead.availability_event_id, source_snapshot_ref: lead.source_snapshot_ref,
		source_snapshot_hash: lead.source_snapshot_hash, policy_version: lead.policy_version,
		occurred_at: occurredAt, recorded_at: now.toISOString(), actor_kind: 'human', actor_id: required(actorId, 'actor_id'),
		idempotency_key: required(input.idempotency_key, 'idempotency_key'), run_id_or_correlation_id: null,
		payload_json: JSON.stringify(payload)
	});
}
