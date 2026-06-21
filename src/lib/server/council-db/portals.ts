// Mobile 1c (2026-05-30): portal whitelist for the link-ingest endpoint.
// Read from ~/Projects/aion-lumen/council/config/portals.yaml (same source
// the council-worker uses). Domains of all `enabled: true` portals are
// accepted; subdomains match automatically.
//
// Cached in-memory with a 5-minute TTL — same pattern as personas.yaml
// (council-db/reader.ts loadPersonas).

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { parse as parseYaml } from 'yaml';
import { getCouncilConfigPath } from '../env.js';
const TTL_MS = 5 * 60 * 1000;

interface PortalEntry {
	id: string;
	name: string;
	domain: string;
	enabled: boolean;
}

let _cache: { domains: Set<string>; portalsById: Map<string, PortalEntry> } | null = null;
let _cachedAt = 0;

function loadPortals(): { domains: Set<string>; portalsById: Map<string, PortalEntry> } {
	const now = Date.now();
	if (_cache && now - _cachedAt < TTL_MS) return _cache;

	const empty = { domains: new Set<string>(), portalsById: new Map<string, PortalEntry>() };
	const portalsPath = join(getCouncilConfigPath(), 'portals.yaml');
	if (!existsSync(portalsPath)) {
		_cache = empty;
		_cachedAt = now;
		return _cache;
	}
	try {
		const parsed = parseYaml(readFileSync(portalsPath, 'utf-8')) as
			| { portals?: PortalEntry[] }
			| null;
		const list = parsed?.portals ?? [];
		const domains = new Set<string>();
		const portalsById = new Map<string, PortalEntry>();
		for (const p of list) {
			if (!p.enabled) continue;
			if (p.domain) domains.add(p.domain.toLowerCase());
			portalsById.set(p.id, p);
		}
		_cache = { domains, portalsById };
	} catch {
		_cache = empty;
	}
	_cachedAt = now;
	return _cache;
}

/**
 * Returns true if the URL's hostname matches one of the enabled portal
 * domains (exact match or as a subdomain). False for unknown hosts,
 * non-http(s) schemes, or malformed URLs.
 */
export function isSupportedPortalUrl(rawUrl: string): { ok: boolean; reason?: string; portal?: string } {
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return { ok: false, reason: 'URL ist nicht wohlgeformt.' };
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		return { ok: false, reason: `Nur http(s) erlaubt, nicht ${url.protocol}.` };
	}
	const host = url.hostname.toLowerCase();
	const { domains } = loadPortals();
	for (const d of domains) {
		if (host === d || host.endsWith(`.${d}`)) {
			return { ok: true, portal: d };
		}
	}
	return {
		ok: false,
		reason: `Portal nicht unterstützt (${host}) — Wende dich an Afshin.`
	};
}

/** Exposed for tests / UI helpers — returns the list of supported domains. */
export function listSupportedDomains(): string[] {
	return Array.from(loadPortals().domains).sort();
}
