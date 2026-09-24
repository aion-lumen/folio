import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import Database from 'better-sqlite3';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const path=vi.hoisted(()=>({value:''}));
vi.mock('../env.js',()=>({getFeedbackDbPath:()=>path.value}));
import {getFeedbackRowsByMailDate} from './reader.js';
let root:string;
beforeEach(()=>{root=mkdtempSync(join(tmpdir(),'folio-date-window-'));path.value=join(root,'feedback.db');const db=new Database(path.value);db.pragma('journal_mode=WAL');db.exec('CREATE TABLE feedback (id INTEGER PRIMARY KEY,mail_date TEXT,created_at TEXT)');db.prepare('INSERT INTO feedback VALUES (1,?,?)').run('2026-09-24T11:00:00+02:00','2026-09-24');db.prepare('INSERT INTO feedback VALUES (2,?,?)').run('2016-09-24T11:00:00+02:00','2026-09-25');db.close();});
afterEach(()=>rmSync(root,{recursive:true,force:true}));
it('filters event time before the import-order limit, including timezone offsets',()=>{
 expect(getFeedbackRowsByMailDate('2026-09-24T09:00:00Z','2026-09-24T10:00:00Z',1).map(r=>r.id)).toEqual([1]);
 expect(getFeedbackRowsByMailDate('2026-09-24T08:00:00Z','2026-09-24T09:00:00Z',1)).toEqual([]);
});
it('does not silently label a capped window exhaustive',()=>{
 expect(()=>getFeedbackRowsByMailDate('2016-01-01','2027-01-01',1)).toThrow('mail_date_window_limit_exceeded');
});
