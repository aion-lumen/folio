import {afterEach,describe,expect,it} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setLlmOverride} from '../agent/llm.js';
import {classifyRejectionCandidates,type LocalCandidate} from './rejection-reconcile.js';
const quote='Leider können wir Ihre Bewerbung nicht berücksichtigen.';
function candidate():LocalCandidate{return {feedbackId:123,account:'fixture',mailDate:'2026-09-22T12:00:00Z',sender:'test@example.com',subject:'Bewerbung',body:'Einleitung. '.repeat(800)+quote,capturedBodyHash:'body',modelInputHash:'full-input',bodyVersion:'fixture',duplicateSources:['mail:fixture:1']};}
function response(){return {events:[{sourceKey:'mail:123',eventType:'rejection',employer:'Acme',role:'Engineer',eventDate:null,evidenceQuote:quote,forwarded:false}]};}
afterEach(()=>setLlmOverride(null));
describe('local rejection evidence classification',()=>{
 it('includes evidence beyond the old 6000-character cutoff',async()=>{setLlmOverride(async prompt=>{expect(prompt).toContain(quote);return JSON.stringify(response());});expect(await classifyRejectionCandidates([candidate()],'fixture')).toHaveLength(1);});
 it('rejects invented evidence and unknown sources',async()=>{setLlmOverride(async()=>JSON.stringify({events:[{...response().events[0],evidenceQuote:'Leider erfundene Aussage'}]}));await expect(classifyRejectionCandidates([candidate()],'fixture')).rejects.toThrow('evidence_invalid');setLlmOverride(async()=>JSON.stringify({events:[{...response().events[0],sourceKey:'mail:999'}]}));await expect(classifyRejectionCandidates([candidate()],'fixture')).rejects.toThrow('evidence_invalid');});
 it('reuses only unchanged full-input and model classification',async()=>{const root=mkdtempSync(join(tmpdir(),'folio-classify-test-'));let calls=0;setLlmOverride(async()=>{calls++;return JSON.stringify(response());});try{await classifyRejectionCandidates([candidate()],'fixture',undefined,undefined,root);await classifyRejectionCandidates([candidate()],'fixture',undefined,undefined,root);expect(calls).toBe(1);await classifyRejectionCandidates([{...candidate(),modelInputHash:'new'}],'fixture',undefined,undefined,root);expect(calls).toBe(2);await classifyRejectionCandidates([candidate()],'another-model',undefined,undefined,root);expect(calls).toBe(3);}finally{rmSync(root,{recursive:true,force:true});}});
 it('isolates failed evidence after a single-message retry instead of losing valid work',async()=>{const good=candidate(),bad={...candidate(),feedbackId:999,modelInputHash:'bad'};let calls=0;setLlmOverride(async prompt=>{calls++;return prompt.includes('mail:999')?JSON.stringify({events:[{...response().events[0],sourceKey:'mail:999',evidenceQuote:'Invented evidence'}]}):JSON.stringify(response());});const gaps:number[]=[];const result=await classifyRejectionCandidates([good,bad],'fixture',undefined,undefined,undefined,c=>gaps.push(c.feedbackId));expect(result).toHaveLength(1);expect(gaps).toEqual([999]);expect(calls).toBe(3);});
 it('honours cancellation before using the model',async()=>{setLlmOverride(async()=>{throw Error('must not run');});await expect(classifyRejectionCandidates([candidate()],'fixture',AbortSignal.abort())).rejects.toThrow();});
});

it('accepts an exact comparative selection statement as rejection evidence',async()=>{
 const comparative='Im Auswahlprozess haben sich jedoch Bewerberinnen und Bewerber gezeigt, die in einzelnen Punkten noch besser zu uns und zur Position passen.';
 setLlmOverride(async()=>JSON.stringify({events:[{...response().events[0],role:null,evidenceQuote:comparative}]}));
 expect(await classifyRejectionCandidates([{...candidate(),body:comparative}],'fixture')).toHaveLength(1);
});
