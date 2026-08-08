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

const CACHE_SCHEMA = 'aion-lumen/sonar-following-profile-cache/v1';
const PROFILE_SCHEMA = 'aion-lumen/sonar-following-profile/v1';
const REVIEW_SCHEMA = 'aion-lumen/sonar-following-review/v1';
const CACHE_DIRECTORY = /^following-profile-cache-(\d{4}-\d{2}-\d{2})$/;
const MAX_PROFILE_BYTES = 2 * 1024 * 1024;
const MAX_MANIFEST_BYTES = 64 * 1024;
const MAX_LEDGER_BYTES = 1024 * 1024;

export type SonarFollowingCategory = 'ai' | 'politics' | 'both' | 'drop';

export interface SonarFollowingProfile {
	accountId: string;
	username: string;
	name: string;
	description: string;
	verified: boolean;
	category: SonarFollowingCategory | null;
	reviewedAt: string | null;
}

export interface SonarFollowingState {
	profiles: SonarFollowingProfile[];
	retrievedOn: string | null;
	skippedProfiles: number;
	sourceHealthy: boolean;
	ledgerHealthy: boolean;
}

interface FollowingReviewRecord {
	schema: typeof REVIEW_SCHEMA;
	account_id: string;
	category: SonarFollowingCategory;
	reviewed_at: string;
}

export class SonarFollowingError extends Error {}

function archiveRoot(): string {
	const root = getModuleDatabasePath('sonar', 'archive-cache', 'archive.read');
	if (!root) throw new SonarFollowingError('Sonar archive store is unavailable');
	return root;
}

function reviewRoot(): string {
	const root = getModuleDatabasePath('sonar', 'review-state', 'review.write');
	if (!root) throw new SonarFollowingError('Sonar review store is unavailable');
	return root;
}

function latestCache(root: string): { directory: string; retrievedOn: string } | null {
	if (!existsSync(root)) return null;
	const stat = lstatSync(root);
	if (!stat.isDirectory() || stat.isSymbolicLink()) throw new SonarFollowingError('Unsafe profile-cache root');
	const resolvedRoot = realpathSync(root);
	const candidates = readdirSync(resolvedRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && CACHE_DIRECTORY.test(entry.name))
		.map((entry) => entry.name)
		.sort()
		.reverse();
	if (candidates.length === 0) return null;
	const directoryName = candidates[0];
	const retrievedOn = CACHE_DIRECTORY.exec(directoryName)?.[1];
	if (!retrievedOn) throw new SonarFollowingError('Invalid profile-cache directory');
	const directory = join(resolvedRoot, directoryName);
	const directoryStat = lstatSync(directory);
	if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
		throw new SonarFollowingError('Unsafe profile-cache directory');
	}
	const resolvedDirectory = realpathSync(directory);
	if (!resolvedDirectory.startsWith(`${resolvedRoot}${sep}`) || basename(resolvedDirectory) !== directoryName) {
		throw new SonarFollowingError('Unsafe profile-cache path');
	}
	return { directory: resolvedDirectory, retrievedOn };
}

function safeFile(path: string, maxBytes: number): string {
	if (!existsSync(path)) throw new SonarFollowingError('Profile-cache file is missing');
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > maxBytes) {
		throw new SonarFollowingError('Unsafe or oversized profile-cache file');
	}
	return readFileSync(path, 'utf8');
}

function readProfiles(root: string): { profiles: SonarFollowingProfile[]; retrievedOn: string | null; skipped: number } {
	const cache = latestCache(root);
	if (!cache) return { profiles: [], retrievedOn: null, skipped: 0 };
	const manifest = JSON.parse(safeFile(join(cache.directory, 'manifest.json'), MAX_MANIFEST_BYTES)) as Record<string, unknown>;
	const privacy = manifest.privacy as Record<string, unknown> | undefined;
	if (
		manifest.schema !== CACHE_SCHEMA ||
		manifest.retrieved_on !== cache.retrievedOn ||
		!Number.isSafeInteger(manifest.count) ||
		Number(manifest.count) < 0 ||
		privacy?.credentials_in_output !== false ||
		privacy?.network_access_during_ui !== false ||
		privacy?.public_metrics_stored !== false
	) {
		throw new SonarFollowingError('Invalid profile-cache manifest');
	}

	const profiles: SonarFollowingProfile[] = [];
	const seen = new Set<string>();
	let skipped = 0;
	for (const line of safeFile(join(cache.directory, 'profiles.ndjson'), MAX_PROFILE_BYTES).split('\n')) {
		if (!line.trim()) continue;
		try {
			const value = JSON.parse(line) as Record<string, unknown>;
			if (
				value.schema !== PROFILE_SCHEMA ||
				typeof value.account_id !== 'string' ||
				!/^\d+$/.test(value.account_id) ||
				seen.has(value.account_id) ||
				typeof value.username !== 'string' ||
				!/^[A-Za-z0-9_]{1,15}$/.test(value.username) ||
				typeof value.name !== 'string' ||
				value.name.length === 0 ||
				value.name.length > 100 ||
				typeof value.description !== 'string' ||
				value.description.length > 1000 ||
				typeof value.verified !== 'boolean'
			) {
				throw new Error('Invalid profile');
			}
			seen.add(value.account_id);
			profiles.push({
				accountId: value.account_id,
				username: value.username,
				name: value.name,
				description: value.description,
				verified: value.verified,
				category: null,
				reviewedAt: null
			});
		} catch {
			skipped += 1;
		}
	}
	if (profiles.length + skipped !== Number(manifest.count)) {
		throw new SonarFollowingError('Profile-cache count does not match manifest');
	}
	return { profiles, retrievedOn: cache.retrievedOn, skipped };
}

