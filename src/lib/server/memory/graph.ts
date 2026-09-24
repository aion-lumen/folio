import { createHash } from 'node:crypto';
import { getFolioDb } from '../folio-db/init.js';
import type {
	MemoryEntityRow,
	MemoryEpisodeRow,
	MemoryFactRow,
	MemoryRelationRow,
	MemorySensitivity
} from './types.js';
import { listActiveMemorySources } from './sources.js';

export type MemoryGraphNodeKind = 'entity' | 'fact' | 'episode' | 'source' | 'domain';
export type MemoryGraphEdgeKind =
	| 'relation'
	| 'fact_subject'
	| 'fact_object'
	| 'episode'
	| 'source_domain'
	| 'evidence'
	| 'derived_from';

export interface MemoryGraphNode {
	id: string;
	kind: MemoryGraphNodeKind;
	domain: string;
	domains: string[];
	label: string;
	subtitle: string;
	sensitivity: MemorySensitivity;
	type: string;
	source_kind: string;
	source_ref: string;
	recorded_at: string;
}

export interface MemoryGraphEdge {
	id: string;
	kind: MemoryGraphEdgeKind;
	source: string;
	target: string;
	label: string;
}

export interface MemoryGraphProjection {
	schema: 'folio/memory-graph/v1';
	generated_at: string;
	nodes: MemoryGraphNode[];
	edges: MemoryGraphEdge[];
	stats: {
		entities: number;
		facts: number;
		episodes: number;
		relations: number;
		connected_nodes: number;
		isolated_nodes: number;
		sources: number;
		stored_sources: number;
		derived_sources: number;
		source_links: number;
		evidence_links: number;
		derived_links: number;
	};
	domains: Array<{ domain: string; nodes: number }>;
}

function compact(value: string, max = 150): string {
	const normalized = value.replace(/\s+/gu, ' ').trim();
	return normalized.length > max ? `${normalized.slice(0, max - 1)}…` : normalized;
}

function evidenceSourceId(sourceRef: string): string {
	return `evidence-source-${createHash('sha256').update(sourceRef).digest('hex').slice(0, 32)}`;
}

function evidenceSourceLabel(sourceKind: string): string {
	const labels: Record<string, string> = {
		owner: 'Manueller Beleg', manual: 'Manueller Beleg', mail: 'Mail-Beleg', file: 'Dateibeleg',
		'carta-cv': 'Carta-Beleg', 'memory-consolidation': 'Nachtschicht-Beleg'
	};
	return labels[sourceKind] ?? `${sourceKind.replaceAll('_', ' ')}-Beleg`;
}

function strongestSensitivity(values: MemorySensitivity[]): MemorySensitivity {
	if (values.includes('sensitive')) return 'sensitive';
	if (values.includes('private')) return 'private';
	return 'public';
}

const DOMAIN_LABELS: Record<string, string> = {
	ai: 'KI & Wissen',
	career: 'Karriere',
	finance: 'Finanzen',
	property: 'Immobilien',
	health: 'Gesundheit',
	family: 'Familie',
	personal: 'Persönlich',
	mobility: 'Mobilität',
	household: 'Haushalt',
	systems: 'Systeme',
	data_analytics: 'Daten & Analytics',
	undetermined: 'Ungeklärt'
};

