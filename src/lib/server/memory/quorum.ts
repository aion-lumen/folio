import { createHash, randomUUID } from 'node:crypto';
import { getFolioDb } from '../folio-db/init.js';
import type { MemoryEntityRow, MemoryFactRow, MemorySensitivity } from './types.js';
import { claimSlot, factOrigin, provenanceSnapshot, sourceRoot } from './provenance.js';

export const QUORUM_POLICY = 'independent-origins/v2';
const norm = (value: string) => value.normalize('NFKC').replace(/\s+/gu, ' ').trim().toLocaleLowerCase('de-CH');
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const rank: Record<MemorySensitivity, number> = { public: 0, private: 1, sensitive: 2 };

export interface MemoryOriginAttestation {
	attestation_id: string; source_ref: string; source_digest: string;
	family_key: string; document_key: string; content_hash: string;
	evidence_ref: string; rationale: string; supported_fact_ids: string; status: 'verified' | 'revoked';
	reviewed_by: string; recorded_at: string;
}
export interface MemoryQuorumClaim {
	claim_key: string;
	fact: MemoryFactRow;
	supporting_fact_ids: string[];
	covered_fact_ids: string[];
	pending_fact_ids: string[];
	origin_ids: string[];
	source_count: number;
	sensitivity: MemorySensitivity;
	evidence_digest: string;
	state: 'eligible' | 'source_confirmed' | 'blocked';
	reason: string;
}

/** Freezes provenance against the actual stored source and its extracted facts. */
export function memoryOriginDigest(sourceRef: string): string {
	const db = getFolioDb();
	const facts = db.prepare('SELECT fact_id, domain, subject, predicate, value_text, source_kind, source_excerpt, derived_from_external, subject_entity_id, object_entity_id, entity_ref, entity_type, valid_from, valid_to FROM memory_facts WHERE source_ref = ? ORDER BY fact_id').all(sourceRef);
	if (!facts.length) throw new Error('Unbekannte Memory-Quelle.');
	const source = db.prepare('SELECT source_kind, content_hash, origin_document_id, status FROM memory_sources WHERE source_ref = ?').get(sourceRef) ?? null;
	const provenance = (facts as Array<{ fact_id: string }>).map((fact) => provenanceSnapshot({ ...fact, source_ref: sourceRef }));
	return digest({ source, facts, provenance });
}

/** Trusted local maintenance only: never expose this to an extractor or an LLM tool. */
export function attestMemoryOrigin(input: Omit<MemoryOriginAttestation, 'attestation_id' | 'recorded_at' | 'reviewed_by'>, reviewer: string): string {
	const db = getFolioDb();
	return db.transaction(() => {
		for (const [key, value] of Object.entries(input)) if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > 2000) throw new Error(`Ungültige Herkunftsangabe: ${key}`);
		if (!reviewer.trim() || !['verified', 'revoked'].includes(input.status) || !/^[a-f0-9]{64}$/.test(input.content_hash)) throw new Error('Ungültige Herkunftsprüfung.');
		if (memoryOriginDigest(input.source_ref) !== input.source_digest) throw new Error('Quelle verändert; Herkunft erneut prüfen.');
		const supported = JSON.parse(input.supported_fact_ids) as unknown;
		if (!Array.isArray(supported) || !supported.length || supported.length > 100 || supported.some((id) => typeof id !== 'string') || new Set(supported).size !== supported.length) throw new Error('Geprüfte Fakten müssen eindeutig angegeben werden.');
		for (const id of supported) if (!db.prepare('SELECT 1 FROM memory_facts WHERE fact_id = ? AND source_ref = ?').get(id, input.source_ref)) throw new Error('Geprüfter Fakt gehört nicht zur Quelle.');
		const source = db.prepare('SELECT status, content_hash FROM memory_sources WHERE source_ref = ?').get(input.source_ref) as { status: string; content_hash: string | null } | undefined;
		for (const id of supported) {
			const binding = factOrigin(id);
			if (input.status === 'verified' && sourceRoot(input.source_ref) !== input.source_ref && !binding) throw new Error('Historische Root-Dokumentversion fehlt.');
			if (input.status === 'verified' && binding && binding.content_hash !== input.content_hash) throw new Error('Historischer Dokumenthash stimmt nicht überein.');
			const root = db.prepare('SELECT status FROM memory_sources WHERE source_ref=?').get(binding?.root_ref ?? sourceRoot(input.source_ref)) as { status: string } | undefined;
			if (input.status === 'verified' && root && ['rejected','tombstoned'].includes(root.status)) throw new Error('Ursprungsquelle zurückgezogen.');
		}
		if (input.status === 'verified' && source && (['rejected', 'tombstoned'].includes(source.status) || (source.content_hash && source.content_hash !== input.content_hash))) throw new Error('Quelle zurückgezogen oder Inhaltshash stimmt nicht überein.');
		if (db.prepare("SELECT 1 FROM memory_facts WHERE source_ref = ? AND source_kind IN ('memory-consolidation','owner-instruction')").get(input.source_ref)) throw new Error('Eigene Zusammenfassungen oder Agentenkorrekturen können keine unabhängige Quelle sein.');
		const id = randomUUID();
		const now = new Date().toISOString();
		db.prepare('INSERT INTO memory_origin_attestations (attestation_id,source_ref,source_digest,family_key,document_key,content_hash,evidence_ref,rationale,supported_fact_ids,status,reviewed_by,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(id, input.source_ref, input.source_digest, input.family_key, input.document_key, input.content_hash, input.evidence_ref, input.rationale, input.supported_fact_ids, input.status, reviewer, now);
		db.prepare("INSERT INTO memory_ledger (event_id,object_kind,object_id,event_type,actor_kind,actor_id,detail_json,recorded_at) VALUES (?,'projection',?,'origin_attested','human',?,?,?)").run(randomUUID(), `memory-origin:${id}`, reviewer, JSON.stringify({ source_ref: input.source_ref, status: input.status, evidence_ref: input.evidence_ref }), now);
		return id;
	})();
}

