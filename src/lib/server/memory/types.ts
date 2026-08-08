export type MemorySensitivity = 'public' | 'private' | 'sensitive';
export type MemoryFactStatus =
	| 'candidate'
	| 'confirmed'
	| 'rejected'
	| 'superseded'
	| 'tombstoned';

export interface MemoryFactRow {
	fact_id: string;
	domain: string;
	data_class: string;
	sensitivity: MemorySensitivity;
	subject: string;
	predicate: string;
	value_text: string;
	status: MemoryFactStatus;
	source_kind: string;
	source_ref: string;
	source_excerpt: string | null;
	derived_from_external: 0 | 1;
	valid_from: string | null;
	valid_to: string | null;
	supersedes_fact_id: string | null;
	recorded_at: string;
	confirmed_at: string | null;
	confirmed_by: string | null;
}

export interface ProposeMemoryFactInput {
	domain: string;
	data_class: string;
	sensitivity: MemorySensitivity;
	subject: string;
	predicate: string;
	value: string;
	source_kind: string;
	source_ref: string;
	source_excerpt?: string | null;
	derived_from_external?: boolean;
	valid_from?: string | null;
	supersedes_fact_id?: string | null;
	actor_kind?: 'system' | 'import' | 'human';
	actor_id: string;
}

export interface MemorySearchPolicy {
	domain: string;
	max_sensitivity: MemorySensitivity;
	limit?: number;
}

export interface MemoryEventRow {
	event_id: string;
	fact_id: string;
	event_type: 'proposed' | 'confirmed' | 'rejected' | 'superseded' | 'tombstoned';
	actor_kind: 'human' | 'system' | 'import';
	actor_id: string;
	detail_json: string;
	recorded_at: string;
}
