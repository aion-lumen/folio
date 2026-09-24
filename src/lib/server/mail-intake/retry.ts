import type {IntakeRun} from './state.js';
/** Preserve imported IDs and completed Memory work. A validator that exited
 * successfully with missing votes must actually run again on explicit retry. */
export function prepareIntakeRetry(run:IntakeRun, preserveAttempts=false):IntakeRun{
 if(run.state!=='failed')throw Error('no_failed_run');
 const next=structuredClone(run);
 if(next.phase==='validate'&&next.error==='incomplete_model_opinions')delete next.validator_id;
 next.state='pending';if(!preserveAttempts)next.attempts=0;
 for(const item of next.items)if(item.stage==='review')delete item.grant_id;
 return next;
}
