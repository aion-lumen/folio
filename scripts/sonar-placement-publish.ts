#!/usr/bin/env -S npx tsx
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
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
	realpathSync,
	unlinkSync,
	writeSync
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hasModuleCapability } from '../src/lib/server/modules/index.js';
import { readSonarPlacementState, type SonarPlacementCandidate } from '../src/lib/server/modules/sonar/placements.js';

const CONFIG_SCHEMA = 'folio/sonar-placement-publisher-config/v1';
const EVENT_SCHEMA = 'folio/sonar-placement-publication/v1';
const MAX_CONFIG_BYTES = 128 * 1024;
const MAX_LEDGER_BYTES = 2 * 1024 * 1024;
const MAX_COMMAND_OUTPUT = 512 * 1024;

export interface PlacementPublisherConfig {
	schema: typeof CONFIG_SCHEMA;
	candidate_root: string;
	review_root: string;
	state_root: string;
	xurl: {
		binary: string;
		app: string;
		expected_username: string;
	};
	limits: { max_text_characters: number };
}

interface PublicationBinding {
	candidate_id: string;
	candidate_hash: string;
	revision: number;
	draft_hash: string;
}

interface ClaimedEvent extends PublicationBinding {
	schema: typeof EVENT_SCHEMA;
	event: 'publish_claimed';
	claim_id: string;
	source_external_id: string;
	recorded_at: string;
}

interface PublishedEvent extends PublicationBinding {
	schema: typeof EVENT_SCHEMA;
	event: 'published';
	claim_id: string;
	external_post_id: string;
	external_url: string;
	recorded_at: string;
}

interface ManualPublishedEvent extends PublicationBinding {
	schema: typeof EVENT_SCHEMA;
	event: 'manual_published';
	claim_id: string;
	external_post_id: string;
	external_url: string;
	verified_via: 'x_api_read';
	recorded_at: string;
}

interface UnclearEvent extends PublicationBinding {
	schema: typeof EVENT_SCHEMA;
	event: 'publish_unclear';
	claim_id: string;
	error_code: 'publisher_command_failed' | 'publisher_response_invalid';
	recorded_at: string;
}

interface ManualRequiredEvent extends PublicationBinding {
	schema: typeof EVENT_SCHEMA;
	event: 'manual_required';
	claim_id: string;
	reason: 'api_reply_requires_mention_or_author';
	intent_url: string;
	recorded_at: string;
}

export type PublicationEvent = ClaimedEvent | PublishedEvent | ManualPublishedEvent | UnclearEvent | ManualRequiredEvent;
export type PublicationStatus = 'claimed' | 'published' | 'unclear' | 'manual_required';

export interface PublicationView extends PublicationBinding {
	status: PublicationStatus;
	claimId: string;
	recordedAt: string;
	externalPostId?: string;
	externalUrl?: string;
	manualReason?: ManualRequiredEvent['reason'];
	intentUrl?: string;
}

export interface PublisherRunResult {
	status: 'idle' | 'ready' | 'published' | 'unclear' | 'manual_required';
	candidateId?: string;
	externalUrl?: string;
}

type CommandRunner = (binary: string, args: string[], timeoutMs: number) => string;

function object(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: object, expected: readonly string[]): boolean {
	const keys = Object.keys(value).sort();
	const sorted = [...expected].sort();
	return keys.length === sorted.length && keys.every((key, index) => key === sorted[index]);
}

function string(value: unknown, max: number): value is string {
	return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function binding(value: Partial<PublicationBinding>): boolean {
	return (
		string(value.candidate_id, 80) &&
		/^[a-z0-9][a-z0-9-]{2,79}$/.test(value.candidate_id) &&
		typeof value.candidate_hash === 'string' &&
		/^[a-f0-9]{64}$/.test(value.candidate_hash) &&
		Number.isSafeInteger(value.revision) &&
		Number(value.revision) >= 1 &&
		typeof value.draft_hash === 'string' &&
		/^[a-f0-9]{64}$/.test(value.draft_hash)
	);
}

function isoDate(value: unknown): value is string {
	return typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value));
}

function safeFile(path: string, maxBytes: number): string {
	if (!isAbsolute(path) || !existsSync(path)) throw new Error(`Missing file: ${path}`);
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) throw new Error(`Unsafe file: ${path}`);
	return realpathSync(path);
}

