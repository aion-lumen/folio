import { randomBytes, createHash } from 'node:crypto';
import { readPrivate, savePrivate, state, saveState, audit, type CalendarEvent } from './store.js';
const BASE='https://www.googleapis.com/calendar/v3';
export interface Client {client_id:string;client_secret:string;redirect_uri:string;}
interface Tokens {access_token:string;refresh_token?:string;expires_at:number;scope:string;}
export function configured(){return Boolean(readPrivate<Client>('client'));}
export function writeGranted(){return (readPrivate<Tokens>('tokens')?.scope??'').split(' ').includes('https://www.googleapis.com/auth/calendar.events.owned');}
export function connected(){return Boolean(readPrivate<Tokens>('tokens')?.refresh_token);}
export function configure(raw:string,redirect:string){const parsed=JSON.parse(raw),c=parsed.web; if(!c?.client_id?.endsWith('.apps.googleusercontent.com')||typeof c.client_secret!=='string'||!Array.isArray(c.redirect_uris)||!c.redirect_uris.includes(redirect))throw new Error('Web-OAuth-JSON mit der angezeigten Redirect-URI erforderlich.');if(connected())throw new Error('Bestehende Verbindung zuerst trennen.');savePrivate('client',{client_id:c.client_id,client_secret:c.client_secret,redirect_uri:redirect});audit('client_configured',{});}
function client(){const c=readPrivate<Client>('client');if(!c)throw new Error('Google-OAuth-Zugang fehlt.');return c;}
export function begin(write:boolean){const c=client(),nonce=randomBytes(32).toString('base64url'),verifier=randomBytes(48).toString('base64url');savePrivate('oauth',{nonce,verifier,expires:Date.now()+600000,write});const u=new URL('https://accounts.google.com/o/oauth2/v2/auth');u.search=new URLSearchParams({client_id:c.client_id,redirect_uri:c.redirect_uri,response_type:'code',scope:['https://www.googleapis.com/auth/calendar.calendarlist.readonly',write?'https://www.googleapis.com/auth/calendar.events.owned':'https://www.googleapis.com/auth/calendar.events.readonly'].join(' '),access_type:'offline',prompt:'consent',state:nonce,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();return {url:u.toString(),nonce};}
async function tokenRequest(fields:Record<string,string>){const c=client();const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({...fields,client_id:c.client_id,client_secret:c.client_secret}),signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error('Google-Anmeldung abgelaufen oder abgelehnt. Bitte erneut verbinden.');return await r.json() as {access_token:string;refresh_token?:string;expires_in:number;scope?:string};}
export async function complete(code:string, nonce:string, cookie:string) {
 const oauth=readPrivate<{nonce:string;verifier:string;expires:number;write:boolean}>('oauth');
 if(!oauth || oauth.nonce!==nonce || nonce!==cookie || oauth.expires<Date.now()) {
  throw new Error('Ungültige oder abgelaufene Google-Anmeldung.');
 }
 savePrivate('oauth',null);
 const previous=state();
 const tokens=await tokenRequest({grant_type:'authorization_code',code,redirect_uri:client().redirect_uri,code_verifier:oauth.verifier});
 if(!tokens.refresh_token)throw new Error('Google hat keinen dauerhaften Zugriff erteilt. Bitte erneut verbinden.');
 savePrivate('tokens',{...tokens,scope:tokens.scope??'',expires_at:Date.now()+tokens.expires_in*1000});
 const writeEnabled=(tokens.scope??'').split(' ').includes('https://www.googleapis.com/auth/calendar.events.owned');
 // An account switch must never expose the previous account's cached events.
 saveState({events:[],writeEnabled});
 if(previous.calendarId) {
  const selected=(await calendars()).find(calendar=>calendar.id===previous.calendarId);
  if(selected)saveState({calendarId:selected.id,calendarName:selected.summary,events:[],writeEnabled:writeEnabled&&selected.accessRole==='owner'});
 }
 audit('connected',{write:writeEnabled});
}
let refreshing:Promise<string>|null=null;
async function access(){const t=readPrivate<Tokens>('tokens');if(!t?.refresh_token)throw new Error('Google Kalender ist noch nicht verbunden.');if(t.expires_at>Date.now()+60000)return t.access_token;if(!refreshing)refreshing=(async()=>{const n=await tokenRequest({grant_type:'refresh_token',refresh_token:t.refresh_token!});savePrivate('tokens',{...t,...n,expires_at:Date.now()+n.expires_in*1000});return n.access_token;})().finally(()=>{refreshing=null;});return refreshing;}
export async function google(path:string,init:RequestInit={}){const r=await fetch(BASE+path,{...init,headers:{Authorization:`Bearer ${await access()}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(25000)});if(!r.ok)throw new Error(`Google Kalender konnte die Aktion nicht abschließen (HTTP ${r.status}).`);return r.json();}
export async function calendars(){const items:Array<{id:string;summary:string;accessRole:string;timeZone?:string}>=[];let page='';do{const d=await google('/users/me/calendarList?'+new URLSearchParams({maxResults:'250',...(page?{pageToken:page}:{})}));items.push(...d.items);page=d.nextPageToken??'';}while(page);return items;}
export async function sync(){const s=state();if(!s.calendarId)throw new Error('Bitte einen Kalender auswählen.');const items:CalendarEvent[]=[];let page='';const now=Date.now();do{const d=await google('/calendars/'+encodeURIComponent(s.calendarId)+'/events?'+new URLSearchParams({singleEvents:'true',maxResults:'2500',timeMin:new Date(now-90*86400000).toISOString(),timeMax:new Date(now+366*86400000).toISOString(),...(page?{pageToken:page}:{})}));items.push(...d.items.filter((e:CalendarEvent)=>e.status!=='cancelled').map((event:CalendarEvent&{attendees?:Array<{email?:string;self?:boolean;responseStatus?:string}>})=>{const {id,summary,location,status,iCalUID,etag,start,end,htmlLink}=event;const attendeeResponses=event.attendees?.filter(attendee=>attendee.email&&!attendee.self&&['accepted','declined','tentative','needsAction'].includes(attendee.responseStatus??'')).map(attendee=>({emailHash:createHash('sha256').update(attendee.email!.trim().toLocaleLowerCase('en-US')).digest('hex'),responseStatus:attendee.responseStatus as NonNullable<CalendarEvent['attendeeResponses']>[number]['responseStatus']}));return {id,summary,location,status,iCalUID,etag,start,end,htmlLink,...(attendeeResponses?.length?{attendeeResponses}:{})};}));page=d.nextPageToken??'';}while(page);const next={...s,events:items,syncedAt:new Date().toISOString()};saveState(next);return next;}
export function disconnect(){savePrivate('tokens',null);savePrivate('oauth',null);saveState({events:[]});audit('disconnected',{});}
