import { getFolioDbPath, isDemoVaultActive } from '../env.js';
import { compileMemoryContext, type CompileMemoryContextInput, type MemoryContextBundle } from './compiler.js';
import { embeddingConfig } from './embedding.js';
import { semanticCandidates } from './semantic.js';

export function isExactMemoryQuery(query: string): boolean {
	return /\b[A-Z]{1,8}[-_/]\d{2,}\b|\b\d{4}[-./]\d{1,2}[-./]\d{1,2}\b|\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b|\b\d+[.,]\d{2}\s*(?:CHF|EUR|USD|€)|(?:\b(?:CHF|EUR|USD)\s*|€\s*)\d+(?:[\s\u00a0’\x27.,]\d{3})*[.,]\d{2}(?!\d)|\b[A-Z]{2}\d{2}[A-Z0-9 ]{10,}|[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.test(query);
}

/** Opt-in asynchronous entry point. Existing synchronous/finance consumers stay unchanged. */
export async function compileMemoryContextHybrid(raw: CompileMemoryContextInput): Promise<MemoryContextBundle> {
	return (await compileMemoryContextsHybrid(raw, [raw.domain]))[0];
}

/** One query, policy ceiling and semantic budget shared across domains. */
export async function compileMemoryContextsHybrid(raw: Omit<CompileMemoryContextInput, 'domain'>, domains: readonly string[]): Promise<MemoryContextBundle[]> {
	const as_of = raw.as_of ?? new Date().toISOString();
	const inputs = [...new Set(domains)].map(domain => ({ ...raw, domain, as_of }));
	const source = getFolioDbPath();
	// Validate every consumer/domain policy before any inference, even for excluded paths.
	const lexical = inputs.map(input => compileMemoryContext(input));
	const fallback = (bundle: MemoryContextBundle, semantic_status: NonNullable<MemoryContextBundle['retrieval']>['semantic_status']): MemoryContextBundle => ({ ...bundle,
		retrieval: { mode: 'lexical', semantic_status, semantic_fact_ids: [] } });
	const changedVault = () => lexical.map(bundle => ({ ...fallback(bundle, 'unavailable'), facts: [], entities: [], relations: [], episodes: [] }));
	const eligible = inputs.filter(input => !isDemoVaultActive() && input.domain !== 'finance' &&
		input.consumer_id !== 'ledger-local' && input.consumer_id !== 'relay-career' && input.query.trim() &&
		!isExactMemoryQuery(input.semantic_query ?? input.query));
	if (!eligible.length) return lexical.map(bundle => fallback(bundle, 'excluded'));
	try {
		const config = embeddingConfig();
		if (!config) return lexical.map(bundle => fallback(bundle, 'disabled'));
		const { seeds, status } = await semanticCandidates({ ...eligible[0], query: raw.semantic_query ?? raw.query }, config, eligible.map(input => input.domain));
		if (getFolioDbPath() !== source) return changedVault();
		// Recompile even on zero hits: a fact could have been withdrawn while embedding the query.
		return inputs.map(input => {
			if (!eligible.includes(input)) return fallback(compileMemoryContext(input), 'excluded');
			const bundle = compileMemoryContext(input, seeds);
			// Only actual, still-present seeds bypass the companion's word filter.
			// Sharing a person/project entity never transfers semantic relevance.
			const seedIds = seeds.filter(seed => bundle.facts.some(fact => fact.fact_id === seed.fact_id)).map(seed => seed.fact_id);
			return { ...bundle, retrieval: { mode: seedIds.length ? 'hybrid' : 'lexical', semantic_status: status, semantic_fact_ids: seedIds } };
		});
	} catch {
		if (getFolioDbPath() !== source) return changedVault();
		// Do not leak source text or endpoint response bodies into logs. Fresh lexical fallback.
		return inputs.map(input => fallback(compileMemoryContext(input), 'unavailable'));
	}
}
