import type { CalendarDomain } from './domain.js';

export type Event = {id:string;summary?:string;location?:string;status?:string;domain?:CalendarDomain;inviteeResponses?:Array<{role:string;responseStatus:'accepted'|'declined'|'tentative'|'needsAction'}>;start:{date?:string;dateTime?:string};end:{date?:string;dateTime?:string}};
export function dayKey(date:Date):string{return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);}
export function shiftDay(day:string,delta:number):string{const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+delta);return d.toISOString().slice(0,10);}
export function monthDays(month:string):string[]{const first=month+'-01',weekday=(new Date(first+'T12:00:00Z').getUTCDay()+6)%7;return Array.from({length:42},(_,i)=>shiftDay(first,i-weekday));}
export function onDay(event:Event,day:string):boolean{
 if(event.status==='cancelled')return false;
 const start=event.start.date??(event.start.dateTime?dayKey(new Date(event.start.dateTime)):'');
 const end=event.end.date?shiftDay(event.end.date,-1):event.end.dateTime?dayKey(new Date(Math.max(Date.parse(event.start.dateTime??event.end.dateTime),Date.parse(event.end.dateTime)-1))):start;
 return !!start&&start<=day&&day<=end;
}
