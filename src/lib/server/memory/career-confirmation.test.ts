import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const mock=vi.hoisted(()=>({tracker:null as any,mail:null as any}));
vi.mock('../career/carta-tracker.js',()=>({readCartaTracker:()=>mock.tracker}));
vi.mock('../feedback/reader.js',()=>({getFeedbackRowById:()=>mock.mail,getFeedbackRowsByMailRef:()=>[]}));
import { resetFolioDbForTests } from '../folio-db/init.js';
import { db } from '../mail-intake/state.js';
import { proposeMemoryBundle,getMemoryReviewSnapshot } from './store.js';
import { exactCareerRejection,careerConfirmationPlan,confirmCareerMemory,reconcileCareerMemory,recordedCareerRejection,CAREER_MEMORY_POLICY,careerReviewQuestions } from './career-confirmation.js';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex').slice(0,20);
const role='Data Engineer (m/w/d)',org='Beispiel AG',label=`${role} · ${org}`,day='2026-09-22';
const identity=`Ihre Bewerbung für die Position als ${role} bei ${org}`,quote='dass wir Ihre Bewerbung derzeit nicht in Betracht ziehen können';
let root:string;
beforeEach(()=>{root=mkdtempSync(join(tmpdir(),'career-memory-'));vi.stubEnv('FOLIO_DB_PATH',join(root,'folio.db'));resetFolioDbForTests();mock.mail={id:7,account_id:'test',imap_uid:42,mail_date:day+'T13:00:00+02:00',subject:identity};mock.tracker={sourcePath:'/example',sourceHash:'tracker-hash',positions:[{title:'Data Engineer [FEST]',company:org,status:'applied',submitted_at:'2026-09-14',identity:'listing:1',rawHash:'row-hash'}],rejected:[]};});
afterEach(()=>{resetFolioDbForTests();vi.unstubAllEnvs();rmSync(root,{recursive:true,force:true});});
function fixture(){
 const source={feedbackId:7,ref:'mail:test:42',subject:identity,body:`Nach Prüfung müssen wir Ihnen leider mitteilen, ${quote}.`,mailDate:mock.mail.mail_date,truncated:false};
 const b=proposeMemoryBundle({domain:'career',source_kind:'mail',source_ref:source.ref,extractor_id:'test',actor_id:'test',
 entities:[{local_ref:'app',entity_type:'application',canonical_key:`career:application:${hash(org.toLowerCase()+'\u0000'+role.toLowerCase())}`,canonical_label:label,sensitivity:'private',source_excerpt:identity,valid_from:day},{local_ref:'org',entity_type:'organization',canonical_key:`organization:${hash(org.toLowerCase())}`,canonical_label:org,sensitivity:'private',source_excerpt:identity}],
 facts:[{data_class:'application',sensitivity:'private',subject:label,subject_ref:'app',predicate:'has_role',value:role,source_excerpt:identity,valid_from:day},{data_class:'application',sensitivity:'private',subject:label,subject_ref:'app',predicate:'has_application_status',value:'rejected',source_excerpt:quote,valid_from:day},{data_class:'application',sensitivity:'private',subject:label,subject_ref:'app',predicate:'received_at',value:day,source_excerpt:quote,valid_from:day}],
 relations:[{relation_type:'application_at',subject_ref:'app',object_ref:'org',sensitivity:'private',source_excerpt:identity,valid_from:day}],
 episodes:[{episode_type:'application_status',title:`rejected: ${label}`,summary:`Bewerbungsstatus rejected bei ${org}.`,occurred_at:day,sensitivity:'private',source_excerpt:quote,entity_refs:[{ref:'app',role:'subject'},{ref:'org',role:'organization'}]}]});
 db().prepare('INSERT INTO mail_intake_sources VALUES(7,\'test\',42,1,?,0)').run(source.body);
 return {b,source,id:b.proposal.proposal_id};
}
it('accepts an exact applied position with explicit rejection and records system provenance',()=>{
 const {b,source,id}=fixture();expect(exactCareerRejection(b,source,mock.tracker)?.basis).toBe('exact_applied_role_and_explicit_rejection');
 const plan=careerConfirmationPlan(id)!;expect(plan).not.toBeNull();const done=confirmCareerMemory(id,plan.digest,'owner request');
 expect(done.proposal).toMatchObject({status:'confirmed',reviewed_by:CAREER_MEMORY_POLICY});
 expect(done.facts.every(f=>f.status==='confirmed'&&f.valid_from===null)).toBe(true);
 expect(done.facts.find(f=>f.predicate==='mail_received_at')?.source_excerpt).toBe(mock.mail.mail_date);
 expect(done.episodes[0]).toMatchObject({episode_type:'application_status_reported',occurred_at:day,status:'confirmed'});
 const audit=db().prepare("SELECT actor_kind,detail_json FROM memory_ledger WHERE event_type='confirmed' AND object_kind='proposal'").get() as any;
 expect(audit.actor_kind).toBe('system');expect(JSON.parse(audit.detail_json).before.bundle.facts[2].predicate).toBe('received_at');
 expect(reconcileCareerMemory('owner request')).toBe(0);
});
it('recognizes an owner-confirmed rejection tied to the same mail',()=>{
 const {b,source}=fixture();Object.assign(mock.tracker.positions[0],{action:'rejected',note:'Absage in Folio freigegeben (mail:7)'});
 expect(exactCareerRejection(b,source,mock.tracker)?.basis).toBe('tracker_confirmed_same_mail');
});
it.each(['different employer','different role','not applied','later application','duplicate position','reference conflict','truncated','forwarded','conditional','missing quote','extra claim','different episode','wrong relation','different date'])( 'keeps %s in review',(change)=>{
 const {b,source}=fixture();const row=mock.tracker.positions[0];
 if(change==='different employer')row.company='Andere AG';if(change==='different role')row.title='Data Analyst';if(change==='not applied')row.status='new';if(change==='later application')row.submitted_at='2026-09-25';if(change==='duplicate position')mock.tracker.positions.push({...row});
 if(change==='reference conflict'){row.title='Data Engineer - 12345';b.facts[0].value_text='Data Engineer - 54321';}
 if(change==='truncated')source.truncated=true;if(change==='forwarded')source.body='Forwarded message\n'+source.body;if(change==='conditional')source.body='Wenn Ihre Bewerbung betroffen ist: '+source.body;
 if(change==='missing quote')source.body='Ihre Bewerbung ist eingegangen.';if(change==='extra claim')b.facts.push({...b.facts[0],predicate:'has_context',value_text:'extra'});
 if(change==='different episode')b.episodes[0].summary='Sie haben die Bewerbung zurückgezogen.';if(change==='wrong relation')b.relations[0].object_entity_id=b.entities[0].entity_id;if(change==='different date')b.episodes[0].occurred_at='2026-09-01';
 expect(exactCareerRejection(b,source,mock.tracker)).toBeNull();
});
it('rechecks source and snapshot before writing and keeps human rejection final',()=>{
 const {id}=fixture(),plan=careerConfirmationPlan(id)!;
 db().prepare("UPDATE mail_intake_sources SET body='changed'").run();expect(()=>confirmCareerMemory(id,plan.digest,'owner')).toThrow();
 expect(getMemoryReviewSnapshot(id).bundle.proposal.status).toBe('candidate');
 db().prepare("UPDATE memory_proposals SET status='rejected' WHERE proposal_id=?").run(id);expect(reconcileCareerMemory('owner')).toBe(0);
});
it('refuses stale bundle snapshots and absent authorization',()=>{
 const {id}=fixture(),plan=careerConfirmationPlan(id)!;
 expect(()=>confirmCareerMemory(id,plan.digest,'')).toThrow();
 db().prepare("UPDATE memory_facts SET source_excerpt='changed' WHERE proposal_id=? AND predicate='has_role'").run(id);
 expect(()=>confirmCareerMemory(id,plan.digest,'owner')).toThrow();
});

