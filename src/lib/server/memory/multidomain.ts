import { getFolioDb } from '../folio-db/init.js';
import { getMemoryProposalBundle } from './store.js';

export const CONTENT_DOMAINS = ['career', 'finance', 'immo', 'personal', 'projects', 'health', 'knowledge'] as const;
const FILE_DOMAIN_ALIASES: Record<string, string> = { property:'immo', private:'personal', family:'personal', mobility:'personal', household:'personal', systems:'projects', data_analytics:'projects', ai:'knowledge' };
export const canonicalMemoryDomain = (domain: string): string => FILE_DOMAIN_ALIASES[domain] ?? domain;
export const isContentDomain = (value: unknown): value is string => typeof value === 'string' && (CONTENT_DOMAINS as readonly string[]).includes(canonicalMemoryDomain(value));

/** A financial claim keeps its protection even when the source is a property letter. */
export function factDomain(fact: { domain?: string; predicate: string; data_class?: string }, fallback: string): string {
	if (fact.predicate === 'paid' || fact.data_class === 'transaction' || fact.data_class === 'account_reference') return 'finance';
	return canonicalMemoryDomain(fact.domain ?? fallback);
}

export function claimKey(fact: { subject: string; predicate: string; value: string; valid_from?: string | null }): string {
	return [fact.subject, fact.predicate, fact.value, fact.valid_from ?? ''].map(value => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('de-CH')).join('\0');
}

/** One claim is stored once, rather than copied into every source domain. Different values remain reviewable. */
export function uniqueDomainFacts<T extends { domain?: string; subject: string; predicate: string; value: string; sensitivity: string; data_class?: string; valid_from?: string | null }>(facts: T[], fallback: string): Array<T & { domain: string }> {
	const unique = new Map<string, T & { domain: string }>();
	for (const fact of facts) {
		const domain = factDomain(fact, fallback);
		const value = { ...fact, domain, sensitivity: domain === 'finance' || domain === 'health' ? 'sensitive' : fact.sensitivity };
		const key = claimKey(value), previous = unique.get(key);
		if (!previous || value.domain === 'finance') unique.set(key, value);
		else if (value.sensitivity === 'sensitive') previous.sensitivity = 'sensitive';
	}
	return [...unique.values()];
}

export function sourceBundles(sourceRef: string) {
	return (getFolioDb().prepare("SELECT proposal_id FROM memory_proposals WHERE source_ref=? AND status IN ('candidate','confirmed') ORDER BY created_at, rowid").all(sourceRef) as { proposal_id: string }[]).map(row => getMemoryProposalBundle(row.proposal_id));
}

export function relatedSourceFacts(sourceRef: string, proposalId: string) {
 return sourceBundles(sourceRef).filter(b => b.proposal.proposal_id !== proposalId).flatMap(b => b.facts.filter(f => ['candidate','confirmed'].includes(f.status)).map(f => ({ id:f.fact_id, domain:f.domain, subject:f.subject, predicate:f.predicate, value:f.value_text, quote:f.source_excerpt }))).sort((a,b)=>a.id.localeCompare(b.id));
}
