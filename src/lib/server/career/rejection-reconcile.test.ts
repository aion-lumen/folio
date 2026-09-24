import { describe, expect, it } from 'vitest';
import { parseCartaTrackerSource } from './carta-tracker.js';
import { careerRoleKey, strictCompany, reconcileEvidence, reconciliationCoverageState, type RejectionEvidence } from './rejection-reconcile.js';

const source = `const DATA=[{"title":"Senior Data Engineer","company":"Acme AG","url":"https://jobs.example/a/123456","status":"applied"},{"title":"Business Process Analyst","company":"Acme AG","url":"https://jobs.example/a/234567","status":"review"}];\nconst REJECTED=[["Bell Food Group","AI Integration Manager","28.08.26","Absage"]];`;
const snapshot = parseCartaTrackerSource(source);
const candidate = (id:number,hash=String(id)) => ({feedbackId:id,account:'mail',mailDate:'2026-09-01T10:00:00Z',sender:'x',subject:'x',body:'rejected',capturedBodyHash:hash,modelInputHash:`model-${hash}`,bodyVersion:'decoded-body-v2',duplicateSources:[`mail:mail:${id}`]});
const event = (id:number,employer:string,role:string):RejectionEvidence => ({sourceKey:`mail:${id}`,eventType:'rejection',employer,role,eventDate:'2026-09-01',evidenceQuote:'rejected',forwarded:false});

describe('career rejection reconciliation',()=>{
	 it('recognizes the exact mail reference after an owner-confirmed legal-name variant',()=>{
	  const handled=parseCartaTrackerSource(`const DATA=[{"title":"Senior Data Engineer [FEST] - KARRIERE-WACHT-FUND 15.09","company":"Acme, Schweizerische Beispielgesellschaft AG","url":"https://jobs.example/123456","status":"applied","action":"rejected","note":"Absage laut Mail vom 2026-09-22, in Folio freigegeben (mail:12). Bewerbung bleibt als versandt dokumentiert."}]; const REJECTED=[];`);
	  expect(reconcileEvidence(handled,[candidate(12)],[event(12,'Acme','Senior Data Engineer')])[0]).toMatchObject({status:'NO_CHANGE',reasonCode:'already_marked_rejected'});
	  expect(reconcileEvidence(handled,[candidate(1)],[event(1,'Acme','Senior Data Engineer')])[0].status).toBe('UNCLEAR');
	 });
	 it('ignores a dated internal discovery label without weakening actual role or employer identity',()=>{
	  const decorated=parseCartaTrackerSource(source.replace('Senior Data Engineer','Senior Data Engineer, 80-100% [FEST] - KARRIERE-WACHT-FUND 15.09'));
	  expect(reconcileEvidence(decorated,[candidate(1)],[event(1,'Acme AG','Senior Data Engineer (w/m/d)')])[0].status).toBe('EXACT_PROPOSAL');
	  expect(reconcileEvidence(decorated,[candidate(1)],[event(1,'Other AG','Senior Data Engineer (w/m/d)')])[0].status).toBe('UNCLEAR');
	  expect(reconcileEvidence(decorated,[candidate(1)],[event(1,'Acme AG','Junior Data Engineer')])[0].status).toBe('UNCLEAR');
	  expect(careerRoleKey('Senior Data Engineer - Analytics')).not.toBe(careerRoleKey('Senior Data Engineer'));
	 });
	it('normalizes display-only workload, gender, HTML and legal-name spacing',()=>{expect(careerRoleKey('AI Engineer (60%-100%, f::m::d)')).toBe(careerRoleKey('AI Engineer, 60-100% [FEST] - ABSAGE 15.09'));expect(strictCompany('Example Company AG')).toBe(strictCompany('ExampleCompany AG'));});
	it('proposes an append-only rejection event while preserving applied',()=>{
		const result=reconcileEvidence(snapshot,[candidate(1)],[event(1,'Acme AG','Senior Data Engineer')]);
		expect(result[0]).toMatchObject({status:'EXACT_PROPOSAL',currentStatus:'applied',proposedEvent:'APPLICATION_REJECTED'});
	});
	it('does not reject an employer-wide different role or re-add known history',()=>{
		expect(reconcileEvidence(snapshot,[candidate(1)],[event(1,'Acme AG','Unknown Role')])[0].status).toBe('UNCLEAR');
		expect(reconcileEvidence(snapshot,[candidate(2)],[event(2,'Bell Food Group','AI Integration Manager')])[0]).toMatchObject({status:'NO_CHANGE',reasonCode:'already_in_rejected_history'});
	});
	it('never upgrades a fuzzy ranking to an exact proposal',()=>{
		expect(reconcileEvidence(snapshot,[candidate(4)],[event(4,'Acme','Senior Data Engineering')])[0]).toMatchObject({status:'UNCLEAR',reasonCode:'probable_match_requires_identity_confirmation'});
	});
	it('prefers exact existing rejection history over an applied duplicate',()=>{
		const duplicate=parseCartaTrackerSource(`const DATA=[{"title":"AI Integration Manager","company":"Bell Food Group AG","url":"https://jobs.example/a/999999","status":"applied"}];\nconst REJECTED=[["Bell Food Group","AI Integration Manager","28.08.26","Absage"]];`);
		expect(reconcileEvidence(duplicate,[candidate(5)],[event(5,'Bell Food Group AG','AI Integration Manager')])[0]).toMatchObject({status:'NO_CHANGE',reasonCode:'already_in_rejected_history'});
	});
	it('dedupes repeated sources but preserves the count',()=>{
		const c={...candidate(3),duplicateSources:['mail:a:1','mail:b:2']};
		expect(reconcileEvidence(snapshot,[c],[event(3,'Acme AG','Senior Data Engineer')])[0].duplicateSourceCount).toBe(2);
	});
	it('recognizes tracker display decorations and an already rejected applied row',()=>{
		const decorated=parseCartaTrackerSource(source.replace('Senior Data Engineer','Senior Data Engineer [FEST] - BEWORBEN 01.09'));
		expect(reconcileEvidence(decorated,[candidate(1)],[event(1,'Acme AG','Senior Data Engineer')])[0].status).toBe('EXACT_PROPOSAL');
		decorated.positions[0].action='rejected';
		expect(reconcileEvidence(decorated,[candidate(1)],[event(1,'Acme AG','Senior Data Engineer')])[0].status).toBe('NO_CHANGE');
	});
	it('does not turn a forwarded rejection into an automatic proposal',()=>{
		expect(reconcileEvidence(snapshot,[candidate(1)],[{...event(1,'Acme AG','Senior Data Engineer'),forwarded:true}])[0].status).toBe('UNCLEAR');
	});
	it('keeps verified mailbox coverage authoritative over legacy feedback gaps',()=>{
		expect(reconciliationCoverageState('covered',true)).toBe('covered');
		expect(reconciliationCoverageState('source_gap',false)).toBe('source_gap');
		expect(reconciliationCoverageState(null,true)).toBe('source_gap');
		expect(reconciliationCoverageState(null,false)).toBe('unknown');
	});
});

