import { state,type CalendarEvent } from './store.js';
import { connected,sync } from './google.js';
import {sources,recordedCalendarSourceIds,type CalendarSource} from './planning.js';
import {buildCalendarProposalQueue} from './proposals.js';
export type AppointmentSource = CalendarSource;
const day=(date:Date)=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function appointmentAttention(sources:AppointmentSource[],events:CalendarEvent[],now=new Date(),recordedSourceIds=new Set<string>()){
 const end=day(new Date(now.getTime()+30*86400000));
 return buildCalendarProposalQueue(sources,events,now,recordedSourceIds).open.filter(item=>item.date<=end).map(item=>({id:item.sourceId,title:item.title,date:item.date,candidate:item.candidate,possible:item.status==='needs_details',urgent:item.date<=day(new Date(now.getTime()+7*86400000)),href:item.href,status:item.status,evidenceCount:item.evidenceCount}));
}
let refreshing:Promise<unknown>|null=null;
export async function calendarAttention(){
 let current=state();let unavailable=false;
 if(connected()&&current.calendarId&&(!current.syncedAt||Date.now()-Date.parse(current.syncedAt)>900000)){
  try{refreshing??=sync().finally(()=>{refreshing=null;});await refreshing;current=state();}catch{unavailable=true;}
 }
 const allSources=sources(),recorded=recordedCalendarSourceIds(current.events),queue=buildCalendarProposalQueue(allSources,current.events,new Date(),recorded);
 return {items:appointmentAttention(allSources,current.events,new Date(),recorded),counts:queue.counts,syncedAt:current.syncedAt??null,unavailable:unavailable||!current.calendarId};
}
