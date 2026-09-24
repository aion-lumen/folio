import { describe,it,expect } from 'vitest';
import { completionBlock,type CompletionEvidence } from './work-status.js';
const complete:CompletionEvidence={sourceComplete:true,sourceEligible:true,modelComplete:true,archiveConsensus:true,attachmentsComplete:true,pendingMemory:false,pendingCase:false,humanConflict:false,memoryOutcome:'no_durable_fact',careerResolved:false,careerNeedsDecision:false,careerGap:false};
describe('local completion evidence gates',()=>{
 it('requires all processing evidence, not merely an empty Memory result',()=>{
  expect(completionBlock(complete)).toBeNull();
  for(const [key,value,reason] of [['archiveConsensus',false,'no_archive_consensus'],['modelComplete',false,'models_incomplete'],['sourceComplete',false,'source_incomplete'],['sourceEligible',false,'excluded_source'],['attachmentsComplete',false,'attachments_incomplete'],['pendingMemory',true,'pending_memory'],['pendingCase',true,'open_case'],['humanConflict',true,'human_instruction'],['obligationOpen',true,'unresolved_obligation'],['memoryOutcome','candidate','memory_incomplete']] as const)
   expect(completionBlock({...complete,[key]:value})).toBe(reason);
 });
 it('recognizes a verified rejection receipt while preserving other open work',()=>{
  const career={...complete,careerResolved:true,archiveConsensus:false,memoryOutcome:'evidence_clarification'};
  expect(completionBlock(career)).toBeNull();
  expect(completionBlock({...career,pendingMemory:true})).toBe('pending_memory');
  expect(completionBlock({...career,attachmentsComplete:false})).toBe('attachments_incomplete');
 });
 it('cannot archive an unresolved or unverified rejection',()=>{
  expect(completionBlock({...complete,careerNeedsDecision:true})).toBe('career_identity');
  expect(completionBlock({...complete,careerGap:true})).toBe('career_evidence_gap');
 });
});
