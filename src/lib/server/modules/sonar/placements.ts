import { createHash } from 'node:crypto';
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

const PLACEMENT_SCHEMA = 'folio/sonar-placement-candidate/v1';
const PLACEMENT_REVIEW_SCHEMA = 'folio/sonar-placement-review/v1';
const PLACEMENT_NAME = /^placement-([a-z0-9][a-z0-9-]{2,79})\.json$/;
const MAX_CANDIDATE_BYTES = 256 * 1024;
const MAX_LEDGER_BYTES = 2 * 1024 * 1024;
const MAX_SOURCE_TEXT = 16_000;
const MAX_DRAFT_TEXT = 4_000;

export const SONAR_PLACEMENT_CHANNELS = [
	'x',
	'reddit',
	'hacker-news',
	'linkedin',
	'discord',
	'other'
] as const;
export type SonarPlacementChannel = (typeof SONAR_PLACEMENT_CHANNELS)[number];
export type SonarPlacementDomain = 'ai' | 'career';
export type SonarPlacementAction = 'revise' | 'dismiss' | 'approve' | 'revoke';

export interface SonarPlacementCandidate {
	id: string;
	candidateHash: string;
	channel: SonarPlacementChannel;
	targetAccount: string;
	discoveredAt: string;
	expiresAt: string;
	status: 'open' | 'expired' | 'dismissed' | 'approved';
	reviewedAt: string | null;
	source: {
		externalId: string;
		url: string;
		authorHandle: string;
		authorName: string;
		text: string;
		publishedAt: string;
	};
	relevance: {
		domains: SonarPlacementDomain[];
		reason: string;
		suggestedAngle: string;
		references?: { title: string; url: string; claim: string }[];
	};
	draft: {
		revision: number;
		text: string;
		generatedAt: string;
		generatedBy: string;
	};
}

export interface SonarPlacementState {
	candidates: SonarPlacementCandidate[];
	skippedCandidates: number;
	healthy: boolean;
	ledgerHealthy: boolean;
}

interface CandidateDocument {
	schema: typeof PLACEMENT_SCHEMA;
	id: string;
	channel: SonarPlacementChannel;
	target_account: string;
	discovered_at: string;
	expires_at: string;
	source: {
		external_id: string;
		url: string;
		author_handle: string;
		author_name: string;
		text: string;
		published_at: string;
	};
	relevance: {
		domains: SonarPlacementDomain[];
		reason: string;
		suggested_angle: string;
		references?: { title: string; url: string; claim: string }[];
	};
	draft: {
		revision: number;
		text: string;
		generated_at: string;
		generated_by: string;
	};
	trust: {
		derived_from_external: true;
		auto_publish_eligible: false;
	};
}

interface RevisedPlacementRecord {
	schema: typeof PLACEMENT_REVIEW_SCHEMA;
	candidate_id: string;
	candidate_hash: string;
	action: 'draft_revised';
	previous_revision: number;
	revision: number;
	draft_text: string;
	reviewed_at: string;
}

interface DismissedPlacementRecord {
	schema: typeof PLACEMENT_REVIEW_SCHEMA;
	candidate_id: string;
	candidate_hash: string;
	action: 'dismissed';
	revision: number;
	reviewed_at: string;
}

interface ApprovedPlacementRecord {
	schema: typeof PLACEMENT_REVIEW_SCHEMA;
	candidate_id: string;
	candidate_hash: string;
	action: 'publish_approved';
	revision: number;
	draft_hash: string;
	reviewed_at: string;
}

interface RevokedPlacementApprovalRecord {
	schema: typeof PLACEMENT_REVIEW_SCHEMA;
	candidate_id: string;
	candidate_hash: string;
	action: 'publish_approval_revoked';
	revision: number;
	draft_hash: string;
	reviewed_at: string;
}

export type SonarPlacementReviewRecord =
	| RevisedPlacementRecord
	| DismissedPlacementRecord
	| ApprovedPlacementRecord
	| RevokedPlacementApprovalRecord;

export class SonarPlacementStoreError extends Error {}

function placementRoot(): string {
	const root = getModuleDatabasePath('sonar', 'placement-candidates', 'placements.read');
	if (!root) throw new SonarPlacementStoreError('Sonar placement store is unavailable');
	return root;
}

function reviewRoot(capability: 'reviews.read' | 'review.write'): string {
	const root = getModuleDatabasePath('sonar', 'review-state', capability);
	if (!root) throw new SonarPlacementStoreError('Sonar review store is unavailable');
	return root;
}

