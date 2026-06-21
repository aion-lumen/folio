// regelwerk loader — reads ~/Projects/aion-lumen/multi-agent/config/regelwerk.yaml
// Direktive 2026-05-26: zentrale Klassifikations-Regel-Quelle, von Heuristik
// (Python), Validator (Python) und UI (TypeScript) gelesen. UI-Labels +
// action_definitions + priority_relevance + voice_consensus stammen aus dieser
// einen Datei, damit eine Regel-Änderung = ein Edit ist.
//
// Pattern analog zu time-decay.ts: 5-min in-memory cache, Cross-Repo-Read
// via homedir(), Fallback auf DEFAULT_REGELWERK bei Fehlern.

import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { getRegelwerkPath } from '../env.js';
import { loadUserContext } from '$lib/server/feedback/time-decay.js';
import type { Actionability, Domain } from '$lib/server/feedback/time-decay.js';

export interface ActionDefinition {
	label: string;
	description: string;
	requires_decision: boolean;
}

export interface PriorityRule {
	domain: Domain;
	max_distance_km: number;
	fallback_unknown_plz: Actionability;
}

export interface Voice {
	id: string;
	role: 'deterministic' | 'primary_llm' | 'control_llm' | string;
	/** LM-Studio model id; null for non-LLM voices (heuristic). */
	lm_studio_model: string | null;
	/** Pre-json-loads strip applied to the LLM response text. */
	response_strip: 'none' | 'code_fence' | 'think';
	/** F4 (Direktive 2026-05-26): false → validator-loop skips this lens.
	 *  Optional, default true (backward-compat for yaml without the field). */
	enabled?: boolean;
}

export interface VoiceConsensus {
	voices: Voice[];
	strictness: 'strict' | 'majority';
	protection_clause: {
		on_disagreement: 'route_to_actionable_always';
	};
}

export interface Regelwerk {
	schema_version: string;
	mode: 'manual' | 'auto';
	action_definitions: Record<Actionability, ActionDefinition>;
	priority_relevance: Record<string, PriorityRule>;
	voice_consensus: VoiceConsensus;
}

const DEFAULT_REGELWERK: Regelwerk = {
	schema_version: 'v1',
	mode: 'manual',
	action_definitions: {
		actionable: {
			label: 'Aktionable',
			description: 'Erfordert Handlung/Entscheidung.',
			requires_decision: true
		},
		archive: {
			label: 'Archiv',
			description: 'Zur Kenntnis/Referenz, sichtbar bei Suche.',
			requires_decision: false
		},
		'archive-silent': {
			label: 'Archiv (stumm)',
			description: 'Nie wieder anschauen.',
			requires_decision: false
		}
	},
	priority_relevance: {},
	voice_consensus: {
		// Reihenfolge per Direktive 2026-05-26 §2.3: Lens 1=gemma, 2=qwen3.6, 3=qwen-thinking.
		// `enabled` default true (in DEFAULT; backward-compat-fallback wenn yaml es weglässt).
		voices: [
			{
				id: 'heuristic',
				role: 'deterministic',
				lm_studio_model: null,
				response_strip: 'none',
				enabled: true
			},
			{
				id: 'gemma-control',
				role: 'control_llm',
				lm_studio_model: 'gemma-4-26b-a4b-it-mlx',
				response_strip: 'code_fence',
				enabled: true
			},
			{
				id: 'qwen35b-lens',
				role: 'control_llm',
				lm_studio_model: 'qwen3.6-35b-a3b-ud-mlx',
				response_strip: 'code_fence',
				enabled: true
			},
			{
				id: 'qwen-validator',
				role: 'primary_llm',
				lm_studio_model: 'qwen3-30b-a3b-thinking-2507',
				response_strip: 'think',
				enabled: true
			}
		],
		strictness: 'strict',
		protection_clause: { on_disagreement: 'route_to_actionable_always' }
	}
};

let _cached: Regelwerk | null = null;
let _cachedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function regelwerkPath(): string {
	return getRegelwerkPath();
}

/** Reset the in-memory cache. Useful for tests + after a write. */
export function resetRegelwerkCache(): void {
	_cached = null;
	_cachedAt = 0;
}

/**
 * Load regelwerk.yaml; fallback to DEFAULT_REGELWERK on missing/error.
 * Does NOT validate cross-references — call validateRegelwerkAgainstContext()
 * explicitly when both regelwerk + user_context are needed.
 */
export function loadRegelwerk(): Regelwerk {
	const now = Date.now();
	if (_cached && now - _cachedAt < CACHE_TTL_MS) return _cached;

	const path = regelwerkPath();
	if (!existsSync(path)) {
		_cached = DEFAULT_REGELWERK;
		_cachedAt = now;
		return _cached;
	}

	try {
		const content = readFileSync(path, 'utf-8');
		const parsed = parseYaml(content) as Partial<Regelwerk> | null;
		if (!parsed || typeof parsed !== 'object') {
			_cached = DEFAULT_REGELWERK;
		} else {
			_cached = {
				schema_version: parsed.schema_version ?? DEFAULT_REGELWERK.schema_version,
				mode: parsed.mode ?? DEFAULT_REGELWERK.mode,
				action_definitions: {
					...DEFAULT_REGELWERK.action_definitions,
					...(parsed.action_definitions ?? {})
				},
				priority_relevance: parsed.priority_relevance ?? {},
				voice_consensus: {
					...DEFAULT_REGELWERK.voice_consensus,
					...(parsed.voice_consensus ?? {})
				}
			};
		}
	} catch (err) {
		console.warn('[regelwerk] load failed, falling back to default:', err);
		_cached = DEFAULT_REGELWERK;
	}
	_cachedAt = now;
	return _cached;
}

export class RegelwerkValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RegelwerkValidationError';
	}
}

/**
 * Enforce Cross-Reference: every user_context.active_priorities key must
 * exist as a key in regelwerk.priority_relevance. Throws on mismatch.
 * Per Direktive 2026-05-26: misconfiguration here can silently mis-classify
 * Suchabos, so we fail loud rather than continue.
 */
export function validateRegelwerkAgainstContext(
	regelwerk: Regelwerk,
	activePriorities: string[]
): void {
	const defined = new Set(Object.keys(regelwerk.priority_relevance));
	const missing = activePriorities.filter((p) => !defined.has(p));
	if (missing.length > 0) {
		throw new RegelwerkValidationError(
			`active_priorities ${JSON.stringify(missing)} not defined in regelwerk.priority_relevance ` +
				`(defined: ${JSON.stringify([...defined].sort())})`
		);
	}
}

/** Convenience: load both, validate, return regelwerk. */
export function loadRegelwerkValidated(): Regelwerk {
	const rw = loadRegelwerk();
	const uc = loadUserContext();
	validateRegelwerkAgainstContext(rw, uc.active_priorities);
	return rw;
}
