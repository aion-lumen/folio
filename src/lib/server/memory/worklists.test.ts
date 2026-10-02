import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { mkdtempSync,rmSync,mkdirSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetFolioDbForTests } from '../folio-db/init.js';
import { proposeMemoryFact } from './store.js';
import { canonicalHash } from '../modules/ledger-books/reconciliation.js';
import { classifyMemoryWork,paymentReviewStates,memoryWorkProjection,type ReviewBundle } from './worklists.js';
const bundle=(predicates:string[],source='mail')=>({facts:predicates.map((predicate,i)=>({fact_id:String(i),predicate,status:'candidate'})),proposal:{source_kind:source},episodes:[]}) as unknown as ReviewBundle;
let dir:string;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'memory-work-'));vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));resetFolioDbForTests();});
afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
it('keeps unpaid evidence waiting until the exact monthly reconciliation is unresolved',()=>{
 expect(classifyMemoryWork(bundle(['paid']))).toMatchObject({lane:'processing',kind:'payment'});
 expect(classifyMemoryWork(bundle(['paid']),{},[{factId:'0',state:'decision',reason:'Open after statement'}])).toMatchObject({lane:'decision',question:'Open after statement'});
});
it('gives episode-only bundles and rejected low-value knowledge an actual question',()=>{
 expect(classifyMemoryWork(bundle([]))).toMatchObject({lane:'decision',kind:'event'});
 expect(classifyMemoryWork(bundle(['has_context']),{reason_codes:['transient_or_low_value']})).toMatchObject({lane:'decision',kind:'keep'});
});
it('separates technical repairs and retains per-object diagnosis',()=>{
 expect(classifyMemoryWork(bundle(['received_at']),{reason_codes:['date_not_explicit'],diagnostic:{unsupported_object_ids:['0']}})).toMatchObject({lane:'processing',kind:'repair',flagged:['0']});
 expect(classifyMemoryWork(bundle(['has_context'],'file')).kind).toBe('file');
});
it('requires complete coverage of the same account/month and current bound evidence',()=>{
 const fact=proposeMemoryFact({domain:'finance',data_class:'transaction',subject:'Synthetic invoice',predicate:'paid',value:'60 EUR',sensitivity:'private',source_kind:'mail',source_ref:'mail:demo:1',actor_kind:'system',actor_id:'test'});
 const evidence:any={candidate:{memory_binding:{fact_id:fact.fact_id,fact_sha256:canonicalHash(fact)},normalized_invoice:{due_date:'2026-09-15'},match_request:{account_refs:['A']}},result:{status:'not_found_with_complete_coverage',coverage:{complete_for_target:true}},batch:{sources:[{account_ref:'A',declared_period:{from:'2026-09-01',to:'2026-09-30'},control_result:{complete:true}}]},stale:false};
 expect(paymentReviewStates([evidence])[0].state).toBe('decision');
 for(const mutate of [(e:any)=>e.batch.sources[0].account_ref='B',(e:any)=>e.batch.sources[0].declared_period.to='2026-09-20',(e:any)=>e.result.coverage.complete_for_target=false,(e:any)=>e.result.status='unknown_due_to_missing_coverage']){const e=structuredClone(evidence);mutate(e);expect(paymentReviewStates([e])[0].state).toBe('waiting');}
 expect(paymentReviewStates([{...evidence,stale:true}])).toEqual([]);
 evidence.candidate.memory_binding.fact_sha256='old';expect(paymentReviewStates([evidence])).toEqual([]);
});

it('replaces an old generic repair question with the actual tracker-link question',()=>{
 const b={...bundle(['has_application_status']),proposal:{proposal_id:'case',source_kind:'mail',domain:'career'},entities:[]} as unknown as ReviewBundle;
 const question={lane:'decision' as const,kind:'identity',question:'Welche Stelle gehört zu dieser Mail?',reasons:[],flagged:[]};
 const work=memoryWorkProjection([b],new Map([['case',{reason_codes:['overinterpretation']}]]),[],new Set(['case']),new Map([['case',question]]));
 expect(work.items[0].work).toEqual(question);
 expect(work.counts).toEqual({decision:1,processing:0});
});

it('keeps covered decisions under processing while a monthly batch has not finished',()=>{
 const fact=proposeMemoryFact({domain:'finance',data_class:'transaction',subject:'Synthetic invoice',predicate:'paid',value:'60 EUR',sensitivity:'private',source_kind:'mail',source_ref:'mail:demo:1',actor_kind:'system',actor_id:'test'});
 const e:any={candidate:{memory_binding:{fact_id:fact.fact_id,fact_sha256:canonicalHash(fact)},normalized_invoice:{due_date:'2026-09-15'},match_request:{account_refs:['A']}},result:{status:'not_found_with_complete_coverage',coverage:{complete_for_target:true}},batch:{sources:[{account_ref:'A',declared_period:{from:'2026-09-01',to:'2026-09-30'},control_result:{complete:true}}]},stale:false};
 mkdirSync(join(dir,'memory-work'));writeFileSync(join(dir,'memory-work','config.json'),JSON.stringify({statement_scope:'configured',monthly_payments:true}));
 expect(paymentReviewStates([e])[0]).toMatchObject({state:'waiting',reason:'Monatsabgleich läuft oder wartet auf Fortsetzung'});
});
it('keeps contract context and broker trades out of the bank payment lane',()=>{
 expect(classifyMemoryWork(bundle(['paid']),{},[{factId:'0',state:'decision',route:'context',reason:'Vertragsinformation'}])).toMatchObject({kind:'keep',question:'Vertragsinformation'});
 expect(classifyMemoryWork(bundle(['paid']),{},[{factId:'0',state:'waiting',route:'broker',reason:'Brokerauszug'}])).toMatchObject({kind:'broker',lane:'processing'});
});
it('groups exact invoice copies without grouping unrelated same-price bills',()=>{
 const make=(id:string)=>({...bundle(['paid']),facts:[{fact_id:id,predicate:'paid',status:'candidate'}],proposal:{proposal_id:id,source_kind:'mail',domain:'finance'},entities:[]}) as unknown as ReviewBundle;
 const review=(id:string,bundleKey?:string)=>({factId:id,state:'decision' as const,reason:'Prüfen',bundleKey});
 const result=memoryWorkProjection([make('a'),make('b'),make('c')],new Map(),[review('a','exact-source'),review('b','exact-source'),review('c')]);
 expect(result.counts.decision).toBe(2);
});