function safeExecutable(path: string): string {
	if (!isAbsolute(path) || !existsSync(path)) throw new Error(`Missing executable: ${path}`);
	const resolved = realpathSync(path);
	const stat = lstatSync(resolved);
	if (!stat.isFile() || stat.size > 128 * 1024 * 1024) throw new Error(`Unsafe executable: ${path}`);
	return resolved;
}

function safeStateRoot(path: string): string {
	if (!isAbsolute(path)) throw new Error('Publisher state root must be absolute');
	if (!existsSync(path)) mkdirSync(path, { recursive: true, mode: 0o700 });
	const stat = lstatSync(path);
	if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe publisher state root');
	return realpathSync(path);
}

function existingStateRoot(path: string): string | null {
	if (!isAbsolute(path)) throw new Error('Publisher state root must be absolute');
	if (!existsSync(path)) return null;
	const stat = lstatSync(path);
	if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Unsafe publisher state root');
	return realpathSync(path);
}

export function parsePublisherConfig(path: string): PlacementPublisherConfig {
	const value: unknown = JSON.parse(readFileSync(safeFile(resolve(path), MAX_CONFIG_BYTES), 'utf8'));
	if (
		!object(value) ||
		!exactKeys(value, ['schema', 'candidate_root', 'review_root', 'state_root', 'xurl', 'limits']) ||
		value.schema !== CONFIG_SCHEMA ||
		!string(value.candidate_root, 4_096) ||
		!isAbsolute(value.candidate_root) ||
		!string(value.review_root, 4_096) ||
		!isAbsolute(value.review_root) ||
		!string(value.state_root, 4_096) ||
		!isAbsolute(value.state_root) ||
		!object(value.xurl) ||
		!exactKeys(value.xurl, ['binary', 'app', 'expected_username']) ||
		!string(value.xurl.binary, 4_096) ||
		!isAbsolute(value.xurl.binary) ||
		!string(value.xurl.app, 120) ||
		!string(value.xurl.expected_username, 100) ||
		!/^@?[A-Za-z0-9_]{1,15}$/.test(value.xurl.expected_username) ||
		!object(value.limits) ||
		!exactKeys(value.limits, ['max_text_characters']) ||
		!Number.isSafeInteger(value.limits.max_text_characters) ||
		Number(value.limits.max_text_characters) < 1 ||
		Number(value.limits.max_text_characters) > 4_000
	) throw new Error('Invalid Sonar publisher config');
	return value as unknown as PlacementPublisherConfig;
}

function parseEvent(value: unknown): PublicationEvent {
	if (!object(value)) throw new Error('Invalid Sonar publication ledger');
	const event = value as Partial<PublicationEvent>;
	const common =
		event.schema === EVENT_SCHEMA &&
		binding(event) &&
		string(event.claim_id, 80) &&
		isoDate(event.recorded_at);
	if (!common) throw new Error('Invalid Sonar publication ledger');
	if (event.event === 'publish_claimed') {
		if (
			!exactKeys(event, ['schema', 'event', 'candidate_id', 'candidate_hash', 'revision', 'draft_hash', 'claim_id', 'source_external_id', 'recorded_at']) ||
			!string(event.source_external_id, 160)
		) throw new Error('Invalid Sonar publication ledger');
	} else if (event.event === 'published') {
		if (
			!exactKeys(event, ['schema', 'event', 'candidate_id', 'candidate_hash', 'revision', 'draft_hash', 'claim_id', 'external_post_id', 'external_url', 'recorded_at']) ||
			!string(event.external_post_id, 160) ||
			!string(event.external_url, 2_048) ||
			new URL(event.external_url).protocol !== 'https:'
		) throw new Error('Invalid Sonar publication ledger');
	} else if (event.event === 'manual_published') {
		if (
			!exactKeys(event, ['schema', 'event', 'candidate_id', 'candidate_hash', 'revision', 'draft_hash', 'claim_id', 'external_post_id', 'external_url', 'verified_via', 'recorded_at']) ||
			!string(event.external_post_id, 160) ||
			!/^\d+$/.test(event.external_post_id) ||
			!string(event.external_url, 2_048) ||
			new URL(event.external_url).protocol !== 'https:' ||
			event.verified_via !== 'x_api_read'
		) throw new Error('Invalid Sonar publication ledger');
	} else if (event.event === 'publish_unclear') {
		if (
			!exactKeys(event, ['schema', 'event', 'candidate_id', 'candidate_hash', 'revision', 'draft_hash', 'claim_id', 'error_code', 'recorded_at']) ||
			!['publisher_command_failed', 'publisher_response_invalid'].includes(String(event.error_code))
		) throw new Error('Invalid Sonar publication ledger');
	} else if (event.event === 'manual_required') {
		if (
			!exactKeys(event, ['schema', 'event', 'candidate_id', 'candidate_hash', 'revision', 'draft_hash', 'claim_id', 'reason', 'intent_url', 'recorded_at']) ||
			event.reason !== 'api_reply_requires_mention_or_author' ||
			!string(event.intent_url, 8_192)
		) throw new Error('Invalid Sonar publication ledger');
		const intent = new URL(event.intent_url);
		if (intent.protocol !== 'https:' || intent.hostname !== 'x.com' || intent.pathname !== '/intent/tweet') {
			throw new Error('Invalid Sonar publication ledger');
		}
	} else {
		throw new Error('Invalid Sonar publication ledger');
	}
	return event as PublicationEvent;
}

