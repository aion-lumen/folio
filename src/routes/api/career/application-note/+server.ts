import { error, json } from '@sveltejs/kit';
import { isDemoVaultActive } from '$lib/server/env.js';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import { saveApplicationNote } from '$lib/server/career/applications.js';
import type { RequestHandler } from './$types.js';

export const POST:RequestHandler=async({locals,request,url})=>{
 if(locals.user.role!=='owner'||isDemoVaultActive())throw error(403,'Private Owner-Notiz erforderlich');
 requireModuleCapability('career','events.write');
 if(request.headers.get('origin')!==url.origin||!request.headers.get('content-type')?.startsWith('application/json'))throw error(403,'Bitte direkt in Folio speichern');
 const input=await request.json().catch(()=>null);
 if(!input||Object.keys(input).sort().join(',')!=='identity,revision,text'||typeof input.identity!=='string'||input.identity.length>2000||typeof input.text!=='string'||input.text.length>8000||!Number.isSafeInteger(input.revision)||input.revision<0)throw error(400,'Ungültige Notiz');
 try{return json(saveApplicationNote(input.identity,input.text,input.revision,`owner:${locals.user.id}`),{headers:{'cache-control':'no-store'}});}
 catch(cause){throw error(409,cause instanceof Error&&cause.message==='note_changed'?'Notiz inzwischen geändert. Bitte Übersicht aktualisieren.':'Bewerbung nicht mehr verfügbar. Bitte Übersicht aktualisieren.');}
};
