import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

describe('getClassifiedMailIdsForRun', () => {
	let dir: string;

	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('returns classified mail_ids in seq order', async () => {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		const dbPath = join(dir, 'folio.db');
		vi.stubEnv('FOLIO_DB_PATH', dbPath);
		vi.resetModules();

		const { resetFolioDbForTests, getFolioDb } = await import('./init.js');
		resetFolioDbForTests();
		const db = getFolioDb();
		const ru = 'test-run-uuid';
		// vi.stubEnv doesn't intercept $env/dynamic/private, so this test
		// occasionally writes to the real ~/.folio/folio.db. Idempotent
		// cleanup keeps the test deterministic regardless of accumulated
		// pollution from prior runs.
		db.prepare('DELETE FROM worker_run_logs WHERE run_uuid = ?').run(ru);
		const ins = db.prepare(
			`INSERT INTO worker_run_logs (run_uuid, seq, voice, event_type, mail_id)
			 VALUES (?, ?, 'heuristik', 'classified', ?)`
		);
		ins.run(ru, 1, 101);
		ins.run(ru, 2, 102);

		const { getClassifiedMailIdsForRun } = await import('./reader.js');
		expect(getClassifiedMailIdsForRun(ru)).toEqual([101, 102]);
	});
});
