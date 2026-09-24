import { expect,it } from 'vitest';
import { compareCvVersion } from './cv-versions.js';
import { claimSlot, resolveMemoryEvidence } from './provenance.js';
import type { MemoryFactRow } from './types.js';
const fact=(subject:string,predicate:string,value_text:string,source_ref:string)=>({fact_id:source_ref,domain:'career',subject_entity_id:'person',subject,predicate,value_text,source_ref,status:'confirmed',source_kind:'carta-cv'}) as MemoryFactRow;
it('matches language meaning across reordered indices, not the old index',()=>{
 const facts=[fact('Deutsch','level','C2','carta:cv:language:0'),fact('Englisch','level','C1','carta:cv:language:1')];
 const result=compareCvVersion(facts,{languages:[{name:'Englisch',level:'C1'},{name:'Deutsch',level:'C2'}]});
 expect(result.map(r=>r.state)).toEqual(['unchanged','unchanged']);expect(result[0].field_locator).toBe('/languages/1');
 expect(result.every(r=>r.apply_allowed===false)).toBe(true);
});
it('proposes changed project versions without touching the fact or guessing renamed identities',()=>{
 const f=fact('Test project','documents_own_project','Old','carta:cv:own-project:0');
 const cv={projects:[{name:'Test project',description:'New',status:'Active'}]};
 expect(compareCvVersion([f],cv)[0]).toMatchObject({state:'changed',previous:'Old',proposed:'New · Active',apply_allowed:false});
 expect(f.value_text).toBe('Old');
 expect(compareCvVersion([f],{projects:[{...cv.projects[0],name:'Renamed project'}]})[0].state).toBe('unresolved');
});
it('ambiguous repeated labels and legacy competencies cannot be silently mapped',()=>{
 const f=fact('Deutsch','level','C2','carta:cv:language:0');
 expect(compareCvVersion([f],{languages:[{name:'Deutsch',level:'C2'},{name:'German',level:'C1'}]})[0].state).toBe('unresolved');
 expect(claimSlot(fact('Capability','documents_competency','old','carta:cv:competency:0')).ambiguous).toBe(true);
});
it('nightshift counts CV fields as a single original, not four documents',()=>{
 const facts=Array.from({length:4},(_,i)=>fact('Deutsch','level','C2',`carta:cv:language:${i}`));
 expect(resolveMemoryEvidence(facts.map(f=>f.fact_id),'career',new Map(facts.map(f=>[f.fact_id,f])),new Map())).toMatchObject({origin_source_count:1,derived_fact_count:0,independence:'not_established'});
});
