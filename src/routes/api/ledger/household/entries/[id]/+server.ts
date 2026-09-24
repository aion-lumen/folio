import {error,json} from '@sveltejs/kit';
import {requireModuleCapability} from '$lib/server/modules/http.js';
import {householdEntryDetail} from '$lib/server/modules/ledger-books/household-evidence.js';
import type {RequestHandler} from './$types.js';
export const GET:RequestHandler=({locals,params,url})=>{
 if(locals.user.role!=='owner')error(403,'Nur für den Eigentümer verfügbar.');
 requireModuleCapability('ledger-books','batches.read');
 try{return json(householdEntryDetail(params.id,url.searchParams.get('batch')??'',url.searchParams.get('fee')==='1'),{headers:{'cache-control':'private, no-store'}});}
 catch{error(409,'Buchung oder Prüfnachweis nicht mehr aktuell. Bitte die Übersicht neu laden.');}
};