export function readPublicationState(root: string): Map<string, PublicationView> {
	const stateRoot = existingStateRoot(root);
	if (!stateRoot) return new Map();
	const path = join(stateRoot, 'placement-publications.ndjson');
	if (!existsSync(path)) return new Map();
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_LEDGER_BYTES) throw new Error('Unsafe Sonar publication ledger');
	const states = new Map<string, PublicationView>();
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		const event = parseEvent(JSON.parse(line));
		const previous = states.get(event.candidate_id);
		if (event.event === 'publish_claimed') {
			if (previous) throw new Error('Inconsistent Sonar publication ledger');
			states.set(event.candidate_id, {
				candidate_id: event.candidate_id,
				candidate_hash: event.candidate_hash,
				revision: event.revision,
				draft_hash: event.draft_hash,
				status: 'claimed',
				claimId: event.claim_id,
				recordedAt: event.recorded_at
			});
		} else {
			if (
				!previous ||
				(event.event === 'manual_required'
					? !['claimed', 'unclear'].includes(previous.status)
					: event.event === 'manual_published'
						? previous.status !== 'manual_required'
						: previous.status !== 'claimed') ||
				previous.claimId !== event.claim_id ||
				previous.candidate_hash !== event.candidate_hash ||
				previous.revision !== event.revision ||
				previous.draft_hash !== event.draft_hash
			) throw new Error('Inconsistent Sonar publication ledger');
			states.set(event.candidate_id, {
				...previous,
				status: event.event === 'published' || event.event === 'manual_published'
					? 'published'
					: event.event === 'manual_required'
						? 'manual_required'
						: 'unclear',
				recordedAt: event.recorded_at,
				...(event.event === 'published' || event.event === 'manual_published'
					? { externalPostId: event.external_post_id, externalUrl: event.external_url }
					: event.event === 'manual_required'
						? { manualReason: event.reason, intentUrl: event.intent_url }
						: {})
			});
		}
	}
	return states;
}

function appendEvent(root: string, event: PublicationEvent): void {
	const stateRoot = safeStateRoot(root);
	const path = join(stateRoot, 'placement-publications.ndjson');
	const payload = Buffer.from(`${JSON.stringify(event)}\n`, 'utf8');
	let fd: number | null = null;
	try {
		fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW, 0o600);
		const stat = fstatSync(fd);
		if (!stat.isFile() || stat.size + payload.length > MAX_LEDGER_BYTES) throw new Error('Unsafe or oversized Sonar publication ledger');
		fchmodSync(fd, 0o600);
		let offset = 0;
		while (offset < payload.length) offset += writeSync(fd, payload, offset, payload.length - offset);
		fsyncSync(fd);
	} finally {
		if (fd !== null) closeSync(fd);
	}
}

function defaultRunner(binary: string, args: string[], timeoutMs: number): string {
	return execFileSync(binary, args, {
		encoding: 'utf8',
		timeout: timeoutMs,
		maxBuffer: MAX_COMMAND_OUTPUT,
		stdio: ['ignore', 'pipe', 'pipe']
	});
}

function parseUsername(raw: string): string {
	const value: unknown = JSON.parse(raw);
	if (!object(value)) throw new Error('Invalid X identity response');
	const data = object(value.data) ? value.data : value;
	if (!string(data.username, 100) || !/^[A-Za-z0-9_]{1,15}$/.test(data.username)) throw new Error('Invalid X identity response');
	return data.username;
}

function parsePublishedId(raw: string): string {
	const value: unknown = JSON.parse(raw);
	if (!object(value) || !object(value.data) || !string(value.data.id, 160)) throw new Error('Invalid X publish response');
	return value.data.id;
}

