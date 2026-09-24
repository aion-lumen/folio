import {error,fail,type Action} from '@sveltejs/kit';
import {configure,calendars,sync,disconnect,writeGranted} from './google.js';
import {guard,state,saveState,audit} from './store.js';
function owner(locals:App.Locals){if(locals.user.role!=='owner')throw error(403,'Owner access required');guard();}
export const calendarSettingsActions:Record<'configure'|'select'|'sync'|'disconnect',Action>={
 configure:async({locals,request,url})=>{owner(locals);try{const f=await request.formData();configure(String(f.get('client')??''),url.origin+'/calendar/callback');return {message:'Zugang gespeichert. Jetzt mit Google verbinden.'};}catch(e){return fail(400,{message:(e as Error).message});}},
 select:async({locals,request})=>{owner(locals);try{const f=await request.formData(),id=String(f.get('calendar'));const c=(await calendars()).find(c=>c.id===id);if(!c)throw new Error('Kalender nicht verfügbar.');saveState({...state(),calendarId:c.id,calendarName:c.summary,events:[],syncedAt:undefined,writeEnabled:writeGranted()&&c.accessRole==='owner'});audit('calendar_selected',{calendarId:c.id});await sync();return {message:'Kalender synchronisiert.'};}catch(e){return fail(400,{message:(e as Error).message});}},
 sync:async({locals})=>{owner(locals);try{await sync();return {message:'Kalender aktualisiert.'};}catch(e){return fail(400,{message:(e as Error).message});}},
 disconnect:async({locals})=>{owner(locals);disconnect();return {message:'Lokale Verbindung getrennt. Google-Zugriff kann zusätzlich im Google-Konto widerrufen werden.'};},
};