/** Conservatively joins origins linked by issuer, original document OR content. */
function independentCount(origins: MemoryOriginAttestation[], selected: Set<string>): number {
	const parents = origins.map((_, index) => index);
	const root = (i: number): number => parents[i] === i ? i : (parents[i] = root(parents[i]));
	const seen = new Map<string, number>();
	origins.forEach((origin, i) => {
		const bindings = (JSON.parse(origin.supported_fact_ids) as string[]).map(factOrigin).filter((item) => !!item);
		for (const key of [`family:${norm(origin.family_key)}`, `document:${norm(origin.document_key)}`, `hash:${origin.content_hash}`, `root:${sourceRoot(origin.source_ref)}`, ...bindings.map((item) => `root:${item.root_ref}`)]) {
			const previous = seen.get(key);
			if (previous !== undefined) parents[root(i)] = root(previous);
			else seen.set(key, i);
		}
	});
	return new Set(origins.flatMap((origin, i) => selected.has(origin.attestation_id) ? [root(i)] : [])).size;
}

export function inspectMemoryQuorum(): MemoryQuorumClaim[] {
	const db = getFolioDb();
	const facts = db.prepare("SELECT * FROM memory_facts WHERE status IN ('candidate','confirmed') ORDER BY recorded_at, fact_id").all() as MemoryFactRow[];
	const entities = new Map((db.prepare("SELECT * FROM memory_entities WHERE status = 'confirmed'").all() as MemoryEntityRow[]).map((entity) => [entity.entity_id, entity]));
	const latest = new Map<string, MemoryOriginAttestation>();
	for (const origin of db.prepare('SELECT * FROM memory_origin_attestations ORDER BY rowid').all() as MemoryOriginAttestation[]) latest.set(origin.source_ref, origin);
	const origins = new Map([...latest].filter(([ref, origin]) => {
		try { return origin.status === 'verified' && memoryOriginDigest(ref) === origin.source_digest; }
		catch { return false; } // A forgotten source invalidates its proof, not the whole page.
	}));
	const receipts = new Set((db.prepare('SELECT evidence_digest FROM memory_quorum_receipts WHERE policy_version = ?').all(QUORUM_POLICY) as Array<{ evidence_digest: string }>).map((row) => row.evidence_digest));
	const decisions = db.prepare("SELECT * FROM memory_facts WHERE status IN ('rejected','tombstoned')").all() as MemoryFactRow[];
	const refusedIds = new Set(decisions.map((row) => row.fact_id));
	const refusedClaims = new Set(decisions.filter((row) => row.subject_entity_id).map((row) => digest(claimSlot(row).parts)));
	for (const receipt of db.prepare('SELECT claim_key, supporting_fact_ids FROM memory_quorum_receipts').all() as Array<{ claim_key: string; supporting_fact_ids: string }>) {
		if ((JSON.parse(receipt.supporting_fact_ids) as string[]).some((id) => refusedIds.has(id))) refusedClaims.add(receipt.claim_key);
	}
	const groups = new Map<string, MemoryFactRow[]>();
	for (const fact of facts) {
		if (fact.source_kind === 'memory-consolidation') continue;
		const entity = fact.subject_entity_id ? entities.get(fact.subject_entity_id) : undefined;
		if (!entity || entity.domain !== fact.domain) continue; // Never merge people by a name alone.
		const key = digest(claimSlot(fact).parts);
		groups.set(key, [...(groups.get(key) ?? []), fact]);
	}
	const result: MemoryQuorumClaim[] = [];
	for (const [key, rows] of groups) {
		const qualified = rows.filter((row) => {
			const origin = origins.get(row.source_ref);
			return origin && (JSON.parse(origin.supported_fact_ids) as string[]).includes(row.fact_id)
				&& (row.source_excerpt || factOrigin(row.fact_id)?.excerpt)
				&& norm(row.source_excerpt || factOrigin(row.fact_id)!.excerpt).includes(norm(row.value_text));
		});
		const fact = qualified.find((row) => row.status === 'confirmed') ?? qualified[0] ?? rows[0];
		const proofOrigins = [...new Map(qualified.map((row) => [row.source_ref, origins.get(row.source_ref)!])).values()];
		const count = independentCount([...origins.values()], new Set(proofOrigins.map((origin) => origin.attestation_id)));
		const ids = qualified.map((row) => row.fact_id).sort();
		const originIds = proofOrigins.map((origin) => origin.attestation_id).sort();
		const evidenceDigest = digest([QUORUM_POLICY, key, qualified, originIds, count]);
		const reason = refusedClaims.has(key) ? 'Frühere Ablehnung oder Löschung braucht persönliche Klärung.'
			: rows.some((row) => claimSlot(row).ambiguous) ? 'Eigenschaftszuordnung ist noch nicht eindeutig geprüft.'
			: rows.some((row) => row.valid_from || row.valid_to) ? 'Zeitliche Gültigkeit muss separat geprüft werden.'
			: new Set(rows.map((row) => JSON.stringify([norm(row.value_text), row.object_entity_id, row.data_class]))).size !== 1 ? 'Abweichende Aussagen oder offener Widerspruch.'
			: rows.some((row) => row.supersedes_fact_id) ? 'Offene Korrektur oder Ersetzung braucht Freigabe.'
			: qualified.length < 4 ? 'Herkunft oder Aussagebeleg noch nicht für vier Ursprünge geprüft.'
			: count < 4 ? 'Weniger als vier unabhängige Ursprungsfamilien.' : '';
		const sensitivity = rows.reduce<MemorySensitivity>((level, row) => rank[row.sensitivity] > rank[level] ? row.sensitivity : level, entities.get(fact.subject_entity_id!)!.sensitivity);
		result.push({ claim_key: key, fact, supporting_fact_ids: ids, covered_fact_ids: rows.map((row) => row.fact_id), pending_fact_ids: rows.filter((row) => row.status === 'candidate').map((row) => row.fact_id), origin_ids: originIds, source_count: count, sensitivity, evidence_digest: evidenceDigest,
			state: reason ? 'blocked' : receipts.has(evidenceDigest) ? 'source_confirmed' : 'eligible', reason });
	}
	return result;
}

