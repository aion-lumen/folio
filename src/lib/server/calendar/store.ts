import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { getFolioDbPath, isDemoVaultActive } from '../env.js';
import { getFolioDb } from '../folio-db/init.js';
import type { CalendarDomain } from '$lib/calendar/domain.js';
export function guard() { if(isDemoVaultActive()) throw new Error('Kalenderzugriff ist im Demo-Vault deaktiviert.'); }
function root(){guard();const p=join(dirname(getFolioDbPath()),'calendar-'+createHash('sha256').update(getFolioDbPath()).digest('hex').slice(0,12));mkdirSync(p,{recursive:true,mode:0o700});return p;}
export function readPrivate<T>(name:string):T|null {const p=join(root(),name+'.json');return existsSync(p)?JSON.parse(readFileSync(p,'utf8')):null;}
export function savePrivate(name:string,value:unknown){const p=join(root(),name+'.json'),tmp=p+'.'+randomUUID();writeFileSync(tmp,JSON.stringify(value),{mode:0o600});renameSync(tmp,p);}
export function db(){guard();const d=getFolioDb();d.exec(`CREATE TABLE IF NOT EXISTS calendar_state (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS calendar_actions (id TEXT PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL, detail TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS calendar_source_links (source_id TEXT NOT NULL,calendar_id TEXT NOT NULL,event_id TEXT NOT NULL,verified_at TEXT NOT NULL,PRIMARY KEY(source_id,calendar_id));
CREATE TABLE IF NOT EXISTS calendar_drafts (id TEXT PRIMARY KEY, value TEXT NOT NULL, status TEXT NOT NULL, event_id TEXT);`);return d;}
export type CalendarResponseStatus='accepted'|'declined'|'tentative'|'needsAction';
export interface CalendarEvent {id:string;summary?:string;location?:string;status?:string;iCalUID?:string;etag?:string;domain?:CalendarDomain;attendeeResponses?:Array<{emailHash:string;responseStatus:CalendarResponseStatus}>;inviteeResponses?:Array<{role:string;responseStatus:CalendarResponseStatus}>;start:{dateTime?:string;date?:string};end:{dateTime?:string;date?:string};htmlLink?:string;}
export interface CalendarState {calendarId?:string;calendarName?:string;writeEnabled?:boolean;syncedAt?:string;events:CalendarEvent[];}
export function state():CalendarState {const r=db().prepare('SELECT value FROM calendar_state WHERE id=1').get() as {value:string}|undefined;return r?JSON.parse(r.value):{events:[]};}
export function saveState(s:CalendarState){db().prepare('INSERT INTO calendar_state VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(s));}
export function audit(kind:string,detail:unknown){db().prepare('INSERT INTO calendar_actions VALUES (?,?,?,?)').run(randomUUID(),new Date().toISOString(),kind,JSON.stringify(detail));}
