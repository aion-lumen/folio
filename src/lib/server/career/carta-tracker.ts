import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, isAbsolute } from 'node:path';
import { getFolioDbPath } from '../env.js';

/** Explicit source; resolving it never happens at module import time. */
export function careerTrackerPath(): string {
 const configured = process.env.FOLIO_CAREER_TRACKER_PATH;
 if (configured) {
  if (!isAbsolute(configured)) throw Error('career_tracker_path_invalid');
  return configured;
 }
 const file = join(dirname(getFolioDbPath()), 'career-settings.json');
 if (!existsSync(file)) return '';
 const settings = JSON.parse(readFileSync(file, 'utf8'));
 if (!settings || typeof settings.trackerPath !== 'string' || !isAbsolute(settings.trackerPath)) {
  throw Error('career_tracker_path_invalid');
 }
 return settings.trackerPath;
}
export function careerTrackerAvailability() {
 try { return { status: 'ready' as const, snapshot: readCartaTracker() }; }
 catch (error) {
  const message = error instanceof Error ? error.message : '';
  const status = message === 'career_tracker_not_configured' ? 'unconfigured'
   : (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'missing' : 'invalid';
  return { status, snapshot: null } as const;
 }
}

const ALLOWED_STATUSES = new Set(['new', 'review', 'applied', 'skip']);
const TRACKING_PARAMS = /^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|ref$|source$)/i;

export interface CartaPosition extends Record<string, unknown> {
	title: string;
	company: string;
	url: string;
	status: 'new' | 'review' | 'applied' | 'skip';
}

export interface CartaRejectedPosition {
	employer: string;
	title: string;
	date: string;
	reason: string;
	identity: string;
	rawHash: string;
}

export interface CartaTrackerSnapshot {
	sourcePath: string;
	sourceHash: string;
	positions: Array<CartaPosition & { identity: string; rawHash: string }>;
	rejected: CartaRejectedPosition[];
}

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function sentinel(source: string, name: 'DATA' | 'REJECTED'): { literal: string; start: number; end: number } {
	const marker = new RegExp(`(?:^|\\n|;)[ \\t]*const[ \\t]+${name}[ \\t]*=[ \\t]*`, 'g');
	const matches = [...source.matchAll(marker)];
	if (matches.length !== 1) throw new Error(`carta_tracker_${name.toLowerCase()}_markers:${matches.length}`);
	const after = (matches[0].index ?? 0) + matches[0][0].length;
	let start = after;
	while (/\s/.test(source[start] ?? '')) start++;
	if (source[start] !== '[') throw new Error(`carta_tracker_${name.toLowerCase()}_not_array`);
	let depth = 0;
	let inString = false;
	let escaped = false;
	let lineComment = false;
	let blockComment = false;
	for (let i = start; i < source.length; i++) {
		const char = source[i];
		const next = source[i + 1];
		if (lineComment) {
			if (char === '\n') lineComment = false;
			continue;
		}
		if (blockComment) {
			if (char === '*' && next === '/') {
				blockComment = false;
				i++;
			}
			continue;
		}
		if (inString) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		else if (char === '/' && next === '/') {
			lineComment = true;
			i++;
		} else if (char === '/' && next === '*') {
			blockComment = true;
			i++;
		} else if (char === '[') depth++;
		else if (char === ']' && --depth === 0) return { literal: source.slice(start, i + 1), start, end:i+1 };
	}
	throw new Error(`carta_tracker_${name.toLowerCase()}_unterminated`);
}

function stripComments(literal: string): string {
	let out = '';
	let inString = false;
	let escaped = false;
	let lineComment = false;
	let blockComment = false;
	for (let i = 0; i < literal.length; i++) {
		const char = literal[i];
		const next = literal[i + 1];
		if (lineComment) {
			if (char === '\n') {
				lineComment = false;
				out += char;
			}
			continue;
		}
		if (blockComment) {
			if (char === '*' && next === '/') {
				blockComment = false;
				i++;
			}
			continue;
		}
		if (inString) {
			out += char;
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') {
			inString = true;
			out += char;
		} else if (char === '/' && next === '/') {
			lineComment = true;
			i++;
		} else if (char === '/' && next === '*') {
			blockComment = true;
			i++;
		} else out += char;
	}
	if (inString || blockComment) throw new Error('carta_tracker_invalid_literal');
	return out;
}

