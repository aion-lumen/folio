import { randomUUID, createHash } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('independent memory source quorum', () => {
	let dir = '';
	afterEach(async () => {
		(await import('../folio-db/init.js')).resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs(); vi.resetModules();
	});
	async function setup(domain = 'personal') {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db')); vi.resetModules();
		const memory = await import('./store.js');
		const quorum = await import('./quorum.js');
		const db = (await import('../folio-db/init.js')).getFolioDb();
		const identity = memory.proposeMemoryBundle({ domain, source_kind: 'owner', source_ref: 'manual:person', extractor_id: 'test', actor_id: 'owner', entities: [{ local_ref: 'person', entity_type: 'person', canonical_key: 'person:test-child', canonical_label: 'Child', sensitivity: 'private' }] });
		const entity = memory.confirmMemoryProposalBundle(identity.proposal.proposal_id, 'owner').entities[0];
		let index = 0;
		function add(overrides: Record<string, unknown> = {}) {
			index++;
			return memory.proposeMemoryFact({ domain, data_class: 'profile', sensitivity: 'private', subject: 'Child name', predicate: 'has_name', value: 'Mira', source_kind: 'mail', source_ref: `mail:source:${index}`, source_excerpt: 'The child is named Mira.', subject_entity_id: entity.entity_id, actor_id: 'test', ...overrides });
		}
		function attest(fact: { source_ref: string; fact_id: string }, overrides: Record<string, unknown> = {}) {
			const hash = createHash('sha256').update(fact.source_ref).digest('hex');
			const input = { source_ref: fact.source_ref, source_digest: quorum.memoryOriginDigest(fact.source_ref), family_key: `issuer:${fact.source_ref}`, document_key: `original:${fact.source_ref}`, content_hash: hash, evidence_ref: `review:${fact.source_ref}`, rationale: 'Reviewed original issuer, complete document and support for named facts; no copy or common upstream source.', supported_fact_ids: JSON.stringify([fact.fact_id]), status: 'verified' as const, ...overrides };
			quorum.attestMemoryOrigin(input, 'owner');
			return input;
		}
		return { memory, quorum, db, entity, add, attest };
	}

	it('requires four independently attested origins, runs idempotently and never marks a human confirmation', async () => {
		const { memory, quorum, db, add, attest } = await setup();
		const facts = Array.from({ length: 3 }, () => add()); facts.forEach((fact) => attest(fact));
		expect(quorum.runMemoryQuorum()).toEqual({ confirmed: 0, blocked: 1, active: 0 });
		facts.push(add()); attest(facts[3]);
		expect(quorum.runMemoryQuorum()).toEqual({ confirmed: 1, blocked: 0, active: 1 });
		expect(quorum.runMemoryQuorum()).toEqual({ confirmed: 0, blocked: 0, active: 1 });
		expect(quorum.listSourceConfirmedMemory()[0]).toMatchObject({ source_count: 4, state: 'source_confirmed', pending_fact_ids: expect.arrayContaining(facts.map((fact) => fact.fact_id)) });
		for (const fact of facts) expect(memory.getMemoryFact(fact.fact_id)).toMatchObject({ status: 'candidate', confirmed_by: null });
		expect(db.prepare("SELECT actor_kind FROM memory_ledger WHERE event_type='source_confirmed'").all()).toEqual([{ actor_kind: 'system' }]);
		expect(db.prepare('SELECT count(*) n FROM memory_quorum_receipts').get()).toEqual({ n: 1 });
	});

	it('keeps language-qualified claims separate while blocking a conflict in the same language', async () => {
		const { quorum, add, attest } = await setup('career');
		for (const subject of ['Deutsch','Englisch']) for (let i=0;i<4;i++) attest(add({subject,predicate:'level',value:subject === 'Deutsch' ? 'C2' : 'C1',source_excerpt:subject === 'Deutsch' ? 'C2' : 'C1'}));
		expect(quorum.runMemoryQuorum().confirmed).toBe(2);
		add({subject:'German',predicate:'level',value:'B2',source_excerpt:'B2'});
		expect(quorum.listSourceConfirmedMemory()).toHaveLength(1);
		expect(quorum.listSourceConfirmedMemory()[0].fact.subject).toBe('Englisch');
	});

	it('CV subfields and versions share one immutable root even with different attested labels', async () => {
		const { quorum, add, attest } = await setup('career');
		const { bindFactOrigin, factOrigin } = await import('./provenance.js');
		const { upsertMemorySourceCandidate } = await import('./sources.js');
		const hash='a'.repeat(64);
		upsertMemorySourceCandidate({source_ref:'carta:cv',source_kind:'file',title:'CV',content_hash:hash,primary_domain:'career',reviewed_by:'owner'});
		for (let i=0;i<4;i++) {
			const fact=add({source_ref:`carta:cv:language:${i}`,subject:'Deutsch',predicate:'level',value:'C2',source_excerpt:null});
			expect(()=>attest(fact,{content_hash:hash})).toThrow('Root-Dokumentversion');
			bindFactOrigin({fact_id:fact.fact_id,root_ref:'carta:cv',content_hash:hash,field_locator:`/languages/${i}`,excerpt:'C2'});
			attest(fact,{content_hash:hash});
			expect(()=>bindFactOrigin({fact_id:fact.fact_id,root_ref:'carta:cv',content_hash:hash,field_locator:'/changed',excerpt:'C2'})).toThrow('unveränderlich');
			expect(factOrigin(fact.fact_id)?.field_locator).toBe(`/languages/${i}`);
		}
		expect(quorum.inspectMemoryQuorum()[0]).toMatchObject({state:'blocked',source_count:1});
		upsertMemorySourceCandidate({source_ref:'carta:cv',source_kind:'file',title:'CV',content_hash:'b'.repeat(64),primary_domain:'career',reviewed_by:'owner'});
		expect(quorum.inspectMemoryQuorum()[0].source_count).toBe(0);
	});

	it('unresolved property labels do not qualify despite four reviewed origins', async () => {
		const { quorum, add, attest } = await setup('career');
		for(let i=0;i<4;i++)attest(add({subject:'Language 0',predicate:'level'}));
		expect(quorum.inspectMemoryQuorum()[0].reason).toContain('Eigenschaftszuordnung');
		expect(quorum.runMemoryQuorum().confirmed).toBe(0);
	});

	it.each(['family_key', 'document_key', 'content_hash'])('does not count repeated %s as independent', async (key) => {
		const { quorum, add, attest } = await setup();
		for (let i = 0; i < 4; i++) attest(add(), { [key]: key === 'content_hash' ? 'a'.repeat(64) : 'same-original' });
		expect(quorum.inspectMemoryQuorum()[0]).toMatchObject({ source_count: 1, state: 'blocked' });
		expect(quorum.runMemoryQuorum().confirmed).toBe(0);
	});

	it('collapses transitive copy links across issuer and document identities', async () => {
		const { quorum, add, attest } = await setup();
		attest(add(), { family_key: 'A', document_key: 'D1' });
		attest(add(), { family_key: 'B', document_key: 'D1' });
		attest(add(), { family_key: 'B', document_key: 'D2' });
		attest(add(), { family_key: 'C', document_key: 'D3' });
		expect(quorum.inspectMemoryQuorum()[0].source_count).toBe(2);
	});

	it('invalidates a receipt on a new contradictory candidate without waiting for another night shift', async () => {
		const { quorum, add, attest } = await setup();
		for (let i = 0; i < 4; i++) attest(add());
		quorum.runMemoryQuorum();
		add({ value: 'Nora', source_excerpt: 'The child is named Nora.' });
		expect(quorum.listSourceConfirmedMemory()).toEqual([]);
		expect(quorum.inspectMemoryQuorum()[0].reason).toContain('Widerspruch');
		const { compileMemoryContext } = await import('./compiler.js');
		expect(compileMemoryContext({ consumer_id: 'owner-preview', domain: 'personal', query: 'Mira', max_sensitivity: 'private' }).facts).toEqual([]);
	});

	it.each(['revoked', 'changed', 'forgotten', 'rejected'])('invalidates %s evidence while retaining the receipt history', async (change) => {
		const { memory, quorum, db, add, attest } = await setup();
		const facts = Array.from({ length: 4 }, () => add());
		const origins = facts.map((fact) => attest(fact)); quorum.runMemoryQuorum();
		if (change === 'revoked') quorum.attestMemoryOrigin({ ...origins[0], status: 'revoked' }, 'owner');
		if (change === 'changed') db.prepare('UPDATE memory_facts SET source_excerpt = ? WHERE fact_id = ?').run('Changed original', facts[0].fact_id);
		if (change === 'forgotten') memory.tombstoneMemoryFact(facts[0].fact_id, 'owner');
		if (change === 'rejected') memory.rejectMemoryCandidate(facts[0].fact_id, 'owner');
		expect(quorum.listSourceConfirmedMemory()).toEqual([]);
		expect(db.prepare('SELECT count(*) n FROM memory_quorum_receipts').get()).toEqual({ n: 1 });
	});

	it.each(['unattested', 'unlinked', 'dated', 'paraphrased', 'unsupported', 'replacement', 'other-domain'])('fails closed for %s facts', async (kind) => {
		const { quorum, add, attest } = await setup();
		for (let i = 0; i < 4; i++) {
			const fact = add(kind === 'unlinked' ? { subject_entity_id: null }
				: kind === 'dated' ? { valid_from: '2026-09-11' }
				: kind === 'unsupported' ? { source_excerpt: 'The other child is named Nora.' }
				: kind === 'other-domain' ? { domain: 'career' }
				: kind === 'paraphrased' && i === 3 ? { value: 'The name is Mira', source_excerpt: 'The name is Mira' } : {});
			if (kind === 'replacement') {
				// A self-reference is invalid in meaning but legal SQL: it must not qualify.
				(await import('../folio-db/init.js')).getFolioDb().prepare('UPDATE memory_facts SET supersedes_fact_id = fact_id WHERE fact_id = ?').run(fact.fact_id);
			}
			if (kind !== 'unattested') attest(fact);
		}
		expect(quorum.runMemoryQuorum().confirmed).toBe(0);
	});

	it('rejects forged stale attestations and self-generated source origins', async () => {
		const { quorum, add, attest } = await setup();
		expect(() => attest(add(), { source_digest: '0'.repeat(64) })).toThrow('Quelle verändert');
		expect(() => attest(add({ source_kind: 'memory-consolidation' }))).toThrow('Zusammenfassungen');
	});

	it('exposes one local fact with source basis and preserves the strongest sensitivity', async () => {
		const { quorum, add, attest } = await setup();
		for (let i = 0; i < 4; i++) attest(add({ sensitivity: i === 3 ? 'sensitive' : 'private' }));
		quorum.runMemoryQuorum();
		const { compileMemoryContext } = await import('./compiler.js');
		expect(compileMemoryContext({ consumer_id: 'owner-preview', domain: 'personal', query: 'Mira', max_sensitivity: 'private' }).facts).toHaveLength(0);
		const local = compileMemoryContext({ consumer_id: 'local-companion', domain: 'personal', query: 'Mira', max_sensitivity: 'sensitive' });
		expect(local.facts).toHaveLength(1);
		expect(local.facts[0]).toMatchObject({ verification: 'source_confirmed', independent_source_count: 4, sensitivity: 'sensitive' });
	});

	it('activates the source policy in the no-model night-shift path', async () => {
		const { add, attest } = await setup();
		for (let i = 0; i < 4; i++) attest(add());
		const report = await (await import('./consolidation.js')).runMemoryNightShift({ semantic: false });
		expect(report.source_quorum).toEqual({ confirmed: 1, blocked: 0, active: 1 });
	});

	it.each(['forgotten', 'rejected'])('does not resurrect a %s claim even when four other sources remain', async (decision) => {
		const { memory, quorum, add, attest } = await setup();
		const facts = Array.from({ length: 5 }, () => add()); facts.forEach((fact) => attest(fact));
		quorum.runMemoryQuorum();
		if (decision === 'forgotten') memory.tombstoneMemoryFact(facts[0].fact_id, 'owner');
		else memory.rejectMemoryCandidate(facts[0].fact_id, 'owner');
		expect(quorum.runMemoryQuorum().confirmed).toBe(0);
		expect(quorum.listSourceConfirmedMemory()).toHaveLength(0);
	});

	it('does not export candidate-based quorum knowledge to public or career consumers', async () => {
		const { quorum, add, attest } = await setup('career');
		for (let i = 0; i < 4; i++) attest(add({ sensitivity: 'public' }));
		quorum.runMemoryQuorum();
		const { compileMemoryContext } = await import('./compiler.js');
		for (const consumer_id of ['sonar-public', 'relay-career'] as const) {
			expect(compileMemoryContext({ consumer_id, domain: 'career', query: 'Mira', max_sensitivity: consumer_id === 'sonar-public' ? 'public' : 'private' }).facts).toHaveLength(0);
		}
		expect(compileMemoryContext({ consumer_id: 'owner-preview', domain: 'career', query: 'Mira', max_sensitivity: 'private' }).facts).toHaveLength(1);
	});

	it('requires explicitly reviewed fact support, not just a name somewhere in the text', async () => {
		const { quorum, add, attest } = await setup();
		const fact = add({ source_excerpt: 'The child is NOT called Mira.' });
		expect(() => attest(fact, { supported_fact_ids: '[]' })).toThrow('Geprüfte Fakten');
		expect(() => attest(fact, { supported_fact_ids: '["another-fact"]' })).toThrow('gehört nicht');
		expect(quorum.runMemoryQuorum().confirmed).toBe(0);
	});

	it('keeps origin and receipt history append-only', async () => {
		const { quorum, db, add, attest } = await setup();
		for (let i = 0; i < 4; i++) attest(add()); quorum.runMemoryQuorum();
		expect(() => db.prepare("UPDATE memory_origin_attestations SET family_key='changed'").run()).toThrow('append-only');
		expect(() => db.prepare('DELETE FROM memory_quorum_receipts').run()).toThrow('append-only');
	});

	it('enriches an established claim with an identical new source without asking again or counting it as independent', async () => {
		const { quorum, add, attest } = await setup();
		for (let i = 0; i < 4; i++) attest(add()); quorum.runMemoryQuorum();
		const additional = add();
		const claim = quorum.listSourceConfirmedMemory()[0];
		expect(claim.source_count).toBe(4);
		expect(claim.covered_fact_ids).toContain(additional.fact_id);
		expect(claim.supporting_fact_ids).not.toContain(additional.fact_id);
		expect(quorum.runMemoryQuorum().confirmed).toBe(0);
	});

	it('reaches the actual local companion even without any personally confirmed fact in that domain', async () => {
		const { quorum, add, attest } = await setup();
		vi.stubEnv('FOLIO_VAULT_OVERRIDE', '/private/tmp/quorum-isolated-vault');
		for (let i = 0; i < 4; i++) attest(add()); quorum.runMemoryQuorum();
		const { companionMemory } = await import('../focus/memory.js');
		expect(companionMemory('Mira')).toEqual([expect.objectContaining({ value: 'Mira', verification: 'source_confirmed' })]);
		const { compileMemoryContext, renderMemoryContext } = await import('./compiler.js');
		expect(renderMemoryContext(compileMemoryContext({ consumer_id: 'local-companion', domain: 'personal', query: 'Mira', max_sensitivity: 'private' }))).toContain('quellenbestätigt durch 4 unabhängige Ursprungsfamilien, nicht persönlich bestätigt');
	});
});
