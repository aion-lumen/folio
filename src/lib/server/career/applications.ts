import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getFolioDbPath } from '../env.js';
import { getFolioDb } from '../folio-db/init.js';
import { readCartaTracker, type CartaTrackerSnapshot } from './carta-tracker.js';
import { careerRoleKey, strictCompany } from './rejection-reconcile.js';

export interface ApplicationBrief {
 sourceHash:string; summary?:string; contacts?:{name:string;role:string;phone?:string}[];
 salary?:string; salaryKind?:string; talk?:string; questions?:string[]; reference?:string;
 availability?:string; ref?:string;
}
const text=(v:unknown)=>typeof v==='string'?v:'';
export function isoDate(value:unknown):string|null {
 const raw=text(value), match=raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T|$)/);
 if(!match)return null;
 const date=match[0].slice(0,10),time=Date.parse(date+'T12:00:00Z');
 return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===date?date:null;
}
function notedDate(note:string,kind:'BEWORBEN'|'ABSAGE'):string|null {
 const match=note.match(new RegExp(`\\b${kind}\\s+(?:am\\s+)?(\\d{2})\\.(\\d{2})\\.(\\d{4})`,'i'));
 return match?isoDate(`${match[3]}-${match[2]}-${match[1]}`):null;
}
export function projectApplications(snapshot:CartaTrackerSnapshot,briefs:Record<string,ApplicationBrief>={},pendingIds:string[]=[]) {
 let interestCount=0,closedCount=0;
 const rows=snapshot.positions.filter(p=>{
  if(p.status!=='applied')return false;
  if(/INTERESSE EINGEREICHT/i.test(p.title)){interestCount++;return false;}
  if(p.action==='closed'){closedCount++;return false;}
  return true;
 }).map(p=>{
  const note=text(p.note),location=text(p.loc),terms=text(p.contract);
  const stored=briefs[p.identity],brief=stored?.sourceHash===p.rawHash?stored:undefined;
  const history=p.action==='rejected'?snapshot.rejected.find(r=>strictCompany(r.employer)===strictCompany(p.company)&&careerRoleKey(r.title)===careerRoleKey(p.title)):null;
  const status=p.action==='rejected'?'rejected':pendingIds.includes(p.identity)?'pending':'open';
  // Never substitute the listing/discovery date for an application date.
  const date=isoDate(p.submitted_at)??notedDate(note,'BEWORBEN');
  const rejection=status==='rejected'?(notedDate(note,'ABSAGE')??isoDate(history?.date)):null;
  return {id:p.identity,rawHash:p.rawHash,employer:p.company,role:p.title.split(/\s*\[/)[0].trim(),date,status,rejection,
   url:p.url,location:location.split(' / ')[0]||'Nicht dokumentiert',terms:terms||'Pensum nicht dokumentiert',
   remote:/zwei Bürotage/i.test(location)?'2 Bürotage pro Woche':/Homeoffice|Work@Home|hybrid|mobiles Arbeiten/i.test(location)?'Möglich · Anteil offen':'Nicht dokumentiert',
   summary:brief?.summary??text(p.stack).replace(/,/g,' · '),contacts:brief?.contacts??[],
   salary:brief?.salary??'Nicht dokumentiert',salaryKind:brief?.salaryKind??'Eigene Lohnvorstellung',
   talk:brief?.talk??null,questions:brief?.questions??['Aufgaben und Erwartungen für die ersten Monate','Präsenzregelung und nächste Gesprächsschritte'],
   reference:brief?.reference??null,availability:brief?.availability??null,ref:brief?.ref??null,
   briefStale:Boolean(stored&&!brief),note,portal:text(p.portal),verified:isoDate(p.lastVerifiedAt)};
 }).sort((a,b)=>(b.date??'').localeCompare(a.date??''));
 return {rows,interestCount,closedCount,sourceHash:snapshot.sourceHash};
}
export function applicationWeeks(rows:ReturnType<typeof projectApplications>['rows'],now=new Date()) {
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 const monday=new Date(today+'T12:00:00Z');monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7-49);
 return Array.from({length:8},(_,i)=>{
  const start=new Date(+monday+i*7*86400000).toISOString().slice(0,10),end=new Date(+monday+(i+1)*7*86400000).toISOString().slice(0,10);
  return {start,label:start.slice(8,10)+'.'+start.slice(5,7)+'.',applications:rows.filter(r=>r.date&&r.date>=start&&r.date<end).length,rejections:rows.filter(r=>r.rejection&&r.rejection>=start&&r.rejection<end).length};
 });
}
export function readApplications(pendingIds:string[]=[],snapshot=readCartaTracker()) {
 const path=join(dirname(getFolioDbPath()),'career-application-briefs.json');
 const briefs:Record<string,ApplicationBrief>=existsSync(path)?JSON.parse(readFileSync(path,'utf8')):{};
 const projected=projectApplications(snapshot,briefs,pendingIds);
 return {...projected,weeks:applicationWeeks(projected.rows),asOf:new Date().toISOString()};
}
function noteDb(){const db=getFolioDb();db.exec('CREATE TABLE IF NOT EXISTS career_application_notes (identity TEXT PRIMARY KEY, text TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL, owner TEXT NOT NULL)');return db;}
export function applicationNotes():Record<string,{text:string;revision:number;updatedAt:string}> {
 const rows=noteDb().prepare('SELECT identity,text,revision,updated_at FROM career_application_notes').all() as {identity:string;text:string;revision:number;updated_at:string}[];
 return Object.fromEntries(rows.map(r=>[r.identity,{text:r.text,revision:r.revision,updatedAt:r.updated_at}]));
}
export function saveApplicationNote(identity:string,value:string,revision:number,owner:string){
 if(!readCartaTracker().positions.some(p=>p.identity===identity&&p.status==='applied'))throw Error('unknown_application');
 const db=noteDb();return db.transaction(()=>{
  const old=db.prepare('SELECT revision FROM career_application_notes WHERE identity=?').get(identity) as {revision:number}|undefined;
  if((old?.revision??0)!==revision)throw Error('note_changed');
  const updatedAt=new Date().toISOString();
  db.prepare('INSERT INTO career_application_notes VALUES (?,?,?,?,?) ON CONFLICT(identity) DO UPDATE SET text=excluded.text,revision=excluded.revision,updated_at=excluded.updated_at,owner=excluded.owner').run(identity,value,revision+1,updatedAt,owner);
  return {text:value,revision:revision+1,updatedAt};
 })();
}
