import {error,json} from '@sveltejs/kit';
import {requireModuleCapability} from '$lib/server/modules/http.js';
import {householdExpenseHierarchy} from '$lib/server/modules/ledger-books/household.js';
import type {RequestHandler} from './$types.js';
export const GET:RequestHandler=({locals,url})=>{
 if(locals.user.role!=='owner')error(403,'Nur für den Eigentümer verfügbar.');
 requireModuleCapability('ledger-books','batches.read');
 try{return json(householdExpenseHierarchy(url.searchParams),{headers:{'cache-control':'private, no-store'}});}
 catch(e){error(e instanceof Error&&e.message==='invalid_query'?400:409,'Die Auswahl hat sich geändert oder ist nicht verfügbar. Bitte die Übersicht neu laden.');}
};
