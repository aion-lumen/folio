import { claimSlot } from './provenance.js';
import type { MemoryFactRow } from './types.js';

const de = (value: unknown): string => typeof value === 'string' ? value : value && typeof value === 'object' ? String((value as Record<string, unknown>).de ?? (value as Record<string, unknown>).en ?? '') : '';
type Cv = { languages?: Array<{ name: unknown; level: unknown }>; projects?: Array<{ name: string; description: unknown; status: unknown }> };
export function cvVersionFields(cv: Cv) {
 return [
  ...(cv.languages ?? []).map((item, index) => ({ subject: de(item.name), predicate: 'level', value: de(item.level), locator: `/languages/${index}`, source_ref: `carta:cv:language:${index}` })),
  ...(cv.projects ?? []).map((item, index) => ({ subject: item.name, predicate: 'documents_own_project', value: `${de(item.description)} · ${de(item.status)}`, locator: `/projects/${index}`, source_ref: `carta:cv:own-project:${index}` }))
 ];
}
/** Read-only comparison. Position is a locator in this version, never a semantic match. */
export function compareCvVersion(facts: MemoryFactRow[], cv: Cv) {
 const fields = cvVersionFields(cv);
 return facts.filter(fact => fact.source_ref.startsWith('carta:cv:')).map(fact => {
  const slot = claimSlot(fact);
  const matches = fields.filter(field => JSON.stringify(claimSlot({ ...fact, ...field }).parts) === JSON.stringify(slot.parts));
  const field = !slot.ambiguous && matches.length === 1 ? matches[0] : null;
  return { fact_id: fact.fact_id, source_ref: fact.source_ref, subject: fact.subject, previous: fact.value_text,
   state: !field ? 'unresolved' : field.value === fact.value_text ? 'unchanged' : 'changed',
   proposed: field?.value ?? null, field_locator: field?.locator ?? null,
   apply_allowed: false };
 });
}
