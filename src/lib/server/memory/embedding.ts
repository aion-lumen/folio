import { createHash } from 'node:crypto';
import { SEMANTIC_TEXT_VERSION } from './semantic-projection.js';

export interface EmbeddingConfig {
	endpoint: string; model: string; revision: string; dimensions: number;
	queryPrefix: string; passagePrefix: string; timeoutMs: number; minSimilarity: number; minMargin: number; maxCandidates: number;
}
export function embeddingConfig(): EmbeddingConfig | null {
	if (process.env.FOLIO_MEMORY_SEMANTIC !== '1') return null;
	const model = process.env.FOLIO_MEMORY_EMBEDDING_MODEL?.trim();
	const revision = process.env.FOLIO_MEMORY_EMBEDDING_REVISION?.trim();
	const endpoint = process.env.FOLIO_MEMORY_EMBEDDING_URL?.trim();
	if (!model || !revision || !endpoint) throw new Error('semantic embedding configuration is incomplete');
	const url = new URL(endpoint);
	if (url.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== '/v1/embeddings') {
		throw new Error('embeddings require an explicit loopback HTTP /v1/embeddings endpoint');
	}
	const dimensions = Number(process.env.FOLIO_MEMORY_EMBEDDING_DIMENSIONS ?? 384);
	const minSimilarity = Number(process.env.FOLIO_MEMORY_SEMANTIC_MIN_SIMILARITY ?? 0.78);
	const minMargin = Number(process.env.FOLIO_MEMORY_SEMANTIC_MIN_MARGIN ?? 0.05);
	const maxCandidates = Number(process.env.FOLIO_MEMORY_SEMANTIC_MAX_CANDIDATES ?? 2);
	if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > 4096 || !Number.isFinite(minSimilarity) || minSimilarity < 0 || minSimilarity > 1 || !Number.isFinite(minMargin) || minMargin < 0 || minMargin > 1 || !Number.isInteger(maxCandidates) || maxCandidates < 1 || maxCandidates > 2) throw new Error('invalid semantic dimensions or threshold');
	return { endpoint: url.toString(), model, revision, dimensions, minSimilarity, minMargin, maxCandidates,
		queryPrefix: process.env.FOLIO_MEMORY_EMBEDDING_QUERY_PREFIX ?? 'query: ',
		passagePrefix: process.env.FOLIO_MEMORY_EMBEDDING_PASSAGE_PREFIX ?? 'passage: ', timeoutMs: 3000 };
}
export function embeddingProfile(config: EmbeddingConfig): string {
	return createHash('sha256').update(JSON.stringify([config.endpoint, config.model, config.revision,
		config.dimensions, config.queryPrefix, config.passagePrefix, SEMANTIC_TEXT_VERSION])).digest('hex');
}
export function normalizedVector(value: unknown, dimensions: number): number[] {
	if (!Array.isArray(value) || value.length !== dimensions || value.some(n => typeof n !== 'number' || !Number.isFinite(n))) throw new Error('invalid embedding vector');
	const norm = Math.sqrt(value.reduce((sum, n) => sum + n * n, 0));
	if (!Number.isFinite(norm) || norm < 1e-12) throw new Error('empty embedding vector');
	return value.map(n => n / norm);
}
// Share only concurrent query inference (e.g. the companion's domain fan-out).
// No persistent query cache; personal questions leave memory after completion.
const pendingQueries = new Map<string, Promise<number[][]>>();
export async function embedQuery(config: EmbeddingConfig, query: string): Promise<number[]> {
	const key = createHash('sha256').update(embeddingProfile(config) + query).digest('hex');
	let pending = pendingQueries.get(key);
	if (!pending) {
		pending = embedTexts(config, [query], 'query');
		pendingQueries.set(key, pending);
	}
	try { return (await pending)[0]; }
	finally { if (pendingQueries.get(key) === pending) pendingQueries.delete(key); }
}
export async function embedTexts(config: EmbeddingConfig, texts: string[], kind: 'query' | 'passage'): Promise<number[][]> {
	if (!texts.length || texts.length > 16 || texts.some(t => !t.trim() || t.length > 12000)) throw new Error('embedding input exceeds bounds');
	const response = await fetch(config.endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(config.timeoutMs),
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ model: config.model, input: texts.map(t => (kind === 'query' ? config.queryPrefix : config.passagePrefix) + t), encoding_format: 'float' }) });
	if (!response.ok) throw new Error(`local embeddings unavailable (${response.status})`);
	// Bound decoded response too; a local endpoint is not a trusted parser input.
	const reader = response.body?.getReader();
	if (!reader) throw new Error('missing embedding response');
	const parts: Uint8Array[] = []; let size = 0;
	try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length;
		if (size > 4_000_000) throw new Error('embedding response too large'); parts.push(value); }
	} catch (error) { await reader.cancel(); throw error; }
	const body = JSON.parse(Buffer.concat(parts).toString('utf8'));
	if (body.model !== config.model || !Array.isArray(body.data) || body.data.length !== texts.length) throw new Error('embedding model or batch mismatch');
	const ordered = new Map<number, number[]>();
	for (const row of body.data) {
		if (!Number.isInteger(row.index) || row.index < 0 || row.index >= texts.length || ordered.has(row.index)) throw new Error('invalid embedding batch index');
		ordered.set(row.index, normalizedVector(row.embedding, config.dimensions));
	}
	return texts.map((_, index) => ordered.get(index)!);
}
