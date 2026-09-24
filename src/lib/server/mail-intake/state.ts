import { randomUUID } from 'node:crypto';
import { getFolioDb } from '../folio-db/init.js';
export const POLICY = 'incoming-mail-v1';
export type Account = string;
export interface HistoryWindow { enabled: boolean; time_zone: 'Europe/Zurich'; start_hour: number; end_hour: number; }
export interface IntakeOptions { career_rejections?:boolean; history_paused?:boolean; unread_first?:boolean; deferred_accounts?:string[]; }
export interface Config extends IntakeOptions { enabled: boolean; owner: string; authorization_ref: string; authorization_id: string; policy: string; interval_minutes: number; batch_size: number; activated_at: string; history_window: HistoryWindow; }
export interface Item { diagnostic?: {code:string;reason:string}; attachments?: {status:string;parts:number;ready:number;deferred:number;reason:string|null}; id: number; stage: 'extract' | 'review' | 'done'; outcome?: string; proposal_id?: string; grant_id?: string; }
export interface IntakeRun { contracts?:{recorded:number;checkedAt:string}; activity?: {model:string;task:string}; career?:{applied:number;checkedAt:string}; id: string; account: Account; history?: boolean; requested_by?: 'automatic' | 'manual'; batch_size?: number; state: 'pending' | 'running' | 'completed' | 'failed'; phase: 'fetch' | 'validate' | 'memory' | 'career'; worker_id?: string; validator_id?: string; items: Item[]; attempts: number; error?: string; started_at: string; ended_at?: string; }
export function db() {
 const conn = getFolioDb();
 conn.exec(`CREATE TABLE IF NOT EXISTS mail_intake_coverage (account TEXT PRIMARY KEY, value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_intake_source_capture (feedback_id INTEGER PRIMARY KEY, version TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_intake_config (id INTEGER PRIMARY KEY CHECK(id=1), value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_intake_runs (id TEXT PRIMARY KEY, value TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_intake_events (id TEXT PRIMARY KEY, at TEXT NOT NULL, actor_kind TEXT NOT NULL, actor TEXT NOT NULL, detail TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_intake_lease (id INTEGER PRIMARY KEY CHECK(id=1), token TEXT NOT NULL, expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS local_model_gate (id INTEGER PRIMARY KEY CHECK(id=1), generation INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS local_model_activity (token TEXT PRIMARY KEY, mode TEXT NOT NULL CHECK(mode IN ('shared','exclusive')), holder TEXT NOT NULL, pid INTEGER NOT NULL, generation INTEGER NOT NULL, heartbeat INTEGER NOT NULL, started_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_intake_cursors (account TEXT PRIMARY KEY, uidvalidity INTEGER NOT NULL, last_uid INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_intake_sources (feedback_id INTEGER PRIMARY KEY, account TEXT NOT NULL, uid INTEGER NOT NULL, uidvalidity INTEGER NOT NULL, body TEXT NOT NULL, truncated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS mail_intake_locations (account TEXT,folder TEXT,epoch INTEGER,uid INTEGER,feedback_id INTEGER NOT NULL,PRIMARY KEY(account,folder,epoch,uid));
 CREATE TABLE IF NOT EXISTS mail_attachment_parts (
  source_key TEXT PRIMARY KEY,source_kind TEXT NOT NULL,account TEXT NOT NULL,folder TEXT NOT NULL,uidvalidity INTEGER NOT NULL,uid INTEGER NOT NULL,part_specifier TEXT NOT NULL,
  message_id TEXT,source_path_hash TEXT,declared_filename TEXT,declared_mime TEXT,detected_mime TEXT,disposition TEXT,transfer_encoding TEXT,declared_size INTEGER,decoded_size INTEGER,
  state TEXT NOT NULL,reason_code TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS mail_attachment_blobs (
  sha256 TEXT PRIMARY KEY,byte_size INTEGER NOT NULL,detected_mime TEXT NOT NULL,quarantine_path TEXT NOT NULL,security_status TEXT NOT NULL,policy_version TEXT NOT NULL,created_at TEXT NOT NULL
 );
 CREATE TABLE IF NOT EXISTS mail_attachment_sources (
  source_key TEXT NOT NULL REFERENCES mail_attachment_parts(source_key),sha256 TEXT NOT NULL REFERENCES mail_attachment_blobs(sha256),created_at TEXT NOT NULL,PRIMARY KEY(source_key,sha256)
 );`);
 conn.prepare('INSERT OR IGNORE INTO local_model_gate VALUES (1,0)').run();
 return conn;
}
export const DEFAULT_HISTORY_WINDOW: HistoryWindow = {enabled:true,time_zone:'Europe/Zurich',start_hour:22,end_hour:7};
export function config(): Config | null {
 const row = db().prepare('SELECT value FROM mail_intake_config WHERE id=1').get() as {value:string}|undefined;
 if(!row)return null;
 const parsed=JSON.parse(row.value) as Omit<Config,'history_window'>&{history_window?:HistoryWindow};
 return {...parsed,history_window:parsed.history_window??DEFAULT_HISTORY_WINDOW};
}
export function configure(enabled: boolean, owner: string, authorizationRef: string, batchSize=30,options:IntakeOptions={}): Config {
 if(!Number.isInteger(batchSize)||batchSize<1||batchSize>30)throw Error('Invalid batch size');
 const previous = config();
 const next: Config = { enabled, owner, authorization_ref: authorizationRef, authorization_id: randomUUID(), policy: POLICY, interval_minutes: 60, batch_size: batchSize, activated_at: previous?.activated_at ?? new Date().toISOString(), history_window: previous?.history_window??DEFAULT_HISTORY_WINDOW,career_rejections:options.career_rejections??previous?.career_rejections??false,history_paused:options.history_paused??previous?.history_paused??false };
 next.unread_first=options.unread_first??previous?.unread_first??false;
 next.deferred_accounts=options.deferred_accounts??previous?.deferred_accounts??[];
 db().transaction(() => {
 db().prepare('INSERT INTO mail_intake_events VALUES (?,?,?,?,?)').run(randomUUID(), new Date().toISOString(), 'human', owner, JSON.stringify(next));
 db().prepare('INSERT INTO mail_intake_config VALUES (1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(next));
 })();
 if(enabled)for(const run of runs().filter(r=>r.state==='pending')) {for(const item of run.items)if(item.stage==='review')item.grant_id=undefined;save(run);}
 return next;
}
export function getIntakeRun(id:string):IntakeRun|null {
 const row=db().prepare('SELECT value FROM mail_intake_runs WHERE id=?').get(id) as {value:string}|undefined;
 return row?JSON.parse(row.value):null;
}
export function runs(): IntakeRun[] {
 // Limit recent history, never the active queue. Retrying an old batch must
 // remain visible to the scheduler, UI and its exact Memory authorization.
 return (db().prepare(`SELECT value FROM mail_intake_runs
  WHERE id IN (SELECT id FROM mail_intake_runs ORDER BY rowid DESC LIMIT 300)
     OR json_extract(value,'$.state') IN ('pending','running')
  ORDER BY CASE WHEN json_extract(value,'$.state') IN ('pending','running') THEN 0 ELSE 1 END, rowid DESC`).all() as {value:string}[]).map(r=>JSON.parse(r.value));
}
export function save(run: IntakeRun) { db().prepare('INSERT INTO mail_intake_runs VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(run.id, JSON.stringify(run)); }
export function recordEvent(actor: string, detail: Record<string, unknown>) { db().prepare('INSERT INTO mail_intake_events VALUES (?,?,?,?,?)').run(randomUUID(), new Date().toISOString(), 'human', actor, JSON.stringify(detail)); }
export function locked(): boolean { return Boolean(db().prepare('SELECT 1 FROM mail_intake_lease WHERE id=1 AND expires>?').get(Date.now())); }
function pidAlive(pid:number):boolean {try{process.kill(pid,0);return true;}catch(error){return (error as NodeJS.ErrnoException).code==='EPERM';}}
function purgeDeadModelActivities():void {
 const rows=db().prepare('SELECT token,pid FROM local_model_activity').all() as {token:string;pid:number}[];
 for(const row of rows)if(!pidAlive(row.pid))db().prepare('DELETE FROM local_model_activity WHERE token=?').run(row.token);
}
function nextGeneration():number {
 const current=(db().prepare('SELECT generation FROM local_model_gate WHERE id=1').get() as {generation:number}).generation+1;
 db().prepare('UPDATE local_model_gate SET generation=? WHERE id=1').run(current);return current;
}
export interface ModelActivity {token:string;mode:'shared'|'exclusive';holder:string;pid:number;generation:number;heartbeat:number;started_at:string;}
export function modelActivities():ModelActivity[]{purgeDeadModelActivities();return db().prepare('SELECT * FROM local_model_activity ORDER BY started_at').all() as ModelActivity[];}
export function acquireModelActivity(holder:string,mode:'shared'|'exclusive'='shared'):ModelActivity|null {
 if(!/^[a-z0-9][a-z0-9:_-]{1,80}$/i.test(holder))throw Error('invalid_model_activity_holder');
 return db().transaction(()=>{
  purgeDeadModelActivities();
  if(db().prepare('SELECT 1 FROM mail_intake_lease WHERE id=1').get())return null;
  const active=db().prepare('SELECT mode FROM local_model_activity').all() as {mode:'shared'|'exclusive'}[];
  if(active.some(row=>row.mode==='exclusive')||(mode==='exclusive'&&active.length))return null;
  const token=randomUUID(),generation=mode==='exclusive'?nextGeneration():(db().prepare('SELECT generation FROM local_model_gate WHERE id=1').get() as {generation:number}).generation;
  const activity:ModelActivity={token,mode,holder,pid:process.pid,generation,heartbeat:Date.now(),started_at:new Date().toISOString()};
  db().prepare('INSERT INTO local_model_activity VALUES (?,?,?,?,?,?,?)').run(activity.token,activity.mode,activity.holder,activity.pid,activity.generation,activity.heartbeat,activity.started_at);
  return activity;
 })();
}
export function renewModelActivity(activity:Pick<ModelActivity,'token'|'generation'>):void {
 if(!db().prepare('UPDATE local_model_activity SET heartbeat=? WHERE token=? AND generation=?').run(Date.now(),activity.token,activity.generation).changes)throw Error('Local model activity lost');
}
export function releaseModelActivity(token:string):void {db().prepare('DELETE FROM local_model_activity WHERE token=?').run(token);}
export function acquire(): string | null { return db().transaction(() => {
 purgeDeadModelActivities();
 // A lease row without a corresponding live process is deliberately not stolen
 // merely because its TTL elapsed. Startup recovery must first establish that the
 // previous worker is gone; expiry alone never proves an inference has stopped.
 if (db().prepare('SELECT 1 FROM mail_intake_lease WHERE id=1').get() || db().prepare('SELECT 1 FROM local_model_activity').get()) return null;
 const token=randomUUID(),generation=nextGeneration(),now=Date.now();
 db().prepare('INSERT INTO mail_intake_lease VALUES (1,?,?)').run(token,now+300_000);
 db().prepare('INSERT INTO local_model_activity VALUES (?,?,?,?,?,?,?)').run(token,'exclusive','mail-intake',process.pid,generation,now,new Date(now).toISOString());
 return token;
 })(); }
export function renew(token: string) { db().transaction(()=>{
 const generation=(db().prepare('SELECT generation FROM local_model_activity WHERE token=? AND mode=?').get(token,'exclusive') as {generation:number}|undefined)?.generation;
 if(generation===undefined||!db().prepare('UPDATE mail_intake_lease SET expires=? WHERE id=1 AND token=?').run(Date.now()+300_000,token).changes)throw Error('Mail intake lease lost');
 renewModelActivity({token,generation});
 })(); }
export function release(token: string) { db().transaction(()=>{db().prepare('DELETE FROM mail_intake_lease WHERE token=?').run(token);db().prepare('DELETE FROM local_model_activity WHERE token=?').run(token);})(); }
export function assertAuthorization(id: string, runId: string, feedbackId: number, owner: string) {
 const c=config(); const run=runs().find(r=>r.id===runId);
 if (!c?.enabled || c.policy!==POLICY || c.authorization_id!==id || c.owner!==owner || !run?.items.some(i=>i.id===feedbackId && i.stage==='review') || run.state!=='running') throw Error('Automatic mail authorization paused, changed or outside scope');
}
