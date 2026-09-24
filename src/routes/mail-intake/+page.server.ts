import { mailCoverage } from '$lib/server/mail-intake/coverage.js';
import { error } from '@sveltejs/kit';
import { config,runs,locked } from '$lib/server/mail-intake/state.js';
import { historyWindowStatus } from '$lib/server/mail-intake/runner.js';
export const load=({locals}: {locals:App.Locals})=>{
 if(locals.user.role!=='owner')throw error(403,'Owner access required');
 const recent=runs();
 const current=config();
 return {coverage:mailCoverage(),config:current,historyWindow:current?historyWindowStatus(current):null,runs:recent.slice(0,30),busy:locked()||recent.some(run=>run.state==='pending'||run.state==='running'),runtime:process.env.FOLIO_AUTOMAIL_RUNTIME==='1'};
};
