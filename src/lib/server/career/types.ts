export type CareerRequirementClass = 'KNOCKOUT' | 'MUST' | 'SHOULD' | 'CONTEXT';
export type CareerEvidenceState = 'PROVEN' | 'PARTIAL' | 'NOT_PROVEN' | 'UNCLEAR';
export type CareerDecision = 'SKIP' | 'CLARIFY' | 'APPLY' | 'APPLY_WITH_GAPS';

export interface CareerRequirement {
	text: string;
	class: CareerRequirementClass;
	evidence_state: CareerEvidenceState;
	evidence_fact_ids: string[];
	note?: string;
}

export interface CareerPositionInput {
	identity_key: string;
	source_kind: string;
	source_ref: string;
	external_id?: string | null;
	employer: string;
	title: string;
	source_url?: string | null;
	checked_at: string;
}

export interface CareerCaseRow {
	case_id: string;
	identity_key: string;
	source_kind: string;
	source_ref: string;
	external_id: string | null;
	employer: string;
	title: string;
	source_url: string | null;
	checked_at: string;
	created_at: string;
}

export interface CareerFitVerdict {
	decision: CareerDecision;
	blockers: string[];
	reason: string;
}

export interface CareerAssessmentRow {
	assessment_id: string;
	case_id: string;
	requirements_json: string;
	decision: CareerDecision;
	blockers_json: string;
	reason: string;
	context_fact_ids_json: string;
	policy_version: string;
	recorded_by: string;
	recorded_at: string;
	fit_score: number | null;
}

export interface CareerAssessmentView extends Omit<CareerAssessmentRow, 'requirements_json' | 'blockers_json' | 'context_fact_ids_json'> {
	requirements: CareerRequirement[];
	blockers: string[];
	context_fact_ids: string[];
}

export type CareerLeadAvailability = 'OPEN' | 'CLOSED' | 'UNKNOWN';
export type CareerLeadAction = 'acknowledge' | 'snooze' | 'start_application' | 'confirm_submitted' | 'decline';
export type CareerLeadEventType =
	| 'HIGH_FIT_LEAD_CREATED'
	| 'ALERT_ACKNOWLEDGED'
	| 'ALERT_SNOOZED'
	| 'APPLICATION_STARTED'
	| 'APPLICATION_SUBMITTED'
	| 'LEAD_DECLINED';

export interface CareerLeadEventRow {
	event_id: string;
	schema_version: 'folio/career-lead-event/v1';
	event_type: CareerLeadEventType;
	lead_id: string;
	case_id: string;
	assessment_id: string;
	expected_revision: number;
	previous_event_id: string | null;
	availability_event_id: string;
	source_snapshot_ref: string;
	source_snapshot_hash: string;
	policy_version: string;
	occurred_at: string;
	recorded_at: string;
	actor_kind: string;
	actor_id: string;
	idempotency_key: string;
	run_id_or_correlation_id: string | null;
	payload_json: string;
}

export interface CareerLeadView {
	lead_id: string;
	case_id: string;
	assessment_id: string;
	revision: number;
	latest_event_id: string;
	availability_event_id: string;
	source_snapshot_hash: string;
	source_snapshot_ref: string;
	employer: string;
	title: string;
	source_url: string | null;
	location: string | null;
	workload: string | null;
	contract_type: string | null;
	fit_score: number;
	decision: CareerDecision;
	policy_version: string;
	high_fit_recorded_at: string;
	availability: CareerLeadAvailability;
	availability_checked_at: string;
	status: 'unacknowledged' | 'acknowledged' | 'snoozed' | 'started' | 'submitted' | 'declined' | 'closed';
	snooze_until: string | null;
	clarify_question: string | null;
	next_step: string;
	strongest_facts: Array<{ fact_id: string; subject: string; predicate: string; value: string }>;
	requirements: CareerRequirement[];
	submitted_at: string | null;
	time_to_apply_ms: number | null;
}
