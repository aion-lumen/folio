import matter from 'gray-matter';
import {
	closeSync,
	constants,
	existsSync,
	fchmodSync,
	fstatSync,
	fsyncSync,
	lstatSync,
	mkdirSync,
	openSync,
	readFileSync,
	readdirSync,
	realpathSync,
	writeSync
} from 'node:fs';
import { basename, join, sep } from 'node:path';
import { getModuleDatabasePath } from '../index.js';

const NOTE_SCHEMA = 'aion-lumen/sonar-vault-note/v1';
const REVIEW_SCHEMA = 'aion-lumen/sonar-review/v1';
const NOTE_NAME = /^twitter-(\d+)\.md$/;
const MAX_NOTE_BYTES = 128 * 1024;
const MAX_LEDGER_BYTES = 2 * 1024 * 1024;

export type SonarDomain = 'ai' | 'career';
export type SonarSignal = 'bookmark' | 'like';
export type SonarReviewStatus = 'pending' | 'accepted' | 'deferred' | 'rejected';
export type SonarDecision = Exclude<SonarReviewStatus, 'pending'>;

export interface SonarNote {
	postId: string;
	title: string;
	reason: string;
	body: string;
	sourceUrl: string;
	publishedAt: string | null;
	importedOn: string;
	domains: SonarDomain[];
	signals: SonarSignal[];
	status: SonarReviewStatus;
	reviewedAt: string | null;
}

export interface SonarState {
	notes: SonarNote[];
	skippedNotes: number;
	ledgerHealthy: boolean;
}

interface ReviewRecord {
	schema: typeof REVIEW_SCHEMA;
	post_id: string;
	status: SonarDecision;
	reviewed_at: string;
}

export class SonarStoreError extends Error {}

function moduleRoot(
	database: 'vault-notes' | 'review-state',
	capability: 'notes.read' | 'reviews.read' | 'review.write'
): string {
	const root = getModuleDatabasePath('sonar', database, capability);
	if (!root) throw new SonarStoreError('Sonar note store is unavailable');
	return root;
}

function normalizedDate(value: unknown): string | null {
	if (typeof value === 'string' && value.trim()) return value;
	if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString();
	return null;
}

function stringArray<T extends string>(value: unknown, allowed: readonly T[]): T[] | null {
	if (!Array.isArray(value) || value.length === 0) return null;
	const values = value.filter((entry): entry is T => typeof entry === 'string' && allowed.includes(entry as T));
	return values.length === value.length ? [...new Set(values)] : null;
}

function section(content: string, heading: string, nextHeading?: string): string | null {
	const startToken = `## ${heading}`;
	const start = content.indexOf(startToken);
	if (start < 0) return null;
	const valueStart = start + startToken.length;
	const end = nextHeading ? content.indexOf(`## ${nextHeading}`, valueStart) : content.length;
	return content.slice(valueStart, end < 0 ? content.length : end).trim();
}

function parseNote(path: string, expectedPostId: string): SonarNote {
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_NOTE_BYTES) {
		throw new SonarStoreError('Unsafe or oversized Sonar note');
	}
	const parsed = matter(readFileSync(path, 'utf8'));
	const data = parsed.data as Record<string, unknown>;
	const postId = data.source_post_id;
	const publishedAt = normalizedDate(data.published_at);
	const importedOn = normalizedDate(data.imported_on);
	const domains = stringArray(data.domains, ['ai', 'career'] as const);
	const signals = stringArray(data.signals, ['bookmark', 'like'] as const);
	const sourceUrl = data.source_url;
	const title = parsed.content.match(/^#\s+(.+)$/m)?.[1]?.trim();
	const reason = section(parsed.content, 'Why it was retained', 'Original post');
	const quotedBody = section(parsed.content, 'Original post');
	const body = quotedBody
		?.split('\n')
		.map((line) => line.replace(/^> ?/, ''))
		.join('\n')
		.trim();

	if (
		data.schema !== NOTE_SCHEMA ||
		data.type !== 'sonar-note' ||
		data.source !== 'x' ||
		postId !== expectedPostId ||
		data.derived_from_external !== true ||
		data.auto_commit_eligible !== false ||
		data.review_status !== 'pending' ||
		typeof sourceUrl !== 'string' ||
		sourceUrl !== `https://x.com/i/web/status/${expectedPostId}` ||
		!importedOn ||
		!domains ||
		!signals ||
		!title ||
		!reason ||
		!body
	) {
		throw new SonarStoreError('Invalid Sonar note schema');
	}

	return {
		postId: expectedPostId,
		title,
		reason,
		body,
		sourceUrl,
		publishedAt,
		importedOn,
		domains,
		signals,
		status: 'pending',
		reviewedAt: null
	};
}

