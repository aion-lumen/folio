import {error} from '@sveltejs/kit';
import {configured,connected,calendars} from '$lib/server/calendar/google.js';
import {guard,state} from '$lib/server/calendar/store.js';
import {calendarSettingsActions} from '$lib/server/calendar/settings.js';
import type {PageServerLoad,Actions} from './$types';
export const load:PageServerLoad=async({locals,url,setHeaders})=>{
 if(locals.user.role!=='owner')throw error(403,'Owner access required');guard();setHeaders({'Cache-Control':'private, no-store'});
 let warning='',list:Awaited<ReturnType<typeof calendars>>=[];
 if(connected())try{list=await calendars();}catch(e){warning=(e as Error).message;}
 const {calendarName,calendarId,writeEnabled,syncedAt}=state();
 return {configured:configured(),connected:connected(),calendars:list,warning,state:{calendarName,calendarId,writeEnabled,syncedAt},redirectUri:url.origin+'/calendar/callback'};
};
export const actions:Actions=calendarSettingsActions;
