import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, join, sep } from 'node:path';
import { getModuleDatabasePath } from '../index.js';

const ARCHIVE_SCHEMA = 'aion-lumen/x-archive-import-manifest/v1';
const ARCHIVE_DIRECTORY = /^x-archive-(\d{4}-\d{2}-\d{2})$/;
const MAX_MANIFEST_BYTES = 64 * 1024;

export interface SonarArchiveSummary {
	importedOn: string;
	likes: number;
	following: number;
	bookmarks: number;
	warnings: number;
}

export interface SonarArchiveState {
	summary: SonarArchiveSummary | null;
	healthy: boolean;
}

function archiveRoot(): string {
	const root = getModuleDatabasePath('sonar', 'archive-cache', 'archive.read');
	if (!root) throw new Error('Sonar archive store is unavailable');
	return root;
}

function count(value: unknown): number | null {
	return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;
}

function parseManifest(path: string, importedOn: string): SonarArchiveSummary {
	const stat = lstatSync(path);
	if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_MANIFEST_BYTES) {
		throw new Error('Unsafe Sonar archive manifest');
	}
	const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
	const counts = parsed.counts as Record<string, unknown> | undefined;
	const privacy = parsed.privacy as Record<string, unknown> | undefined;
	const likes = count(counts?.likes);
	const following = count(counts?.following);
	const bookmarks = count(counts?.bookmarks);
	const warnings = Array.isArray(parsed.warnings) && parsed.warnings.every((item) => typeof item === 'string')
		? parsed.warnings.length
		: null;

	if (
		parsed.schema !== ARCHIVE_SCHEMA ||
		likes === null ||
		following === null ||
		bookmarks === null ||
		warnings === null ||
		privacy?.network_access !== false ||
		privacy?.review_contains_post_text !== false
	) {
		throw new Error('Invalid Sonar archive manifest');
	}

	return { importedOn, likes, following, bookmarks, warnings };
}

/** Read only the newest archive's aggregate manifest; never load post or account records. */
export function readSonarArchiveState(rootOverride?: string): SonarArchiveState {
	try {
		const root = rootOverride ?? archiveRoot();
		if (!existsSync(root)) return { summary: null, healthy: true };
		const rootStat = lstatSync(root);
		if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Unsafe Sonar archive root');
		const resolvedRoot = realpathSync(root);
		const candidates = readdirSync(resolvedRoot, { withFileTypes: true })
			.filter((entry) => entry.isDirectory() && ARCHIVE_DIRECTORY.test(entry.name))
			.map((entry) => entry.name)
			.sort()
			.reverse();
		if (candidates.length === 0) return { summary: null, healthy: true };

		const directoryName = candidates[0];
		const match = ARCHIVE_DIRECTORY.exec(directoryName);
		if (!match) throw new Error('Invalid Sonar archive directory');
		const directory = join(resolvedRoot, directoryName);
		const directoryStat = lstatSync(directory);
		if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
			throw new Error('Unsafe Sonar archive directory');
		}
		const resolvedDirectory = realpathSync(directory);
		if (!resolvedDirectory.startsWith(`${resolvedRoot}${sep}`) || basename(resolvedDirectory) !== directoryName) {
			throw new Error('Unsafe Sonar archive path');
		}
		const manifestPath = join(resolvedDirectory, 'manifest.json');
		if (!existsSync(manifestPath)) throw new Error('Sonar archive manifest is missing');
		return { summary: parseManifest(manifestPath, match[1]), healthy: true };
	} catch {
		return { summary: null, healthy: false };
	}
}
