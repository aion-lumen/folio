import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ body: 'Prefers Tuesday.', endpoint: 'http://127.0.0.1:1234', llm: vi.fn() }));
vi.mock('../agent/llm.js', () => ({ callLmStudioJson: mocks.llm }));
vi.mock('../env.js', async (original) => ({ ...await original<object>(), getLmStudioBaseUrl: () => mocks.endpoint }));
vi.mock('../feedback/reader.js', () => ({ getFeedbackRowById: (id: number) => id === 7 ? { id, account_id: 'test', imap_uid: 42, task_id: 'task7', body_hash: 'hash', sender: 'test@example.invalid', subject: 'Preference', body_excerpt: mocks.body, mail_date: '2026-09-05' } : null }));
vi.mock('../hermes/mail-body.js', () => ({ lookupMailBody: () => ({ bodyText: mocks.body }) }));
vi.mock('./mail-domain.js', () => ({ resolveMailMemoryDomain: () => ({ domain: 'kontakt', source: 'model_consensus', models: ['a','b','c'] }) }));
vi.mock('../regelwerk/loader.js', () => ({ loadRegelwerk: () => ({ voice_consensus: { voices: [{ role: 'conditional_reviewer', lm_studio_model: 'independent' }] } }) }));

describe('local delegated review boundary', () => {
	let dir = '';
	afterEach(async () => {
		(await import('../folio-db/init.js')).resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs(); vi.resetModules(); mocks.llm.mockReset(); mocks.body = 'Prefers Tuesday.'; mocks.endpoint = 'http://127.0.0.1:1234';
	});
	async function setup() {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID()); mkdirSync(dir, { recursive: true });
		vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db')); vi.resetModules();
		const store = await import('./store.js'); const review = await import('./delegated-review.js');
		const bundle = store.proposeMemoryBundle({ domain: 'personal', source_kind: 'mail', source_ref: 'mail:test:42', extractor_id: 'extractor', actor_id: 'extractor', facts: [{ data_class: 'preference', sensitivity: 'private', subject: 'Person', predicate: 'prefers', value: 'Tuesday', source_excerpt: 'Prefers Tuesday.' }] });
		const grant = review.authorizeMailMemoryReview(7, bundle.proposal.proposal_id, 'owner:1', 'test-authorization');
		const accept = { verdict: 'accept', reason_codes: ['fully_supported'], checked_object_ids: [bundle.facts[0].fact_id], unsupported_object_ids: [] };
		return { store, review, bundle, grant, accept };
	}
	it('confirms under the standing grant once and preserves system provenance on replay', async () => {
  const {store,review,bundle,accept}=await setup();const state=await import('../mail-intake/state.js');
  const c=state.configure(true,'owner:1','standing-test');state.save({id:'run',account:'gmail',state:'running',phase:'memory',items:[{id:7,stage:'review'}],attempts:0,started_at:new Date().toISOString()});
  const grant=review.authorizeMailMemoryReview(7,bundle.proposal.proposal_id,'owner:1','standing-test',{id:c.authorization_id,run_id:'run',feedback_id:7});
  mocks.llm.mockResolvedValue(accept);const first=await review.reviewDelegatedMailMemory(7,grant.grant_id);expect(await review.reviewDelegatedMailMemory(7,grant.grant_id)).toEqual(first);
  expect(mocks.llm).toHaveBeenCalledTimes(1);expect(store.getMemoryProposalBundle(bundle.proposal.proposal_id).proposal.reviewed_by).toBe('local-memory-reviewer:independent');
  expect(state.db().prepare("SELECT DISTINCT actor_kind FROM memory_ledger WHERE event_type='confirmed'").all()).toEqual([{actor_kind:'system'}]);
 });
	it('records automatic grants as system and rejects confirmation after the owner pauses', async () => {
  const { store, review, bundle, accept } = await setup();
  const state=await import('../mail-intake/state.js');
  const c=state.configure(true,'owner:1','standing-test');
  state.save({id:'run',account:'gmail',state:'running',phase:'memory',items:[{id:7,stage:'review'}],attempts:0,started_at:new Date().toISOString()});
  const auto=review.authorizeMailMemoryReview(7,bundle.proposal.proposal_id,'owner:1','standing-test',{id:c.authorization_id,run_id:'run',feedback_id:7});
  expect(state.db().prepare("SELECT actor_kind FROM memory_ledger WHERE json_extract(detail_json,'$.grant_id')=?").get(auto.grant_id)).toMatchObject({actor_kind:'system'});
  mocks.llm.mockImplementation(async()=>{state.configure(false,'owner:1','pause');return accept;});
  await expect(review.reviewDelegatedMailMemory(7,auto.grant_id)).rejects.toThrow();
  expect(store.getMemoryProposalBundle(bundle.proposal.proposal_id).proposal.status).toBe('candidate');
 });
	it('uses the server source and records the actual local reviewer', async () => {
		const { store, review, bundle, grant, accept } = await setup(); mocks.llm.mockResolvedValue(accept);
		await review.reviewDelegatedMailMemory(7, grant.grant_id);
		expect(mocks.llm.mock.calls[0][0]).toContain('Prefers Tuesday.'); expect(mocks.llm.mock.calls[0][1]).toBe('independent');
		expect(mocks.llm.mock.calls[0][0]).toContain('mail domain kontakt maps to Memory personal');
		expect(mocks.llm.mock.calls[0][0]).not.toContain('"derived_from_external"');
		expect(mocks.llm.mock.calls[0][0]).not.toContain('"task_id"');
		expect(store.getMemoryProposalBundle(bundle.proposal.proposal_id).proposal.reviewed_by).toBe('local-memory-reviewer:independent');
	});
	it.each(['null', 'missing_objects', 'contradiction', 'contradictory_rejection', 'changed_source'])('does not confirm on %s', async (mode) => {
		const { store, review, bundle, grant, accept } = await setup();
		mocks.llm.mockImplementation(async () => {
			if (mode === 'null') return null;
			if (mode === 'missing_objects') return { ...accept, checked_object_ids: [] };
			if (mode === 'contradiction') return { ...accept, unsupported_object_ids: accept.checked_object_ids };
			if (mode === 'contradictory_rejection') return { ...accept, verdict: 'reject', unsupported_object_ids: accept.checked_object_ids };
			mocks.body = 'Different source'; return accept;
		});
		await expect(review.reviewDelegatedMailMemory(7, grant.grant_id)).rejects.toThrow();
		expect(store.getMemoryProposalBundle(bundle.proposal.proposal_id).proposal.status).toBe('candidate');
	});
	it('records a consistent negative verdict while keeping the original candidate open', async () => {
		const { store, review, bundle, grant, accept } = await setup();
		mocks.llm.mockResolvedValue({ ...accept, verdict: 'reject', reason_codes: ['transient_or_low_value'], unsupported_object_ids: accept.checked_object_ids });
		await expect(review.reviewDelegatedMailMemory(7, grant.grant_id)).resolves.toMatchObject({ verdict: 'reject' });
		expect(store.getMemoryProposalBundle(bundle.proposal.proposal_id).proposal.status).toBe('candidate');
		expect(mocks.llm.mock.calls[0][0]).toContain('A rejection must NEVER use fully_supported');
	});
	it('retries one structurally incomplete local verdict with the exact object IDs', async () => {
		const { store, review, bundle, grant, accept } = await setup();
		mocks.llm.mockResolvedValueOnce({ ...accept, checked_object_ids: [] }).mockResolvedValueOnce(accept);
		await expect(review.reviewDelegatedMailMemory(7, grant.grant_id)).resolves.toMatchObject({ verdict: 'accept' });
		expect(mocks.llm).toHaveBeenCalledTimes(2);
		expect(mocks.llm.mock.calls[1][0]).toContain('CORRECTION (trusted reviewer policy)');
		expect(mocks.llm.mock.calls[1][0]).toContain(bundle.facts[0].fact_id);
		expect(store.getMemoryProposalBundle(bundle.proposal.proposal_id).proposal.status).toBe('confirmed');
	});
	it('refuses remote endpoints and mock environment responses before sending private data', async () => {
		const { review, grant } = await setup(); mocks.endpoint = 'https://example.invalid';
		await expect(review.reviewDelegatedMailMemory(7, grant.grant_id)).rejects.toThrow(/loopback/);
		mocks.endpoint = 'http://127.0.0.1:1234'; vi.stubEnv('FOLIO_AGENT_MOCK_RESPONSE', '{}');
		await expect(review.reviewDelegatedMailMemory(7, grant.grant_id)).rejects.toThrow(/Mock/);
		expect(mocks.llm).not.toHaveBeenCalled();
	});
	it('does not delegate a new proposal back to its extraction model', async () => {
		const { review, bundle } = await setup();
		const db = (await import('../folio-db/init.js')).getFolioDb();
		db.prepare('UPDATE memory_proposals SET extractor_id = ? WHERE proposal_id = ?').run('memory-mail-extractor-v1:independent', bundle.proposal.proposal_id);
		expect(() => review.authorizeMailMemoryReview(7, bundle.proposal.proposal_id, 'owner:1', 'new-request')).toThrow(/must differ/);
		expect(mocks.llm).not.toHaveBeenCalled();
	});
});