it('uses an already recorded history status without enumerating its rejection wording',()=>{
 const {b,source,id}=fixture();mock.tracker.positions=[];
 mock.tracker.rejected=[{employer:org,title:role,date:'22.09.26',identity:'history:1',rawHash:'history-hash'}];
 source.body='We decided to proceed with a different candidate.';
 const quote=source.body;b.facts.find(f=>f.predicate==='has_application_status')!.source_excerpt=quote;
 b.facts.find(f=>f.predicate==='received_at')!.source_excerpt=quote;b.episodes[0].source_excerpt=quote;
 expect(exactCareerRejection(b,source,mock.tracker)?.basis).toBe('tracker_rejected_history');
 const plan=careerConfirmationPlan(id)!;expect(plan.proof.position_identity).toBe('history:1');
 expect(confirmCareerMemory(id,plan.digest,'owner').proposal.status).toBe('confirmed');
});
it('matches a Swiss date across UTC midnight, without tolerating arbitrary day differences',()=>{
 const {b}=fixture();mock.tracker.positions=[];
 mock.tracker.rejected=[{employer:org,title:role,date:'23.09.26'}];
 expect(recordedCareerRejection(b,'2026-09-22T22:40:02+00:00',mock.tracker).kind).toBe('matched');
 expect(recordedCareerRejection(b,'2026-09-22T13:00:00+00:00',mock.tracker).kind).toBe('date');
 mock.tracker.rejected[0].date='22.09.25';
 expect(recordedCareerRejection(b,'2026-09-22',mock.tracker).kind).toBe('date');
});
it('keeps reapplications, multiple history entries and business-word title changes unresolved',()=>{
 const {b}=fixture();mock.tracker.rejected=[{employer:org,title:role,date:'22.09.26'}];
 expect(recordedCareerRejection(b,'2026-09-22',mock.tracker).kind).toBe('ambiguous');
 mock.tracker.positions=[];mock.tracker.rejected.push({...mock.tracker.rejected[0]});
 expect(recordedCareerRejection(b,'2026-09-22',mock.tracker).kind).toBe('ambiguous');
 mock.tracker.rejected=[{employer:org,title:'Data Engineer Team Lead',date:'22.09.26'}];
 expect(recordedCareerRejection(b,'2026-09-22',mock.tracker).kind).toBe('role');
});

