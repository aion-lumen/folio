import type { CalendarEvent } from './store.js';
import { draftFromSource, matches, type CalendarSource, type EventDraft } from './planning.js';

export type CalendarProposalKind = 'appointment' | 'date_range' | 'deadline';
export type CalendarProposalStatus = 'ready' | 'needs_details' | 'existing';

export interface CalendarProposal {
	id: string;
	sourceId: string;
	sourceIds: string[];
	sourceRefs: string[];
	title: string;
	date: string;
	endDate: string | null;
	kind: CalendarProposalKind;
	status: CalendarProposalStatus;
	candidate: boolean;
	draft: EventDraft | null;
	evidenceCount: number;
	href: string;
}

export interface CalendarProposalQueue {
	open: CalendarProposal[];
	existing: CalendarProposal[];
	deadlines: CalendarProposal[];
	counts: { ready: number; needsDetails: number; existing: number; deadlines: number; unresolved: number; past: number };
}

export { sourceDateSpan } from '../../calendar/source-dates.js';
import { sourceDateSpan } from '../../calendar/source-dates.js';
function deadline(source: CalendarSource) {
	if(source.domain==='finance')return true;
	return /\b(rechnung|invoice|bill|fällig|due|zahlung|payment|renewal|kündigung|subscription|abo|taggeld|benefits?|leistungsende|deadline|befragung|umfrage|survey)\b/i.test(`${source.subject} ${source.value_text}`)
		|| /\b(?:end|ends|endet)\s+(?:am|on)\b/i.test(source.value_text);
}
function ownerWords(): string[]{return (process.env.FOLIO_OWNER_ALIASES??'').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[];}
function words(source: CalendarSource) {
	const aliases:Record<string,string>={kurs:'course',training:'course',schulung:'course',beratung:'meeting',termin:'meeting'};
	return new Set((`${source.subject} ${source.value_text}`.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)??[])
		.map(v=>aliases[v]??v).filter(v=>![...ownerWords(),'scheduled','2026','2025','september','oktober','october','datum','date','mail'].includes(v)));
}
function related(a:CalendarSource,b:CalendarSource){const aw=words(a),bw=words(b);let common=0;for(const w of aw)if(bw.has(w))common++;return common/Math.max(1,Math.min(aw.size,bw.size))>=.45;}
function proposalTitle(source:CalendarSource,draft:EventDraft|null){
	if(draft?.summary)return draft.summary;
	return /[\p{L}]{3}/u.test(source.value_text)?source.value_text:source.subject||source.value_text;
}
function plusDay(date:string){const value=new Date(date+'T12:00:00Z');value.setUTCDate(value.getUTCDate()+1);return value.toISOString().slice(0,10);}
export function proposalDraftFromSource(source:CalendarSource):EventDraft|null{
	const span=sourceDateSpan(source);if(!span||deadline(source))return null;
	const timed=draftFromSource({...source,valid_from:span.start});if(timed)return timed;
	const generic=(/^[^@\s]+@[^@\s]+$/.test(source.subject.trim()) || (ownerWords().length>0 && source.subject.toLowerCase().split(/\s+/).every(word=>ownerWords().includes(word))));
	const summary=!generic&&/[\p{L}]{3}/u.test(source.subject)?source.subject:source.value_text;
	return {sourceId:source.fact_id,sourceRef:source.source_ref,summary,location:'',start:span.start,end:plusDay(span.end??span.start),allDay:true,assumption:'Die Quelle nennt keine Uhrzeit. Folio schlägt deshalb einen ganztägigen Eintrag vor; die Datumsgrenzen sind aus den Mailbelegen übernommen.'};
}

export function buildCalendarProposalQueue(sources: CalendarSource[], events: CalendarEvent[], now=new Date(), recordedSourceIds=new Set<string>()): CalendarProposalQueue {
	const today=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
	const raw:{source:CalendarSource;span:{start:string;end:string|null};kind:CalendarProposalKind;draft:EventDraft|null}[]=[];
	let unresolved=0,past=0;
	for(const source of sources.filter(s=>s.source_ref.startsWith('mail:'))){
		const span=sourceDateSpan(source);if(!span){unresolved++;continue;}if((span.end??span.start)<today){past++;continue;}
		const kind=deadline(source)?'deadline':span.end&&span.end!==span.start?'date_range':'appointment';
		raw.push({source,span,kind,draft:kind==='deadline'?null:proposalDraftFromSource(source)});
	}
	const clusters:typeof raw[]=[];
	for(const item of raw){const group=clusters.find(g=>g[0].kind===item.kind&&g[0].span.start===item.span.start&&g[0].span.end===item.span.end&&related(g[0].source,item.source));if(group)group.push(item);else clusters.push([item]);}
	const open:CalendarProposal[]=[],existing:CalendarProposal[]=[],deadlines:CalendarProposal[]=[];
	for(const group of clusters){
		group.sort((a,b)=>Number(b.source.status==='confirmed')-Number(a.source.status==='confirmed')||Number(!!b.draft)-Number(!!a.draft));
		const primary=group[0],matched=group.flatMap(i=>i.draft?matches(i.draft,events):[]),recorded=group.some(i=>recordedSourceIds.has(i.source.fact_id));
		const status:CalendarProposalStatus=matched.length||recorded?'existing':primary.draft?'ready':'needs_details';
		const item:CalendarProposal={id:`${primary.kind}:${primary.span.start}:${primary.source.fact_id}`,sourceId:primary.source.fact_id,sourceIds:group.map(i=>i.source.fact_id),sourceRefs:[...new Set(group.map(i=>i.source.source_ref))],title:proposalTitle(primary.source,primary.draft),date:primary.span.start,endDate:primary.span.end,kind:primary.kind,status,candidate:!group.some(i=>i.source.status==='confirmed'),draft:primary.draft,evidenceCount:group.length,href:'/calendar?source='+encodeURIComponent(primary.source.fact_id)};
		if(primary.kind==='deadline')deadlines.push(item);else if(status==='existing')existing.push(item);else open.push(item);
	}
	const order=(a:CalendarProposal,b:CalendarProposal)=>a.date.localeCompare(b.date)||a.title.localeCompare(b.title);
	open.sort(order);existing.sort(order);deadlines.sort(order);
	return {open,existing,deadlines,counts:{ready:open.filter(i=>i.status==='ready').length,needsDetails:open.filter(i=>i.status==='needs_details').length,existing:existing.length,deadlines:deadlines.length,unresolved,past}};
}
