// F.8 — Time-Decay Apply + user_context.yaml-Loader (5min in-memory cache).
// Worker schreibt `actionability` frozen-at-insert. Folio Server-Load berechnet
// `effective_actionability` dynamisch basierend auf mail_date + user-config.

import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { getUserContextPath as getUserContextYamlPath } from '../env.js';

// F.8.5: correspondence → kontakt rename + werbung als 8. Domain.
export type Domain =
	| 'immo'
	| 'job'
	| 'shopping'
	| 'finance'
	| 'kontakt'
	| 'werbung'
	| 'system'
	| 'unsorted';

export type Actionability = 'actionable' | 'archive' | 'archive-silent';

export interface TimeDecayConfig {
	actionable_within_days: number;
	archive_within_days: number;
}

export interface UserContext {
	active_priorities: string[];
	time_decay: Record<Domain, TimeDecayConfig>;
}

const DEFAULT_CONTEXT: UserContext = {
	active_priorities: [],
	time_decay: {
		immo: { actionable_within_days: 90, archive_within_days: 180 },
		job: { actionable_within_days: 90, archive_within_days: 180 },
		kontakt: { actionable_within_days: 30, archive_within_days: 365 },
		shopping: { actionable_within_days: 14, archive_within_days: 60 },
		finance: { actionable_within_days: 60, archive_within_days: 2555 },
		werbung: { actionable_within_days: 3, archive_within_days: 7 },
		system: { actionable_within_days: 7, archive_within_days: 30 },
		unsorted: { actionable_within_days: 30, archive_within_days: 180 }
	}
};

let _cachedContext: UserContext | null = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function getUserContextPath(): string {
	return getUserContextYamlPath();
}

export function loadUserContext(): UserContext {
	const now = Date.now();
	if (_cachedContext && now - _cachedAt < CACHE_TTL_MS) {
		return _cachedContext;
	}
	const path = getUserContextPath();
	if (!existsSync(path)) {
		_cachedContext = DEFAULT_CONTEXT;
		_cachedAt = now;
		return _cachedContext;
	}
	try {
		const content = readFileSync(path, 'utf-8');
		const parsed = parseYaml(content) as Partial<UserContext> | null;
		if (!parsed || typeof parsed !== 'object') {
			_cachedContext = DEFAULT_CONTEXT;
		} else {
			_cachedContext = {
				active_priorities: parsed.active_priorities ?? [],
				time_decay: {
					...DEFAULT_CONTEXT.time_decay,
					...(parsed.time_decay ?? {})
				}
			};
		}
	} catch {
		_cachedContext = DEFAULT_CONTEXT;
	}
	_cachedAt = now;
	return _cachedContext;
}

const DOMAIN_PRIORITY_MAP: Partial<Record<Domain, string>> = {
	immo: 'hauskauf',
	job: 'jobsuche'
};

export function applyTimeDecay(
	domain: string | null,
	actionability: string | null,
	mailDate: string | null,
	context: UserContext
): Actionability | null {
	if (!domain || !actionability) return (actionability as Actionability) ?? null;
	const d = domain as Domain;
	const cfg = context.time_decay[d];
	if (!cfg) return actionability as Actionability;
	let result: Actionability = actionability as Actionability;
	if (mailDate) {
		const t = new Date(mailDate).getTime();
		if (Number.isFinite(t)) {
			const ageDays = (Date.now() - t) / 86400000;
			if (ageDays > cfg.archive_within_days) {
				result = 'archive-silent';
			} else if (ageDays > cfg.actionable_within_days) {
				result = 'archive';
			}
		}
	}
	// Active-Priorities-Boost: archive→actionable wenn domain ∈ active_priorities.
	// archive-silent bleibt unverändert (User-Wille explizit).
	const priority = DOMAIN_PRIORITY_MAP[d];
	if (priority && context.active_priorities.includes(priority) && result === 'archive') {
		result = 'actionable';
	}
	return result;
}
