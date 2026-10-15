import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const args = process.argv.slice(2);
const arg = (key: string, fallback: string) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const split = arg('--split', 'dev');
if (!['dev', 'heldout'].includes(split)) throw new Error('Use --split dev or heldout');
const thresholds = arg('--thresholds', '0.85').split(',').map(Number);
if (split === 'heldout' && thresholds.length !== 1) throw new Error('Freeze one threshold before the held-out comparison');
const out = resolve(arg('--output', join(tmpdir(), `folio-memory-${split}.json`)));
const dir = mkdtempSync(join(tmpdir(), 'folio-retrieval-eval-'));
process.env.FOLIO_DB_PATH = join(dir, 'folio.db');
process.env.FOLIO_VAULT_OVERRIDE = join(dir, 'vault');
process.env.FEEDBACK_DB_PATH = join(dir, 'feedback.db');
process.env.FOLIO_MEMORY_SEMANTIC = '1';
process.env.FOLIO_MEMORY_EMBEDDING_URL ??= 'http://127.0.0.1:1235/v1/embeddings';
process.env.FOLIO_MEMORY_EMBEDDING_MODEL ??= 'intfloat/multilingual-e5-small@614241f622f53c4eeff9890bdc4f31cfecc418b3/qint8';
process.env.FOLIO_MEMORY_EMBEDDING_REVISION ??= '614241f622f53c4eeff9890bdc4f31cfecc418b3';
process.env.FOLIO_MEMORY_EMBEDDING_DIMENSIONS = '384';
const memory = await import('../../src/lib/server/memory/store.js');
const { getFolioDb, resetFolioDbForTests } = await import('../../src/lib/server/folio-db/init.js');
const { compileMemoryContext, renderMemoryContext } = await import('../../src/lib/server/memory/compiler.js');
const { compileMemoryContextHybrid } = await import('../../src/lib/server/memory/hybrid.js');
const { indexMemoryVectors, semanticIndexPath } = await import('../../src/lib/server/memory/semantic.js');
const { embeddingConfig, embeddingProfile } = await import('../../src/lib/server/memory/embedding.js');
const source = readFileSync(new URL('./cases.json', import.meta.url), 'utf8');
type Fact = { id: string; domain: string; subject: string; predicate: string; value: string; entity?: string };
type Query = { id: string; split: string; kind: string; domain: string; query: string; expected: string[] };
const suite = JSON.parse(source) as { reference: string; facts: Fact[]; queries: Query[] };
const ids = new Map<string, string>();
for (const f of suite.facts.filter(f => !f.entity)) {
	const row = memory.proposeMemoryFact({ ...f, data_class: 'context', sensitivity: 'private', source_kind: 'owner', source_ref: `synthetic:${f.id}`, actor_kind: 'human', actor_id: 'synthetic-owner' });
	memory.confirmMemoryFactByHuman(row.fact_id, 'synthetic-owner'); ids.set(row.fact_id, f.id);
}
for (const entity of new Set(suite.facts.map(f => f.entity).filter(Boolean))) {
	const group = suite.facts.filter(f => f.entity === entity);
	const proposed = memory.proposeMemoryBundle({ domain: group[0].domain, source_kind: 'owner', source_ref: `synthetic:${entity}`, extractor_id: 'synthetic', actor_kind: 'human', actor_id: 'synthetic-owner',
		entities: [{ local_ref: entity!, entity_type: 'project', canonical_key: `project:${entity}`, canonical_label: 'Vorgang Nordlicht', sensitivity: 'private' }],
		facts: group.map(f => ({ data_class: 'context', sensitivity: 'private', subject: f.subject, predicate: f.predicate, value: f.value, subject_ref: entity })) });
	const confirmed = memory.confirmMemoryProposalBundle(proposed.proposal.proposal_id, 'synthetic-owner');
	for (const f of confirmed.facts) ids.set(f.fact_id, group.find(g => g.value === f.value_text)!.id);
}
const config = embeddingConfig()!;
const index = await indexMemoryVectors(config);
const update = await indexMemoryVectors(config);
const sourceSchemaBefore = getFolioDb().prepare('SELECT sql FROM sqlite_master ORDER BY name').all();
type Score = { found: string[]; recall: number|null; precision: number|null; false_hits: string[];
	duration_ms: number; rendered: string; retrieval: ReturnType<typeof compileMemoryContext>['retrieval'] };
