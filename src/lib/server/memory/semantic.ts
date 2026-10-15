import Database from 'better-sqlite3';
import { chmodSync, existsSync } from 'node:fs';
import { getFolioDbPath, isDemoVaultActive } from '../env.js';
import { embeddingProfile, embedQuery, embedTexts, normalizedVector, type EmbeddingConfig } from './embedding.js';
import { projectMemoryFacts } from './semantic-projection.js';
import type { CompileMemoryContextInput } from './compiler.js';

export interface SemanticSeed { fact_id: string; hash: string; similarity: number }
export function semanticIndexPath(): string { return `${getFolioDbPath()}.memory-vectors.sqlite`; }
const schema = `CREATE TABLE IF NOT EXISTS vectors (
	fact_id TEXT PRIMARY KEY, profile TEXT NOT NULL, content_hash TEXT NOT NULL,
	vector TEXT NOT NULL, indexed_at TEXT NOT NULL);
	CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);`;

/** Explicit maintenance only; search never writes to either database. */
export async function indexMemoryVectors(config: EmbeddingConfig) {
	if (isDemoVaultActive()) throw new Error('semantic indexing is disabled for demo vaults');
	const start = performance.now(), profile = embeddingProfile(config), source = getFolioDbPath();
	const projected = projectMemoryFacts({ max_sensitivity: 'sensitive', as_of: new Date().toISOString() });
	const path = semanticIndexPath(), db = new Database(path);
	chmodSync(path, 0o600); db.pragma('busy_timeout = 1000'); db.pragma('journal_mode = DELETE'); db.exec(schema);
	try {
		const previous = new Map((db.prepare('SELECT fact_id, profile, content_hash FROM vectors').all() as { fact_id: string; profile: string; content_hash: string }[]).map(r => [r.fact_id, r]));
		const current = new Set(projected.map(p => p.fact.fact_id));
		let removed = 0;
		// Purge revoked/expired/changed/model-mismatched rows even if inference later fails.
		db.transaction(() => { for (const [id, row] of previous) {
			const fact = projected.find(p => p.fact.fact_id === id);
			if (!current.has(id) || row.profile !== profile || row.content_hash !== fact?.hash) removed += db.prepare('DELETE FROM vectors WHERE fact_id=?').run(id).changes;
		} })();
		const missing = projected.filter(p => previous.get(p.fact.fact_id)?.profile !== profile || previous.get(p.fact.fact_id)?.content_hash !== p.hash);
		let indexed = 0, skippedChanged = 0;
		for (let at = 0; at < missing.length; at += 8) {
			const batch = missing.slice(at, at + 8);
			const vectors = await embedTexts({ ...config, timeoutMs: 30000 }, batch.map(p => p.text), 'passage');
			if (getFolioDbPath() !== source) throw new Error('active memory changed during indexing');
			const latest = new Map(projectMemoryFacts({ max_sensitivity: 'sensitive', as_of: new Date().toISOString() }).map(p => [p.fact.fact_id, p.hash]));
			db.transaction(() => { batch.forEach((p, index) => {
				if (latest.get(p.fact.fact_id) !== p.hash) { skippedChanged++; return; }
				db.prepare('INSERT OR REPLACE INTO vectors VALUES (?,?,?,?,?)').run(p.fact.fact_id, profile, p.hash, JSON.stringify(vectors[index]), new Date().toISOString()); indexed++;
			}); })();
		}
		db.prepare('INSERT OR REPLACE INTO metadata VALUES (?,?)').run('profile', JSON.stringify({ profile, model: config.model, revision: config.revision, dimensions: config.dimensions, indexed_at: new Date().toISOString() }));
		return { indexed, removed, reused: projected.length - missing.length, skippedChanged, facts: projected.length, duration_ms: performance.now() - start, profile, path };
	} finally { db.close(); }
}

export async function semanticCandidates(input: CompileMemoryContextInput, config: EmbeddingConfig, domains: readonly string[] = [input.domain]): Promise<{ seeds: SemanticSeed[]; status: 'ready' | 'missing-index' }> {
	const source = getFolioDbPath(), path = semanticIndexPath();
	if (!existsSync(path)) return { seeds: [], status: 'missing-index' };
	const profile = embeddingProfile(config), db = new Database(path, { readonly: true, fileMustExist: true });
	let rows: { fact_id: string; content_hash: string; vector: string }[];
	try { rows = db.prepare('SELECT fact_id, content_hash, vector FROM vectors WHERE profile=? LIMIT 5001').all(profile) as typeof rows; }
	finally { db.close(); }
	if (!rows.length) return { seeds: [], status: 'missing-index' };
	if (rows.length > 5000) throw new Error('semantic index exceeds bounded search');
	// A single candidate pool and budget across all policy-validated domains.
	const projectAllowed = () => new Map(projectMemoryFacts({ max_sensitivity: input.max_sensitivity, as_of: input.as_of! })
		.filter(p => domains.includes(p.fact.domain)).map(p => [p.fact.fact_id, p.hash]));
	let allowed = projectAllowed();
	rows = rows.filter(r => allowed.get(r.fact_id) === r.content_hash);
	if (!rows.length) return { seeds: [], status: 'ready' };
	const query = await embedQuery(config, input.query.slice(0, 6000));
	if (getFolioDbPath() !== source) throw new Error('active memory changed during search');
	// Recheck permissions, deletion and source changes after the asynchronous boundary.
	allowed = projectAllowed();
	const ranked = rows.filter(r => allowed.get(r.fact_id) === r.content_hash).map(row => {
		const vector = normalizedVector(JSON.parse(row.vector), config.dimensions);
		return { fact_id: row.fact_id, hash: row.content_hash, similarity: query.reduce((sum, n, i) => sum + n * vector[i], 0) };
	}).sort((a, b) => b.similarity - a.similarity || a.fact_id.localeCompare(b.fact_id));
	// Contrast against this query's permitted corpus, not a probability of truth.
	// With fewer than three eligible facts no useful background estimate exists.
	const middle = Math.floor(ranked.length / 2);
	const median = ranked.length ? (ranked[middle].similarity + ranked[Math.floor((ranked.length - 1) / 2)].similarity) / 2 : 0;
	const seeds = ranked.filter(r => r.similarity >= config.minSimilarity &&
		(ranked.length < 3 || r.similarity - median >= config.minMargin)).slice(0, Math.min(2, config.maxCandidates));
	return { seeds, status: 'ready' };
}
