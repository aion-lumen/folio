import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { mkdtempSync,rmSync,mkdirSync,writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
const m=vi.hoisted(()=>({date:'2026-06-19',hash:'body-v1'}));
vi.mock('../feedback/reader.js',()=>({getFeedbackRowsByMailRef:()=>[{mail_date:m.date,body_hash:m.hash}],getFeedbackBriefsByIds:()=>new Map()}));
import { getFolioDb,resetFolioDbForTests } from '../folio-db/init.js';
import { proposeMemoryBundle,getMemoryReviewSnapshot,memorySnapshotDigest } from './store.js';
import { assessMemoryRetention,savedSearchProfile } from './retention-policy.js';
import { retentionPlan,applyRetentionPlan,memoryRetentionState,restoreMemoryRetention,processMemoryRetention,reconcileMemoryRetention } from './retention.js';
import { db as intakeDb } from '../mail-intake/state.js';
import { listMemoryReviewQueue } from './review.js';
let dir:string;
const today='2026-09-29',low={verdict:'reject',reason_codes:['transient_or_low_value']};
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'memory-retention-'));vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));resetFolioDbForTests();m.date='2026-06-19';m.hash='body-v1';});
afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
function proposal(fact:Record<string,unknown>={},domain='immo'){
 return proposeMemoryBundle({domain,source_kind:'mail',source_ref:`mail:test:${randomUUID()}`,extractor_id:'extractor',actor_id:'test',facts:[{data_class:'context',sensitivity:'private',subject:'12345678',predicate:'has_context',value:'Schönes Haus mit Garten',source_excerpt:'Schönes Haus mit Garten',...fact}] as any});
}
function reviewed(b:ReturnType<typeof proposal>,reason=low){
 const id=b.proposal.proposal_id;
 getFolioDb().prepare("INSERT INTO memory_ledger(event_id,proposal_id,object_kind,object_id,event_type,actor_kind,actor_id,detail_json,recorded_at) VALUES(?,?,'proposal',?,'delegated_reviewed','system','reviewer',?,?)").run(randomUUID(),id,id,JSON.stringify({...reason,bundle_digest:memorySnapshotDigest(getMemoryReviewSnapshot(id))}),new Date().toISOString());
 return id;
}
it('routes a reviewed advert reversibly without changing any fact or source',()=>{
 const id=reviewed(proposal()),before=getMemoryReviewSnapshot(id),p=retentionPlan(id)!;
 expect(p.decision.mode).toBe('discard');expect(applyRetentionPlan(id,p.digest,'owner request')).toBe(true);
 expect(getMemoryReviewSnapshot(id)).toEqual(before);expect(memoryRetentionState().hidden.has(id)).toBe(true);
 expect(applyRetentionPlan(id,p.digest,'owner request')).toBe(false);expect(reconcileMemoryRetention('owner request')).toBe(0);
 expect(getFolioDb().prepare("SELECT count(*) n FROM memory_ledger WHERE event_type='relevance_routed'").get()).toEqual({n:1});
});
it('requires a reviewer and authorization to hide an advert',()=>{
 const b=proposal();expect(assessMemoryRetention(b,undefined,today)).toBeNull();const id=reviewed(b),p=retentionPlan(id)!;
 expect(()=>applyRetentionPlan(id,p.digest,'')).toThrow('retention_authorization_required');
});
it('invalidates decisions when source or claims change and rejects a stale preview',()=>{
 const b=proposal(),id=reviewed(b),p=retentionPlan(id)!;applyRetentionPlan(id,p.digest,'owner');
 m.hash='body-v2';expect(memoryRetentionState().hidden.has(id)).toBe(false);expect(()=>applyRetentionPlan(id,p.digest,'owner')).toThrow('retention_evidence_changed');
 getFolioDb().prepare("UPDATE memory_facts SET value_text='changed' WHERE fact_id=?").run(b.facts[0].fact_id);
 expect(retentionPlan(id)?.decision.mode).toBe('review');
});
it('honors owner restoration across reconciliation and import hooks',()=>{
 const id=reviewed(proposal()),p=retentionPlan(id)!;applyRetentionPlan(id,p.digest,'owner');restoreMemoryRetention(id,'owner');
 expect(retentionPlan(id)).toBeNull();expect(reconcileMemoryRetention('owner')).toBe(0);
 expect(memoryRetentionState().work.get(id)?.lane).toBe('decision');expect(memoryRetentionState().hidden.has(id)).toBe(false);
});
it('requires opt-in and respects a pause for future routing',()=>{
 const id=reviewed(proposal());processMemoryRetention(id);expect(memoryRetentionState().hidden.size).toBe(0);
 mkdirSync(join(dir,'memory-work'));const config=join(dir,'memory-work/config.json');
 writeFileSync(config,JSON.stringify({enabled:false,retention:'owner'}));processMemoryRetention(id);expect(memoryRetentionState().hidden.size).toBe(0);
 writeFileSync(config,JSON.stringify({enabled:true,retention:'owner'}));processMemoryRetention(id);expect(memoryRetentionState().hidden.has(id)).toBe(true);
});
it.each([
 ['paid','2026-09-01','finance','transaction'],
 ['has_application_status','rejected','career','application'],
 ['identified_by','Account 99','personal','account_reference']
])('preserves the existing domain workflow for %s',(predicate,value,domain,data_class)=>{
 expect(assessMemoryRetention(proposal({predicate,value,data_class},domain),low,today)).toBeNull();
});
it.each([
 {predicate:'committed_to',value:'Return the key'},
 {predicate:'has_contact_address',value:'example@example.invalid'},
 {value:'Die Geburtsurkunde reicht für die Anmeldung aus.'},
 {value:'Wir werden Ihnen die Zuteilung mitteilen.'},
 {value:'Please review the listings.'},
 {value:'Preis CHF 900000'}
])('retains meaningful information and unresolved work: %j',fact=>{
 expect(assessMemoryRetention(proposal(fact),low,today)?.mode).toBe('review');
});
it.each(['scheduled_for','available_at'])('archives a past %s without confirming it',predicate=>{
 const b=proposal({predicate,value:'2026-05-01',source_excerpt:'2026-05-01'},'personal');
 expect(assessMemoryRetention(b,low,today)?.mode).toBe('history');expect(b.facts[0].status).toBe('candidate');
});
it.each([
 {value:'2026-10-01',source_excerpt:'2026-10-01'},
 {value:'2026-09-29',source_excerpt:'2026-09-29'},
 {subject:'Rückgabefrist',value:'2026-05-01',source_excerpt:'Rückgabe 2026-05-01'},
 {value:'2026-05-01 then every month',source_excerpt:'2026-05-01 then every month'}
])('keeps future dates, overdue obligations and recurring appointments actionable: %j',fact=>{
 expect(assessMemoryRetention(proposal({predicate:'scheduled_for',...fact},'personal'),low,today)?.mode).toBe('review');
});
it('never archives a mixed bundle just because one appointment is old',()=>{
 const b=proposal({predicate:'scheduled_for',value:'2026-05-01',source_excerpt:'2026-05-01'},'personal');
 b.facts.push({...b.facts[0],predicate:'committed_to',value_text:'send the document'});
 expect(assessMemoryRetention(b,low,today)?.mode).toBe('review');
});
it('groups only matching search criteria with provenance, leaving different budgets separate',()=>{
 const search=(price:number)=>proposal({subject:'Gespeicherte Suche',value:`Haus zum Kauf, max ${price} EUR`,source_excerpt:`Haus zum Kauf, max ${price} EUR`});
 const first=search(400000),second=search(400000),third=search(450000);
 expect(savedSearchProfile(first)?.key).toBe(savedSearchProfile(second)?.key);expect(savedSearchProfile(first)?.key).not.toBe(savedSearchProfile(third)?.key);
 for(const b of [first,second,third]){const p=retentionPlan(b.proposal.proposal_id)!;applyRetentionPlan(b.proposal.proposal_id,p.digest,'owner');}
 expect(memoryRetentionState().counts).toMatchObject({profiles:2,profileSources:3});expect(memoryRetentionState().groups[0].entries).toHaveLength(2);
});
it('does not hide evidence errors behind a relevance decision',()=>{
 const b=proposal();expect(assessMemoryRetention(b,{verdict:'reject',reason_codes:['transient_or_low_value','evidence_mismatch']},today)?.mode).toBe('review');
});
it('uses original mail metadata for legacy proposals with no intake capture',()=>{
 intakeDb();const b=proposal();const queue=listMemoryReviewQueue(new Set(),new Date('2026-09-29T12:00:00Z'));
 expect(queue.active.find(x=>x.proposal.proposal_id===b.proposal.proposal_id)?.source_date).toBe(m.date);
});

