import Database from 'better-sqlite3';
import { parseArgs } from 'node:util';
import { privatePath, readMemorySnapshot, writePrivate } from './private-support.js';

const { values } = parseArgs({ options: { source: { type: 'string' }, output: { type: 'string' } } });
if (!values.source || !values.output) throw new Error('Required: --source /private/folio.db --output /private/new-snapshot.json');
const output = privatePath(values.output);
// Deliberately no import of app initialization: the source cannot be migrated or opened writable.
const db = new Database(values.source, { readonly: true, fileMustExist: true });
try {
 db.pragma('query_only = ON');
 const snapshot = db.transaction(() => readMemorySnapshot(db))();
 writePrivate(output, snapshot);
 console.log(JSON.stringify({ output, counts: Object.fromEntries(Object.entries(snapshot.tables).map(([t,rows]) => [t,rows.length])) }));
} finally { db.close(); }
