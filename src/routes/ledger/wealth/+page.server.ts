import { error } from '@sveltejs/kit';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import { readWealthOverview } from '$lib/server/modules/ledger-books/wealth.js';
import { readHouseholdOverview } from '$lib/server/modules/ledger-books/household.js';
import type { PageServerLoad } from './$types.js';
export const load:PageServerLoad=({locals,setHeaders})=>{
 if(locals.user.role!=='owner')error(403,'Nur für den Eigentümer verfügbar.');
 requireModuleCapability('ledger-books','panel.render');
 requireModuleCapability('ledger-books','batches.read');
 setHeaders({'cache-control':'private, no-store'});
 return {...readWealthOverview(),...readHouseholdOverview()};
};