function exactKeys(value: object, expected: readonly string[]): boolean {
	const keys = Object.keys(value).sort();
	const sortedExpected = [...expected].sort();
	return keys.length === sortedExpected.length && keys.every((key, index) => key === sortedExpected[index]);
}

function nonEmptyString(value: unknown, max: number): value is string {
	return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function isoDate(value: unknown): value is string {
	return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function httpsUrl(value: unknown): value is string {
	if (typeof value !== 'string' || value.length > 2_048) return false;
	try {
		return new URL(value).protocol === 'https:';
	} catch {
		return false;
	}
}

function domains(value: unknown): value is SonarPlacementDomain[] {
	return (
		Array.isArray(value) &&
		value.length > 0 &&
		value.length <= 2 &&
		value.every((item) => item === 'ai' || item === 'career') &&
		new Set(value).size === value.length
	);
}

function parseCandidate(path: string, expectedId: string, now: Date): SonarPlacementCandidate {
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_CANDIDATE_BYTES) {
		throw new SonarPlacementStoreError('Unsafe or oversized placement candidate');
	}
	const sourceBytes = readFileSync(path);
	const value: unknown = JSON.parse(sourceBytes.toString('utf8'));
	if (!value || typeof value !== 'object') throw new SonarPlacementStoreError('Invalid placement candidate');
	const candidate = value as Partial<CandidateDocument>;
	const source = candidate.source;
	const relevance = candidate.relevance;
	const draft = candidate.draft;
	const trust = candidate.trust;
	if (
		!exactKeys(candidate, [
			'schema',
			'id',
			'channel',
			'target_account',
			'discovered_at',
			'expires_at',
			'source',
			'relevance',
			'draft',
			'trust'
		]) ||
		candidate.schema !== PLACEMENT_SCHEMA ||
		candidate.id !== expectedId ||
		!SONAR_PLACEMENT_CHANNELS.includes(candidate.channel as SonarPlacementChannel) ||
		!nonEmptyString(candidate.target_account, 80) ||
		!isoDate(candidate.discovered_at) ||
		!isoDate(candidate.expires_at) ||
		Date.parse(candidate.expires_at) < Date.parse(candidate.discovered_at) ||
		!source ||
		!exactKeys(source, ['external_id', 'url', 'author_handle', 'author_name', 'text', 'published_at']) ||
		!nonEmptyString(source.external_id, 160) ||
		!httpsUrl(source.url) ||
		!nonEmptyString(source.author_handle, 100) ||
		!nonEmptyString(source.author_name, 160) ||
		!nonEmptyString(source.text, MAX_SOURCE_TEXT) ||
		!isoDate(source.published_at) ||
		!relevance ||
		!(exactKeys(relevance, ['domains', 'reason', 'suggested_angle']) || exactKeys(relevance, ['domains', 'reason', 'suggested_angle', 'references'])) ||
        (relevance.references !== undefined && (!Array.isArray(relevance.references) || relevance.references.length > 20 || !relevance.references.every(ref => {
          if (!ref || typeof ref !== 'object' || !exactKeys(ref, ['title','url','claim']) || !nonEmptyString(ref.title, 200) || !nonEmptyString(ref.claim, 1500) || !nonEmptyString(ref.url, 2048)) return false;
          try { const url = new URL(ref.url); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
        }))) ||
		!domains(relevance.domains) ||
		!nonEmptyString(relevance.reason, 1_000) ||
		!nonEmptyString(relevance.suggested_angle, 1_000) ||
		!draft ||
		!exactKeys(draft, ['revision', 'text', 'generated_at', 'generated_by']) ||
		!Number.isSafeInteger(draft.revision) ||
		Number(draft.revision) < 1 ||
		!nonEmptyString(draft.text, MAX_DRAFT_TEXT) ||
		!isoDate(draft.generated_at) ||
		!nonEmptyString(draft.generated_by, 160) ||
		!trust ||
		!exactKeys(trust, ['derived_from_external', 'auto_publish_eligible']) ||
		trust.derived_from_external !== true ||
		trust.auto_publish_eligible !== false
	) {
		throw new SonarPlacementStoreError('Invalid placement candidate schema');
	}

	return {
		id: expectedId,
		candidateHash: createHash('sha256').update(sourceBytes).digest('hex'),
		channel: candidate.channel as SonarPlacementChannel,
		targetAccount: candidate.target_account,
		discoveredAt: candidate.discovered_at,
		expiresAt: candidate.expires_at,
		status: Date.parse(candidate.expires_at) < now.getTime() ? 'expired' : 'open',
		reviewedAt: null,
		source: {
			externalId: source.external_id,
			url: source.url,
			authorHandle: source.author_handle,
			authorName: source.author_name,
			text: source.text,
			publishedAt: source.published_at
		},
		relevance: {
			domains: relevance.domains,
			reason: relevance.reason,
			suggestedAngle: relevance.suggested_angle,
			...(relevance.references ? { references: relevance.references } : {})
		},
		draft: {
			revision: Number(draft.revision),
			text: draft.text,
			generatedAt: draft.generated_at,
			generatedBy: draft.generated_by
		}
	};
}

function placementLedger(root: string): SonarPlacementReviewRecord[] {
	if (!existsSync(root)) return [];
	const rootStat = lstatSync(root);
	if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
		throw new SonarPlacementStoreError('Unsafe placement review store');
	}
	const path = join(realpathSync(root), 'placement-reviews.ndjson');
	if (!existsSync(path)) return [];
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_LEDGER_BYTES) {
		throw new SonarPlacementStoreError('Unsafe or oversized placement review ledger');
	}
	const records: SonarPlacementReviewRecord[] = [];
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		let value: unknown;
		try {
			value = JSON.parse(line);
		} catch {
			throw new SonarPlacementStoreError('Invalid placement review ledger');
		}
		if (!value || typeof value !== 'object') throw new SonarPlacementStoreError('Invalid placement review ledger');
		const record = value as Partial<SonarPlacementReviewRecord>;
		const commonValid =
			record.schema === PLACEMENT_REVIEW_SCHEMA &&
			nonEmptyString(record.candidate_id, 80) &&
			/^[a-z0-9][a-z0-9-]{2,79}$/.test(record.candidate_id) &&
			typeof record.candidate_hash === 'string' &&
			/^[a-f0-9]{64}$/.test(record.candidate_hash) &&
			isoDate(record.reviewed_at);
		if (!commonValid) throw new SonarPlacementStoreError('Invalid placement review ledger');
		if (record.action === 'draft_revised') {
			if (
				!exactKeys(record, [
					'schema',
					'candidate_id',
					'candidate_hash',
					'action',
					'previous_revision',
					'revision',
					'draft_text',
					'reviewed_at'
				]) ||
				!Number.isSafeInteger(record.previous_revision) ||
				!Number.isSafeInteger(record.revision) ||
				!nonEmptyString(record.draft_text, MAX_DRAFT_TEXT)
			) {
				throw new SonarPlacementStoreError('Invalid placement review ledger');
			}
		} else if (record.action === 'dismissed') {
			if (
				!exactKeys(record, [
					'schema',
					'candidate_id',
					'candidate_hash',
					'action',
					'revision',
					'reviewed_at'
				]) ||
				!Number.isSafeInteger(record.revision)
			) {
				throw new SonarPlacementStoreError('Invalid placement review ledger');
			}
		} else if (record.action === 'publish_approved' || record.action === 'publish_approval_revoked') {
			if (
				!exactKeys(record, [
					'schema',
					'candidate_id',
					'candidate_hash',
					'action',
					'revision',
					'draft_hash',
					'reviewed_at'
				]) ||
				!Number.isSafeInteger(record.revision) ||
				typeof record.draft_hash !== 'string' ||
				!/^[a-f0-9]{64}$/.test(record.draft_hash)
			) {
				throw new SonarPlacementStoreError('Invalid placement review ledger');
			}
		} else {
			throw new SonarPlacementStoreError('Invalid placement review ledger');
		}
		records.push(record as SonarPlacementReviewRecord);
	}
	return records;
}