function stripTrailingCommas(literal: string): string {
	let out = '';
	let inString = false;
	let escaped = false;
	for (let i = 0; i < literal.length; i++) {
		const char = literal[i];
		if (inString) {
			out += char;
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '"') inString = true;
		if (char === ',') {
			let j = i + 1;
			while (/\s/.test(literal[j] ?? '')) j++;
			if (literal[j] === ']' || literal[j] === '}') continue;
		}
		out += char;
	}
	return out;
}

function parseLiteral(literal: string): unknown {
	return JSON.parse(stripTrailingCommas(stripComments(literal)));
}

function rawItems(literal: string): string[] {
	const items: string[] = [];
	let start = -1;
	let depth = 0;
	let inString = false;
	let escaped = false;
	let lineComment = false;
	let blockComment = false;
	for (let i = 1; i < literal.length - 1; i++) {
		const char = literal[i];
		const next = literal[i + 1];
		if (lineComment) {
			if (char === '\n') lineComment = false;
			continue;
		}
		if (blockComment) {
			if (char === '*' && next === '/') {
				blockComment = false;
				i++;
			}
			continue;
		}
		if (inString) {
			if (escaped) escaped = false;
			else if (char === '\\') escaped = true;
			else if (char === '"') inString = false;
			continue;
		}
		if (char === '/' && next === '/') {
			lineComment = true;
			i++;
			continue;
		}
		if (char === '/' && next === '*') {
			blockComment = true;
			i++;
			continue;
		}
		if (start < 0) {
			if (/\s|,/.test(char)) continue;
			start = i;
		}
		if (char === '"') inString = true;
		else if (char === '[' || char === '{') depth++;
		else if (char === ']' || char === '}') depth--;
		else if (char === ',' && depth === 0 && start >= 0) {
			items.push(literal.slice(start, i).trim());
			start = -1;
		}
	}
	if (start >= 0) items.push(literal.slice(start, literal.length - 1).trim());
	return items.filter(Boolean);
}

export function normalizeListingUrl(raw: string): string {
	const url = new URL(raw);
	if (url.protocol !== 'https:' || url.username || url.password) throw new Error('carta_tracker_unsafe_url');
	for (const key of [...url.searchParams.keys()]) if (TRACKING_PARAMS.test(key)) url.searchParams.delete(key);
	url.hash = '';
	url.hostname = url.hostname.toLowerCase();
	url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/\/$/, '') || '/';
	url.searchParams.sort();
	return url.href;
}

function listingIdentity(position: CartaPosition): string {
	const normalizedUrl = normalizeListingUrl(position.url);
	const url = new URL(normalizedUrl);
	const externalId = url.pathname.match(/[0-9a-f]{8}-[0-9a-f-]{20,}|\b\d{5,}\b/i)?.[0];
	const stable = externalId ? `${url.hostname}:${externalId.toLowerCase()}` : normalizedUrl;
	return `listing:${sha256(stable).slice(0, 24)}`;
}

function roleScopedListingIdentity(position: CartaPosition): string {
	const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('de-CH').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
	return `listing:${sha256(`${normalizeListingUrl(position.url)}|${normalize(position.company)}|${normalize(position.title)}`).slice(0, 24)}`;
}

function rejectionIdentity(employer: string, title: string): string {
	const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('de-CH').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
	return `rejection:${sha256(`${normalize(employer)}|${normalize(title)}`).slice(0, 24)}`;
}

