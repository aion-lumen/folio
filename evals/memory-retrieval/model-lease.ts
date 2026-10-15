import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

/** Participate in Folio's existing gate without initializing or reading its private corpus. */
export function acquireEvaluationLease(path: string) {
 const db = new Database(path, { fileMustExist: true });
 db.pragma('busy_timeout = 1000');
 const token = randomUUID();
 try {
  const generation = db.transaction(() => {
   // Do not recover, steal or expire another process's lease here.
   if (db.prepare('SELECT 1 FROM mail_intake_lease LIMIT 1').get() || db.prepare('SELECT 1 FROM local_model_activity LIMIT 1').get()) return null;
   const row = db.prepare('SELECT generation FROM local_model_gate WHERE id=1').get() as {generation:number}|undefined;
   if (!row) throw new Error('Existing model gate required');
   const generation = row.generation + 1, now = Date.now();
   db.prepare('UPDATE local_model_gate SET generation=? WHERE id=1').run(generation);
   db.prepare('INSERT INTO local_model_activity VALUES (?,?,?,?,?,?,?)').run(token,'exclusive','synthetic-memory-evaluation',process.pid,generation,now,new Date(now).toISOString());
   return generation;
  }).immediate();
  if (generation === null) { db.close(); return null; }
  return {
   renew() {
    if (db.prepare('UPDATE local_model_activity SET heartbeat=? WHERE token=? AND generation=?').run(Date.now(),token,generation).changes !== 1) throw new Error('Evaluation lease lost');
   },
   release() { try { db.prepare('DELETE FROM local_model_activity WHERE token=? AND generation=?').run(token,generation); } finally { db.close(); } }
  };
 } catch (error) { db.close(); throw error; }
}