it('archives a matching historical mail event but keeps unrelated episode context',()=>{
 const b=proposal({predicate:'scheduled_for',value:'2026-05-01',source_excerpt:'2026-05-01'},'personal');
 b.episodes=[{status:'candidate',episode_type:'mail_event',source_ref:b.proposal.source_ref,source_excerpt:'2026-05-01',occurred_at:'2026-05-01'} as any];
 expect(assessMemoryRetention(b,low,today)?.mode).toBe('history');
 b.episodes[0].episode_type='commitment';expect(assessMemoryRetention(b,low,today)?.mode).toBe('review');
});

// Owner intent must survive new model reviews and refreshed source metadata.
it.each(['review', 'source', 'review-decision'])('keeps restored proposals actionable after %s changes', change => {
 const bundle=proposal(),id=reviewed(bundle),plan=retentionPlan(id)!;
 applyRetentionPlan(id,plan.digest,'owner');restoreMemoryRetention(id,'owner:1');
 if(change==='source')m.hash='body-v2';
 else reviewed(bundle,{verdict:'reject',reason_codes:change==='review-decision'?['transient_or_low_value','evidence_mismatch']:['transient_or_low_value'],grant_id:'new-review'} as any);
 expect(memoryRetentionState().work.get(id)?.lane).toBe('decision');
 reconcileMemoryRetention('owner');reconcileMemoryRetention('owner');
 expect(memoryRetentionState().hidden.has(id)).toBe(false);
 expect(memoryRetentionState().work.get(id)?.lane).toBe('decision');
 expect(getFolioDb().prepare('SELECT owner_override FROM memory_retention WHERE proposal_id=?').get(id)).toEqual({owner_override:1});
});