it('validates every optional contact before history confirmation',()=>{
 const {b,source}=fixture();mock.tracker.positions=[];mock.tracker.rejected=[{employer:org,title:role,date:'22.09.26',identity:'h',rawHash:'h'}];
 const address='team@example.test',excerpt=`Kontakt: ${address}`;source.body+=' '+excerpt;
 const person={...b.entities[1],entity_id:'person',entity_type:'person',canonical_key:`contact:${hash(address)}`,canonical_label:address,source_excerpt:excerpt,valid_from:null};
 b.entities.push(person);
 b.facts.push({...b.facts[0],fact_id:'contact',predicate:'has_contact_address',data_class:'contact_fact',subject:address,subject_entity_id:'person',value_text:address,source_excerpt:excerpt,valid_from:null});
 b.relations.push({...b.relations[0],relation_id:'contact',relation_type:'contact_for',subject_entity_id:'person',object_entity_id:b.entities[0].entity_id,source_excerpt:excerpt,valid_from:null});
 expect(exactCareerRejection(b,source,mock.tracker)?.basis).toBe('tracker_rejected_history');
 person.canonical_label='Invented person';expect(exactCareerRejection(b,source,mock.tracker)).toBeNull();
});

it('accepts a source-backed department alias, waiting status and a direct personal rejection',()=>{
 const {b,source}=fixture();
 mock.tracker.positions[0].company='Kanton Beispiel, Beispiel AG / Generalsekretariat';
 mock.tracker.positions[0].action='wait';
 const q='Leider müssen wir dir mitteilen, dass wir dich im weiteren Auswahlprozess nicht berücksichtigen können.';
 source.body=q+'\nKanton Beispiel\nBeispiel AG\nHuman Resources';
 b.facts.find(f=>f.predicate==='has_application_status')!.source_excerpt=q;
 b.facts.find(f=>f.predicate==='received_at')!.source_excerpt=q;b.episodes[0].source_excerpt=q;
 expect(exactCareerRejection(b,source,mock.tracker)?.basis).toBe('exact_applied_role_and_explicit_rejection');
 mock.tracker.positions.push({...mock.tracker.positions[0],identity:'second'});
 expect(exactCareerRejection(b,source,mock.tracker)).toBeNull();
 mock.tracker.positions.pop();mock.tracker.positions[0].company='Kanton Anders, Beispiel AG / Generalsekretariat';
 expect(exactCareerRejection(b,source,mock.tracker)).toBeNull();
});
it.each(['clarify','withdrawn','interview'])('does not override tracker action %s',action=>{
 const {b,source}=fixture();mock.tracker.positions[0].action=action;expect(exactCareerRejection(b,source,mock.tracker)).toBeNull();
});
it.each([
 'Wir können dich im weiteren Auswahlprozess berücksichtigen.',
 'Vielleicht können wir dich im weiteren Auswahlprozess nicht berücksichtigen.',
 'Falls deine Bewerbung unvollständig ist, können wir dich nicht berücksichtigen.',
 'Wir werden dich im weiteren Auswahlprozess berücksichtigen.'
])('keeps non-rejection wording in review: %s',q=>{
 const {b,source}=fixture();source.body=q;
 b.facts.find(f=>f.predicate==='has_application_status')!.source_excerpt=q;
 b.facts.find(f=>f.predicate==='received_at')!.source_excerpt=q;b.episodes[0].source_excerpt=q;
 expect(exactCareerRejection(b,source,mock.tracker)).toBeNull();
});

it('uses source-backed employer aliases in the actual question path when a capture is incomplete',()=>{
 const {b,id}=fixture();
 b.entities.find(e=>e.entity_type==='organization')!.canonical_label='Digital Services';
 mock.mail.subject='Ihre Bewerbung bei Digital Services';
 mock.tracker.positions=[];
 mock.tracker.rejected=[{employer:'Beispiel AG, Digital Services',title:role,date:day}];
 db().prepare("UPDATE mail_intake_sources SET body='Beispiel AG Digital Services teilt mit',truncated=1").run();
 expect(careerConfirmationPlan(id)).toBeNull();
 expect(careerReviewQuestions([b]).get(id)).toMatchObject({lane:'decision',kind:'status',question:'Absage ist im Tracker erfasst – Angaben übernehmen?'});
 db().prepare("UPDATE mail_intake_sources SET body='Andere Firma'").run();
 expect(careerReviewQuestions([b]).get(id)?.lane).toBe('decision');
});
