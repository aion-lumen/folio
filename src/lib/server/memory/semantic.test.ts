import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { getFolioDb, resetFolioDbForTests } from '../folio-db/init.js';
import { confirmMemoryFactByHuman, proposeMemoryFact, proposeMemoryBundle, confirmMemoryProposalBundle } from './store.js';
import { compileMemoryContext, type CompileMemoryContextInput } from './compiler.js';
import { compileMemoryContextHybrid, compileMemoryContextsHybrid } from './hybrid.js';
import { embeddingConfig, embedTexts } from './embedding.js';
import { indexMemoryVectors, semanticIndexPath } from './semantic.js';
import { projectMemoryFacts } from './semantic-projection.js';
import { companionMemory, companionMemoryHybrid } from '../focus/memory.js';

let dir: string;
const input: CompileMemoryContextInput = { consumer_id: 'owner-preview', domain: 'home', query: 'Fenstertausch', max_sensitivity: 'private', as_of: '2026-10-09T10:00:00Z', limit: 5 };
function config() { return embeddingConfig()!; }
function fact(value = 'Verglasung erneuern', extra = {}, confirmed = true) {
	const row = proposeMemoryFact({ domain: 'home', data_class: 'decision', sensitivity: 'private', subject: 'Gebäude',
		predicate: 'decided', value, source_kind: 'owner', source_ref: `test:${Math.random()}`, actor_kind: 'human', actor_id: 'owner', ...extra });
	if (confirmed) confirmMemoryFactByHuman(row.fact_id, 'owner');
	return row;
}
function embeddings(override?: (texts: string[]) => number[][]) {
	const mock = vi.fn(async (_url: unknown, init: RequestInit) => {
		const body = JSON.parse(init.body as string);
		const vectors = override?.(body.input) ?? body.input.map(() => [1, 0, 0]);
		return new Response(JSON.stringify({ model: body.model, data: vectors.map((embedding: number[], index: number) => ({ index, embedding })) }));
	}); vi.stubGlobal('fetch', mock); return mock;
}
beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'folio-semantic-'));
	vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db'));
	vi.stubEnv('FOLIO_VAULT_OVERRIDE', join(dir, 'vault'));
	vi.stubEnv('FOLIO_MEMORY_SEMANTIC', '1');
	vi.stubEnv('FOLIO_MEMORY_EMBEDDING_URL', 'http://127.0.0.1:1235/v1/embeddings');
	vi.stubEnv('FOLIO_MEMORY_EMBEDDING_MODEL', 'test-embedding');
	vi.stubEnv('FOLIO_MEMORY_EMBEDDING_REVISION', 'revision-1');
	vi.stubEnv('FOLIO_MEMORY_EMBEDDING_DIMENSIONS', '3');
	vi.stubEnv('FOLIO_MEMORY_SEMANTIC_MIN_SIMILARITY', '0.85');
	vi.stubEnv('FOLIO_MEMORY_SEMANTIC_MIN_MARGIN', '0.05');
	vi.stubEnv('FOLIO_MEMORY_SEMANTIC_MAX_CANDIDATES', '2');
	resetFolioDbForTests();
});
afterEach(() => { resetFolioDbForTests(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); rmSync(dir, { recursive: true, force: true }); });

