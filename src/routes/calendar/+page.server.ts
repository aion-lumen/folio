import {calendarSettingsActions} from '$lib/server/calendar/settings.js';
import {error,fail,redirect} from '@sveltejs/kit';
import {configured,connected,calendars,sync} from '$lib/server/calendar/google.js';
import {guard,state} from '$lib/server/calendar/store.js';
import {sources,prepare,pending,createApproved,zurichTime,calendarMatches,calendarConflicts,recordedCalendarSourceIds,calendarEventsWithDomains} from '$lib/server/calendar/planning.js';
import {buildCalendarProposalQueue,proposalDraftFromSource} from '$lib/server/calendar/proposals.js';
import {withFamilyInvitees,withInviteeResponses} from '$lib/server/calendar/invitations.js';
import type {Actions,PageServerLoad} from './$types.js';
function owner(locals:App.Locals){if(locals.user.role!=='owner')throw error(403,'Owner access required');guard();}
export const load:PageServerLoad=async({locals,url,setHeaders})=>{
 owner(locals);setHeaders({'Cache-Control':'private, no-store'});
 let warning='',list:Awaited<ReturnType<typeof calendars>>=[];
 if(connected())try{list=await calendars();const s=state();if(s.calendarId&&(!s.syncedAt||Date.now()-Date.parse(s.syncedAt)>300000))await sync();}catch(e){warning=(e as Error).message;}
 const allSources=sources(),matches=await calendarMatches().catch(()=>({} as Record<string,string>)),current=state(),queue=buildCalendarProposalQueue(allSources,current.events,new Date(),recordedCalendarSourceIds(current.events));
 for(const item of queue.open){const source=allSources.find(source=>source.fact_id===item.sourceId);if(source&&item.draft)item.draft=withFamilyInvitees(source,item.draft);}
 const sourceId=url.searchParams.get('source')??'',proposalId=url.searchParams.get('proposal')??'',openProposal=queue.open.find(item=>item.sourceId===proposalId),proposalState=proposalId?(queue.existing.some(item=>item.sourceId===proposalId)?'existing':openProposal?'open':'missing'):'';
 const visibleIds=new Set([...queue.open,...queue.existing,...queue.deadlines].map(item=>item.sourceId));if(sourceId)visibleIds.add(sourceId);if(proposalId)visibleIds.add(proposalId);
 return {configured:configured(),connected:connected(),state:{...current,events:withInviteeResponses(calendarEventsWithDomains(current.events))},calendars:list,warning,sources:allSources.filter(source=>visibleIds.has(source.fact_id)).map(s=>({...s,suggestion:proposalDraftFromSource(s)})),queue,matches,conflicts:calendarConflicts(),draft:url.searchParams.has('draft')?pending(url.searchParams.get('draft')!):null,proposalDraft:openProposal?.draft??null,proposalState,proposalId,redirectUri:url.origin+'/calendar/callback',sourceId};
};
export const actions:Actions={
 ...calendarSettingsActions,
 prepare:async({locals,request})=>{owner(locals);let id;try{const f=await request.formData(),s=sources().find(s=>s.fact_id===f.get('sourceId'));if(!s)throw new Error('Quelle nicht gefunden.');id=prepare(withFamilyInvitees(s,{sourceId:s.fact_id,sourceRef:s.source_ref,summary:String(f.get('summary')??''),location:String(f.get('location')??''),start:zurichTime(String(f.get('start')??'')),end:zurichTime(String(f.get('end')??''))}));}catch(e){return fail(400,{message:(e as Error).message});}throw redirect(303,'/calendar?draft='+id);},
 createProposal:async({locals,request})=>{owner(locals);try{const f=await request.formData();if(f.get('approve')!=='yes')throw new Error('Explizite Freigabe erforderlich.');const s=sources().find(s=>s.fact_id===f.get('sourceId'));if(!s)throw new Error('Quelle nicht gefunden.');const base=proposalDraftFromSource(s),draft=base?withFamilyInvitees(s,base):null;if(!draft)throw new Error('Für diese Quelle fehlen noch Angaben.');return {message:await createApproved(prepare(draft),'owner:'+locals.user.id)};}catch(e){return fail(409,{message:(e as Error).message});}},
 create:async({locals,request})=>{owner(locals);try{const f=await request.formData();if(f.get('approve')!=='yes')throw new Error('Explizite Freigabe erforderlich.');return {message:await createApproved(String(f.get('draftId')??''),'owner:'+locals.user.id)};}catch(e){return fail(409,{message:(e as Error).message});}}
};