/** Night-shift write: receipts only. Human status, source rows and graphs stay intact. */
export function runMemoryQuorum(): { confirmed: number; blocked: number; active: number } {
	const db = getFolioDb();
	return db.transaction(() => {
		const claims = inspectMemoryQuorum();
		let confirmed = 0;
		for (const claim of claims.filter((row) => row.state === 'eligible')) {
			const id = randomUUID();
			const now = new Date().toISOString();
			const inserted = db.prepare('INSERT OR IGNORE INTO memory_quorum_receipts (receipt_id,claim_key,canonical_fact_id,evidence_digest,supporting_fact_ids,origin_ids,source_count,policy_version,recorded_at) VALUES (?,?,?,?,?,?,?,?,?)').run(id, claim.claim_key, claim.fact.fact_id, claim.evidence_digest, JSON.stringify(claim.supporting_fact_ids), JSON.stringify(claim.origin_ids), claim.source_count, QUORUM_POLICY, now);
			if (!inserted.changes) continue;
			db.prepare("INSERT INTO memory_ledger (event_id,object_kind,object_id,event_type,actor_kind,actor_id,detail_json,recorded_at) VALUES (?,'fact',?,'source_confirmed','system',?,?,?)").run(randomUUID(), claim.fact.fact_id, QUORUM_POLICY, JSON.stringify({ receipt_id: id, source_count: claim.source_count, supporting_fact_ids: claim.supporting_fact_ids }), now);
			confirmed++;
		}
		return { confirmed, blocked: claims.filter((row) => row.state === 'blocked').length, active: claims.filter((row) => row.state !== 'blocked').length };
	})();
}

/** Recheck at every read; revoked evidence or a new conflict invalidates old receipts immediately. */
export function listSourceConfirmedMemory(): MemoryQuorumClaim[] {
	return inspectMemoryQuorum().filter((claim) => claim.state === 'source_confirmed');
}
