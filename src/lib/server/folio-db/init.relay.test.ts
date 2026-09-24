import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Relay database migrations', () => {
	let dir = '';

	afterEach(async () => {
		const { resetFolioDbForTests } = await import('./init.js');
		resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('adds the retention marker to an existing relay table without losing cases', async () => {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		const dbPath = join(dir, 'folio.db');
		const legacy = new Database(dbPath);
		legacy.exec(`
			CREATE TABLE relay_cases (
				case_id TEXT PRIMARY KEY,
				domain TEXT NOT NULL,
				source_kind TEXT NOT NULL,
				source_ref TEXT NOT NULL,
				subject TEXT NOT NULL,
				capability TEXT NOT NULL,
				target_id TEXT NOT NULL,
				target_locality TEXT NOT NULL CHECK(target_locality IN ('local','cloud')),
				data_classes_json TEXT NOT NULL,
				status TEXT NOT NULL CHECK(status IN ('detected','staged','approved','shared','claimed','needs_context','answered','reviewed','applied','closed','rejected','expired')),
				request_hash TEXT NOT NULL,
				request_body_path TEXT NOT NULL,
				response_hash TEXT,
				retention_until TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			);
			INSERT INTO relay_cases VALUES (
				'legacy-case', 'career', 'mail', 'mail:legacy', 'Legacy', 'reply_draft',
				'career-session', 'cloud', '["mail_body"]', 'staged', 'hash', '/tmp/payload.json',
				NULL, '2026-08-20T00:00:00.000Z', '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
			);
		`);
		legacy.close();

		vi.stubEnv('FOLIO_DB_PATH', dbPath);
		vi.resetModules();
		const { resetFolioDbForTests, getFolioDb } = await import('./init.js');
		resetFolioDbForTests();
		const db = getFolioDb();
		expect((db.prepare('PRAGMA table_info(relay_cases)').all() as Array<{ name: string }>)
			.some((column) => column.name === 'content_purged_at')).toBe(true);
		expect(db.prepare("SELECT case_id, content_purged_at FROM relay_cases WHERE case_id = 'legacy-case'").get())
			.toEqual({ case_id: 'legacy-case', content_purged_at: null });
	});

	it('widens legacy relay applications for Memory candidates without losing accepted artifacts', async () => {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		const dbPath = join(dir, 'folio.db');
		const legacy = new Database(dbPath);
		legacy.exec(`
			CREATE TABLE relay_cases (
				case_id TEXT PRIMARY KEY, domain TEXT NOT NULL, source_kind TEXT NOT NULL,
				source_ref TEXT NOT NULL, subject TEXT NOT NULL, capability TEXT NOT NULL,
				target_id TEXT NOT NULL, target_locality TEXT NOT NULL CHECK(target_locality IN ('local','cloud')),
				data_classes_json TEXT NOT NULL, status TEXT NOT NULL,
				request_hash TEXT NOT NULL, request_body_path TEXT NOT NULL, response_hash TEXT,
				retention_until TEXT NOT NULL, content_purged_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
			);
			INSERT INTO relay_cases VALUES (
				'legacy-applied', 'career', 'mail', 'mail:legacy-applied', 'Legacy', 'reply_draft',
				'career-session', 'cloud', '["mail_body"]', 'applied', 'hash', '/tmp/payload.json',
				'hash', '2026-08-20T00:00:00.000Z', NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z'
			);
			CREATE TABLE relay_applications (
				application_id TEXT PRIMARY KEY, case_id TEXT NOT NULL UNIQUE,
				artifact_kind TEXT NOT NULL CHECK(artifact_kind IN ('mail_draft','objective','context_request','no_action')),
				target_ref TEXT NOT NULL, applied_by TEXT NOT NULL, applied_at TEXT NOT NULL,
				FOREIGN KEY (case_id) REFERENCES relay_cases(case_id)
			);
			INSERT INTO relay_applications VALUES (
				'legacy-application', 'legacy-applied', 'no_action', 'relay:legacy-applied', 'owner', '2026-08-01T00:00:00.000Z'
			);
		`);
		legacy.close();

		vi.stubEnv('FOLIO_DB_PATH', dbPath);
		vi.resetModules();
		const { resetFolioDbForTests, getFolioDb } = await import('./init.js');
		resetFolioDbForTests();
		const db = getFolioDb();
		expect((db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='relay_applications'").get() as { sql: string }).sql)
			.toContain("'memory_candidate'");
		expect(db.prepare("SELECT application_id, artifact_kind FROM relay_applications WHERE case_id = 'legacy-applied'").get())
			.toEqual({ application_id: 'legacy-application', artifact_kind: 'no_action' });
	});
});
