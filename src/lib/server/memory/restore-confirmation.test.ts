// Synthetic regression for owner restoration across automatic confirmation paths.
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ llm: vi.fn() }));
vi.mock('../agent/llm.js', () => ({ callLmStudioJson: mocks.llm }));
vi.mock('../env.js', async (o) => ({ ...await o<object>(), getLmStudioBaseUrl: () => 'http://127.0.0.1:1234' }));
vi.mock('../feedback/reader.js', () => ({ getFeedbackRowById: (id: number) => id === 7 ? { id, account_id: 'test', imap_uid: 42, task_id: 't', body_hash: 'hash', sender: 's@example.invalid', subject: 'Preference', body_excerpt: 'Prefers Tuesday.', mail_date: '2026-09-05' } : null, getFeedbackRowsByMailRef: () => [{ mail_date: '2026-09-05', body_hash: 'hash' }], getFeedbackBriefsByIds: () => new Map() }));
vi.mock('../hermes/mail-body.js', () => ({ lookupMailBody: () => ({ bodyText: 'Prefers Tuesday.' }) }));
vi.mock('./mail-domain.js', () => ({ resolveMailMemoryDomain: () => ({ domain: 'kontakt', source: 'model_consensus', models: ['a','b','c'] }) }));
vi.mock('../regelwerk/loader.js', () => ({ loadRegelwerk: () => ({ voice_consensus: { voices: [{ role: 'conditional_reviewer', lm_studio_model: 'independent' }] } }) }));
let dir='';
afterEach(async()=>{(await import('../folio-db/init.js')).resetFolioDbForTests();rmSync(dir,{recursive:true,force:true});vi.unstubAllEnvs();vi.resetModules();mocks.llm.mockReset();});
async function restored(){
 dir=join(process.cwd(),'src/lib/server/folio-db/.test-tmp',randomUUID());mkdirSync(join(dir,'memory-work'),{recursive:true});
 writeFileSync(join(dir,'memory-work/config.json'),JSON.stringify({enabled:true,retention:'owner'}));
 vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));vi.resetModules();
 const store=await import('./store.js'),review=await import('./delegated-review.js'),ret=await import('./retention.js'),{getFolioDb}=await import('../folio-db/init.js');
 const b=store.proposeMemoryBundle({domain:'personal',source_kind:'mail',source_ref:'mail:test:42',extractor_id:'extractor',actor_id:'extractor',facts:[{data_class:'preference',sensitivity:'private',subject:'Person',predicate:'prefers',value:'Tuesday',source_excerpt:'Prefers Tuesday.'}]});
 const id=b.proposal.proposal_id;
 // Simulate an earlier low-value review + routing, then owner restoration.
 getFolioDb().prepare("INSERT INTO memory_ledger(event_id,proposal_id,object_kind,object_id,event_type,actor_kind,actor_id,detail_json,recorded_at) VALUES(?,?,'proposal',?,'delegated_reviewed','system','r',?,?)").run(randomUUID(),id,id,JSON.stringify({verdict:'reject',reason_codes:['transient_or_low_value'],bundle_digest:store.memorySnapshotDigest(store.getMemoryReviewSnapshot(id))}),new Date().toISOString());
 const p=ret.retentionPlan(id)!;ret.applyRetentionPlan(id,p.digest,'owner');ret.restoreMemoryRetention(id,'owner:1');

 return {store,review,ret,b,id,db:getFolioDb()};
}
it('keeps restored proposals pending after accepting reviews and replay',async()=>{
 const {store,review,ret,b,id,db}=await restored();
 const grant=review.authorizeMailMemoryReview(7,id,'owner:1','test');
 mocks.llm.mockImplementation(async()=>{
  return {verdict:'accept',reason_codes:['fully_supported'],checked_object_ids:[b.facts[0].fact_id],unsupported_object_ids:[]};
 });
 const result=await review.reviewDelegatedMailMemory(7,grant.grant_id);
 expect(result).toMatchObject({verdict:'accept'});
 expect(await review.reviewDelegatedMailMemory(7,grant.grant_id)).toEqual(result);
 const again=review.authorizeMailMemoryReview(7,id,'owner:1','second delegation');
 await review.reviewDelegatedMailMemory(7,again.grant_id);
 expect(store.getMemoryProposalBundle(id).proposal.status).toBe('candidate');
 expect(ret.memoryRetentionState().work.get(id)).toMatchObject({lane:'decision'});
 expect(db.prepare("SELECT count(*) AS n FROM memory_ledger WHERE proposal_id=? AND event_type='confirmed'").get(id)).toEqual({n:0});
 // The owner can still confirm and is recorded as the deciding actor.
 expect(store.confirmMemoryProposalBundle(id,'owner:1').proposal.status).toBe('confirmed');
 expect(db.prepare("SELECT DISTINCT actor_kind FROM memory_ledger WHERE proposal_id=? AND event_type='confirmed'").all(id)).toEqual([{actor_kind:'human'}]);
});
it('blocks other automatic evidence policies without partial confirmation',async()=>{
 const {store,id,db}=await restored();
 const before=store.getMemoryReviewSnapshot(id),policy='career-tracker-reconciliation/v2';
 expect(()=>store.confirmMemoryBySystemEvidence(id,store.memorySnapshotDigest(before),policy,{policy,authorization_ref:'synthetic'})).toThrow('requires owner confirmation');
 expect(store.getMemoryReviewSnapshot(id)).toEqual(before);
 expect(db.prepare("SELECT count(*) AS n FROM memory_ledger WHERE proposal_id=? AND event_type='confirmed'").get(id)).toEqual({n:0});
});
