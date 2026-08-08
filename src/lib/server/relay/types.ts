export type RelayLocality = 'local' | 'cloud';
export type RelayAdapter = 'cowork-filesystem' | 'hermes-local';
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
	body: string;
	created_at: string;
}
