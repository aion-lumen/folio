import {error,redirect} from '@sveltejs/kit';
import {complete} from '$lib/server/calendar/google.js';
import {guard} from '$lib/server/calendar/store.js';
import type {RequestHandler} from './$types.js';
export const GET:RequestHandler=async({locals,url,cookies})=>{if(locals.user.role!=='owner')throw error(403);guard();const cookie=cookies.get('folio-calendar-oauth')??'';cookies.delete('folio-calendar-oauth',{path:'/calendar'});if(url.searchParams.has('error'))throw error(400,'Google-Anmeldung wurde nicht abgeschlossen.');try{await complete(url.searchParams.get('code')??'',url.searchParams.get('state')??'',cookie);}catch(e){throw error(400,(e as Error).message);}throw redirect(303,'/calendar');};
