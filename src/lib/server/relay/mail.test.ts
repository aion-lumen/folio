import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SessionTarget } from './types.js';

const target: SessionTarget = {
	id: 'career-cowork',
	label: 'Karriere-Session',
	domain: 'career',
	adapter: 'cowork-filesystem',
	locality: 'cloud',
	capabilities: ['reply_draft', 'needs_context'],
	allowed_data_classes: ['mail_metadata', 'mail_body', 'memory_context'],
	memory_max_sensitivity: 'private',
	retention_days: 14
};

describe('mail to Session Relay', () => {
	let dir = '';

	afterEach(async () => {
		const { resetFolioDbForTests } = await import('../folio-db/init.js');
		resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	async function setup() {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db'));
		vi.stubEnv('FOLIO_SESSION_EXCHANGE_PATH', join(dir, 'exchange'));
		vi.resetModules();
		const init = await import('../folio-db/init.js');
		init.resetFolioDbForTests();
		init.getFolioDb();
		return {
			mail: await import('./mail.js'),
			relay: await import('./store.js')
		};
	}

	it('stages one reviewable career case per source and target', async () => {
		const { mail, relay } = await setup();
		const input = {
			feedback_id: 17,
			account_id: 'mirhamed',
			imap_uid: 4217,
			sender: 'Recruiting <jobs@example.org>',
			to_addr: 'candidate@example.net',
			subject: 'Einladung zum Gespräch',
			received_at: '2026-08-10T08:00:00Z',
			domain: 'job',
			body: 'Wir möchten Sie am Dienstag sprechen.',
			body_truncated: true
		};
		const first = mail.stageCareerMailRelay(input, [target]);
		expect(first.created).toBe(true);
		expect(first.case.status).toBe('staged');
		const payload = relay.getRelayPayloadForReview(first.case.case_id);
		expect(payload.source_ref).toBe('mail:mirhamed:4217');
		expect(payload.body).toContain('Von: Recruiting <jobs@example.org>');
		expect(payload.body).toContain('Vollständigkeit ist nicht belegt');
		expect(payload.data_classes).toContain('memory_context');

		const second = mail.stageCareerMailRelay(input, [target]);
		expect(second.created).toBe(false);
		expect(second.case.case_id).toBe(first.case.case_id);
	});

	it('rejects non-career mail and targets without mail policy', async () => {
		const { mail } = await setup();
		const base = {
			feedback_id: 18, account_id: 'yahoo', imap_uid: 99, sender: 'shop@example.org',
			subject: 'Order', received_at: null, domain: 'shopping', body: 'Shipped', body_truncated: false
		};
		expect(() => mail.stageCareerMailRelay(base, [target])).toThrow(/Job oder Job-Lead/);
		expect(() => mail.stageCareerMailRelay({ ...base, domain: 'job' }, [{
			...target, allowed_data_classes: ['mail_metadata']
		}])).toThrow(/Kein passendes/);
	});
});