function parseIdentity(raw: string): { id: string; username: string } {
	const value: unknown = JSON.parse(raw);
	if (!object(value)) throw new Error('Invalid X identity response');
	const data = object(value.data) ? value.data : value;
	if (
		!string(data.id, 160) ||
		!/^\d+$/.test(data.id) ||
		!string(data.username, 100) ||
		!/^[A-Za-z0-9_]{1,15}$/.test(data.username)
	) throw new Error('Invalid X identity response');
	return { id: data.id, username: data.username };
}

function draftHash(candidate: SonarPlacementCandidate): string {
	return createHash('sha256').update(candidate.draft.text).digest('hex');
}

function replyIntent(candidate: SonarPlacementCandidate): string {
	const intent = new URL('https://x.com/intent/tweet');
	intent.searchParams.set('in_reply_to', candidate.source.externalId);
	intent.searchParams.set('text', candidate.draft.text);
	return intent.toString();
}

function commandFailureText(error: unknown): string {
	if (!object(error)) return error instanceof Error ? error.message : '';
	return [error.message, error.stdout, error.stderr]
		.filter((part): part is string | Buffer => typeof part === 'string' || Buffer.isBuffer(part))
		.map((part) => part.toString())
		.join('\n');
}

function requiresManualReply(error: unknown): boolean {
	const message = commandFailureText(error);
	return message.includes('You can only reply to or quote posts where you are mentioned or are the author.') &&
		message.includes('403');
}

function appendManualRequired(
	config: PlacementPublisherConfig,
	candidate: SonarPlacementCandidate,
	publication: PublicationView,
	now: Date
): PublisherRunResult {
	appendEvent(config.state_root, {
		schema: EVENT_SCHEMA,
		event: 'manual_required',
		candidate_id: publication.candidate_id,
		candidate_hash: publication.candidate_hash,
		revision: publication.revision,
		draft_hash: publication.draft_hash,
		claim_id: publication.claimId,
		reason: 'api_reply_requires_mention_or_author',
		intent_url: replyIntent(candidate),
		recorded_at: now.toISOString()
	});
	return { status: 'manual_required', candidateId: candidate.id };
}

export function reconcileManualReply(
	config: PlacementPublisherConfig,
	candidateId: string,
	now = new Date()
): PublisherRunResult {
	if (!hasModuleCapability('sonar', 'publish.execute')) throw new Error('Sonar publisher is disabled');
	const placementState = readSonarPlacementState(config.candidate_root, now, config.review_root);
	if (!placementState.healthy || !placementState.ledgerHealthy) throw new Error('Sonar placement state is not safely readable');
	const candidate = placementState.candidates.find((item) => item.id === candidateId);
	const publication = readPublicationState(config.state_root).get(candidateId);
	if (!candidate || candidate.status !== 'approved' || !publication || publication.status !== 'unclear') {
		throw new Error('Only an approved unclear publication can be reconciled to manual reply');
	}
	if (
		publication.candidate_hash !== candidate.candidateHash ||
		publication.revision !== candidate.draft.revision ||
		publication.draft_hash !== draftHash(candidate)
	) throw new Error('Approved placement changed before manual reconciliation');
	return appendManualRequired(config, candidate, publication, now);
}

function verifyManualPublication(
	raw: string,
	candidate: SonarPlacementCandidate,
	externalPostId: string,
	expectedAuthorId: string
): void {
	const value: unknown = JSON.parse(raw);
	if (!object(value) || !object(value.data)) throw new Error('Invalid X publication receipt');
	const data = value.data;
	const references = Array.isArray(data.referenced_tweets) ? data.referenced_tweets : [];
	const expectedText = candidate.draft.text;
	const expectedReplyText = `@${candidate.source.authorHandle} ${expectedText}`;
	if (
		data.id !== externalPostId ||
		data.author_id !== expectedAuthorId ||
		data.conversation_id !== candidate.source.externalId ||
		!references.some((reference) =>
			object(reference) && reference.type === 'replied_to' && reference.id === candidate.source.externalId
		) ||
		(data.text !== expectedText && data.text !== expectedReplyText)
	) throw new Error('X publication does not match the approved placement');
}

