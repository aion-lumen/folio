import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import Database from 'better-sqlite3';

describe('Hermes session traceability', () => {
	let dir = '';

	afterEach(async () => {
		const { resetFolioDbForTests } = await import('./init.js');
		resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('persists a turn and idempotent session-objective links', async () => {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db'));
		vi.resetModules();

		const { resetFolioDbForTests, getFolioDb } = await import('./init.js');
		resetFolioDbForTests();
		const { startHermesTurn, finishHermesTurn } = await import('./writer.js');
		const sessionId = randomUUID();
		const turnId = randomUUID();
		startHermesTurn({
			session_id: sessionId,
			turn_id: turnId,
			conversation_id: 'folio-vault-deadbeef-session',
			vault_fingerprint: 'deadbeef',
			objective_ids: ['obj-01-01', 'obj-01-01', 'obj-02-03'],
			execution_profile: { modelId: 'local-model', fingerprint: 'profile-1' }
		});
		finishHermesTurn(turnId, 'completed');

		const db = getFolioDb();
		expect(db.prepare('SELECT status FROM hermes_turns WHERE turn_id = ?').get(turnId)).toEqual({
			status: 'completed'
		});
		expect(
			(db.prepare('SELECT COUNT(*) AS n FROM hermes_session_objectives WHERE session_id = ?').get(
				sessionId
			) as { n: number }).n
		).toBe(2);
		expect(() =>
			startHermesTurn({
				session_id: sessionId,
				turn_id: randomUUID(),
				conversation_id: 'folio-vault-other-session',
				vault_fingerprint: 'other-vault',
				objective_ids: [],
				execution_profile: { modelId: 'local-model' }
			})
		).toThrow('does not match its original vault');

		const abortedTurnId = randomUUID();
		startHermesTurn({
			session_id: sessionId,
			turn_id: abortedTurnId,
			conversation_id: 'folio-vault-deadbeef-session',
			vault_fingerprint: 'deadbeef',
			objective_ids: [],
			execution_profile: { modelId: 'local-model' }
		});
		finishHermesTurn(abortedTurnId, 'aborted', 'client disconnected or cancelled');
		expect(
			db.prepare('SELECT status FROM hermes_turns WHERE turn_id = ?').get(abortedTurnId)
		).toEqual({ status: 'aborted' });

		expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
		expect(() =>
			db
				.prepare(
					`INSERT INTO hermes_turns
					 (turn_id, session_id, execution_profile_json, status, started_at)
					 VALUES (?, ?, '{}', 'running', ?)`
				)
				.run(randomUUID(), randomUUID(), new Date().toISOString())
		).toThrow(/FOREIGN KEY constraint failed/);
	});

	it('migrates the early three-state CHECK constraint without losing turns', async () => {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		const dbPath = join(dir, 'folio.db');
		const legacy = new Database(dbPath);
		legacy.exec(`
			CREATE TABLE hermes_sessions (
				session_id TEXT PRIMARY KEY,
				conversation_id TEXT NOT NULL UNIQUE,
				vault_fingerprint TEXT NOT NULL,
				started_at TEXT NOT NULL,
				last_activity_at TEXT NOT NULL
			);
			CREATE TABLE hermes_turns (
				turn_id TEXT PRIMARY KEY,
				session_id TEXT NOT NULL,
				execution_profile_json TEXT NOT NULL,
				status TEXT NOT NULL CHECK(status IN ('running','completed','failed')),
				error_summary TEXT,
				started_at TEXT NOT NULL,
				completed_at TEXT,
				FOREIGN KEY (session_id) REFERENCES hermes_sessions(session_id)
			);
			INSERT INTO hermes_sessions VALUES
			  ('session-legacy', 'conversation-legacy', 'vault-legacy', '2026-08-06', '2026-08-06');
			INSERT INTO hermes_turns VALUES
			  ('turn-legacy', 'session-legacy', '{}', 'completed', NULL, '2026-08-06', '2026-08-06');
		`);
		legacy.close();

		vi.stubEnv('FOLIO_DB_PATH', dbPath);
		vi.resetModules();
		const { resetFolioDbForTests, getFolioDb } = await import('./init.js');
		resetFolioDbForTests();
		const db = getFolioDb();
		const sql = db
			.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='hermes_turns'")
			.get() as { sql: string };
		expect(sql.sql).toContain("'aborted'");
		expect(db.prepare("SELECT status FROM hermes_turns WHERE turn_id='turn-legacy'").get()).toEqual({
			status: 'completed'
		});
	});
});
