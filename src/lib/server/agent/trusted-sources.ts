// Source-Trust-Policy — reader for config/trusted_sources.yaml (Folio-File-First, kein DB).
// Cached per process; YAML-Edit triggert keinen Auto-Reload (dev-server-restart nötig).
// Fail-closed: fehlt/kaputt die Config, ist KEINE Quelle vertraut → alles fällt ins Review.

import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { getTrustedSourcesPath } from '../env.js';

let _cache: string[] | null = null;

export function loadTrustedSources(): string[] {
	if (_cache) return _cache;
	try {
		const raw = readFileSync(getTrustedSourcesPath(), 'utf-8');
		const parsed = parseYaml(raw) as { trusted_sources?: unknown };
		const list = Array.isArray(parsed?.trusted_sources) ? parsed.trusted_sources : [];
		_cache = list.filter((s): s is string => typeof s === 'string' && s.trim() !== '');
	} catch {
		_cache = [];
	}
	return _cache;
}

/** True when `source` is on the trusted list. */
export function isTrustedSource(source: string | null | undefined): boolean {
	return !!source && loadTrustedSources().includes(source);
}

/**
 * Auto-commit trust gate: only trusted, non-derived imports may bypass manual review.
 * `derived_from_external:true` revokes trust unconditionally (content came from external material).
 */
export function isSourceAutoTrusted(
	source: string | null | undefined,
	derivedFromExternal: boolean | undefined
): boolean {
	return !derivedFromExternal && isTrustedSource(source);
}

/** Test-only: drop the module cache so a fresh config path is re-read. */
export function _resetTrustedSourcesCache(): void {
	_cache = null;
}