export function buildMemoryGraph(): MemoryGraphProjection {
	const db = getFolioDb();
	const entities = db.prepare(
		"SELECT * FROM memory_entities WHERE status = 'confirmed' ORDER BY domain, canonical_label"
	).all() as MemoryEntityRow[];
	const facts = db.prepare(
		"SELECT * FROM memory_facts WHERE status = 'confirmed' ORDER BY domain, recorded_at"
	).all() as MemoryFactRow[];
	const relations = db.prepare(
		"SELECT * FROM memory_relations WHERE status = 'confirmed' ORDER BY domain, recorded_at"
	).all() as MemoryRelationRow[];
	const episodes = db.prepare(
		"SELECT * FROM memory_episodes WHERE status = 'confirmed' ORDER BY domain, occurred_at"
	).all() as MemoryEpisodeRow[];
	const episodeLinks = db.prepare(
		`SELECT ee.episode_id, ee.entity_id, ee.role
		 FROM memory_episode_entities ee
		 JOIN memory_episodes ep ON ep.episode_id = ee.episode_id AND ep.status = 'confirmed'
		 JOIN memory_entities en ON en.entity_id = ee.entity_id AND en.status = 'confirmed'
		 ORDER BY ee.episode_id, ee.entity_id, ee.role`
	).all() as Array<{ episode_id: string; entity_id: string; role: string }>;
	const storedSources = listActiveMemorySources();
	const evidenceObjects: Array<{
		id: string; domain: string; source_kind: string; source_ref: string;
		sensitivity: MemorySensitivity; recorded_at: string;
	}> = [
		...entities.map((row) => ({ id: row.entity_id, domain: row.domain, source_kind: row.source_kind, source_ref: row.source_ref, sensitivity: row.sensitivity, recorded_at: row.recorded_at })),
		...facts.map((row) => ({ id: row.fact_id, domain: row.domain, source_kind: row.source_kind, source_ref: row.source_ref, sensitivity: row.sensitivity, recorded_at: row.recorded_at })),
		...episodes.map((row) => ({ id: row.episode_id, domain: row.domain, source_kind: row.source_kind, source_ref: row.source_ref, sensitivity: row.sensitivity, recorded_at: row.recorded_at }))
	];
	const inferredSources = new Map<string, typeof evidenceObjects>();
	for (const object of evidenceObjects) {
		inferredSources.set(object.source_ref, [...(inferredSources.get(object.source_ref) ?? []), object]);
	}
	const storedByRef = new Map(storedSources.map((source) => [source.source_ref, source]));
	const storedSourceNodes: MemoryGraphNode[] = storedSources.map((source) => {
		const inferred = inferredSources.get(source.source_ref) ?? [];
		const domains = [...new Set([...source.domains.map((row) => row.domain), ...inferred.map((row) => row.domain)])].sort();
		const primary = source.domains.find((row) => row.role === 'primary')?.domain ?? inferred[0]?.domain ?? domains[0] ?? 'undetermined';
		return {
			id: source.source_id, kind: 'source', domain: primary, domains,
			label: compact(source.title, 70), subtitle: compact(source.relative_path ?? 'Belegte Quelle'),
			sensitivity: source.sensitivity,
			type: source.status === 'confirmed' ? 'confirmed_source' : 'source_candidate',
			source_kind: source.source_kind, source_ref: source.source_ref, recorded_at: source.recorded_at
		};
	});
	const derivedSourceNodes: MemoryGraphNode[] = [...inferredSources.entries()]
		.filter(([sourceRef]) => !storedByRef.has(sourceRef))
		.map(([sourceRef, objects]) => {
			const domains = [...new Set(objects.map((row) => row.domain))].sort();
			return {
				id: evidenceSourceId(sourceRef), kind: 'source', domain: domains[0] ?? 'undetermined', domains,
				label: evidenceSourceLabel(objects[0].source_kind), subtitle: compact(sourceRef),
				sensitivity: strongestSensitivity(objects.map((row) => row.sensitivity)),
				type: 'derived_evidence_source', source_kind: objects[0].source_kind,
				source_ref: sourceRef, recorded_at: objects[0].recorded_at
			};
		});
	const sourceNodes = [...storedSourceNodes, ...derivedSourceNodes];
	const sourceNodeByRef = new Map(sourceNodes.map((source) => [source.source_ref, source]));
	const sourceDomainIds = [...new Set([
		...sourceNodes.flatMap((source) => source.domains),
		...entities.map((row) => row.domain), ...facts.map((row) => row.domain), ...episodes.map((row) => row.domain)
	])].sort();

	const nodes: MemoryGraphNode[] = [
		...sourceDomainIds.map((domain) => ({
			id: `domain:${domain}`,
			kind: 'domain' as const,
			domain,
			domains: [domain],
			label: DOMAIN_LABELS[domain] ?? domain,
			subtitle: 'Domänenknoten für bestätigte Quellenzuordnungen',
			sensitivity: 'public' as const,
			type: 'domain',
			source_kind: 'memory',
			source_ref: `memory:domain:${domain}`,
			recorded_at: new Date(0).toISOString()
		})),
		...entities.map((entity) => ({
			id: entity.entity_id,
			kind: 'entity' as const,
			domain: entity.domain,
			domains: [entity.domain],
			label: entity.canonical_label,
			subtitle: entity.entity_type,
			sensitivity: entity.sensitivity,
			type: entity.entity_type,
			source_kind: entity.source_kind,
			source_ref: entity.source_ref,
			recorded_at: entity.recorded_at
		})),
		...facts.map((fact) => ({
			id: fact.fact_id,
			kind: 'fact' as const,
			domain: fact.domain,
			domains: [fact.domain],
			label: compact(fact.subject, 70),
			subtitle: compact(fact.value_text),
			sensitivity: fact.sensitivity,
			type: fact.data_class,
			source_kind: fact.source_kind,
			source_ref: fact.source_ref,
			recorded_at: fact.recorded_at
		})),
		...episodes.map((episode) => ({
			id: episode.episode_id,
			kind: 'episode' as const,
			domain: episode.domain,
			domains: [episode.domain],
			label: compact(episode.title, 70),
			subtitle: compact(episode.summary),
			sensitivity: episode.sensitivity,
			type: episode.episode_type,
			source_kind: episode.source_kind,
			source_ref: episode.source_ref,
			recorded_at: episode.recorded_at
		})),
		...sourceNodes
	];
	const nodeIds = new Set(nodes.map((node) => node.id));
	const edges: MemoryGraphEdge[] = [];
	for (const relation of relations) {
		if (!nodeIds.has(relation.subject_entity_id) || !nodeIds.has(relation.object_entity_id)) continue;
		edges.push({
			id: `relation:${relation.relation_id}`,
			kind: 'relation',
			source: relation.subject_entity_id,
			target: relation.object_entity_id,
			label: relation.relation_type
		});
	}
	for (const fact of facts) {
		if (fact.subject_entity_id && nodeIds.has(fact.subject_entity_id)) {
			edges.push({ id: `fact-subject:${fact.fact_id}`, kind: 'fact_subject', source: fact.subject_entity_id, target: fact.fact_id, label: fact.predicate });
		}
		if (fact.object_entity_id && nodeIds.has(fact.object_entity_id)) {
			edges.push({ id: `fact-object:${fact.fact_id}`, kind: 'fact_object', source: fact.fact_id, target: fact.object_entity_id, label: fact.predicate });
		}
	}
	for (const link of episodeLinks) {
		edges.push({ id: `episode:${link.episode_id}:${link.entity_id}:${link.role}`, kind: 'episode', source: link.entity_id, target: link.episode_id, label: link.role });
	}
	for (const object of evidenceObjects) {
		const source = sourceNodeByRef.get(object.source_ref);
		if (!source) continue;
		edges.push({ id: `evidence:${source.id}:${object.id}`, kind: 'evidence', source: source.id, target: object.id, label: 'belegt' });
	}
	const derivedEdgeIds = new Set<string>();
	const derivations = db.prepare(
		"SELECT fact_id, detail_json FROM memory_events WHERE event_type = 'confirmed' AND detail_json LIKE '%source_fact_ids%'"
	).all() as Array<{ fact_id: string; detail_json: string }>;
	for (const derivation of derivations) {
		if (!nodeIds.has(derivation.fact_id)) continue;
		try {
			const detail = JSON.parse(derivation.detail_json) as { source_fact_ids?: unknown };
			if (!Array.isArray(detail.source_fact_ids)) continue;
			for (const sourceFactId of detail.source_fact_ids) {
				if (typeof sourceFactId !== 'string' || !nodeIds.has(sourceFactId)) continue;
				const id = `derived:${derivation.fact_id}:${sourceFactId}`;
				if (derivedEdgeIds.has(id)) continue;
				derivedEdgeIds.add(id);
				edges.push({ id, kind: 'derived_from', source: derivation.fact_id, target: sourceFactId, label: 'abgeleitet aus' });
			}
		} catch {
			// Historical ledger details are untrusted projection input; malformed rows add no edge.
		}
	}
	for (const source of sourceNodes) {
		for (const domain of source.domains) {
			edges.push({
				id: `source-domain:${source.id}:${domain}`,
				kind: 'source_domain',
				source: `domain:${domain}`,
				target: source.id,
				label: domain === source.domain ? 'Hauptdomäne' : 'betrifft auch'
			});
		}
	}

	const connected = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
	const domains = [...nodes.reduce((counts, node) => {
		for (const domain of node.domains) counts.set(domain, (counts.get(domain) ?? 0) + 1);
		return counts;
	}, new Map<string, number>())]
		.map(([domain, count]) => ({ domain, nodes: count }))
		.sort((left, right) => right.nodes - left.nodes || left.domain.localeCompare(right.domain));
	return {
		schema: 'folio/memory-graph/v1',
		generated_at: new Date().toISOString(),
		nodes,
		edges,
		stats: {
			entities: entities.length,
			facts: facts.length,
			episodes: episodes.length,
			relations: relations.length,
			connected_nodes: connected.size,
			isolated_nodes: nodes.length - connected.size,
			sources: sourceNodes.length,
			stored_sources: storedSourceNodes.length,
			derived_sources: derivedSourceNodes.length,
			source_links: sourceNodes.reduce((count, row) => count + row.domains.length, 0),
			evidence_links: evidenceObjects.length,
			derived_links: derivedEdgeIds.size
		},
		domains
	};
}
