import { describe,it,expect } from 'vitest';
import { parseCartaTrackerSource } from './carta-tracker.js';
import { projectApplications,applicationWeeks,isoDate } from './applications.js';

function snapshot(rows:Record<string,unknown>[],rejected:unknown[][]=[]){return parseCartaTrackerSource(`const DATA=${JSON.stringify(rows.map((r,i)=>({company:'Example',title:'Analyst',url:`https://jobs.example/${100000+i}`,status:'applied',...r})))};\nconst REJECTED=${JSON.stringify(rejected)};`);}
describe('live application overview',()=>{
 it('uses confirmed submission dates, never the discovery date, and rejects impossible dates',()=>{
  const data=projectApplications(snapshot([{date:'2026-01-01',note:'BEWORBEN am 03.09.2026'},{date:'2026-02-01'},{submitted_at:'2026-09-04T22:00:00Z',note:'BEWORBEN 01.09.2026'}]));
  expect(data.rows.map(r=>r.date)).toEqual(['2026-09-04','2026-09-03',null]);expect(isoDate('2026-02-31')).toBeNull();
 });
 it('does not confuse interest-only, closed projects or own exclusions with received rejections',()=>{
  const data=projectApplications(snapshot([{title:'Role [INTERESSE EINGEREICHT]'},{action:'closed'},{title:'Role B',status:'skip'},{note:'BEWORBEN 02.09.2026'}],[['Example','Analyst','2026-09-05','Own decision: not a fit']]));
  expect(data).toMatchObject({interestCount:1,closedCount:1});expect(data.rows).toHaveLength(1);expect(data.rows[0].status).toBe('open');
 });
 it('binds private conversation briefs to the current source revision',()=>{
  const s=snapshot([{note:'BEWORBEN 02.09.2026'}]),row=s.positions[0];
  expect(projectApplications(s,{[row.identity]:{sourceHash:row.rawHash,salary:'Own expectation',contacts:[{name:'Named person',role:'HR'}]}}).rows[0].contacts).toHaveLength(1);
  const stale=projectApplications(s,{[row.identity]:{sourceHash:'stale',salary:'Old amount'}},[row.identity]).rows[0];expect(stale.salary).toBe('Nicht dokumentiert');expect(stale.briefStale).toBe(true);expect(stale.status).toBe('pending');
 });
 it('counts submissions and received rejections in separate weeks including the current Zurich week',()=>{
  const rows=projectApplications(snapshot([{note:'BEWORBEN 06.09.2026 · ABSAGE 14.09.2026',action:'rejected'},{submitted_at:'2026-09-22'},{status:'skip',date:'2026-09-21'}])).rows;
  const weeks=applicationWeeks(rows,new Date('2026-09-20T22:30:00Z'));
  expect(weeks.at(-1)?.start).toBe('2026-09-21');expect(weeks.find(w=>w.start==='2026-08-31')?.applications).toBe(1);expect(weeks.find(w=>w.start==='2026-09-14')?.rejections).toBe(1);expect(weeks.reduce((n,w)=>n+w.rejections,0)).toBe(1);
 });
});
