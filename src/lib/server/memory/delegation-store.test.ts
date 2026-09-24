import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('bounded delegated memory confirmation', () => {
	let dir = '';
	afterEach(async () => {
		(await import('../folio-db/init.js')).resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.useRealTimers(); vi.unstubAllEnvs(); vi.resetModules();
	});
	async function setup() {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID()); mkdirSync(dir, { recursive: true });
		vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db')); vi.resetModules();
		const m = await import('./store.js'); const db = (await import('../folio-db/init.js')).getFolioDb();
		const bundle = m.proposeMemoryBundle({ domain: 'personal', source_kind: 'mail', source_ref: 'mail:test:42', extractor_id: 'extractor', actor_id: 'extractor', facts: [{ data_class: 'preference', sensitivity: 'private', subject: 'Person', predicate: 'prefers', value: 'Tuesday', source_excerpt: 'Tuesday' }] });
		const digest = m.memorySnapshotDigest({ body: 'Tuesday' });
		const grant = m.authorizeMemoryDelegation(bundle.proposal.proposal_id, 'owner:1', 'explicit-owner-request', digest, 'reviewer');
		return { m, db, bundle, digest, grant };
	}
	it('separates owner authorization from model confirmation and is idempotent', async () => {
		const { m, db, bundle, digest, grant } = await setup();
		m.finishDelegatedMemoryReview(grant.grant_id, digest, 'reviewer', 'accept', ['fully_supported']);
		const count = db.prepare('SELECT count(*) AS n FROM memory_ledger').get();
		m.finishDelegatedMemoryReview(grant.grant_id, digest, 'reviewer', 'accept', ['fully_supported']);
		expect(db.prepare('SELECT count(*) AS n FROM memory_ledger').get()).toEqual(count);
		expect(m.getMemoryProposalBundle(bundle.proposal.proposal_id).facts[0]).toMatchObject({ status: 'confirmed', confirmed_by: 'local-memory-reviewer:reviewer' });
		const events = db.prepare("SELECT actor_kind, actor_id, detail_json FROM memory_events WHERE event_type = 'confirmed'").all() as Array<{ actor_kind: string; actor_id: string; detail_json: string }>;
		expect(events).toHaveLength(1); expect(events[0].actor_kind).toBe('system');
		expect(JSON.parse(events[0].detail_json)).toMatchObject({ grant_id: grant.grant_id, authorized_by: 'owner:1', authorization_ref: 'explicit-owner-request' });
		expect(() => db.prepare("DELETE FROM memory_ledger WHERE event_type = 'delegation_authorized'").run()).toThrow(/append-only/);
	});
	it.each(['source', 'proposal', 'model', 'expired'] as const)('fails closed after %s changes', async (change) => {
		const { m, db, digest, grant } = await setup();
		if (change === 'proposal') db.prepare("UPDATE memory_facts SET value_text = 'Other'").run();
		if (change === 'expired') vi.spyOn(Date, 'now').mockReturnValue(Date.parse(grant.expires_at) + 1);
		expect(() => m.finishDelegatedMemoryReview(grant.grant_id, change === 'source' ? 'f'.repeat(64) : digest, change === 'model' ? 'other' : 'reviewer', 'accept', ['fully_supported'])).toThrow();
		expect(m.getMemoryProposalBundle(grant.proposal_id).proposal.status).toBe('candidate');
		expect(m.getMemoryDelegationResult(grant.grant_id)).toBeNull();
		vi.restoreAllMocks();
	});
	it('records a rejected review without rejecting or confirming the underlying candidates', async () => {
		const { m, grant, digest } = await setup();
		m.finishDelegatedMemoryReview(grant.grant_id, digest, 'reviewer', 'reject', ['overinterpretation']);
		expect(m.getMemoryProposalBundle(grant.proposal_id).proposal.status).toBe('candidate');
	});
	it('requires a real recorded grant and disallows contradictory acceptance', async () => {
		const { m, grant, digest } = await setup();
		expect(() => m.finishDelegatedMemoryReview('made-up', digest, 'reviewer', 'accept', ['fully_supported'])).toThrow();
		expect(() => m.finishDelegatedMemoryReview(grant.grant_id, digest, 'reviewer', 'accept', ['overinterpretation'])).toThrow();
	});
	it('honors revocation and does not create a duplicate source in another domain', async () => {
		const { m, grant, digest } = await setup();
		m.revokeMemoryDelegation(grant.grant_id, 'owner:1');
		expect(() => m.finishDelegatedMemoryReview(grant.grant_id, digest, 'reviewer', 'accept', ['fully_supported'])).toThrow();
		expect(m.hasMemorySourceDomainConflict('finance', 'mail:test:42')).toBe(true);
		expect(m.hasMemorySourceDomainConflict('personal', 'mail:test:42')).toBe(false);
	});
	it('shows the newest decision per proposal while retaining the earlier review in the journal', async () => {
		const { m, db, grant, digest } = await setup();
		m.finishDelegatedMemoryReview(grant.grant_id, digest, 'reviewer', 'reject', ['overinterpretation']);
		const next = m.authorizeMemoryDelegation(grant.proposal_id, 'owner:1', 'new-explicit-review', digest, 'reviewer');
		m.finishDelegatedMemoryReview(next.grant_id, digest, 'reviewer', 'accept', ['fully_supported']);
		expect(m.listDelegatedMemoryReviews()).toHaveLength(1);
		expect(m.listDelegatedMemoryReviews()[0].detail.verdict).toBe('accept');
		expect(db.prepare("SELECT count(*) AS n FROM memory_ledger WHERE event_type = 'delegated_reviewed'").get()).toEqual({ n: 2 });
	});
	it('binds episode roles and refuses a grant from an older review policy', async () => {
		const { m, db, digest, grant } = await setup();
		const stale = { ...grant, grant_id: randomUUID(), review_policy: 'older-policy' };
		db.prepare('INSERT INTO memory_ledger (event_id, proposal_id, object_kind, object_id, event_type, actor_kind, actor_id, detail_json, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), grant.proposal_id, 'proposal', grant.proposal_id, 'delegation_authorized', 'human', 'owner:1', JSON.stringify(stale), new Date().toISOString());
		expect(() => m.finishDelegatedMemoryReview(stale.grant_id, digest, 'reviewer', 'accept', ['fully_supported'])).toThrow();
		const event = m.proposeMemoryBundle({ domain: 'personal', source_kind: 'mail', source_ref: 'mail:test:43', extractor_id: 'extractor', actor_id: 'extractor',
			entities: [{ local_ref: 'person', entity_type: 'person', canonical_key: 'fixture', canonical_label: 'Person', sensitivity: 'private', source_excerpt: 'Person attended.' }],
			episodes: [{ episode_type: 'event', title: 'Meeting', summary: 'Person attended.', occurred_at: '2026-09-01', sensitivity: 'private', source_excerpt: 'Person attended.', entity_refs: [{ ref: 'person', role: 'participant' }] }] });
		const eventGrant = m.authorizeMemoryDelegation(event.proposal.proposal_id, 'owner:1', 'event-review', digest, 'reviewer');
		db.prepare('UPDATE memory_episode_entities SET role = ? WHERE episode_id = ?').run('organizer', event.episodes[0].episode_id);
		expect(() => m.finishDelegatedMemoryReview(eventGrant.grant_id, digest, 'reviewer', 'accept', ['fully_supported'])).toThrow();
		expect(m.getMemoryProposalBundle(event.proposal.proposal_id).proposal.status).toBe('candidate');
	});
});
