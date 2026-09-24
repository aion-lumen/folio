import type {FocusItem} from './store.js';
import type {CalendarSource} from '../calendar/planning.js';
import {matches} from '../calendar/planning.js';
import {proposalDraftFromSource,sourceDateSpan} from '../calendar/proposals.js';
import type {CalendarState} from '../calendar/store.js';

/** Current display projection only; never records attendance or edits a task/calendar. */
export function calendarFocusStatus(item:FocusItem,sources:CalendarSource[],calendar:CalendarState,recorded:Set<string>,now=new Date()):{item:FocusItem;mode:'done'|'waiting';evidence:{id:string;text:string;status:string;source:string}}|null{
 if(!item.href.startsWith('/calendar?'))return null;
 const id=new URL(item.href,'http://folio.local').searchParams.get('source');
 const source=sources.find(s=>s.fact_id===id);if(!source)return null;
 const span=sourceDateSpan(source),draft=proposalDraftFromSource(source);if(!span||!draft)return null;
 const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 if((span.end??span.start)<today)return {item:{...item,title:draft.summary+' · vergangener Termin',recommendation:'Der Termin liegt zurück. Bei Bedarf Ergebnis oder Folgeschritte festhalten; keine offene Kalenderfrist.',why:'Das Termindatum ist vergangen. Teilnahme und Erledigung sind dadurch nicht bestätigt.'},mode:'waiting',evidence:{id:'calendar-status:'+id,text:'Vergangener Termin am '+span.start,status:'Datumsabgleich',source:source.source_ref}};
 const age=now.getTime()-Date.parse(calendar.syncedAt??'');
 if(!calendar.calendarId||!Number.isFinite(age)||age<0||age>86400000)return null;
 if(!recorded.has(source.fact_id)&&matches(draft,calendar.events.filter(e=>e.status!=='cancelled')).length!==1)return null;
 return {item:{...item,title:draft.summary+' · im Kalender',recommendation:'Der Termin ist bereits im Kalender eingetragen. Keine erneute Anlage erforderlich.',why:'Mit dem aktuellen Kalenderbestand abgeglichen.'},mode:'done',evidence:{id:'calendar-status:'+id,text:'Termineintrag vorhanden; die Teilnahme selbst ist damit nicht bestätigt.',status:'Kalenderabgleich · '+calendar.syncedAt!.slice(0,10),source:item.href}};
}