function applyPlacementRecords(
	candidates: SonarPlacementCandidate[],
	records: SonarPlacementReviewRecord[]
): void {
	const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
	for (const record of records) {
		const candidate = byId.get(record.candidate_id);
		// A producer may replace a candidate. Decisions for the old source bytes remain auditable,
		// but never carry over to the replacement.
		if (!candidate || candidate.candidateHash !== record.candidate_hash) continue;
		if (record.action === 'draft_revised') {
			if (
				candidate.status === 'dismissed' ||
				candidate.status === 'approved' ||
				record.previous_revision !== candidate.draft.revision ||
				record.revision !== record.previous_revision + 1
			) {
				throw new SonarPlacementStoreError('Inconsistent placement review ledger');
			}
			candidate.draft = {
				revision: record.revision,
				text: record.draft_text,
				generatedAt: record.reviewed_at,
				generatedBy: 'human:folio'
			};
			candidate.reviewedAt = record.reviewed_at;
		} else if (record.action === 'dismissed') {
			if (
				candidate.status === 'dismissed' ||
				candidate.status === 'approved' ||
				record.revision !== candidate.draft.revision
			) {
				throw new SonarPlacementStoreError('Inconsistent placement review ledger');
			}
			candidate.status = 'dismissed';
			candidate.reviewedAt = record.reviewed_at;
		} else if (record.action === 'publish_approved') {
			if (
				candidate.status === 'dismissed' ||
				candidate.status === 'approved' ||
				record.revision !== candidate.draft.revision ||
				record.draft_hash !== createHash('sha256').update(candidate.draft.text).digest('hex')
			) {
				throw new SonarPlacementStoreError('Inconsistent placement review ledger');
			}
			candidate.status = 'approved';
			candidate.reviewedAt = record.reviewed_at;
		} else {
			if (
				candidate.status !== 'approved' ||
				record.revision !== candidate.draft.revision ||
				record.draft_hash !== createHash('sha256').update(candidate.draft.text).digest('hex')
			) {
				throw new SonarPlacementStoreError('Inconsistent placement review ledger');
			}
			candidate.status = Date.parse(candidate.expiresAt) < Date.parse(record.reviewed_at) ? 'expired' : 'open';
			candidate.reviewedAt = record.reviewed_at;
		}
	}
}

