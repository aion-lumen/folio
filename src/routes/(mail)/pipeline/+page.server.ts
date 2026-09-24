import { accounts } from '$lib/server/mail-intake/accounts.js';
import { listRecentPipelineRuns, getActiveWorkerRun, getWorkerRunLogs, getWorkerRunSummary } from '$lib/server/folio-db/reader.js';
import { pipelineSnapshot } from '$lib/server/mail-intake/pipeline-status.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({setHeaders}) => {
 setHeaders({'cache-control':'private, no-store'});
 const pipelineRuns = listRecentPipelineRuns(30, false);
 const snapshot=pipelineSnapshot();
 const activeRun=getActiveWorkerRun();
 return {
  pipelineRuns, activeRun, accounts:accounts().map(({id,label})=>({id,label})),
  activeLogs:activeRun ? getWorkerRunLogs(activeRun.run_uuid) : [],
  activeSummary:activeRun ? getWorkerRunSummary(activeRun.run_uuid) : null,
  ...snapshot
 };
};