export function parseCartaTrackerSource(source: string, sourcePath = ''): CartaTrackerSnapshot {
	const dataLiteral = sentinel(source, 'DATA').literal;
	const rejectedLiteral = sentinel(source, 'REJECTED').literal;
	const data = parseLiteral(dataLiteral);
	const rejected = parseLiteral(rejectedLiteral);
	if (!Array.isArray(data) || !Array.isArray(rejected)) throw new Error('carta_tracker_invalid_arrays');
	const dataRaw = rawItems(dataLiteral);
	const rejectedRaw = rawItems(rejectedLiteral);
	if (dataRaw.length !== data.length || rejectedRaw.length !== rejected.length) throw new Error('carta_tracker_source_alignment_failed');

	const identities = new Set<string>();
	const baseListingIdentities = data.map((value, index) => {
		if (!value || typeof value !== 'object' || Array.isArray(value)) return `invalid:${index}`;
		const row = value as Record<string, unknown>;
		if (typeof row.title !== 'string' || typeof row.company !== 'string' || typeof row.url !== 'string' || typeof row.status !== 'string' || !ALLOWED_STATUSES.has(row.status)) return `invalid:${index}`;
		return listingIdentity(row as CartaPosition);
	});
	const baseCounts = new Map<string, number>();
	for (const identity of baseListingIdentities) baseCounts.set(identity, (baseCounts.get(identity) ?? 0) + 1);
	const positions = data.map((value, index) => {
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`carta_tracker_position_invalid:${index}`);
		const row = value as Record<string, unknown>;
		if (typeof row.title !== 'string' || typeof row.company !== 'string' || typeof row.url !== 'string' || typeof row.status !== 'string' || !ALLOWED_STATUSES.has(row.status)) {
			throw new Error(`carta_tracker_position_schema:${index}`);
		}
		const position = row as CartaPosition;
		const baseIdentity = baseListingIdentities[index];
		const identity = (baseCounts.get(baseIdentity) ?? 0) > 1 ? roleScopedListingIdentity(position) : baseIdentity;
		if (identities.has(identity)) throw new Error(`carta_tracker_duplicate_identity:${identity}`);
		identities.add(identity);
		return { ...position, url: normalizeListingUrl(position.url), identity, rawHash: sha256(dataRaw[index]) };
	});
	const rejectedPositions = rejected.map((value, index) => {
		if (!Array.isArray(value) || value.length !== 4 || value.some((entry) => typeof entry !== 'string')) throw new Error(`carta_tracker_rejected_schema:${index}`);
		const [employer, title, date, reason] = value as string[];
		const identity = rejectionIdentity(employer, title);
		if (identities.has(identity)) throw new Error(`carta_tracker_duplicate_identity:${identity}`);
		identities.add(identity);
		return { employer, title, date, reason, identity, rawHash: sha256(rejectedRaw[index]) };
	});
	return { sourcePath, sourceHash: sha256(source), positions, rejected: rejectedPositions };
}

export function readCartaTracker(): CartaTrackerSnapshot {
	const path=careerTrackerPath();if(!path)throw Error('career_tracker_not_configured');
	return parseCartaTrackerSource(readFileSync(path, 'utf8'),path);
}

export interface CartaRejectionChange {
	identity: string;
	rawHash: string;
	date: string;
	source: string;
}

/** Only these four operational fields plus an appended note/history are changed.
 * Never evaluate HTML, rewrite neighbouring records, or discard submitted_at. */
export function patchCartaRejections(source: string, expectedHash: string, changes: CartaRejectionChange[]): string {
	const before = parseCartaTrackerSource(source);
	if (before.sourceHash !== expectedHash) throw new Error('tracker_changed');
	if (!changes.length || new Set(changes.map(c => c.identity)).size !== changes.length) throw new Error('invalid_changes');
	const data = sentinel(source, 'DATA'), rejected = sentinel(source, 'REJECTED');
	const items = rawItems(data.literal);
	let updated = data.literal;
	const history: string[][] = [];
	const safeJson = (value: unknown) => JSON.stringify(value, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
	for (const change of changes) {
		const index = before.positions.findIndex(p => p.identity === change.identity);
		const row = before.positions[index];
		if (!row || row.rawHash !== change.rawHash || row.status !== 'applied' || row.action === 'rejected') throw new Error('position_changed');
		if (!/^\d{4}-\d{2}-\d{2}$/.test(change.date) || !/^mail:\d+$/.test(change.source)) throw new Error('invalid_evidence_reference');
		if (before.rejected.some(r => r.employer === row.company && r.title === row.title)) throw new Error('already_rejected');
		const original = parseLiteral(items[index]) as Record<string, unknown>;
		const note = `Absage laut Mail vom ${change.date}, in Folio freigegeben (${change.source}). Bewerbung bleibt als versandt dokumentiert.`;
		const replacement = safeJson({ ...original, action:'rejected', urg:'cool', alert:`ABSAGE ${change.date}`, note:[original.note, note].filter(Boolean).join('\n') });
		updated = updated.replace(items[index], () => replacement);
		history.push([row.company, row.title, change.date, note]);
	}
	const newHistory = '[' + history.map(safeJson).join(',\n') + (before.rejected.length ? ',\n' : '\n') + rejected.literal.slice(1);
	const edits = [{...data, value:updated}, {...rejected, value:newHistory}].sort((a,b) => b.start-a.start);
	let result = source;
	for (const edit of edits) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end);
	const after = parseCartaTrackerSource(result);
	if (after.positions.length !== before.positions.length || after.rejected.length !== before.rejected.length + changes.length) throw new Error('tracker_patch_invariant');
	for (const row of before.positions) if (!changes.some(c => c.identity === row.identity) && after.positions.find(p => p.identity === row.identity)?.rawHash !== row.rawHash) throw new Error('unrelated_position_changed');
	return result;
}
