import {describe,it,expect} from 'vitest';
import {projectIntake} from './run-status.js';
import {advanceValidatorStatus} from '../server/worker-runner/live-status.js';
import type {IntakeRun} from '../server/mail-intake/state.js';
const run:IntakeRun={id:'run',account:'test',state:'running',phase:'fetch',items:[],attempts:0,started_at:'2026-09-10T10:00:00Z'};
describe('whole intake milestones',()=>{
 it('keeps the final stage active and names the career update accurately',()=>expect(projectIntake({...run,phase:'career',activity:{model:'local',task:'Absagen prüfen'}},true,null)).toMatchObject({active:true,phasesDone:2,phase:'Bewerbungsabgleich',activity:{model:'local'}}));
 it('does not invent a fetch total',()=>expect(projectIntake(run,true,null)).toMatchObject({phasesDone:0,itemsTotal:null,active:true}));
 it('stays active without worker in Memory',()=>expect(projectIntake({...run,phase:'memory',activity:{model:'primary',task:'extract'}},true,null)).toMatchObject({active:true,phasesDone:2,activity:{model:'primary'}}));
 it('does not show 100% before primary model restoration',()=>expect(projectIntake({...run,phase:'memory',items:[{id:1,stage:'done'}]},true,null).phasesDone).toBe(2));
 it('only reports completed after run success, including zero mail',()=>expect(projectIntake({...run,state:'completed',phase:'memory'},true,null).phasesDone).toBe(3));
 it.each(['pending','failed'] as const)('clears model activity for %s',state=>expect(projectIntake({...run,state,phase:'memory',activity:{model:'x',task:'old'}},false,null)).toMatchObject({active:false,activity:null,phasesDone:2}));
 it('shows paused distinctly from idle',()=>expect(projectIntake({...run,state:'pending'},false,null).state).toBe('Pausiert'));
 it('does not infer activity from phase alone',()=>expect(projectIntake({...run,phase:'validate'},true,null).activity).toBeNull());
});
describe('validator explicit control events',()=>{
 const empty={activity:null,target:null};
 it('captures start before the first completed opinion',()=>expect(advanceValidatorStatus(empty,'INFO === lens=glm-router model=org/glm strip=code_fence ===').activity).toEqual({model:'org/glm',task:'Modell laden · Mail-Klassifikation'}));
 it('does not use a completed mail as current model',()=>expect(advanceValidatorStatus(empty,'INFO lens=glm-router i=1 uid=27 → domain=job action=silent conf=.9').activity).toBeNull());
 it('handles load confirmation, conditional start and termination',()=>{
  let s=advanceValidatorStatus(empty,'=== lens=a model=org/a strip=x ===');
  s=advanceValidatorStatus(s,'wait_for_lens_model_loaded: org/a confirmed loaded');
  expect(s.activity?.task).toBe('Mail-Klassifikation');
  s=advanceValidatorStatus(s,'=== lens=review model=org/reviewer strip=x ===');
  expect(s.activity?.model).toBe('org/reviewer');
  expect(advanceValidatorStatus(s,'validator_batch done: total_opinions=5').activity).toBeNull();
 });
 it.each(['model-swap to org/a failed — skipping lens a','lens=review has no disagreement rows — no model load'])('clears activity on %s',line=>expect(advanceValidatorStatus({activity:{model:'a',task:'x'},target:2},line).activity).toBeNull());
 it('extracts actual target including zero',()=>expect(advanceValidatorStatus(empty,'INFO target rows: 0').target).toBe(0));
});
