import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('source-bound candidate correction', () => {
	let dir = '';
	afterEach(async () => {
		(await import('../folio-db/init.js')).resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs(); vi.resetModules();
	});
	async function setup() {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID()); mkdirSync(dir, { recursive: true });
		vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db')); vi.resetModules();
		const m = await import('./store.js'); const db = (await import('../folio-db/init.js')).getFolioDb();
		const bundle = m.proposeMemoryBundle({ domain: 'career', source_kind: 'mail', source_ref: 'mail:fixture:42', extractor_id: 'extractor', actor_id: 'extractor',
			facts: [
				{ data_class: 'transaction', sensitivity: 'sensitive', subject: 'Course', predicate: 'paid', value: 'Course paid', source_excerpt: 'Funding approved.', derived_from_external: true, valid_from: '2026-09-10' },
				{ data_class: 'appointment', sensitivity: 'private', subject: 'Course', predicate: 'scheduled_for', value: '21 September', source_excerpt: '21 September.', valid_from: '2026-09-21' }
			], episodes: [{ episode_type: 'event', title: 'Payment', summary: 'Course paid.', occurred_at: '2026-09-10', sensitivity: 'sensitive' }] });
		const previous = bundle.facts[0];
		const input = { fact_id: previous.fact_id, expected_version: m.candidateCorrectionVersion(previous)!, predicate: 'decided', value: 'Funding approved', valid_from: null, reason: 'Approval is not a payment.' };
		return { m, db, bundle, previous, input };
	}
	it('preserves provenance, old content and other facts; confirms nothing', async () => {
		const { m, db, bundle, previous, input } = await setup();
		const corrected = m.correctMemoryCandidate(input, 'owner:1');
		expect(corrected).toMatchObject({ status: 'candidate', data_class: 'decision', predicate: 'decided', value_text: 'Funding approved', domain: previous.domain, sensitivity: previous.sensitivity, source_ref: previous.source_ref, source_excerpt: previous.source_excerpt, derived_from_external: 1, supersedes_fact_id: previous.fact_id, valid_from: null, confirmed_by: null });
		expect(m.getMemoryFact(previous.fact_id)).toMatchObject({ status: 'superseded', value_text: previous.value_text, predicate: 'paid' });
		expect(m.getMemoryFact(bundle.facts[1].fact_id)).toEqual(bundle.facts[1]);
		expect(m.getMemoryProposalBundle(bundle.proposal.proposal_id).episodes[0]).toMatchObject({ status: 'rejected', summary: 'Course paid.' });
		expect(db.prepare("SELECT count(*) n FROM memory_facts WHERE status='confirmed'").get()).toEqual({ n: 0 });
		expect(db.prepare("SELECT actor_id FROM memory_ledger WHERE event_type='corrected'").get()).toEqual({ actor_id: 'owner:1' });
	});
	it('never resurrects retired facts or summaries during bundle confirmation', async () => {
		const { m, db, bundle, previous, input } = await setup();
		const corrected = m.correctMemoryCandidate(input, 'owner:1');
		m.confirmMemoryProposalBundle(bundle.proposal.proposal_id, 'owner:1');
		expect(m.getMemoryFact(corrected.fact_id).status).toBe('confirmed');
		expect(m.getMemoryFact(previous.fact_id).status).toBe('superseded');
		expect(m.listMemoryEvents(previous.fact_id).some((event) => event.event_type === 'confirmed')).toBe(false);
		expect(db.prepare("SELECT count(*) n FROM memory_ledger WHERE object_id=? AND event_type='confirmed'").get(bundle.episodes[0].episode_id)).toEqual({ n: 0 });
	});
	it('rejects stale and duplicate submissions atomically', async () => {
		const { m, db, input } = await setup();
		expect(() => m.correctMemoryCandidate({ ...input, expected_version: 'stale' }, 'owner:1')).toThrow();
		m.correctMemoryCandidate(input, 'owner:1');
		expect(() => m.correctMemoryCandidate(input, 'owner:1')).toThrow();
		expect(db.prepare('SELECT count(*) n FROM memory_facts').get()).toEqual({ n: 3 });
	});
	it('invalidates earlier model approvals and forbids new delegation', async () => {
		const { m, bundle, input } = await setup(); const digest = 'a'.repeat(64);
		const grant = m.authorizeMemoryDelegation(bundle.proposal.proposal_id, 'owner:1', 'fixture', digest, 'reviewer');
		m.correctMemoryCandidate(input, 'owner:1');
		expect(() => m.finishDelegatedMemoryReview(grant.grant_id, digest, 'reviewer', 'accept', ['fully_supported'])).toThrow();
		expect(() => m.authorizeMemoryDelegation(bundle.proposal.proposal_id, 'owner:1', 'fixture', digest, 'reviewer')).toThrow();
	});
	it.each([
		{ predicate: 'invented' }, { value: '' }, { reason: '' }, { valid_from: '2026-02-30' },
		{ predicate: 'paid', valid_from: null }, { value: 'x'.repeat(8001) }
	])('rejects invalid edits without partial writes: %j', async (change) => {
		const { m, db, input, previous } = await setup();
		expect(() => m.correctMemoryCandidate({ ...input, ...change }, 'owner:1')).toThrow();
		expect(m.getMemoryFact(previous.fact_id)).toEqual(previous);
		expect(db.prepare('SELECT count(*) n FROM memory_facts').get()).toEqual({ n: 2 });
	});
	it('blocks graph-linked objects and confirmed facts', async () => {
		const { m, db, previous, input } = await setup();
		m.confirmMemoryFactByHuman(previous.fact_id, 'owner:1');
		expect(m.candidateCorrectionVersion(m.getMemoryFact(previous.fact_id))).toBeNull();
		expect(() => m.correctMemoryCandidate(input, 'owner:1')).toThrow();
		const linked = m.proposeMemoryBundle({domain:'career',source_kind:'mail',source_ref:'mail:fixture:43',extractor_id:'test',actor_id:'test',entities:[{local_ref:'p',entity_type:'person',canonical_key:'p',canonical_label:'Person',sensitivity:'private'}],facts:[{data_class:'context',predicate:'has_context',subject:'Person',subject_ref:'p',value:'Example',sensitivity:'private'}]});
		expect(m.candidateCorrectionVersion(linked.facts[0])).toBeNull();
	});
	it('also corrects standalone candidates and keeps rejected history accurate', async () => {
		const { m, bundle, previous, input } = await setup();
		m.correctMemoryCandidate(input, 'owner:1');
		m.rejectMemoryProposalBundle(bundle.proposal.proposal_id, 'owner:1');
		expect(m.listMemoryEvents(previous.fact_id).map((event) => event.event_type)).toEqual(['proposed','superseded']);
		const standalone = m.proposeMemoryFact({ domain:'career',data_class:'context',predicate:'has_context',subject:'Course',value:'Old',sensitivity:'private',source_kind:'mail',source_ref:'mail:fixture:44',actor_id:'extractor' });
		const changed = m.correctMemoryCandidate({...input,fact_id:standalone.fact_id,expected_version:m.candidateCorrectionVersion(standalone)!}, 'owner:1');
		expect(changed.proposal_id).toBeNull(); expect(changed.status).toBe('candidate');
	});
});
