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
}

export interface CareerAssessmentView extends Omit<CareerAssessmentRow, 'requirements_json' | 'blockers_json' | 'context_fact_ids_json'> {
	requirements: CareerRequirement[];
	blockers: string[];
	context_fact_ids: string[];
}