export function reconcileManualPublication(
	config: PlacementPublisherConfig,
	candidateId: string,
	externalPostId: string,
	now = new Date(),
	runner: CommandRunner = defaultRunner
): PublisherRunResult {
	if (!hasModuleCapability('sonar', 'publish.execute')) throw new Error('Sonar publisher is disabled');
	if (!/^\d{6,160}$/.test(externalPostId)) throw new Error('Invalid X publication ID');
	const placementState = readSonarPlacementState(config.candidate_root, now, config.review_root);
	if (!placementState.healthy || !placementState.ledgerHealthy) throw new Error('Sonar placement state is not safely readable');
	const candidate = placementState.candidates.find((item) => item.id === candidateId);
	const publication = readPublicationState(config.state_root).get(candidateId);
	if (!candidate || candidate.status !== 'approved' || !publication || publication.status !== 'manual_required') {
		throw new Error('Only an approved manual publication can be reconciled');
	}
	if (
		publication.candidate_hash !== candidate.candidateHash ||
		publication.revision !== candidate.draft.revision ||
		publication.draft_hash !== draftHash(candidate)
	) throw new Error('Approved placement changed before publication reconciliation');
	const xurl = safeExecutable(config.xurl.binary);
	const expected = config.xurl.expected_username.replace(/^@/, '').toLowerCase();
	const identity = parseIdentity(runner(xurl, ['--app', config.xurl.app, 'whoami'], 30_000));
	if (identity.username.toLowerCase() !== expected) throw new Error(`X identity mismatch: expected @${expected}`);
	verifyManualPublication(
		runner(xurl, ['--app', config.xurl.app, 'read', externalPostId], 30_000),
		candidate,
		externalPostId,
		identity.id
	);
	const externalUrl = `https://x.com/${expected}/status/${externalPostId}`;
	appendEvent(config.state_root, {
		schema: EVENT_SCHEMA,
		event: 'manual_published',
		candidate_id: publication.candidate_id,
		candidate_hash: publication.candidate_hash,
		revision: publication.revision,
		draft_hash: publication.draft_hash,
		claim_id: publication.claimId,
		external_post_id: externalPostId,
		external_url: externalUrl,
		verified_via: 'x_api_read',
		recorded_at: now.toISOString()
	});
	return { status: 'published', candidateId, externalUrl };
}

function acquireLock(root: string): number {
	const path = join(safeStateRoot(root), 'placement-publisher.lock');
	return openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
}

function releaseLock(root: string, fd: number): void {
	closeSync(fd);
	const path = join(safeStateRoot(root), 'placement-publisher.lock');
	if (existsSync(path)) unlinkSync(path);
}

export function runPlacementPublisher(
	config: PlacementPublisherConfig,
	now = new Date(),
	runner: CommandRunner = defaultRunner,
	dryRun = false,
	candidateId?: string
): PublisherRunResult {
	if (!hasModuleCapability('sonar', 'publish.execute')) throw new Error('Sonar publisher is disabled');
	const placementState = readSonarPlacementState(config.candidate_root, now, config.review_root);
	if (!placementState.healthy || !placementState.ledgerHealthy) throw new Error('Sonar placement state is not safely readable');
	const publication = readPublicationState(config.state_root);
	const candidates = placementState.candidates.filter((candidate) =>
		candidate.status === 'approved' &&
		candidate.channel === 'x' &&
		candidate.targetAccount.replace(/^@/, '').toLowerCase() === config.xurl.expected_username.replace(/^@/, '').toLowerCase() &&
		!publication.has(candidate.id) &&
		(!candidateId || candidate.id === candidateId)
	);
	const candidate = candidates.at(0);
	if (!candidate) return { status: 'idle' };
	if ([...candidate.draft.text].length > config.limits.max_text_characters) throw new Error('Approved draft exceeds configured X character limit');
	if (dryRun) return { status: 'ready', candidateId: candidate.id };

	const xurl = safeExecutable(config.xurl.binary);
	const expected = config.xurl.expected_username.replace(/^@/, '').toLowerCase();
	const actual = parseUsername(runner(xurl, ['--app', config.xurl.app, 'whoami'], 30_000)).toLowerCase();
	if (actual !== expected) throw new Error(`X identity mismatch: expected @${expected}`);

	let lock: number | null = null;
	try {
		lock = acquireLock(config.state_root);
		if (readPublicationState(config.state_root).has(candidate.id)) return { status: 'idle' };
		const current = readSonarPlacementState(config.candidate_root, new Date(), config.review_root).candidates
			.find((item) => item.id === candidate.id);
		if (
			!current ||
			current.status !== 'approved' ||
			current.candidateHash !== candidate.candidateHash ||
			current.draft.revision !== candidate.draft.revision ||
			draftHash(current) !== draftHash(candidate)
		) throw new Error('Approved placement changed before publication');
		const claimId = randomUUID();
		const common: PublicationBinding = {
			candidate_id: candidate.id,
			candidate_hash: candidate.candidateHash,
			revision: candidate.draft.revision,
			draft_hash: draftHash(candidate)
		};
		appendEvent(config.state_root, {
			schema: EVENT_SCHEMA,
			event: 'publish_claimed',
			...common,
			claim_id: claimId,
			source_external_id: candidate.source.externalId,
			recorded_at: now.toISOString()
		});
		let raw: string;
		try {
			raw = runner(xurl, ['--app', config.xurl.app, 'reply', candidate.source.externalId, candidate.draft.text], 45_000);
		} catch (error) {
			if (requiresManualReply(error)) {
				return appendManualRequired(config, candidate, {
					...common,
					status: 'claimed',
					claimId,
					recordedAt: new Date().toISOString()
				}, new Date());
			}
			appendEvent(config.state_root, {
				schema: EVENT_SCHEMA,
				event: 'publish_unclear',
				...common,
				claim_id: claimId,
				error_code: 'publisher_command_failed',
				recorded_at: new Date().toISOString()
			});
			return { status: 'unclear', candidateId: candidate.id };
		}
		let externalId: string;
		try {
			externalId = parsePublishedId(raw);
		} catch {
			appendEvent(config.state_root, {
				schema: EVENT_SCHEMA,
				event: 'publish_unclear',
				...common,
				claim_id: claimId,
				error_code: 'publisher_response_invalid',
				recorded_at: new Date().toISOString()
			});
			return { status: 'unclear', candidateId: candidate.id };
		}
		const externalUrl = `https://x.com/${expected}/status/${externalId}`;
		appendEvent(config.state_root, {
			schema: EVENT_SCHEMA,
			event: 'published',
			...common,
			claim_id: claimId,
			external_post_id: externalId,
			external_url: externalUrl,
			recorded_at: new Date().toISOString()
		});
		return { status: 'published', candidateId: candidate.id, externalUrl };
	} finally {
		if (lock !== null) releaseLock(config.state_root, lock);
	}
}