function readReviews(root: string): Map<string, FollowingReviewRecord> {
	const path = join(root, 'following-reviews.ndjson');
	if (!existsSync(path)) return new Map();
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_LEDGER_BYTES) {
		throw new SonarFollowingError('Unsafe following review ledger');
	}
	const latest = new Map<string, FollowingReviewRecord>();
	for (const line of readFileSync(path, 'utf8').split('\n')) {
		if (!line.trim()) continue;
		const value = JSON.parse(line) as Partial<FollowingReviewRecord>;
		if (
			value.schema !== REVIEW_SCHEMA ||
			typeof value.account_id !== 'string' ||
			!/^\d+$/.test(value.account_id) ||
			!['ai', 'politics', 'both', 'drop'].includes(value.category ?? '') ||
			typeof value.reviewed_at !== 'string' ||
			Number.isNaN(Date.parse(value.reviewed_at))
		) {
			throw new SonarFollowingError('Invalid following review ledger');
		}
		latest.set(value.account_id, value as FollowingReviewRecord);
	}
	return latest;
}

export function readSonarFollowingState(
	archiveRootOverride?: string,
	reviewRootOverride?: string
): SonarFollowingState {
	const sourceRoot = archiveRootOverride ?? archiveRoot();
	const decisionsRoot = reviewRootOverride ?? (archiveRootOverride ? archiveRootOverride : reviewRoot());
	let source: ReturnType<typeof readProfiles>;
	try {
		source = readProfiles(sourceRoot);
	} catch {
		return {
			profiles: [],
			retrievedOn: null,
			skippedProfiles: 0,
			sourceHealthy: false,
			ledgerHealthy: true
		};
	}
	let reviews = new Map<string, FollowingReviewRecord>();
	let ledgerHealthy = true;
	try {
		reviews = readReviews(decisionsRoot);
	} catch {
		ledgerHealthy = false;
	}
	for (const profile of source.profiles) {
		const review = reviews.get(profile.accountId);
		if (review) {
			profile.category = review.category;
			profile.reviewedAt = review.reviewed_at;
		}
	}
	source.profiles.sort((a, b) => {
		if (a.category === null && b.category !== null) return -1;
		if (a.category !== null && b.category === null) return 1;
		return a.username.localeCompare(b.username);
	});
	return {
		profiles: source.profiles,
		retrievedOn: source.retrievedOn,
		skippedProfiles: source.skipped,
		sourceHealthy: true,
		ledgerHealthy
	};
}

export function appendSonarFollowingReview(
	accountId: string,
	category: SonarFollowingCategory,
	archiveRootOverride?: string,
	reviewRootOverride?: string
): FollowingReviewRecord {
	if (!/^\d+$/.test(accountId) || !['ai', 'politics', 'both', 'drop'].includes(category)) {
		throw new SonarFollowingError('Invalid following review decision');
	}
	const sourceRoot = archiveRootOverride ?? archiveRoot();
	const decisionsRoot = reviewRootOverride ?? (archiveRootOverride ? archiveRootOverride : reviewRoot());
	const profiles = readProfiles(sourceRoot).profiles;
	if (!profiles.some((profile) => profile.accountId === accountId)) {
		throw new SonarFollowingError('Following profile does not exist');
	}
	const reviews = readReviews(decisionsRoot);
	const existing = reviews.get(accountId);
	if (existing?.category === category) return existing;

	const record: FollowingReviewRecord = {
		schema: REVIEW_SCHEMA,
		account_id: accountId,
		category,
		reviewed_at: new Date().toISOString()
	};
	const payload = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
	if (!existsSync(decisionsRoot)) mkdirSync(decisionsRoot, { recursive: true, mode: 0o700 });
	const rootStat = lstatSync(decisionsRoot);
	if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
		throw new SonarFollowingError('Unsafe Sonar review store');
	}
	const ledgerPath = join(decisionsRoot, 'following-reviews.ndjson');
	let fd: number | null = null;
	try {
		fd = openSync(
			ledgerPath,
			constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW,
			0o600
		);
		if (!fstatSync(fd).isFile()) throw new SonarFollowingError('Unsafe following review ledger');
		fchmodSync(fd, 0o600);
		let offset = 0;
		while (offset < payload.length) offset += writeSync(fd, payload, offset, payload.length - offset);
		fsyncSync(fd);
	} finally {
		if (fd !== null) closeSync(fd);
	}
	return record;
}
