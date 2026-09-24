import {describe,it,expect,vi,beforeEach} from 'vitest';
const mock=vi.hoisted(()=>({runs:vi.fn(),config:vi.fn(),worker:vi.fn(),live:vi.fn()}));
vi.mock('./state.js',()=>({runs:mock.runs,config:mock.config}));
vi.mock('../worker-runner/manager.js',()=>({getActiveRun:mock.worker,getLiveValidatorStatus:mock.live}));
import {pipelineSnapshot} from './pipeline-status.js';
const run={id:'r',account:'test',phase:'memory',state:'completed',items:[],started_at:'2026-09-10',attempts:0};
beforeEach(()=>{mock.runs.mockReturnValue([run]);mock.config.mockReturnValue({enabled:true});mock.worker.mockReturnValue(null);mock.live.mockReturnValue({activity:null,target:null});});
describe('shared page and indicator state',()=>{
 it('clears busy immediately after completion',()=>expect(pipelineSnapshot()).toMatchObject({busy:false,status:{active:false,state:'Abgeschlossen'}}));
 it('includes Memory without a worker subprocess',()=>{mock.runs.mockReturnValue([{...run,state:'running',activity:{model:'m',task:'review'}}]);expect(pipelineSnapshot()).toMatchObject({busy:true,status:{active:true,activity:{model:'m'}}});});
 it.each(['pending','failed'])('does not glow for %s',state=>{mock.runs.mockReturnValue([{...run,state}]);expect(pipelineSnapshot().busy).toBe(false);});
 it('includes a standalone worker',()=>{mock.worker.mockReturnValue({uuid:'w',account:'test',mode:'silent'});expect(pipelineSnapshot()).toMatchObject({busy:true,label:'test · silent · läuft'});});
 it('finds active older runs ahead of newer completed records',()=>{mock.runs.mockReturnValue([run,{...run,id:'older',state:'running'}]);expect(pipelineSnapshot().status.id).toBe('older');});
 it('does not assign another runs model to intake',()=>{mock.runs.mockReturnValue([{...run,state:'running',phase:'validate',validator_id:'a'}]);mock.worker.mockReturnValue({uuid:'b'});mock.live.mockReturnValue({activity:{model:'wrong',task:'x'}});expect(pipelineSnapshot().status.activity).toBeNull();});
 it('uses the same snapshot for terminal-to-running-to-terminal transitions',()=>{for(const state of ['completed','running','completed']){mock.runs.mockReturnValue([{...run,state}]);const s=pipelineSnapshot();expect(s.busy).toBe(s.status.active);}});
});