describe('bounded semantic memory', () => {
 it('indexes a mixed batch containing an oversized legacy fact and hashes its full text', async () => {
  const large = fact('legacy record');
  const original = 'A'.repeat(13_000) + ' original suffix';
  getFolioDb().prepare('UPDATE memory_facts SET value_text=? WHERE fact_id=?').run(original, large.fact_id);
  for(let i=0;i<12;i++) fact('ordinary synthetic fact '+i);
  const fetch = embeddings(); const before = getFolioDb().serialize();
  const projected = projectMemoryFacts({ max_sensitivity: 'private', as_of: new Date().toISOString() }).find(p=>p.fact.fact_id===large.fact_id)!;
  expect(projected.text.length).toBeLessThanOrEqual(12000);
  await indexMemoryVectors(config());
  const index = new Database(semanticIndexPath(), { readonly: true });
  expect(index.prepare('SELECT COUNT(*) AS count FROM vectors').get()).toEqual({ count: 13 }); index.close();
  expect(getFolioDb().serialize()).toEqual(before);
  for (const [,init] of fetch.mock.calls) expect(JSON.parse((init as RequestInit).body as string).input.every((t:string)=>t.length<=12000+'passage: '.length)).toBe(true);
  getFolioDb().prepare('UPDATE memory_facts SET value_text=? WHERE fact_id=?').run(original.replace('original suffix','changed suffix'),large.fact_id);
  const changed=projectMemoryFacts({max_sensitivity:'private',as_of:new Date().toISOString()}).find(p=>p.fact.fact_id===large.fact_id)!;
  expect(changed.text).toBe(projected.text);expect(changed.hash).not.toBe(projected.hash);
  expect((await indexMemoryVectors(config())).indexed).toBe(1);
 });
 it('preserves literal assessment ambiguity beyond the 32-term query limit', async()=>{
  const access=fact('Assessment erfordert Lernlizenz.',{domain:'projects',subject:'Lernportal'});
  const center=fact('Assessment-Center befindet sich in Zürich.',{domain:'career',subject:'Auswahl'});
  embeddings(texts=>texts.map(t=>t.startsWith('query:')?[1,0,0]:[0,1,0]));await indexMemoryVectors(config());
  const question=Array.from({length:45},(_,i)=>'kontextwort'+i).join(' ')+' Wie war mein Assessment?';
  for(const results of [companionMemory(question),await companionMemoryHybrid(question)]) expect(results.map(f=>f.fact_id)).toEqual(expect.arrayContaining([access.fact_id,center.fact_id]));
 });
 it.each(['CHF 120.50','EUR 120,50','USD 120.50','€ 120,50',"CHF 1’120.50",'120.50 CHF'])('keeps exact amount query lexical: %s', async query=>{
  fact('Kostenreferenz'); const fetch=embeddings();await indexMemoryVectors(config());fetch.mockClear();
  const result=await compileMemoryContextHybrid({...input,query});
  expect(result.retrieval?.semantic_status).toBe('excluded');expect(fetch).not.toHaveBeenCalled();
 });
 it('preserves both senses when the owner explicitly asks an ambiguous assessment question',async()=>{
  const access=fact('Assessment erfordert Lernlizenz.',{domain:'projects',subject:'Lernportal'});
  const center=fact('Assessment-Center befindet sich in Zürich.',{domain:'career',subject:'Auswahl'});
  embeddings(texts=>texts.map(t=>t.startsWith('query:')?[1,0,0]:[0,1,0]));await indexMemoryVectors(config());
  for(const results of [companionMemory('Wie war mein Assessment?'),await companionMemoryHybrid('Wie war mein Assessment?')]){
   expect(results.map(f=>f.fact_id)).toEqual(expect.arrayContaining([access.fact_id,center.fact_id]));
  }
 });
 it('reserves vocabulary terms in long histories and does not award bridge matches to assessment centers',async()=>{
  const access=fact('Assessment erfordert Lernlizenz.',{domain:'projects',subject:'Lernportal'});
  const center=fact('Assessment-Center befindet sich in Zürich.',{domain:'career',subject:'Auswahl'});
  const risk=fact('Risk Assessment erfasst Systemrisiken.',{domain:'projects',subject:'Analyse'});
  const history=[{role:'user',text:Array.from({length:60},(_,i)=>'langeskontextwort'+i).join(' ')}];
  const fetch=embeddings(texts=>texts.map(t=>t.startsWith('query:')?[1,0,0]:[0,1,0]));await indexMemoryVectors(config());
  for(const question of ['Wissenstests','Wissens-Test','Kenntnisprüfungen']){
   expect(companionMemory(question,'',history).map(f=>f.fact_id)).toEqual([access.fact_id]);
   expect((await companionMemoryHybrid(question,'',history)).map(f=>f.fact_id)).toEqual([access.fact_id]);
  }
  expect(companionMemory('Assessment-Center').map(f=>f.fact_id)).toContain(center.fact_id);
  expect(companionMemory('Risk Assessment').map(f=>f.fact_id)).toContain(risk.fact_id);
  const requests=fetch.mock.calls.map(([,init])=>JSON.parse((init as RequestInit).body as string));
  expect(requests.some(r=>r.input.some((t:string)=>t.startsWith('query: Wissenstests ')&&!t.includes('kenntnistest')))).toBe(true);
 });
	it('retrieves assessment access evidence through bounded vocabulary without changing semantic thresholds', async () => {
		const access = fact('Beim Öffnen des Assessments erscheint: gültiges Lernabo erforderlich.', {domain:'projects',subject:'Lernportal'});
		const other = fact('Die Wohnungstür ist verschlossen.', {domain:'home'});
		const unconfirmed = fact('Assessment ist bereits bestanden.', {domain:'career'}, false);
		embeddings(texts => texts.map(t => t.startsWith('query:') ? [1,0,0] : [0,1,0]));await indexMemoryVectors(config());
		for (const query of ['Weshalb komme ich nicht in den Wissenstest hinein?','Mein Kenntnistest lässt sich nicht öffnen.']) {
			expect(companionMemory(query).map(f=>f.fact_id)).toContain(access.fact_id);
			const result=await companionMemoryHybrid(query);
			expect(result.map(f=>f.fact_id)).toContain(access.fact_id);
			expect(result.map(f=>f.fact_id)).not.toContain(other.fact_id);
			expect(result.map(f=>f.fact_id)).not.toContain(unconfirmed.fact_id);
		}
		expect((await companionMemoryHybrid('Weshalb komme ich nicht in das Haus hinein?')).map(f=>f.fact_id)).not.toContain(access.fact_id);
	});
	it('is opt-in and search never creates an index', async () => {
		fact('Fenstertausch'); const fetch = embeddings(); vi.stubEnv('FOLIO_MEMORY_SEMANTIC', '0');
		const result = await compileMemoryContextHybrid(input);
		expect(result.facts).toEqual(compileMemoryContext(input).facts);
		expect(result.retrieval?.semantic_status).toBe('disabled');
		expect(existsSync(semanticIndexPath())).toBe(false); expect(fetch).not.toHaveBeenCalled();
	});
	it('finds a paraphrase without lexical overlap and preserves its source in the companion', async () => {
		const row = fact(); embeddings(); await indexMemoryVectors(config());
		expect(compileMemoryContext(input).facts).toHaveLength(0);
		const result = await compileMemoryContextHybrid(input);
		expect(result.facts.map(f => f.fact_id)).toEqual([row.fact_id]);
		expect(result.facts[0].source_ref).toBe(row.source_ref);
		expect(result.facts[0].verification).toBeUndefined();
		expect((await companionMemoryHybrid('Fenstertausch')).map(f => f.fact_id)).toContain(row.fact_id);
		expect(statSync(semanticIndexPath()).mode & 0o777).toBe(0o600);
	});
	it('enforces consumer, domain, sensitivity, status and temporal validity before inference', async () => {
		const allowed = fact(); fact('Geheim', { sensitivity: 'sensitive' }); fact('Fremd', { domain: 'health' });
		fact('Ungeprüft', {}, false); const expired = fact('Alt'); const future = fact('Später');
		getFolioDb().prepare('UPDATE memory_facts SET valid_to=? WHERE fact_id=?').run('2020-01-01', expired.fact_id);
		getFolioDb().prepare('UPDATE memory_facts SET valid_from=? WHERE fact_id=?').run('2099-01-01', future.fact_id);
		const fetch = embeddings(); await indexMemoryVectors(config());
		expect((await compileMemoryContextHybrid(input)).facts.map(f => f.fact_id)).toEqual([allowed.fact_id]);
		fetch.mockClear(); await expect(compileMemoryContextHybrid({ ...input, consumer_id: 'relay-career' })).rejects.toThrow('cannot read');
		await expect(compileMemoryContextHybrid({ ...input, consumer_id: 'sonar-public', domain: 'ai' })).rejects.toThrow('ceiling');
		expect(fetch).not.toHaveBeenCalled();
	});
	it.each(['tombstoned', 'superseded', 'rejected', 'candidate'])('excludes %s facts even with a stale index', async status => {
		const row = fact(); const fetch = embeddings(); await indexMemoryVectors(config());
		getFolioDb().prepare('UPDATE memory_facts SET status=? WHERE fact_id=?').run(status, row.fact_id);
		fetch.mockClear(); expect((await compileMemoryContextHybrid(input)).facts).toHaveLength(0); expect(fetch).not.toHaveBeenCalled();
		await indexMemoryVectors(config()); const index = new Database(semanticIndexPath(), { readonly: true });
		expect(index.prepare('SELECT COUNT(*) AS n FROM vectors').get()).toEqual({ n: 0 }); index.close();
	});
	it('invalidates edited content, sources and permissions before a rebuild', async () => {
		const row = fact(); embeddings(); await indexMemoryVectors(config());
		getFolioDb().prepare('UPDATE memory_facts SET source_ref=? WHERE fact_id=?').run('changed-source', row.fact_id);
		expect((await compileMemoryContextHybrid(input)).facts).toHaveLength(0);
		const update = await indexMemoryVectors(config()); expect(update.indexed).toBe(1);
		expect((await compileMemoryContextHybrid(input)).facts[0].source_ref).toBe('changed-source');
		getFolioDb().prepare("UPDATE memory_facts SET sensitivity='sensitive' WHERE fact_id=?").run(row.fact_id);
		expect((await compileMemoryContextHybrid(input)).facts).toHaveLength(0);
	});
	it('rechecks withdrawal during query inference and during index construction', async () => {
		const row = fact(); embeddings(); await indexMemoryVectors(config());
		embeddings(() => { getFolioDb().prepare("UPDATE memory_facts SET status='tombstoned' WHERE fact_id=?").run(row.fact_id); return [[1,0,0]]; });
		expect((await compileMemoryContextHybrid(input)).facts).toHaveLength(0);
		const next = fact('Neue Verglasung');
		embeddings(texts => { getFolioDb().prepare("UPDATE memory_facts SET status='rejected' WHERE fact_id=?").run(next.fact_id); return texts.map(() => [1,0,0]); });
		expect((await indexMemoryVectors(config())).skippedChanged).toBe(1);
	});
	it('reuses unchanged vectors and rebuilds after a model revision change', async () => {
		fact(); const fetch = embeddings(); expect((await indexMemoryVectors(config())).indexed).toBe(1);
		fetch.mockClear(); expect((await indexMemoryVectors(config())).reused).toBe(1); expect(fetch).not.toHaveBeenCalled();
		vi.stubEnv('FOLIO_MEMORY_EMBEDDING_REVISION', 'revision-2');
		expect((await compileMemoryContextHybrid(input)).retrieval?.semantic_status).toBe('missing-index');
		expect(fetch).not.toHaveBeenCalled(); expect((await indexMemoryVectors(config())).indexed).toBe(1);
	});
	it('falls back to fresh lexical retrieval on timeout or corrupt index data', async () => {
		const row = fact('Fenstertausch'); embeddings(); await indexMemoryVectors(config());
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
		expect((await compileMemoryContextHybrid(input)).facts.map(f => f.fact_id)).toEqual([row.fact_id]);
		expect((await compileMemoryContextHybrid(input)).retrieval?.semantic_status).toBe('unavailable');
		const db = new Database(semanticIndexPath()); db.prepare('UPDATE vectors SET vector=?').run('[null]'); db.close(); embeddings();
		expect((await compileMemoryContextHybrid(input)).retrieval?.semantic_status).toBe('unavailable');
	});
	it('leaves finance and exact identifiers entirely on the existing path', async () => {
		fact('Bezahlt CHF 200', { domain: 'finance' }); fact('Vertrag AB-1234'); const fetch = embeddings();
		await indexMemoryVectors(config()); fetch.mockClear();
		for (const request of [{ ...input, consumer_id: 'ledger-local' as const, domain: 'finance', query: 'Bezahlt' }, { ...input, query: 'Vertrag AB-1234' }]) {
			expect((await compileMemoryContextHybrid(request)).facts).toEqual(compileMemoryContext(request).facts);
			expect((await compileMemoryContextHybrid(request)).retrieval?.semantic_status).toBe('excluded');
		} expect(fetch).not.toHaveBeenCalled();
		expect(projectMemoryFacts({ max_sensitivity: 'sensitive', as_of: input.as_of! }).every(p => p.fact.domain !== 'finance')).toBe(true);
	});
	it('rejects fabricated seed hashes instead of trusting caller-supplied content', () => {
		const row = fact(); expect(compileMemoryContext(input, [{ fact_id: row.fact_id, hash: 'fake', similarity: 1 }]).facts).toHaveLength(0);
	});
	it('does not confer semantic relevance on other facts about the same person', async () => {
		const bundle = proposeMemoryBundle({ domain: 'home', source_kind: 'owner', source_ref: 'synthetic:building', extractor_id: 'test', actor_kind: 'human', actor_id: 'test',
			entities: [{ local_ref: 'building', entity_type: 'person', canonical_key: 'owner:1', canonical_label: 'Eigentümer', sensitivity: 'private' }],
			facts: [
				{ data_class: 'context', subject: 'Haus', predicate: 'repair', value: 'Verglasung erneuern', sensitivity: 'private', subject_ref: 'building' },
				{ data_class: 'context', subject: 'Haus', predicate: 'next', value: 'Offerte ausstehend', sensitivity: 'private', subject_ref: 'building' },
				{ data_class: 'context', subject: 'Haus', predicate: 'next', value: 'Fenstertausch ist budgetiert', sensitivity: 'private', subject_ref: 'building' }
			] });
		const confirmed = confirmMemoryProposalBundle(bundle.proposal.proposal_id, 'owner');
		embeddings(texts => texts.map(t => t.startsWith('query:') || t.includes('Verglasung') ? [1,0,0] : [0,1,0])); await indexMemoryVectors(config());
		const expected = confirmed.facts.filter(f => !f.value_text.includes('Offerte')).map(f => f.fact_id);
		const bundleResult = await compileMemoryContextHybrid(input);
		expect(bundleResult.retrieval?.semantic_fact_ids).toEqual([confirmed.facts.find(f => f.value_text.includes('Verglasung'))!.fact_id]);
		expect(new Set((await companionMemoryHybrid('Fenstertausch')).map(f => f.fact_id))).toEqual(new Set(expected));
	});
	it('shares at most two semantic seeds across domains with only one query inference', async () => {
		for (const [i, domain] of ['home','career','ai','personal','systems','health'].entries()) fact(`Kandidat ${i}`, { domain });
		const fetch = embeddings(texts => texts.map(t => {
			if (t.startsWith('query:')) return [1,0,0];
			const similarity = [1,.98,.96,.86,.85,.84][Number(t.match(/Kandidat (\d)/)![1])];
			return [similarity,Math.sqrt(1-similarity**2),0];
		}));
		await indexMemoryVectors(config()); fetch.mockClear();
		const result = await companionMemoryHybrid('Fenstertausch');
		expect(result).toHaveLength(2);
		expect(result.map(f => f.domain).sort()).toEqual(['career','home']);
		expect(fetch).toHaveBeenCalledTimes(1);
	});
	it('retains literal project-subject matches without requiring the name inside each value', async () => {
		const logging = fact('Pro Anfrage werden Kennung und Dauer gespeichert; Nachrichtentexte werden ausgelassen.', { domain: 'projects', subject: 'Wortgarten' });
		fact('Der Statusendpunkt ist /service/status.', { domain: 'projects', subject: 'Wortgarten' });
		fact('Andere Vorschriften.', { domain: 'projects', subject: 'Wortgartenarchiv' });
		const candidate = fact('Unbestätigte Aufzeichnung.', { domain: 'projects', subject: 'Wortgarten' }, false);
		embeddings(); await indexMemoryVectors(config());
		const question = 'Welche Diagnosedaten schreibt Wortgarten?';
		expect(companionMemory(question).map(f => f.fact_id)).not.toContain(logging.fact_id);
		const result = await companionMemoryHybrid(question);
		expect(result.map(f => f.fact_id)).toContain(logging.fact_id);
		expect(result.map(f => f.fact_id)).not.toContain(candidate.fact_id);
		expect(result.every(f => f.subject === 'Wortgarten')).toBe(true);
	});
	it('keeps multiple decisions about an explicitly named object within the existing budget', async () => {
		const floor = fact('38 Quadratmeter Kork wurden ausgewählt.', { subject: 'Werkstatt Birkenhof' });
		const room = fact('Der kleine Lagerraum bleibt ungeteilt.', { subject: 'Werkstatt Birkenhof' });
		const door = fact('Für die Aussentür wurden zwei Angebote angefragt.', { subject: 'Werkstatt Birkenhof' });
		embeddings(); await indexMemoryVectors(config());
		const result = await companionMemoryHybrid('Was ist beim Birkenhof entschieden und bei der Aussentür offen?');
		expect(new Set(result.map(f => f.fact_id))).toEqual(new Set([floor.fact_id, room.fact_id, door.fact_id]));
		for (let i = 0; i < 22; i++) fact(`Weitere Entscheidung ${i}`, { subject: 'Werkstatt Birkenhof' });
		await indexMemoryVectors(config());
		expect((await companionMemoryHybrid('Birkenhof')).length).toBeLessThanOrEqual(10);
	});
	it('does not extend subject ranking to excluded finance or unavailable semantic paths', async () => {
		fact('Geklärte Kontobewegung.', { subject: 'Kontomappe', domain: 'finance' });
		fact('Kennung und Dauer werden protokolliert.', { subject: 'Wortgarten', domain: 'projects' });
		embeddings(texts => texts.map(t => t.startsWith('query:') ? [1,0,0] : [0,1,0])); await indexMemoryVectors(config());
		expect(await companionMemoryHybrid('Kontomappe')).toEqual(companionMemory('Kontomappe'));
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
		expect(await companionMemoryHybrid('Wortgarten')).toEqual(companionMemory('Wortgarten'));
	});
	it('abstains from semantic additions when all candidate similarities are similarly high', async () => {
		for (let i = 0; i < 4; i++) fact(`Kandidat ${i}`);
		embeddings(); await indexMemoryVectors(config());
		const result = await compileMemoryContextHybrid(input);
		expect(result.retrieval?.semantic_status).toBe('ready');
		expect(result.retrieval?.semantic_fact_ids).toEqual([]);
		expect(await companionMemoryHybrid('Fenstertausch')).toEqual([]);
	});
	it('reserves selected seeds against single-word and pinned-class crowding within the budget', async () => {
		const seed = fact('Britische Projektmanagementmethode', { data_class: 'career_credential' });
		for (let i = 0; i < 12; i++) fact(`Fenstertausch ${i}`, { data_class: 'career_education' });
		embeddings(texts => texts.map(t => t.startsWith('query:') || t.includes('Britische') ? [1,0,0] : [0,1,0])); await indexMemoryVectors(config());
		const result = await compileMemoryContextHybrid({ ...input, always_include_data_classes: ['career_education'] });
		expect(result.facts).toHaveLength(5);
		expect(result.facts.slice(0,5).map(f => f.fact_id)).toContain(seed.fact_id);
		const companion = await companionMemoryHybrid('Fenstertausch Ausbildung');
		expect(companion).toHaveLength(10);
		expect(companion.slice(0,5).map(f => f.fact_id)).toContain(seed.fact_id);
	});
	it('keeps disabled, unavailable and exact companion queries identical to the lexical path', async () => {
		for (let i = 0; i < 12; i++) fact(`Fenstertausch AB-1234 ${i}`);
		const fetch = embeddings(); await indexMemoryVectors(config()); fetch.mockClear();
		expect(await companionMemoryHybrid('Fenstertausch AB-1234')).toEqual(companionMemory('Fenstertausch AB-1234'));
		expect(fetch).not.toHaveBeenCalled();
		vi.stubEnv('FOLIO_MEMORY_SEMANTIC','0');
		expect(await companionMemoryHybrid('Fenstertausch')).toEqual(companionMemory('Fenstertausch'));
		vi.stubEnv('FOLIO_MEMORY_SEMANTIC','1');
		vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
		expect(await companionMemoryHybrid('Fenstertausch')).toEqual(companionMemory('Fenstertausch'));
	});
	it('validates every requested domain before a shared inference', async () => {
		fact(); const fetch = embeddings(); await indexMemoryVectors(config()); fetch.mockClear();
		await expect(compileMemoryContextsHybrid({ ...input, consumer_id: 'sonar-public', max_sensitivity: 'public' }, ['ai','home'])).rejects.toThrow('cannot read');
		expect(fetch).not.toHaveBeenCalled();
	});
	it('drops all domain bundles on a vault switch during the shared inference', async () => {
		fact('Fenstertausch'); fact('Fenstertausch', { domain: 'career' }); embeddings(); await indexMemoryVectors(config());
		embeddings(() => { vi.stubEnv('FOLIO_DB_PATH', join(dir,'other.db')); return [[1,0,0]]; });
		expect(await companionMemoryHybrid('Fenstertausch')).toEqual([]);
	});
	it('does not include more-sensitive or invalid entity labels in embedding input', () => {
		const bundle = proposeMemoryBundle({ domain: 'home', source_kind: 'owner', source_ref: 'synthetic:private', extractor_id: 'test', actor_kind: 'human', actor_id: 'test',
			entities: [{ local_ref: 'entity', entity_type: 'property', canonical_key: 'secret:1', canonical_label: 'SECRET LABEL', sensitivity: 'sensitive' }],
			facts: [{ data_class: 'context', subject: 'Haus', predicate: 'repair', value: 'Verglasung', sensitivity: 'private', subject_ref: 'entity' }] });
		confirmMemoryProposalBundle(bundle.proposal.proposal_id, 'owner');
		const projected = projectMemoryFacts({ max_sensitivity: 'private', as_of: input.as_of! });
		expect(projected.map(p => p.text).join(' ')).not.toContain('SECRET LABEL');
	});
	it('does not mutate canonical Memory or Ledger tables when indexing or retrieving', async () => {
		fact(); embeddings(); const before = getFolioDb().serialize();
		await indexMemoryVectors(config()); await compileMemoryContextHybrid(input);
		expect(getFolioDb().serialize()).toEqual(before);
		expect(getFolioDb().prepare("SELECT name FROM sqlite_master WHERE name='vectors'").get()).toBeUndefined();
	});
	it('does not reuse previous-vault facts if the vault changes while inference is pending', async () => {
		fact('Fenstertausch'); embeddings(); await indexMemoryVectors(config());
		embeddings(() => { vi.stubEnv('FOLIO_DB_PATH', join(dir,'other.db')); return [[1,0,0]]; });
		const result = await compileMemoryContextHybrid(input);
		expect(result.facts).toEqual([]); expect(result.entities).toEqual([]); expect(result.retrieval?.semantic_status).toBe('unavailable');
	});
	it('keeps Relay lexical even when semantic retrieval is enabled', async () => {
		vi.stubEnv('FOLIO_SESSION_EXCHANGE_PATH', join(dir,'exchange'));
		vi.stubEnv('FOLIO_SESSION_BRIDGE_PATH', join(dir,'bridge'));
		fact('Travail à distance', { domain: 'career', sensitivity: 'public' });
		const publicFact = fact('Remote work', { domain: 'career', sensitivity: 'public' });
		fact('CONFIDENTIAL', { domain: 'career', sensitivity: 'sensitive' });
		const fetch = embeddings(); await indexMemoryVectors(config()); fetch.mockClear();
		const { stageCareerMailRelayHybrid } = await import('../relay/mail.js');
		const { getRelayPayloadForReview } = await import('../relay/store.js');
		const result = await stageCareerMailRelayHybrid({ feedback_id: 1, account_id: 'test', imap_uid: 1, sender: 'Example', subject: 'Remote work', domain: 'job', body: 'Would a distributed arrangement be suitable?', body_truncated: false },
			[{ id: 'test-target', label: 'Test', domain: 'career', adapter: 'filesystem', locality: 'cloud', capabilities: ['reply_draft'], allowed_data_classes: ['mail_metadata','mail_body','memory_context'], memory_max_sensitivity: 'public', retention_days: 14 }]);
		const payload = getRelayPayloadForReview(result.case.case_id);
		expect(payload.memory_context?.facts.map(f => f.fact_id)).toEqual([publicFact.fact_id]);
		expect(JSON.stringify(payload)).not.toContain('CONFIDENTIAL');
		expect(result.case.status).toBe('staged');
		const relayInput = { ...input, consumer_id: 'relay-career' as const, domain: 'career', query: 'Remote work' };
		expect((await compileMemoryContextHybrid(relayInput)).facts).toEqual(compileMemoryContext(relayInput).facts);
		expect(fetch).not.toHaveBeenCalled();
	});
	it('filters low-similarity results and deduplicates lexical/semantic hits', async () => {
		fact('Fenstertausch'); fact('Fahrrad', { subject: 'Rad' });
		embeddings(texts => texts.map(t => t.includes('Fahrrad') ? [0,1,0] : [1,0,0])); await indexMemoryVectors(config());
		const result = await compileMemoryContextHybrid(input); expect(result.facts).toHaveLength(1);
		expect(result.facts[0].value).toBe('Fenstertausch');
	});
	it.each(['https://example.org/v1/embeddings', 'http://127.0.0.1.evil.test/v1/embeddings', 'http://user:pass@127.0.0.1/v1/embeddings'])('rejects remote or credentialed endpoint %s', endpoint => {
		vi.stubEnv('FOLIO_MEMORY_EMBEDDING_URL', endpoint); expect(() => config()).toThrow('loopback');
	});
	it('rejects model substitution, duplicate indexes, invalid dimensions and zero vectors', async () => {
		for (const body of [
			{ model: 'wrong', data: [{index:0,embedding:[1,0,0]}] },
			{ model: 'test-embedding', data: [{index:1,embedding:[1,0,0]}] },
			{ model: 'test-embedding', data: [{index:0,embedding:[1,0]}] },
			{ model: 'test-embedding', data: [{index:0,embedding:[0,0,0]}] }
		]) { vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body)))); await expect(embedTexts(config(), ['test'], 'query')).rejects.toThrow(); }
	});
});
