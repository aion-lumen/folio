import { randomUUID } from 'node:crypto';
import { getFolioDb } from '../folio-db/init.js';
import { getMemoryFact, getMemoryReviewSnapshot, memorySnapshotDigest, proposeMemoryFact, confirmMemoryFactByHuman } from './store.js';
import { claimSlot, provenanceSnapshot } from './provenance.js';
import { CORRECTION_KINDS } from '../../memory/correction.js';
import type { MemoryFactRow, MemorySensitivity } from './types.js';

export interface ChangeDraft { value: string; predicate: string; valid_from: string | null; reason: string }
interface Snapshot { fact: MemoryFactRow; evidence: MemoryFactRow | null; provenance: unknown; evidenceProvenance: unknown; bundle: unknown; related: MemoryFactRow[]; entity: unknown }
interface RequestRow { request_id: string; owner_id: string; fact_id: string; evidence_fact_id: string | null; snapshot_digest: string; snapshot_json: string; instruction: string; draft_json: string; model: string; status: 'pending' | 'applied' | 'rejected'; replacement_fact_id: string | null; created_at: string; reviewed_at: string | null }
const rank: Record<MemorySensitivity, number> = { public: 0, private: 1, sensitive: 2 };
const text = (value: unknown, max: number) => {
 if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Ungültige oder zu lange Eingabe.');
 return value.trim();
};
export function changeSnapshot(factId: string, evidenceId?: string | null): Snapshot {
 const fact = getMemoryFact(factId);
 const evidence = evidenceId ? getMemoryFact(evidenceId) : null;
 if (!['candidate','confirmed'].includes(fact.status) || fact.object_entity_id || fact.source_kind === 'memory-consolidation') throw new Error('Dieser Fakt benötigt eine separate Strukturprüfung.');
 const bundle = fact.proposal_id ? getMemoryReviewSnapshot(fact.proposal_id) : null;
 const entity = fact.subject_entity_id ? getFolioDb().prepare('SELECT * FROM memory_entities WHERE entity_id=?').get(fact.subject_entity_id) as {status:string;domain:string} | undefined : null;
 if (fact.subject_entity_id && (!entity || entity.status !== 'confirmed' || entity.domain !== fact.domain)) throw new Error('Die Identität muss zuerst persönlich geklärt werden.');
 // Do not leave graph relationships or accepted summaries asserting the old value.
 if (bundle && (bundle.bundle.relations.length || bundle.bundle.episodes.some(item => item.status === 'confirmed'))) throw new Error('Verknüpfte Beziehungen oder bestätigte Zusammenfassungen brauchen eine gemeinsame Prüfung.');
 if (evidence && (!['candidate','confirmed'].includes(evidence.status) || evidence.domain !== fact.domain || evidence.source_kind === 'memory-consolidation')) throw new Error('Beleg ist nicht verfügbar oder gehört zu einer anderen Domäne.');
 const provenance = provenanceSnapshot(fact);
 const evidenceProvenance = evidence ? provenanceSnapshot(evidence) : null;
 for (const p of [provenance, evidenceProvenance]) {
  for (const source of [p?.root,p?.source]) if (source && ['rejected','tombstoned'].includes((source as { status: string }).status)) throw new Error('Quelle wurde zurückgezogen.');
 }
 const related = (getFolioDb().prepare("SELECT * FROM memory_facts WHERE domain=? AND predicate=? AND status IN ('candidate','confirmed') ORDER BY fact_id").all(fact.domain,fact.predicate) as MemoryFactRow[])
  .filter(row => JSON.stringify(claimSlot(row).parts) === JSON.stringify(claimSlot(fact).parts) && (fact.subject_entity_id || row.subject === fact.subject));
 const summaries = getFolioDb().prepare("SELECT e.detail_json FROM memory_events e JOIN memory_facts f ON f.fact_id=e.fact_id WHERE f.status='confirmed' AND f.source_kind='memory-consolidation' AND e.event_type='confirmed'").all() as Array<{detail_json:string}>;
 if (summaries.some(row => {const detail = JSON.parse(row.detail_json); return Array.isArray(detail.source_fact_ids) && detail.source_fact_ids.includes(fact.fact_id);})) throw new Error('Eine bestätigte Zusammenfassung hängt von diesem Fakt ab. Gemeinsame Prüfung erforderlich.');
 return { fact, evidence, provenance, evidenceProvenance, bundle, related, entity };
}
export function validateChangeDraft(raw: unknown, fact: MemoryFactRow): ChangeDraft {
 if (!raw || typeof raw !== 'object' || Array.isArray(raw) || Object.keys(raw).sort().join() !== ['predicate','reason','valid_from','value'].join()) throw new Error('Das Modell hat keinen gültigen Änderungsvorschlag geliefert.');
 const d = raw as ChangeDraft;
 const value = text(d.value, 8000), reason = text(d.reason, 1000), predicate = text(d.predicate, 64);
 if (predicate !== fact.predicate && !CORRECTION_KINDS.some(kind => kind.predicate === predicate)) throw new Error('Diese Änderung der Aussageart ist nicht freigeschaltet.');
 if (d.valid_from !== null && (typeof d.valid_from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(d.valid_from) || !Number.isFinite(Date.parse(d.valid_from)) || new Date(d.valid_from).toISOString().slice(0,10) !== d.valid_from)) throw new Error('Ungültiges Ereignisdatum.');
 if (['paid','scheduled_for'].includes(predicate) && !d.valid_from) throw new Error('Zahlung und Termin brauchen ein belegtes Ereignisdatum.');
 if (predicate === fact.predicate && value === fact.value_text && d.valid_from === fact.valid_from) throw new Error('Die Aussage ist unverändert. Kein Korrekturvorschlag nötig.');
 return { value, reason, predicate, valid_from: d.valid_from };
}
export function stageMemoryChange(input: { snapshot: Snapshot; instruction: string; draft: unknown; model: string; owner: string }): string {
 const db = getFolioDb();
 return db.transaction(() => {
  const instruction = text(input.instruction,2000), owner = text(input.owner,120), model = text(input.model,240);
  const snapshot = changeSnapshot(input.snapshot.fact.fact_id,input.snapshot.evidence?.fact_id);
  const version = memorySnapshotDigest(snapshot);
  if (version !== memorySnapshotDigest(input.snapshot)) throw new Error('Fakt oder Beleg hat sich während der Modellprüfung geändert.');
  const draft = validateChangeDraft(input.draft,snapshot.fact);
  const id = randomUUID(), now = new Date().toISOString();
  db.prepare("INSERT INTO memory_change_requests (request_id,owner_id,fact_id,evidence_fact_id,snapshot_digest,snapshot_json,instruction,draft_json,model,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,'pending',?)").run(id,owner,snapshot.fact.fact_id,snapshot.evidence?.fact_id ?? null,version,JSON.stringify(snapshot),instruction,JSON.stringify(draft),model,now);
  ledger(id,'change_proposed','system',model,{ fact_id: snapshot.fact.fact_id, requested_by: owner });
  return id;
 })();
}
function ledger(id: string,event: string,kind: string,actor: string,detail: unknown) {
 getFolioDb().prepare("INSERT INTO memory_ledger (event_id,object_kind,object_id,event_type,actor_kind,actor_id,detail_json,recorded_at) VALUES (?,'projection',?,?,?,?,?,?)").run(randomUUID(),`memory-change:${id}`,event,kind,actor,JSON.stringify(detail),new Date().toISOString());
}
export function listMemoryChanges(owner: string) {
 return (getFolioDb().prepare('SELECT * FROM memory_change_requests WHERE owner_id=? ORDER BY created_at DESC LIMIT 30').all(owner) as RequestRow[]).map(row => {
  let stale = false;
  try { stale = memorySnapshotDigest(changeSnapshot(row.fact_id,row.evidence_fact_id)) !== row.snapshot_digest; } catch { stale = true; }
  return { ...row, snapshot: JSON.parse(row.snapshot_json) as Snapshot, draft: JSON.parse(row.draft_json) as ChangeDraft,
   version: memorySnapshotDigest(row), stale };
 });
}
/** Called only by owner-authenticated review action. The model never receives this capability. */
export function reviewMemoryChange(id: string, version: string, owner: string, decision: 'apply' | 'reject') {
 const db = getFolioDb();
 return db.transaction(() => {
  const row = db.prepare('SELECT * FROM memory_change_requests WHERE request_id=? AND owner_id=?').get(id,owner) as RequestRow | undefined;
  if (!row || row.status !== 'pending' || memorySnapshotDigest(row) !== version || !['apply','reject'].includes(decision)) throw new Error('Vorschlag verändert oder bereits entschieden. Bitte neu laden.');
  if (decision === 'reject') {
   db.prepare("UPDATE memory_change_requests SET status='rejected',reviewed_at=? WHERE request_id=?").run(new Date().toISOString(),id);
   ledger(id,'change_rejected','human',owner,{}); return null;
  }
  const snapshot = changeSnapshot(row.fact_id,row.evidence_fact_id);
  if (memorySnapshotDigest(snapshot) !== row.snapshot_digest) throw new Error('Fakt oder Beleg verändert. Bitte einen neuen Vorschlag vorbereiten.');
  const draft = validateChangeDraft(JSON.parse(row.draft_json),snapshot.fact), previous = snapshot.fact;
  const evidence = snapshot.evidence;
  const sensitivity = evidence && rank[evidence.sensitivity] > rank[previous.sensitivity] ? evidence.sensitivity : previous.sensitivity;
  const replacement = proposeMemoryFact({ ...previous, proposal_id: undefined,
   data_class: draft.predicate === previous.predicate ? previous.data_class : CORRECTION_KINDS.find(kind => kind.predicate === draft.predicate)!.dataClass,
   predicate: draft.predicate, value: draft.value, valid_from: draft.valid_from, sensitivity,
   source_kind: 'owner-instruction', source_ref: `memory-change:${id}`, source_excerpt: row.instruction,
   derived_from_external: !!evidence?.derived_from_external || previous.derived_from_external === 1,
   supersedes_fact_id: previous.fact_id, actor_kind: 'human', actor_id: owner });
  confirmMemoryFactByHuman(replacement.fact_id,owner);
  if (previous.status === 'candidate') {
   db.prepare("UPDATE memory_facts SET status='superseded',valid_to=? WHERE fact_id=?").run(new Date().toISOString(),previous.fact_id);
   db.prepare("INSERT INTO memory_events (event_id,fact_id,event_type,actor_kind,actor_id,detail_json,recorded_at) VALUES (?,?,'superseded','human',?,?,?)").run(randomUUID(),previous.fact_id,owner,JSON.stringify({ by: replacement.fact_id }),new Date().toISOString());
  }
  if (previous.proposal_id) {
   db.prepare("UPDATE memory_episodes SET status='rejected' WHERE proposal_id=? AND status='candidate'").run(previous.proposal_id);
  }
  db.prepare("UPDATE memory_change_requests SET status='applied',replacement_fact_id=?,reviewed_at=? WHERE request_id=?").run(replacement.fact_id,new Date().toISOString(),id);
  ledger(id,'change_applied','human',owner,{ previous_fact_id: previous.fact_id, replacement_fact_id: replacement.fact_id, evidence_fact_id: evidence?.fact_id ?? null, snapshot_digest: row.snapshot_digest });
  return replacement.fact_id;
 })();
}