const variants = [];
for (const threshold of thresholds) {
	process.env.FOLIO_MEMORY_SEMANTIC_MIN_SIMILARITY = String(threshold);
	const cases: (Query & {baseline: Score; hybrid: Score})[] = [];
	for (const q of suite.queries.filter(q => q.split === split)) {
		const request = { consumer_id: 'owner-preview' as const, domain: q.domain, query: q.query, max_sensitivity: 'private' as const, limit: 5 };
		const start = performance.now(); const baseline = compileMemoryContext(request); const baselineMs = performance.now() - start;
		const began = performance.now(); const hybrid = await compileMemoryContextHybrid(request); const hybridMs = performance.now() - began;
		const score = (bundle: typeof baseline, ms: number) => {
			const found = bundle.facts.map(f => ids.get(f.fact_id)!);
			const relevant = found.filter(f => q.expected.includes(f));
			return { found, recall: q.expected.length ? relevant.length / q.expected.length : null,
				precision: found.length ? relevant.length / found.length : null,
				false_hits: found.filter(f => !q.expected.includes(f)), duration_ms: ms,
				rendered: renderMemoryContext(bundle), retrieval: bundle.retrieval };
		};
		cases.push({ ...q, baseline: score(baseline, baselineMs), hybrid: score(hybrid, hybridMs) });
	}
	const summarize = (items: typeof cases, mode: 'baseline' | 'hybrid') => {
		const relevant = items.filter(q => q.expected.length), empty = items.filter(q => !q.expected.length);
		const times = items.map(q => q[mode].duration_ms).sort((a,b) => a-b);
		return { cases: items.length, recall_at_5: relevant.length ? relevant.reduce((sum,q) => sum + q[mode].recall!, 0) / relevant.length : null,
			false_hits: items.reduce((sum,q) => sum + q[mode].false_hits.length, 0),
			unanswerable_with_hits: empty.filter(q => q[mode].found.length).length,
			p50_ms: times[Math.floor(times.length/2)], p95_ms: times[Math.min(times.length-1,Math.floor(times.length*.95))] };
	};
	variants.push({ threshold, baseline: summarize(cases,'baseline'), hybrid: summarize(cases,'hybrid'),
		by_kind: Object.fromEntries([...new Set(cases.map(q => q.kind))].map(kind => [kind, { baseline: summarize(cases.filter(q => q.kind === kind),'baseline'), hybrid: summarize(cases.filter(q => q.kind === kind),'hybrid') }])), cases });
}
if (JSON.stringify(sourceSchemaBefore) !== JSON.stringify(getFolioDb().prepare('SELECT sql FROM sqlite_master ORDER BY name').all())) throw new Error('retrieval changed canonical schema');
const report = { schema: 'folio/memory-retrieval-report/v1', created_at: new Date().toISOString(), reference: suite.reference,
	limitations: ['Small synthetic corpus; questions and references authored by the implementing AI.', 'Measures retrieval and rendered source context, not final generative answers or production reliability.'],
	split, suite_sha256: createHash('sha256').update(source).digest('hex'), profile: { ...config, profile: embeddingProfile(config) },
	index, unchanged_update: update, index_bytes: statSync(semanticIndexPath()).size, fixture_directory: dir, variants };
mkdirSync(resolve(out, '..'), { recursive: true }); writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
resetFolioDbForTests();
console.log(JSON.stringify({ output: out, index, variants: variants.map(({threshold,baseline,hybrid}) => ({threshold,baseline,hybrid})) }, null, 2));
