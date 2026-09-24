import {config,runs} from './state.js';
import {getActiveRun,getLiveValidatorStatus} from '../worker-runner/manager.js';
import {projectIntake} from '$lib/pipeline/run-status.js';

/** One source for the pipeline page and global activity indicator. */
export function pipelineSnapshot(){
 const recent=runs();
 const run=recent.find(r=>r.state==='running') ?? recent.find(r=>r.state==='pending') ?? recent[0] ?? null;
 const worker=getActiveRun();
 const live=getLiveValidatorStatus();
 const intakeEnabled=config()?.enabled===true;
 const status=projectIntake(run,intakeEnabled,run?.validator_id===worker?.uuid ? live.activity : null);
 const busy=status.active || worker!==null;
 const label=status.active ? `${status.account} · ${status.phase} · läuft` : worker ? `${worker.account} · ${worker.mode} · läuft` : `Pipeline · ${status.state} · kein Lauf aktiv`;
 return {status,intakeEnabled,busy,label,standaloneActivity:worker&&!status.active ? live.activity : null};
}
