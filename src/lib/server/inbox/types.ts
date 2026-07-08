import type { TriageAssessment } from '../agent/types.js';

export type FolioImportType = 'directive' | 'field-note' | 'objective-update' | 'note' | 'lead';

export type InboxItemStatus = 'valid' | 'invalid' | 'duplicate';

export interface FolioImportPatch {
	status?: string;
	progress_note?: string;
	deadline?: string;
}

export interface FolioImportFrontmatter {
	folio_import: string;
	type: FolioImportType;
	target: string;
	id: string;
	source: string;
	created: string;
	title?: string;
	tags?: string[];
	/** Marks content derived from external material (e.g. an incoming mail). Forces manual review. */
	derived_from_external?: boolean;
	patch?: FolioImportPatch;
	// Lead-type fields (type === 'lead'). rolle + quelle required for leads; rest optional.
	rolle?: string;
	quelle?: string;
	deadline?: string;
	satz?: string;
	ort?: string;
	link?: string;
	/** Cross-portal semantic dedup key (same role+location+rate → same key). */
	dedup_key?: string;
	/** Id of the first lead with this dedup_key, when a duplicate was detected upstream. */
	duplicate_of?: string;
}

export interface ParsedInboxDocument {
	filename: string;
	frontmatter: FolioImportFrontmatter;
	body: string;
}

export interface InboxScanItem {
	filename: string;
	id: string | null;
	type: FolioImportType | null;
	target: string | null;
	title: string | null;
	source?: string;
	derived_from_external?: boolean;
	// Lead fields surfaced to Heute-hub card, TTL scan and inbox dedup grouping.
	rolle?: string;
	quelle?: string;
	deadline?: string;
	dedup_key?: string;
	duplicate_of?: string;
	status: InboxItemStatus;
	error: string | null;
	triage?: TriageAssessment | null;
}

export interface InboxTriageSummary {
	auto_committed: number;
	awaiting_review: number;
}

export interface InboxScanResult {
	pending: number;
	valid: number;
	invalid: number;
	duplicate: number;
	items: InboxScanItem[];
	byType: Record<string, number>;
	triage?: InboxTriageSummary;
}

export interface CommitResultItem {
	id: string;
	filename: string;
	ok: boolean;
	message: string;
}

export interface CommitResult {
	committed: CommitResultItem[];
	skipped: CommitResultItem[];
}