describe('separate career identifiers and chronology',()=>{
 const dated=(date='2026-08-20',role='Senior Data Engineer')=>parseCartaTrackerSource(`const DATA=[${JSON.stringify({company:'Acme AG',title:role,url:'https://jobs.example/123456',status:'applied',submitted_at:date})}]; const REJECTED=[];`);
 it('matches an extra job reference while preserving semantic numbers and rejecting conflicting references',()=>{
  expect(reconcileEvidence(dated(),[candidate(1)],[event(1,'Acme AG','Senior Data Engineer (m/w/d) - 136702')])[0].status).toBe('EXACT_PROPOSAL');
  expect(reconcileEvidence(dated('2026-08-20','Senior Data Engineer - 999999'),[candidate(1)],[event(1,'Acme AG','Senior Data Engineer - 136702')])[0].status).toBe('UNCLEAR');
  expect(careerRoleKey('SAP S/4HANA Consultant')).not.toBe(careerRoleKey('SAP S/3HANA Consultant'));
 });
 it('uses a unique evidenced application date, never employer alone, across two open roles',()=>{
  const two=parseCartaTrackerSource(`const DATA=[${JSON.stringify({company:'Acme AG',title:'Analyst',url:'https://jobs.example/629',status:'applied',submitted_at:'2026-08-20'})},${JSON.stringify({company:'Acme AG',title:'Project Manager',url:'https://jobs.example/634',status:'applied',submitted_at:'2026-08-29'})}];const REJECTED=[];`);
  const mail={...candidate(1),subject:'Deine Bewerbung vom 20.08.2026 bei Acme AG'};
  const noRole={...event(1,'Acme AG',''),role:null};
  expect(reconcileEvidence(two,[mail],[noRole])[0]).toMatchObject({status:'EXACT_PROPOSAL',positionIdentity:two.positions[0].identity});
  expect(reconcileEvidence(two,[candidate(1)],[noRole])[0].status).toBe('UNCLEAR');
  expect(reconcileEvidence(two,[mail],[event(1,'Acme AG','Project Manager')])[0].status).toBe('UNCLEAR');
  expect(reconcileEvidence(two,[{...mail,body:'Bewerbung vom 29.08.2026'}],[noRole])[0].status).toBe('UNCLEAR');
 });
 it('never applies an old rejection to a newer application, or swallows a new rejection in old history',()=>{
  expect(reconcileEvidence(dated('2026-09-10'),[candidate(1)],[event(1,'Acme AG','Senior Data Engineer')])[0]).toMatchObject({status:'EVIDENCE_CONFLICT',reasonCode:'application_date_conflict'});
  const reapplied=dated();reapplied.rejected=parseCartaTrackerSource('const DATA=[];const REJECTED=[["Acme AG","Senior Data Engineer","01.08.26","Absage"]];').rejected;
  expect(reconcileEvidence(reapplied,[candidate(1)],[event(1,'Acme AG','Senior Data Engineer')])[0].status).toBe('EXACT_PROPOSAL');
 });
 it('recognizes a unique same-day shortened role only as existing history, never a write',()=>{
  const history=parseCartaTrackerSource('const DATA=[];const REJECTED=[["Acme AG","Business Analyst / Stabstelle Digitalisierung, 80–100%","01.09.26","Absage"]];');
  expect(reconcileEvidence(history,[candidate(1)],[event(1,'Acme AG','Business Analyst (80-100%)')])[0]).toMatchObject({status:'NO_CHANGE',reasonCode:'already_in_rejected_history'});
  expect(reconcileEvidence(history,[{...candidate(1),mailDate:'2026-10-01'}],[event(1,'Acme AG','Business Analyst (80-100%)')])[0].status).toBe('UNCLEAR');
 });
});