function usage(): never {
	throw new Error('Usage: npm run sonar:publish-placement -- --config /absolute/path/publisher.json [--dry-run | --mark-manual-required | --record-manual-publication --external-post-id 123] [--candidate x-123]');
}

function main(argv: string[]): void {
	const configIndex = argv.indexOf('--config');
	const candidateIndex = argv.indexOf('--candidate');
	const externalPostIndex = argv.indexOf('--external-post-id');
	if (configIndex < 0 || !argv[configIndex + 1] || (candidateIndex >= 0 && !argv[candidateIndex + 1])) usage();
	if (externalPostIndex >= 0 && !argv[externalPostIndex + 1]) usage();
	const allowed = new Set(['--config', argv[configIndex + 1], '--dry-run', '--mark-manual-required', '--record-manual-publication']);
	if (candidateIndex >= 0) {
		allowed.add('--candidate');
		allowed.add(argv[candidateIndex + 1]);
	}
	if (externalPostIndex >= 0) {
		allowed.add('--external-post-id');
		allowed.add(argv[externalPostIndex + 1]);
	}
	if (argv.some((arg) => !allowed.has(arg))) usage();
	const modes = ['--dry-run', '--mark-manual-required', '--record-manual-publication'].filter((mode) => argv.includes(mode));
	if (modes.length > 1) usage();
	if (argv.includes('--mark-manual-required') && candidateIndex < 0) usage();
	if (argv.includes('--record-manual-publication') && (candidateIndex < 0 || externalPostIndex < 0)) usage();
	if (!argv.includes('--record-manual-publication') && externalPostIndex >= 0) usage();
	const config = parsePublisherConfig(argv[configIndex + 1]);
	const result = argv.includes('--record-manual-publication')
		? reconcileManualPublication(config, argv[candidateIndex + 1], argv[externalPostIndex + 1], new Date())
		: argv.includes('--mark-manual-required')
			? reconcileManualReply(config, argv[candidateIndex + 1], new Date())
			: runPlacementPublisher(config, new Date(), defaultRunner, argv.includes('--dry-run'), candidateIndex >= 0 ? argv[candidateIndex + 1] : undefined);
	process.stdout.write(`${JSON.stringify(result)}\n`);
	if (result.status === 'unclear') process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
	try {
		main(process.argv.slice(2));
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Unknown Sonar publisher failure';
		process.stderr.write(`Sonar publisher failed: ${message}\n`);
		process.exitCode = 1;
	}
}
