import type { MemoryContextBundle } from '../memory/compiler.js';
import type { MemorySensitivity } from '../memory/types.js';

export type RelayLocality = 'local' | 'cloud';
export type RelayAdapter = 'filesystem' | 'cowork-filesystem' | 'hermes-local';
export type RelayCapability = 'analyze' | 'reply_draft' | 'objective_proposal' | 'needs_context';
export type RelayCaseStatus =
	| 'detected'
	| 'staged'
	| 'approved'
	| 'shared'
	| 'claimed'
	| 'needs_context'
	| 'answered'
	| 'reviewed'
	| 'applied'
	| 'closed'
	| 'rejected'
	| 'expired';

export interface SessionTarget {
	id: string;
	label: string;
	domain: string;
	adapter: RelayAdapter;
	locality: RelayLocality;
	capabilities: RelayCapability[];
	allowed_data_classes: string[];
	memory_max_sensitivity?: MemorySensitivity;
	retention_days: number;
}

export interface StageRelayCaseInput {
	domain: string;
	source_kind: string;
	source_ref: string;
	subject: string;
	body: string;
	capability: RelayCapability;
	data_classes: string[];
	memory_context?: MemoryContextBundle;
	target: SessionTarget;
}

export interface RelayCaseRow {
	case_id: string;
	domain: string;
	source_kind: string;
	source_ref: string;
	subject: string;
	capability: RelayCapability;
	target_id: string;
	target_locality: RelayLocality;
	data_classes_json: string;
	status: RelayCaseStatus;
	request_hash: string;
	request_body_path: string;
	response_hash: string | null;
	retention_until: string;
	created_at: string;
	updated_at: string;
}

export interface RelayCaseView extends RelayCaseRow {
	data_classes: string[];
	requires_egress_approval: boolean;
}

export interface RelayRequestPayload {
	schema: 'folio/session-relay-request/v1';
	case_id: string;
	domain: string;
	source_kind: string;
	source_ref: string;
	subject: string;
	capability: RelayCapability;
	data_classes: string[];
	memory_context?: MemoryContextBundle;
	follow_ups?: RelayFollowUp[];
	body: string;
	created_at: string;
}

export interface RelayFollowUp {
	question: string;
	answer: string;
	created_at: string;
}

export type RelayResponseKind = 'reply_draft' | 'needs_context' | 'objective_proposal';

export interface RelayReplyDraft {
	kind: 'reply_draft';
	subject?: string;
	body: string;
}

export interface RelayNeedsContext {
	kind: 'needs_context';
	question: string;
}

export interface RelayObjectiveProposal {
	kind: 'objective_proposal';
	title: string;
	threshold: string;
	chapter_slug?: string;
	deadline?: string;
}

export type RelayResponseResult = RelayReplyDraft | RelayNeedsContext | RelayObjectiveProposal;

export interface RelayResponsePayload {
	schema: 'folio/session-relay-response/v1';
	case_id: string;
	request_hash: string;
	target_id: string;
	result: RelayResponseResult;
	created_at: string;
}

export interface RelayMailDraftRow {
	draft_id: string;
	case_id: string;
	source_ref: string;
	subject: string;
	body: string;
	created_at: string;
	updated_at: string;
}
