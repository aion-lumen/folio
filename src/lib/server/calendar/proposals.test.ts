import {describe,expect,it} from 'vitest';
import {buildCalendarProposalQueue,proposalDraftFromSource,sourceDateSpan} from './proposals.js';
import type {CalendarSource} from './planning.js';

const source=(overrides:Partial<CalendarSource>):CalendarSource=>({fact_id:'fact',domain:'personal',data_class:'appointment',subject:'Termin',predicate:'scheduled_for',value_text:'Termin am 2026-09-24 um 10:00 Uhr',valid_from:'2026-09-24',source_ref:'mail:test:1',status:'candidate',...overrides});

describe('calendar proposal projection',()=>{
	it('recognizes an already stored appointment even when the mail has no end time',()=>{
		const queue=buildCalendarProposalQueue([source({value_text:'RAV Beratung am 2026-09-24 um 10:00 Uhr'})],[{id:'rav',summary:'RAV Beratung',start:{dateTime:'2026-09-24T10:00:00+02:00'},end:{dateTime:'2026-09-24T10:30:00+02:00'}}],new Date('2026-09-15T10:00:00Z'));
		expect(queue.open).toEqual([]);expect(queue.existing).toHaveLength(1);
	});
	it('recognizes a live event through its successful creation receipt when a historical draft used a different date shape',()=>{
		const queue=buildCalendarProposalQueue([source({fact_id:'course',subject:'PL-300 Kurs',value_text:'Kurs vom 21. bis 23. September 2026',valid_from:'2026-09-10'})],[],new Date('2026-09-15T10:00:00Z'),new Set(['course']));
		expect(queue.open).toEqual([]);expect(queue.existing).toMatchObject([{sourceId:'course',status:'existing'}]);
	});
	it('keeps finance deadlines out of the appointment review queue',()=>{
		const queue=buildCalendarProposalQueue([source({domain:'finance',data_class:'transaction',subject:'Salt Rechnung',value_text:'Rechnung zahlbar bis 2026-09-28',valid_from:'2026-09-28'})],[],new Date('2026-09-15T10:00:00Z'));
		expect(queue.open).toEqual([]);expect(queue.deadlines).toMatchObject([{kind:'deadline',date:'2026-09-28'}]);
	});
	it('treats surveys and benefit end dates as deadlines rather than appointments',()=>{
		const queue=buildCalendarProposalQueue([source({subject:'Online-Befragung',value_text:'2026-09-07 bis 2026-09-25 während der Unterrichtszeit',valid_from:'2026-09-07'}),source({fact_id:'benefit',domain:'career',value_text:'Unemployment benefits end on 2026-10-16',valid_from:'2026-10-16'})],[],new Date('2026-09-15T10:00:00Z'));
		expect(queue.open).toEqual([]);expect(queue.deadlines).toHaveLength(2);
	});
	it('uses explicit evidence dates and combines duplicate multi-day course facts',()=>{
		const first=source({fact_id:'course-1',domain:'career',subject:'PL-300 Kurs',value_text:'Microsoft Power BI Data Analyst course 21 to 23 September 2026',valid_from:'2026-09-10',source_ref:'mail:test:course'});
		const second=source({fact_id:'course-2',domain:'career',subject:'Microsoft PL-300 Training',value_text:'Training vom 21. bis 23. September 2026 bei Digicomp',valid_from:'2026-09-14',source_ref:'mail:test:course-duplicate'});
		const queue=buildCalendarProposalQueue([first,second],[],new Date('2026-09-15T10:00:00Z'));
		expect(queue.open).toHaveLength(1);expect(queue.open[0]).toMatchObject({date:'2026-09-21',endDate:'2026-09-23',kind:'date_range',status:'ready',evidenceCount:2,draft:{allDay:true,start:'2026-09-21',end:'2026-09-24'}});
	});
	it('counts unresolved and past mail facts without putting them in front of the owner',()=>{
		const queue=buildCalendarProposalQueue([source({fact_id:'past',value_text:'Termin am 2020-01-01 um 10:00',valid_from:'2020-01-01'}),source({fact_id:'unknown',value_text:'Termin irgendwann',valid_from:null})],[],new Date('2026-09-15T10:00:00Z'));
		expect(queue.open).toEqual([]);expect(queue.counts).toMatchObject({past:1,unresolved:1});
	});
});

it('parses compact same-month ranges',()=>{expect(sourceDateSpan({value_text:'Elternbesuchstage 2026-10-27/28',valid_from:'2026-10-01'})).toEqual({start:'2026-10-27',end:'2026-10-28'});});
it('turns an exact date range without times into an all-day draft with an exclusive Google end date',()=>{expect(proposalDraftFromSource(source({subject:'PL-300 Kurs',value_text:'Kurs vom 21. bis 23. September 2026',valid_from:'2026-09-10'}))).toMatchObject({summary:'PL-300 Kurs',start:'2026-09-21',end:'2026-09-24',allDay:true});});
