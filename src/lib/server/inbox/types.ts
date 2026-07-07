export type FolioImportType = 'directive' | 'field-note' | 'objective-update' | 'note';

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
	patch?: FolioImportPatch;
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
	status: InboxItemStatus;
	error: string | null;
}

export interface InboxScanResult {
	pending: number;
	valid: number;
	invalid: number;
	duplicate: number;
	items: InboxScanItem[];
	byType: Record<string, number>;
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