function reviewLedger(root: string): Map<string, ReviewRecord> {
	const path = join(root, 'reviews.ndjson');
	if (!existsSync(path)) return new Map();
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_LEDGER_BYTES) {
		throw new SonarStoreError('Unsafe or oversized Sonar review ledger');
	}
	const latest = new Map<string, ReviewRecord>();
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch {
			throw new SonarStoreError('Invalid Sonar review ledger');
		}
		const record = value as Partial<ReviewRecord>;
		if (
			record.schema !== REVIEW_SCHEMA ||
			typeof record.post_id !== 'string' ||
			!/^[0-9]+$/.test(record.post_id) ||
			!['accepted', 'deferred', 'rejected'].includes(record.status ?? '') ||
			typeof record.reviewed_at !== 'string' ||
			Number.isNaN(Date.parse(record.reviewed_at))
		) {
			throw new SonarStoreError('Invalid Sonar review ledger');
		}
		latest.set(record.post_id, record as ReviewRecord);
	}
	return latest;
}

function safeInbox(root: string): string | null {
	const inbox = join(root, 'inbox');
	if (!existsSync(inbox)) return null;
	const stat = lstatSync(inbox);
	if (!stat.isDirectory() || stat.isSymbolicLink()) throw new SonarStoreError('Unsafe Sonar inbox');
	return realpathSync(inbox);
}

export function readSonarState(
	noteRoot?: string,
	reviewRoot?: string
): SonarState {
	const resolvedNoteRoot = noteRoot ?? moduleRoot('vault-notes', 'notes.read');
	const resolvedReviewRoot = reviewRoot ?? (noteRoot ? noteRoot : moduleRoot('review-state', 'reviews.read'));
	const inbox = safeInbox(resolvedNoteRoot);
	if (!inbox) return { notes: [], skippedNotes: 0, ledgerHealthy: true };
	let ledger = new Map<string, ReviewRecord>();
	let ledgerHealthy = true;
	try {
		ledger = reviewLedger(resolvedReviewRoot);
	} catch {
		ledgerHealthy = false;
	}

	const notes: SonarNote[] = [];
	let skippedNotes = 0;
	for (const entry of readdirSync(inbox, { withFileTypes: true })) {
		const match = NOTE_NAME.exec(entry.name);
		if (!match || !entry.isFile()) continue;
		try {
			const note = parseNote(join(inbox, entry.name), match[1]);
			const review = ledger.get(note.postId);
			if (review) {
				note.status = review.status;
				note.reviewedAt = review.reviewed_at;
			}
			notes.push(note);
		} catch {
			skippedNotes += 1;
		}
	}

	notes.sort((a, b) => {
		if (a.status === 'pending' && b.status !== 'pending') return -1;
		if (a.status !== 'pending' && b.status === 'pending') return 1;
		return (b.publishedAt ?? b.importedOn).localeCompare(a.publishedAt ?? a.importedOn);
	});
	return { notes, skippedNotes, ledgerHealthy };
}

export function appendSonarReview(
	postId: string,
	status: SonarDecision,
	noteRoot?: string,
	reviewRoot?: string
): ReviewRecord {
	const resolvedNoteRoot = noteRoot ?? moduleRoot('vault-notes', 'notes.read');
	const resolvedReviewRoot = reviewRoot ?? (noteRoot ? noteRoot : moduleRoot('review-state', 'review.write'));
	if (!/^[0-9]+$/.test(postId) || !['accepted', 'deferred', 'rejected'].includes(status)) {
		throw new SonarStoreError('Invalid Sonar review decision');
	}
	// Refuse to extend an audit trail that cannot be parsed completely.
	reviewLedger(resolvedReviewRoot);
	const inbox = safeInbox(resolvedNoteRoot);
	if (!inbox) throw new SonarStoreError('Sonar inbox is unavailable');
	const notePath = join(inbox, `twitter-${postId}.md`);
	if (!existsSync(notePath)) throw new SonarStoreError('Sonar note does not exist');
	const resolvedNote = realpathSync(notePath);
	if (!resolvedNote.startsWith(`${inbox}${sep}`) || basename(resolvedNote) !== `twitter-${postId}.md`) {
		throw new SonarStoreError('Unsafe Sonar note path');
	}
	parseNote(resolvedNote, postId);

	const record: ReviewRecord = {
		schema: REVIEW_SCHEMA,
		post_id: postId,
		status,
		reviewed_at: new Date().toISOString()
	};
	const payload = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
	if (!existsSync(resolvedReviewRoot)) mkdirSync(resolvedReviewRoot, { recursive: true, mode: 0o700 });
	const reviewRootStat = lstatSync(resolvedReviewRoot);
	if (!reviewRootStat.isDirectory() || reviewRootStat.isSymbolicLink()) {
		throw new SonarStoreError('Unsafe Sonar review store');
	}
	const ledgerPath = join(resolvedReviewRoot, 'reviews.ndjson');
	let fd: number | null = null;
	try {
		fd = openSync(
			ledgerPath,
			constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW,
			0o600
		);
		if (!fstatSync(fd).isFile()) throw new SonarStoreError('Unsafe Sonar review ledger');
		fchmodSync(fd, 0o600);
		let offset = 0;
		while (offset < payload.length) {
			offset += writeSync(fd, payload, offset, payload.length - offset);
		}
		fsyncSync(fd);
	} finally {
		if (fd !== null) closeSync(fd);
	}
	return record;
}