function safeInbox(root: string): { root: string; inbox: string } | null {
	if (!existsSync(root)) return null;
	const rootStat = lstatSync(root);
	if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new SonarPlacementStoreError('Unsafe placement root');
	const resolvedRoot = realpathSync(root);
	const inbox = join(resolvedRoot, 'inbox');
	if (!existsSync(inbox)) return null;
	const inboxStat = lstatSync(inbox);
	if (!inboxStat.isDirectory() || inboxStat.isSymbolicLink()) throw new SonarPlacementStoreError('Unsafe placement inbox');
	const resolvedInbox = realpathSync(inbox);
	if (!resolvedInbox.startsWith(`${resolvedRoot}${sep}`)) throw new SonarPlacementStoreError('Unsafe placement inbox path');
	return { root: resolvedRoot, inbox: resolvedInbox };
}

function readCandidates(root: string, now: Date): { candidates: SonarPlacementCandidate[]; skipped: number } {
	const safe = safeInbox(root);
	if (!safe) return { candidates: [], skipped: 0 };
	const candidates: SonarPlacementCandidate[] = [];
	let skipped = 0;
	for (const entry of readdirSync(safe.inbox, { withFileTypes: true })) {
		const match = PLACEMENT_NAME.exec(entry.name);
		if (!match || !entry.isFile()) continue;
		try {
			const path = join(safe.inbox, entry.name);
			const resolvedPath = realpathSync(path);
			if (!resolvedPath.startsWith(`${safe.inbox}${sep}`) || basename(resolvedPath) !== entry.name) {
				throw new SonarPlacementStoreError('Unsafe placement candidate path');
			}
			candidates.push(parseCandidate(resolvedPath, match[1], now));
		} catch {
			skipped += 1;
		}
	}
	return { candidates, skipped };
}

export function readSonarPlacementState(
	rootOverride?: string,
	now = new Date(),
	reviewRootOverride?: string
): SonarPlacementState {
	try {
		const root = rootOverride ?? placementRoot();
		const base = readCandidates(root, now);
		let ledgerHealthy = true;
		try {
			const records = placementLedger(reviewRootOverride ?? (rootOverride ? root : reviewRoot('reviews.read')));
			applyPlacementRecords(base.candidates, records);
		} catch {
			ledgerHealthy = false;
			// Discard partial in-memory application and return the immutable producer state.
			base.candidates = readCandidates(root, now).candidates;
		}
		base.candidates.sort((a, b) => {
			if (a.status === 'open' && b.status !== 'open') return -1;
			if (a.status !== 'open' && b.status === 'open') return 1;
			return b.discoveredAt.localeCompare(a.discoveredAt);
		});
		return {
			candidates: base.candidates,
			skippedCandidates: base.skipped,
			healthy: true,
			ledgerHealthy
		};
	} catch {
		return { candidates: [], skippedCandidates: 0, healthy: false, ledgerHealthy: false };
	}
}

