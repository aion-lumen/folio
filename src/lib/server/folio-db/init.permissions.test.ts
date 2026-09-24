import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('Folio database filesystem boundary', () => {
	let dir = '';

	afterEach(async () => {
		const { resetFolioDbForTests } = await import('./init.js');
		resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('keeps the state directory owner-only and database files private', async () => {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true, mode: 0o755 });
		const dbPath = join(dir, 'folio.db');
		vi.stubEnv('FOLIO_DB_PATH', dbPath);
		vi.resetModules();

		const init = await import('./init.js');
		init.resetFolioDbForTests();
		init.getFolioDb();

		expect(statSync(dir).mode & 0o777).toBe(0o700);
		expect(statSync(dbPath).mode & 0o777).toBe(0o600);
		for (const suffix of ['-wal', '-shm']) {
			const path = `${dbPath}${suffix}`;
			if (statSync(path, { throwIfNoEntry: false })) {
				expect(statSync(path).mode & 0o777).toBe(0o600);
			}
		}
	});

	it('adds canonical proposal and entity links to an existing memory baseline', async () => {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		const dbPath = join(dir, 'folio.db');
		const legacy = new Database(dbPath);
		legacy.exec(`CREATE TABLE memory_facts (
			fact_id TEXT PRIMARY KEY, domain TEXT NOT NULL, data_class TEXT NOT NULL,
			sensitivity TEXT NOT NULL, subject TEXT NOT NULL, predicate TEXT NOT NULL,
			value_text TEXT NOT NULL, status TEXT NOT NULL, source_kind TEXT NOT NULL,
			source_ref TEXT NOT NULL, source_excerpt TEXT, derived_from_external INTEGER NOT NULL DEFAULT 0,
			valid_from TEXT, valid_to TEXT, supersedes_fact_id TEXT, recorded_at TEXT NOT NULL,
			confirmed_at TEXT, confirmed_by TEXT
		)`);
		legacy.close();
		vi.stubEnv('FOLIO_DB_PATH', dbPath);
		vi.resetModules();

		const init = await import('./init.js');
		init.resetFolioDbForTests();
		const db = init.getFolioDb();
		const columns = db.prepare('PRAGMA table_info(memory_facts)').all() as Array<{ name: string }>;
		expect(columns.map((column) => column.name)).toEqual(expect.arrayContaining([
			'proposal_id', 'subject_entity_id', 'object_entity_id'
		]));
		expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'memory_%'").all()).toEqual(expect.arrayContaining([
			{ name: 'memory_entities' }, { name: 'memory_relations' }, { name: 'memory_episodes' }, { name: 'memory_ledger' }
		]));
	});

	it('preserves exclusive v1 gold labels while adding the multi-label review columns', async () => {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		const dbPath = join(dir, 'folio.db');
		const legacy = new Database(dbPath);
		legacy.exec(`CREATE TABLE memory_mail_domain_reviews (
			review_id INTEGER PRIMARY KEY AUTOINCREMENT,
			run_id TEXT NOT NULL,
			feedback_id INTEGER NOT NULL,
			verdict TEXT NOT NULL,
			primary_domain TEXT NOT NULL,
			secondary_domains_json TEXT NOT NULL DEFAULT '[]',
			review_category TEXT,
			note TEXT,
			reviewed_by_user_id INTEGER NOT NULL,
			reviewed_at TEXT NOT NULL
		)`);
		legacy.prepare(`INSERT INTO memory_mail_domain_reviews (
			run_id, feedback_id, verdict, primary_domain, secondary_domains_json,
			review_category, note, reviewed_by_user_id, reviewed_at
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
			'gold-v1', 42, 'included', 'job', '["finance"]',
			'detail_rich', 'legacy decision', 1, '2026-08-18T10:00:00Z'
		);
		legacy.close();
		vi.stubEnv('FOLIO_DB_PATH', dbPath);
		vi.resetModules();

		const init = await import('./init.js');
		init.resetFolioDbForTests();
		const db = init.getFolioDb();
		const row = db.prepare(`SELECT review_category, review_traits_json, label_schema
			FROM memory_mail_domain_reviews WHERE feedback_id = 42`).get() as Record<string, string>;

		expect(row).toEqual({
			review_category: 'detail_rich',
			review_traits_json: '[]',
			label_schema: 'v1-exclusive'
		});
	});
});
