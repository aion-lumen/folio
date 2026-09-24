import {afterEach,beforeEach,describe,expect,it} from 'vitest';
import {mkdtempSync,writeFileSync,readFileSync,rmSync,mkdirSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {RejectionApprovalStore} from './rejection-approval.js';
import {parseCartaTrackerSource,patchCartaRejections} from './carta-tracker.js';
import type {LocalCandidate,RejectionReconciliationReport} from './rejection-reconcile.js';
import {prepareAutomaticRejections} from './mail-sync.js';

const original=`<script>\nconst DATA=[\n// retained comment\n{"company":"Acme <company>","title":"Data Engineer [FEST]","url":"https://jobs.example/123456?utm_source=old","status":"applied","submitted_at":"2026-09-01","note":"Old note","urg":"hot"},\n{"company":"Other","title":"Developer","url":"https://jobs.example/234567","status":"review"},\n];\nconst REJECTED=[\n// retained history\n["Other","Old role","2025-01-01","Unchanged"],\n];\nconsole.log('unchanged script');</script>`;
let root:string,path:string,store:RejectionApprovalStore,now:Date,candidates:LocalCandidate[];
const report=()=>{const snapshot=parseCartaTrackerSource(original);return {window:{fromInclusive:'2026-09-08T00:00:00Z',toExclusive:'2026-09-23T00:00:00Z',timezone:'Europe/Zurich'},tracker:{sourceHash:snapshot.sourceHash},findings:[{eventType:'rejection',status:'EXACT_PROPOSAL',proposedEvent:'APPLICATION_REJECTED',feedbackId:1,positionIdentity:snapshot.positions[0].identity,positionHash:snapshot.positions[0].rawHash,mailTime:'2026-09-21T23:30:00Z',sourceHash:'body',modelInputHash:'input'}]} as RejectionReconciliationReport;};
beforeEach(()=>{root=mkdtempSync(join(tmpdir(),'folio-rejection-test-'));path=join(root,'tracker.html');writeFileSync(path,original);now=new Date('2026-09-22T12:00:00Z');candidates=[{feedbackId:1,capturedBodyHash:'body',modelInputHash:'input'} as LocalCandidate];store=new RejectionApprovalStore(path,join(root,'plans'),'fixture-vault',()=>candidates,()=>now);});
afterEach(()=>rmSync(root,{recursive:true,force:true}));
describe('owner-approved Carta rejection update',()=>{
 it('surfaces a short brand versus legal-name match for explicit review, never automatic application',()=>{
  const source=original.replace('Acme <company>','Acme, Schweizerische Beispielgesellschaft AG').replace('Data Engineer [FEST]','Data Engineer, 80-100% [FEST] - KARRIERE-WACHT-FUND 15.09');writeFileSync(path,source);
  const r=report();r.tracker.sourceHash=parseCartaTrackerSource(source).sourceHash;r.findings[0]={...r.findings[0],status:'UNCLEAR',eventEmployer:'Acme',eventRole:'Data Engineer (w/m/d)',reasonCode:'probable_match_requires_identity_confirmation'};
  expect(prepareAutomaticRejections(r,store)).toBeNull();
  const plan=store.prepare(r)!;expect(plan.items).toHaveLength(1);expect(plan.items[0].requiresIdentityConfirmation).toBe(true);
  expect(()=>store.apply(plan.id,'owner:test')).toThrow('identity_confirmation_required');
  expect(store.apply(plan.id,'owner:test',[1]).state).toBe('applied');
 });
 it('does not offer brand variants with a different role or multiple matching applications',()=>{
  const source=original.replace('Acme <company>','Acme, Schweizerische Beispielgesellschaft AG');writeFileSync(path,source);
  const r=report();r.tracker.sourceHash=parseCartaTrackerSource(source).sourceHash;r.findings[0]={...r.findings[0],status:'UNCLEAR',eventEmployer:'Acme',eventRole:'Business Analyst',reasonCode:'probable_match_requires_identity_confirmation'};
  expect(store.prepare(r)).toBeNull();
  const duplicate=source.replace('{"company":"Other","title":"Developer"','{"company":"Acme, Schweizerische Beispielgesellschaft AG","title":"Data Engineer"').replace('"status":"review"','"status":"applied"');writeFileSync(path,duplicate);r.tracker.sourceHash=parseCartaTrackerSource(duplicate).sourceHash;r.findings[0].eventRole='Data Engineer';
  expect(store.prepare(r)).toBeNull();
 });
 it('automates only exact rejection evidence and leaves ambiguous identities untouched',()=>{
  const r=report();r.findings.push({...r.findings[0],feedbackId:2,status:'UNCLEAR',eventEmployer:'Other',eventRole:null});
  const plan=prepareAutomaticRejections(r,store)!;expect(plan.items).toHaveLength(1);expect(plan.items[0].requiresIdentityConfirmation).toBe(false);
  expect(store.apply(plan.id,'owner:test/hourly-mail/authorization').receipt?.count).toBe(1);
  expect(parseCartaTrackerSource(readFileSync(path,'utf8')).positions[1].rawHash).toBe(parseCartaTrackerSource(original).positions[1].rawHash);
  r.findings=r.findings.slice(1);r.tracker.sourceHash=parseCartaTrackerSource(readFileSync(path,'utf8')).sourceHash;expect(prepareAutomaticRejections(r,store)).toBeNull();
 });
 it('previews without writing, applies once, backs up exact bytes and preserves unrelated data',()=>{
  const plan=store.prepare(report())!;expect(readFileSync(path,'utf8')).toBe(original);expect(plan.items[0].date).toBe('2026-09-22');
  const result=store.apply(plan.id,'owner:test'),text=readFileSync(path,'utf8'),snapshot=parseCartaTrackerSource(text);
  expect(result.state).toBe('applied');expect(snapshot.positions[0]).toMatchObject({status:'applied',submitted_at:'2026-09-01',action:'rejected',urg:'cool'});
  expect(snapshot.positions[0].note).toContain('Old note');expect(snapshot.rejected).toHaveLength(2);
  expect(snapshot.positions[1].rawHash).toBe(parseCartaTrackerSource(original).positions[1].rawHash);
  expect(text).toContain('// retained comment');expect(text).toContain('// retained history');expect(text).toContain("console.log('unchanged script')");expect(text).not.toContain('<company>');
  expect(readFileSync(join(root,'plans',plan.id+'.before.html'),'utf8')).toBe(original);
  expect(store.apply(plan.id,'owner:test')).toEqual(result);expect(readFileSync(path,'utf8')).toBe(text);
 });
 it('requires explicit identity confirmation for the only open application at the named employer',()=>{const r=report();r.findings[0]={...r.findings[0],status:'UNCLEAR',eventEmployer:'Acme <company>',eventRole:null,reasonCode:'no_unique_position_match'};const p=store.prepare(r)!;expect(p.items[0].requiresIdentityConfirmation).toBe(true);expect(()=>store.apply(p.id,'owner:test')).toThrow('identity_confirmation_required');expect(readFileSync(path,'utf8')).toBe(original);expect(store.apply(p.id,'owner:test',[1]).state).toBe('applied');});
 it('deduplicates repeated evidence for one application',()=>{const r=report();r.findings.push({...r.findings[0]});expect(store.prepare(r)?.items).toHaveLength(1);});
 it('retains an unchanged pending preview across hourly batches without losing the owner selection',()=>{const r=report(),p=store.prepare(r)!;expect(store.prepare(r,{reuseId:p.id})?.id).toBe(p.id);now=new Date(+now+24*3600_000);expect(store.prepare(r,{reuseId:p.id})?.id).not.toBe(p.id);});
 it('does not promote unclear matches to a writable plan',()=>{const r=report();r.findings[0].status='UNCLEAR';expect(store.prepare(r)).toBeNull();});
 it('rejects stale previews without overwriting a concurrent Carta change',()=>{const p=store.prepare(report())!;writeFileSync(path,original+'\n<!-- Carta edit -->');expect(()=>store.apply(p.id,'owner:test')).toThrow('tracker_changed');expect(readFileSync(path,'utf8')).toContain('Carta edit');});
 it('rechecks exact mail inputs before writing',()=>{const p=store.prepare(report())!;candidates[0].modelInputHash='changed';expect(()=>store.apply(p.id,'owner:test')).toThrow('mail_evidence_changed');expect(readFileSync(path,'utf8')).toBe(original);});
 it('expires plans and excludes paths supplied as ids',()=>{const p=store.prepare(report())!;now=new Date('2026-09-24');expect(()=>store.apply(p.id,'owner:test')).toThrow('approval_expired');expect(()=>store.get('../tracker')).toThrow('invalid_approval');expect(readFileSync(path,'utf8')).toBe(original);});
 it('does not steal another writer lock',()=>{const p=store.prepare(report())!;mkdirSync(path+'.folio-rejection.lock');expect(()=>store.apply(p.id,'owner:test')).toThrow();expect(readFileSync(path,'utf8')).toBe(original);});
 it('recovers a crash after atomic tracker replacement without duplicating history',()=>{
  const p=store.prepare(report())!,done=store.apply(p.id,'owner:test');writeFileSync(join(root,'plans',p.id+'.json'),JSON.stringify({...done,state:'applying'}));
  expect(store.apply(p.id,'owner:test').state).toBe('applied');expect(parseCartaTrackerSource(readFileSync(path,'utf8')).rejected).toHaveLength(2);
 });
 it('refuses unsubmitted positions and preserves the entire file on failure',()=>{const snapshot=parseCartaTrackerSource(original);expect(()=>patchCartaRejections(original,snapshot.sourceHash,[{identity:snapshot.positions[1].identity,rawHash:snapshot.positions[1].rawHash,date:'2026-09-22',source:'mail:1'}])).toThrow('position_changed');expect(readFileSync(path,'utf8')).toBe(original);});
});
