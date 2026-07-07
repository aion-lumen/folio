import { mkdir, readFile, writeFile, rename } from 'fs/promises';
import { createHash } from 'crypto';
import { dirname } from 'path';
import { getTriageCachePath } from '../env.js';
import type { TriageAssessment } from './types.js';

interface CacheEntry {
	hash: string;
	assessment: TriageAssessment;
	cachedAt: string;
}

interface TriageCache {
	version: 1;
	entries: Record<string, CacheEntry>;
}

async function readCache(): Promise<TriageCache> {
	try {
		const raw = await readFile(getTriageCachePath(), 'utf-8');
		const parsed = JSON.parse(raw) as TriageCache;
		if (parsed.version === 1 && parsed.entries) return parsed;
	} catch {
		// fresh
	}
	return { version: 1, entries: {} };
}

async function writeCache(cache: TriageCache): Promise<void> {
	const path = getTriageCachePath();
	await mkdir(dirname(path), { recursive: true });
	const tmp = `${path}.tmp`;
	await writeFile(tmp, JSON.stringify(cache, null, 2), 'utf-8');
	await rename(tmp, path);
}

export function hashContent(raw: string): string {
	return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}

export async function getCachedAssessment(
	filename: string,
	contentHash: string
): Promise<TriageAssessment | null> {
	const cache = await readCache();
	const entry = cache.entries[filename];
	if (!entry || entry.hash !== contentHash) return null;
	return entry.assessment;
}

export async function setCachedAssessment(
	filename: string,
	contentHash: string,
	assessment: TriageAssessment
): Promise<void> {
	const cache = await readCache();
	cache.entries[filename] = {
		hash: contentHash,
		assessment,
		cachedAt: new Date().toISOString()
	};
	await writeCache(cache);
}

export async function clearTriageCache(): Promise<void> {
	await writeCache({ version: 1, entries: {} });
}
