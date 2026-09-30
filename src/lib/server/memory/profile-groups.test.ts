import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { mkdtempSync,rmSync } from 'node:fs';import { tmpdir } from 'node:os';import { join } from 'node:path';import { randomUUID } from 'node:crypto';
import { resetFolioDbForTests,getFolioDb } from '../folio-db/init.js';
import { proposeMemoryBundle,getMemoryProposalBundle } from './store.js';
import { careerProfile,summarizeProfileGroup,profileGroupDigest,confirmProfileGroup } from './profile-groups.js';
import { memoryWorkProjection,type ReviewBundle } from './worklists.js';
let dir:string;
beforeEach(()=>{dir=mkdtempSync(join(tmpdir(),'folio-profile-groups-'));vi.stubEnv('FOLIO_DB_PATH',join(dir,'folio.db'));resetFolioDbForTests();});
afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});});
function create(person='Alex Example',text='holds_certification: Certificate A',quote='Certificate A, completed 2024'){
 return proposeMemoryBundle({domain:'career',source_kind:'file',source_ref:`file:${randomUUID()}`,extractor_id:'test',actor_id:'test',episodes:[{episode_type:'application',title:person,summary:text,occurred_at:'2026-01-01',source_excerpt:quote,sensitivity:'private'}]});
}
it('groups the same explicit person while keeping distinct qualifications visible',()=>{
 const a=create(),b=create(),c=create('Alex Example','has_certification: Certificate B','Certificate B, completed 2025');
 const g=summarizeProfileGroup([a,b,c])!;expect(g.ids).toHaveLength(3);expect(g.claimCount).toBe(2);expect(g.repeated).toBe(1);expect(g.sections[0].claims[0].variants).toHaveLength(2);
 expect([a,b,c].every(x=>getMemoryProposalBundle(x.proposal.proposal_id).proposal.status==='candidate')).toBe(true);
});
it('preserves preparation versus completion and all conflicting interpretations of a shared quote',()=>{
 const a=create('Alex Example','has_certification_target: Certificate A','Preparing for Certificate A');
 const b=create(),c=create('Alex Example','has_certification_target: Certificate A','Certificate A, completed 2024');
 const g=summarizeProfileGroup([a,b,c])!;expect(g.claimCount).toBe(2);expect(g.sections[0].claims[1].variants.map(v=>v.text)).toEqual([b.episodes[0].summary,c.episodes[0].summary]);
});
it('never groups different people or guesses an owner from a generic title',()=>{
 expect(summarizeProfileGroup([create(),create('Robin Example')])).toBeNull();
 expect(careerProfile(create('Professional Profile (CV 2025)'))).toBeNull();expect(careerProfile(create('Alex'))).toBeNull();
});
it.each(['applied_for_position_at: Employer','committed_to: send Certificate A','requires_certification: Certificate A','expressed_interest_in_future_opportunities: Employer'])('keeps actual casework separate: %s',text=>{expect(careerProfile(create('Alex Example',text))).toBeNull();});
it('does not hide a commitment inside a mixed profile bundle',()=>{
 const b=create();b.episodes.push({...b.episodes[0],summary:'committed_to: send a document'});expect(careerProfile(b)).toBeNull();
});
it('counts a shared review dossier once and keeps separate workflow lanes',()=>{
 const a=create(),b=create(),c=proposeMemoryBundle({domain:'career',source_kind:'file',source_ref:'file:other',extractor_id:'test',actor_id:'test',facts:[{subject:'Alex Example',predicate:'holds_certification',value:'Certificate A',source_excerpt:'Certificate A',data_class:'other',sensitivity:'private'}]});
 const projection=memoryWorkProjection([a,b,c] as ReviewBundle[],new Map(),[]);expect(projection.counts).toEqual({decision:1,processing:1});expect(projection.items.every(x=>x.work.kind==='profile')).toBe(true);
});
it('confirms the displayed group atomically with independent source provenance',()=>{
 const a=create(),b=create(),ids=[a.proposal.proposal_id,b.proposal.proposal_id];expect(confirmProfileGroup(ids,profileGroupDigest(ids),'owner:test')).toBe(2);
 for(const id of ids){const saved=getMemoryProposalBundle(id);expect(saved.proposal.status).toBe('confirmed');expect(saved.episodes[0].source_ref).toBe(saved.proposal.source_ref);}
});
it('rejects a changed group without confirming its other members',()=>{
 const a=create(),b=create(),ids=[a.proposal.proposal_id,b.proposal.proposal_id],digest=profileGroupDigest(ids);
 getFolioDb().prepare("UPDATE memory_episodes SET summary='has_certification: changed' WHERE episode_id=?").run(b.episodes[0].episode_id);
 expect(()=>confirmProfileGroup(ids,digest,'owner')).toThrow('geändert');expect(getMemoryProposalBundle(a.proposal.proposal_id).proposal.status).toBe('candidate');
});
it('rejects foreign-person and duplicate-ID group submissions',()=>{
 const a=create(),b=create('Robin Example'),ids=[a.proposal.proposal_id,b.proposal.proposal_id];expect(()=>confirmProfileGroup(ids,profileGroupDigest(ids),'owner')).toThrow();expect(()=>confirmProfileGroup([ids[0],ids[0]],'any','owner')).toThrow();
});
