export type MemorySensitivity = 'public' | 'private' | 'sensitive';
export type MemoryLifecycleStatus = 'candidate' | 'confirmed' | 'rejected' | 'superseded' | 'tombstoned';
export type MemoryFactStatus =
	| 'candidate'
	| 'confirmed'
	| 'rejected'
	| 'superseded'
	| 'tombstoned';

export interface MemoryFactRow {
	fact_id: string;
	proposal_id: string | null;
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
	entity_ref: string | null;
	entity_type: string | null;
	entity_label: string | null;
	subject_entity_id: string | null;
	object_entity_id: string | null;
	valid_from: string | null;
	valid_to: string | null;
	supersedes_fact_id: string | null;
	recorded_at: string;
	confirmed_at: string | null;
	confirmed_by: string | null;
}

export interface ProposeMemoryFactInput {
	proposal_id?: string | null;
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
	entity_ref?: string | null;
	entity_type?: string | null;
	entity_label?: string | null;
	subject_entity_id?: string | null;
	object_entity_id?: string | null;
	valid_from?: string | null;
	supersedes_fact_id?: string | null;
	actor_kind?: 'system' | 'import' | 'human';
	actor_id: string;
}

export type MemoryProposalStatus = 'candidate' | 'confirmed' | 'rejected';
export type MemoryEntityStatus = 'candidate' | 'confirmed' | 'rejected' | 'merged' | 'tombstoned';
export type MemoryEpisodeStatus = 'candidate' | 'confirmed' | 'rejected' | 'tombstoned';

export interface MemoryProposalRow {
	proposal_id: string;
	domain: string;
	source_kind: string;
	source_ref: string;
	status: MemoryProposalStatus;
	extractor_id: string;
	selection_method: string;
	created_at: string;
	reviewed_at: string | null;
	reviewed_by: string | null;
}

export interface MemoryEntityRow {
	entity_id: string;
	proposal_id: string | null;
	domain: string;
	entity_type: string;
	canonical_key: string;
	canonical_label: string;
	sensitivity: MemorySensitivity;
	status: MemoryEntityStatus;
	source_kind: string;
	source_ref: string;
	source_excerpt: string | null;
	derived_from_external: 0 | 1;
	valid_from: string | null;
	valid_to: string | null;
	merged_into_entity_id: string | null;
	recorded_at: string;
	confirmed_at: string | null;
	confirmed_by: string | null;
}

export interface MemoryRelationRow {
	relation_id: string;
	proposal_id: string | null;
	domain: string;
	relation_type: string;
	subject_entity_id: string;
	object_entity_id: string;
	sensitivity: MemorySensitivity;
	status: MemoryFactStatus;
	source_kind: string;
	source_ref: string;
	source_excerpt: string | null;
	derived_from_external: 0 | 1;
	valid_from: string | null;
	valid_to: string | null;
	supersedes_relation_id: string | null;
	recorded_at: string;
	confirmed_at: string | null;
	confirmed_by: string | null;
}

export interface MemoryEpisodeRow {
	episode_id: string;
	proposal_id: string | null;
	domain: string;
	episode_type: string;
	title: string;
	summary: string;
	occurred_at: string;
	sensitivity: MemorySensitivity;
	status: MemoryEpisodeStatus;
	source_kind: string;
	source_ref: string;
	source_excerpt: string | null;
	derived_from_external: 0 | 1;
	recorded_at: string;
	confirmed_at: string | null;
	confirmed_by: string | null;
}

export interface MemoryProposalBundle {
	proposal: MemoryProposalRow;
	entities: MemoryEntityRow[];
	facts: MemoryFactRow[];
	relations: MemoryRelationRow[];
	episodes: MemoryEpisodeRow[];
}

export interface MemoryDossier {
	root_entity: MemoryEntityRow;
	entities: MemoryEntityRow[];
	facts: MemoryFactRow[];
	relations: MemoryRelationRow[];
	episodes: MemoryEpisodeRow[];
	source_refs: string[];
}

export interface ProposeMemoryBundleInput {
	domain: string;
	source_kind: string;
	source_ref: string;
	extractor_id: string;
	selection_method?: string;
	actor_kind?: 'system' | 'import' | 'human';
	actor_id: string;
	entities?: Array<{
		local_ref: string;
		entity_type: string;
		canonical_key: string;
		canonical_label: string;
		sensitivity: MemorySensitivity;
		source_excerpt?: string | null;
		derived_from_external?: boolean;
		valid_from?: string | null;
	}>;
	facts?: Array<{
		data_class: string;
		sensitivity: MemorySensitivity;
		subject: string;
		predicate: string;
		value: string;
		subject_ref?: string | null;
		object_ref?: string | null;
		source_excerpt?: string | null;
		derived_from_external?: boolean;
		valid_from?: string | null;
	}>;
	relations?: Array<{
		relation_type: string;
		subject_ref: string;
		object_ref: string;
		sensitivity: MemorySensitivity;
		source_excerpt?: string | null;
		derived_from_external?: boolean;
		valid_from?: string | null;
	}>;
	episodes?: Array<{
		episode_type: string;
		title: string;
		summary: string;
		occurred_at: string;
		sensitivity: MemorySensitivity;
		entity_refs?: Array<{ ref: string; role: string }>;
		source_excerpt?: string | null;
		derived_from_external?: boolean;
	}>;
}

export interface MemorySearchPolicy {
	domain: string;
	max_sensitivity: MemorySensitivity;
	limit?: number;
}

export interface MemoryFactFilter {
	domain?: string;
	status?: MemoryFactStatus;
	limit?: number;
}

export interface MemoryOverview {
	total: number;
	candidates: number;
	confirmed: number;
	domains: Array<{ domain: string; facts: number; candidates: number }>;
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
