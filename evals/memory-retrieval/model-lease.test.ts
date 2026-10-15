import { expect,it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { acquireEvaluationLease } from './model-lease.js';

it('respects existing work and releases only its own coordination row',()=>{
 const path=join(mkdtempSync(join(tmpdir(),'evaluation-gate-')),'gate.db'),db=new Database(path);
 db.exec(`CREATE TABLE local_model_gate(id INTEGER PRIMARY KEY,generation INTEGER);
 CREATE TABLE mail_intake_lease(id INTEGER PRIMARY KEY,token TEXT,expires INTEGER);
 CREATE TABLE local_model_activity(token TEXT PRIMARY KEY,mode TEXT,holder TEXT,pid INTEGER,generation INTEGER,heartbeat INTEGER,started_at TEXT);
 CREATE TABLE private_evidence(value TEXT); INSERT INTO private_evidence VALUES ('untouched');
 INSERT INTO local_model_gate VALUES(1,4); INSERT INTO mail_intake_lease VALUES(1,'other',0);`);
 expect(acquireEvaluationLease(path)).toBeNull(); // Expiry is not authority to steal.
 db.prepare('DELETE FROM mail_intake_lease').run();
 const lease=acquireEvaluationLease(path)!;expect(lease).not.toBeNull();expect(acquireEvaluationLease(path)).toBeNull();
 lease.renew();expect(db.prepare('SELECT generation FROM local_model_gate').get()).toEqual({generation:5});
 lease.release();expect(db.prepare('SELECT * FROM local_model_activity').all()).toEqual([]);
 expect(db.prepare('SELECT * FROM private_evidence').all()).toEqual([{value:'untouched'}]);db.close();
});
