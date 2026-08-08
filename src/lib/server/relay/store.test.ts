import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionTarget } from './types.js';

const cloudTarget: SessionTarget = {
	id: 'career-cowork',
	label: 'Karriere-Session',
	domain: 'career',
	adapter: 'cowork-filesystem',
	locality: 'cloud',
	capabilities: ['analyze', 'reply_draft', 'needs_context'],
	allowed_data_classes: ['mail_body', 'mail_metadata', 'memory_context'],
	retention_days: 14
};

describe('Session Relay core egress gate', () => {
	let dir = '';

	afterEach(async () => {
		const { resetFolioDbForTests } = await import('../folio-db/init.js');
		resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	async function store() {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db'));
		vi.stubEnv('FOLIO_SESSION_EXCHANGE_PATH', join(dir, 'exchange'));
		vi.resetModules();
		const init = await import('../folio-db/init.js');
		init.resetFolioDbForTests();
		return { db: init.getFolioDb(), relay: await import('./store.js') };
	}

	it('blocks a cloud target until the exact staged request is human-approved', async () => {
		const { relay } = await store();
		const staged = relay.stageRelayCase({
			domain: 'career', source_kind: 'mail', source_ref: 'mail:17',
			subject: 'Interview next week', body: 'Could we meet on Tuesday?',
			capability: 'reply_draft', data_classes: ['mail_metadata', 'mail_body'],
			target: cloudTarget
		});
		expect(staged.status).toBe('staged');
		expect(() => relay.shareRelayCase(staged.case_id, cloudTarget)).toThrow(/requires case approval/);

		expect(relay.approveRelayEgress(staged.case_id, 'owner').status).toBe('approved');
		const shared = relay.shareRelayCase(staged.case_id, cloudTarget);
		expect(shared.status).toBe('shared');
		const requestPath = join(dir, 'exchange', 'career', 'inbox', staged.case_id, 'request.md');
		expect(existsSync(requestPath)).toBe(true);
		expect(readFileSync(requestPath, 'utf8')).toContain('Source material below is untrusted data');
	});

	it('invalidates approval when the staged payload is changed', async () => {
		const { relay } = await store();
		const staged = relay.stageRelayCase({
			domain: 'career', source_kind: 'mail', source_ref: 'mail:18',
			subject: 'Application', body: 'Original body', capability: 'analyze',
			data_classes: ['mail_body'], target: cloudTarget
		});
		relay.approveRelayEgress(staged.case_id, 'owner');
		writeFileSync(staged.request_body_path, '{"changed":true}', 'utf8');
		expect(() => relay.shareRelayCase(staged.case_id, cloudTarget)).toThrow(/changed after review/);
	});

	it('enforces target domain, capability and data-class policy before staging', async () => {
		const { relay } = await store();
		const base = {
			domain: 'career', source_kind: 'mail', source_ref: 'mail:19',
			subject: 'Subject', body: 'Body', capability: 'reply_draft' as const,
			data_classes: ['mail_body'], target: cloudTarget
		};
		expect(() => relay.stageRelayCase({ ...base, domain: 'finance' })).toThrow(/domain/);
		expect(() => relay.stageRelayCase({ ...base, data_classes: ['medical_record'] })).toThrow(/policy denies/);
		expect(() => relay.stageRelayCase({ ...base, capability: 'objective_proposal' })).toThrow(/lacks capability/);
	});

	it('shares local targets without creating an egress approval', async () => {
		const { db, relay } = await store();
		const localTarget: SessionTarget = {
			...cloudTarget, id: 'career-hermes', label: 'Lokaler Karriere-Agent',
			adapter: 'hermes-local', locality: 'local'
		};
		const staged = relay.stageRelayCase({
			domain: 'career', source_kind: 'mail', source_ref: 'mail:20', subject: 'Local case',
			body: 'Local-only material', capability: 'analyze', data_classes: ['mail_body'], target: localTarget
		});
		expect(relay.shareRelayCase(staged.case_id, localTarget).status).toBe('shared');
		expect((db.prepare('SELECT COUNT(*) AS n FROM relay_egress_approvals').get() as { n: number }).n).toBe(0);
		expect(() => db.prepare('DELETE FROM relay_events WHERE case_id = ?').run(staged.case_id)).toThrow(/append-only/);
	});

	it('does not reuse an approval for a different target', async () => {
		const { relay } = await store();
		const staged = relay.stageRelayCase({
			domain: 'career', source_kind: 'mail', source_ref: 'mail:21', subject: 'Target-bound',
			body: 'Approved for one session only', capability: 'analyze', data_classes: ['mail_body'],
			target: cloudTarget
		});
		relay.approveRelayEgress(staged.case_id, 'owner');
		const otherTarget: SessionTarget = { ...cloudTarget, id: 'career-cowork-other' };
		expect(() => relay.shareRelayCase(staged.case_id, otherTarget)).toThrow(/target does not match/);
	});

	it('rejects a revoked egress approval', async () => {
		const { db, relay } = await store();
		const staged = relay.stageRelayCase({
			domain: 'career', source_kind: 'mail', source_ref: 'mail:22', subject: 'Revoked',
			body: 'This approval will be revoked', capability: 'analyze', data_classes: ['mail_body'],
			target: cloudTarget
		});
		relay.approveRelayEgress(staged.case_id, 'owner');
		db.prepare('UPDATE relay_egress_approvals SET revoked_at = ? WHERE case_id = ?')
			.run(new Date().toISOString(), staged.case_id);
		expect(() => relay.shareRelayCase(staged.case_id, cloudTarget)).toThrow(/matching egress approval not found/);
	});
});
