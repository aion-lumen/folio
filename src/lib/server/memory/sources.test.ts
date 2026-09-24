import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('memory source provenance', () => {
	let dir = '';
	afterEach(async () => {
		const init = await import('../folio-db/init.js');
		init.resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('stores one source with confirmed primary and secondary domains but no content', async () => {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db'));
		vi.resetModules();
		const sourceStore = await import('./sources.js');
		sourceStore.upsertMemorySourceCandidate({
			source_kind: 'file', source_ref: 'file:abc', title: 'Antrag.pdf', relative_path: 'Documents/Antrag.pdf',
			content_hash: 'abc', primary_domain: 'career', secondary_domains: ['finance', 'career', 'finance'], reviewed_by: 'owner'
		});
		const sources = sourceStore.listActiveMemorySources();
		expect(sources).toHaveLength(1);
		expect(sources[0]).toMatchObject({ source_ref: 'file:abc', status: 'candidate' });
		expect(sources[0].domains.map((row) => [row.domain, row.role])).toEqual([
			['career', 'primary'], ['finance', 'secondary']
		]);
		expect(Object.keys(sources[0])).not.toContain('content');
		sourceStore.withdrawMemorySourceCandidate('file:abc');
		expect(sourceStore.listActiveMemorySources()).toEqual([]);
	});
});
