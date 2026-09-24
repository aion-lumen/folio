import { error, fail } from '@sveltejs/kit';
import { isDemoVaultActive } from '$lib/server/env.js';
import { getMemoryFact } from '$lib/server/memory/store.js';
import { getFolioDb } from '$lib/server/folio-db/init.js';
import type { MemoryFactRow } from '$lib/server/memory/types.js';
import { listMemoryChanges, reviewMemoryChange } from '$lib/server/memory/changes.js';
import { prepareMemoryChange } from '$lib/server/focus/memory-change.js';
import type { PageServerLoad, Actions } from './$types';

function owner(locals: App.Locals) {
 if (locals.user?.role !== 'owner' || isDemoVaultActive()) throw error(403,'Nur im privaten Owner-Arbeitsraum verfügbar.');
 return `owner:${locals.user.id}`;
}
function field(data: FormData, key: string, max: number) {
 const value = data.get(key);
 if (data.getAll(key).length !== 1 || typeof value !== 'string' || !value.trim() || value.length > max) throw new Error('Ungültige Eingabe.');
 return value.trim();
}
function origin(request: Request,url: URL) {
 if (request.headers.get('origin') !== url.origin) throw error(403,'Ursprung nicht zugelassen.');
}
export const load: PageServerLoad = ({locals,url}) => {
 const actor = owner(locals);
 const query = (url.searchParams.get('q') ?? '').trim().slice(0,200);
 const selected = url.searchParams.get('fact') ?? '';
 const facts = getFolioDb().prepare("SELECT * FROM memory_facts WHERE status IN ('candidate','confirmed') AND source_kind <> 'memory-consolidation' AND (?='' OR instr(lower(subject || ' ' || value_text),lower(?))>0) ORDER BY recorded_at DESC LIMIT 200").all(query,query) as MemoryFactRow[];
 if (selected && !facts.some(f=>f.fact_id===selected)) {
  try { const fact=getMemoryFact(selected);if (['candidate','confirmed'].includes(fact.status) && fact.source_kind !== 'memory-consolidation') facts.unshift(fact); } catch { /* Stale deep link remains unselected. */ }
 }
 return { changes:listMemoryChanges(actor), selected, query, facts };
};
export const actions: Actions = {
 prepare: async ({locals,request,url}) => {
  const actor = owner(locals); origin(request,url);
  try {
   const data = await request.formData();
   const id = await prepareMemoryChange(field(data,'fact_id',64),String(data.get('evidence_id') ?? '').trim() || null,field(data,'instruction',2000),actor,request.signal);
   return { success:true,message:'Vorschlag vorbereitet. Noch kein Fakt wurde geändert.',requestId:id };
  } catch (e) { return fail(409,{message:e instanceof Error ? e.message : 'Vorschlag nicht möglich.'}); }
 },
 review: async ({locals,request,url}) => {
  const actor = owner(locals); origin(request,url);
  try {
   const data = await request.formData(), decision = field(data,'decision',10);
   if (!['apply','reject'].includes(decision) || (decision === 'apply' && data.get('slide_approved') !== 'yes')) throw new Error('Ausdrückliche Slidefreigabe fehlt.');
   reviewMemoryChange(field(data,'request_id',64),field(data,'version',64),actor,decision as 'apply'|'reject');
   return { success:true,message:decision === 'apply' ? 'Freigegeben und nachvollziehbar übernommen. Der vorige Fakt bleibt in der Historie.' : 'Vorschlag verworfen. Fakten unverändert.' };
  } catch (e) { return fail(409,{message:e instanceof Error ? e.message : 'Freigabe nicht möglich.'}); }
 }
};
