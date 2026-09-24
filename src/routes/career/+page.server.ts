import { careerTrackerAvailability } from '$lib/server/career/carta-tracker.js';
import { error } from '@sveltejs/kit';
import { isDemoVaultActive } from '$lib/server/env.js';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import { applicationNotes, readApplications } from '$lib/server/career/applications.js';
import { careerSyncView } from '$lib/server/career/mail-sync.js';
import { config } from '$lib/server/mail-intake/state.js';
import type { PageServerLoad } from './$types.js';

export const load:PageServerLoad=({locals,setHeaders,url})=>{
 if(locals.user.role!=='owner'||isDemoVaultActive())throw error(403,'Private Bewerbungsübersicht');
 requireModuleCapability('career','panel.render');requireModuleCapability('career','cases.read');
 setHeaders({'cache-control':'private, no-store'});
 const sync=careerSyncView(),current=config(),source=careerTrackerAvailability();
 const snapshot=source.snapshot??{sourcePath:"",sourceHash:"",positions:[],rejected:[]};
 return {sourceStatus:source.status,historicalRejection:snapshot.rejected.find(r=>r.identity===url.searchParams.get('position'))??null,...readApplications(sync.pendingIds,snapshot),notes:applicationNotes(),
  sync:{enabled:Boolean(current?.enabled&&current.career_rejections),runtime:process.env.FOLIO_AUTOMAIL_RUNTIME==='1',state:sync.state?.state??null,checkedAt:sync.state?.checkedAt??null,applied:sync.state?.applied??0,error:sync.state?.error??null,
   report:sync.state?.report?JSON.stringify({...sync.state.report,approval:sync.review}):null},
 };
};