function appendRecord(root: string, record: SonarPlacementReviewRecord): void {
	if (!existsSync(root)) mkdirSync(root, { recursive: true, mode: 0o700 });
	const rootStat = lstatSync(root);
	if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
		throw new SonarPlacementStoreError('Unsafe placement review store');
	}
	const path = join(root, 'placement-reviews.ndjson');
	const payload = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
	let fd: number | null = null;
	try {
		fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
		const stat = fstatSync(fd);
		if (!stat.isFile() || stat.size + payload.length > MAX_LEDGER_BYTES) {
			throw new SonarPlacementStoreError('Unsafe or oversized placement review ledger');
		}
		fchmodSync(fd, 0o600);
		let offset = 0;
		while (offset < payload.length) offset += writeSync(fd, payload, offset, payload.length - offset);
		fsyncSync(fd);
	} finally {
		if (fd !== null) closeSync(fd);
	}
}

export function appendSonarPlacementAction(
	candidateId: string,
	candidateHash: string,
	expectedRevision: number,
	action: SonarPlacementAction,
	draftText?: string,
	candidateRootOverride?: string,
	reviewRootOverride?: string,
	now = new Date()
): SonarPlacementReviewRecord {
	if (
		!/^[a-z0-9][a-z0-9-]{2,79}$/.test(candidateId) ||
		!/^[a-f0-9]{64}$/.test(candidateHash) ||
		!Number.isSafeInteger(expectedRevision) ||
		expectedRevision < 1 ||
		!['revise', 'dismiss', 'approve', 'revoke'].includes(action) ||
		(action === 'revise' ? !nonEmptyString(draftText, MAX_DRAFT_TEXT) : draftText !== undefined)
	) {
		throw new SonarPlacementStoreError('Invalid placement review decision');
	}
	const candidateRoot = candidateRootOverride ?? placementRoot();
	const reviewStore = reviewRootOverride ?? (candidateRootOverride ? candidateRoot : reviewRoot('review.write'));
	// Parse the complete ledger first; never extend a trail that Folio cannot verify.
	const records = placementLedger(reviewStore);
	const base = readCandidates(candidateRoot, now);
	const candidate = base.candidates.find((item) => item.id === candidateId);
	if (!candidate || candidate.candidateHash !== candidateHash) {
		throw new SonarPlacementStoreError('Placement candidate changed');
	}
	applyPlacementRecords(base.candidates, records);
	if (
		candidate.draft.revision !== expectedRevision ||
		(action === 'revoke' ? candidate.status !== 'approved' : candidate.status !== 'open')
	) {
		throw new SonarPlacementStoreError('Placement candidate is no longer actionable');
	}
	const reviewedAt = now.toISOString();
	const record: SonarPlacementReviewRecord =
		action === 'revise'
			? {
					schema: PLACEMENT_REVIEW_SCHEMA,
					candidate_id: candidateId,
					candidate_hash: candidateHash,
					action: 'draft_revised',
					previous_revision: expectedRevision,
					revision: expectedRevision + 1,
					draft_text: draftText as string,
					reviewed_at: reviewedAt
				}
			: action === 'dismiss'
				? {
					schema: PLACEMENT_REVIEW_SCHEMA,
					candidate_id: candidateId,
					candidate_hash: candidateHash,
					action: 'dismissed',
					revision: expectedRevision,
					reviewed_at: reviewedAt
				}
				: action === 'approve'
					? {
						schema: PLACEMENT_REVIEW_SCHEMA,
						candidate_id: candidateId,
						candidate_hash: candidateHash,
						action: 'publish_approved',
						revision: expectedRevision,
						draft_hash: createHash('sha256').update(candidate.draft.text).digest('hex'),
						reviewed_at: reviewedAt
					}
					: {
						schema: PLACEMENT_REVIEW_SCHEMA,
						candidate_id: candidateId,
						candidate_hash: candidateHash,
						action: 'publish_approval_revoked',
						revision: expectedRevision,
						draft_hash: createHash('sha256').update(candidate.draft.text).digest('hex'),
						reviewed_at: reviewedAt
					};
	appendRecord(reviewStore, record);
	return record;
}
