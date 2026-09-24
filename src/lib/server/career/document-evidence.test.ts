import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CareerEvidenceManifest } from './document-evidence.js';

describe('career document evidence import', () => {
	let dir = '';

	afterEach(async () => {
		const { resetFolioDbForTests } = await import('../folio-db/init.js');
		resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('hash-verifies, supersedes a CV fact and remains idempotent', async () => {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		const vault = join(dir, 'life');
		const relativePath = 'career/zertifikate/degree.pdf';
		const absolutePath = join(vault, relativePath);
		mkdirSync(join(vault, 'career/zertifikate'), { recursive: true });
		writeFileSync(absolutePath, 'Bachelor of Science Informatik, 11.07.2003');
		vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db'));
		vi.resetModules();
		const memory = await import('../memory/store.js');
		const sources = await import('../memory/sources.js');
		const importer = await import('./document-evidence.js');
		const identity = memory.proposeMemoryBundle({
			domain: 'career', source_kind: 'owner', source_ref: 'owner:identity', extractor_id: 'test', actor_id: 'test',
			entities: [{ local_ref: 'person', entity_type: 'person', canonical_key: 'career:person:owner', canonical_label: 'Alex Beispiel', sensitivity: 'private' }]
		});
		memory.confirmMemoryProposalBundle(identity.proposal.proposal_id, 'owner');
		const person = memory.findConfirmedMemoryEntity('career', 'person', 'career:person:owner')!;
		const cvFact = memory.proposeMemoryFact({
			domain: 'career', data_class: 'career_education', sensitivity: 'private', subject: 'Alex Beispiel',
			predicate: 'holds_degree', value: 'B.Sc. Informatik', source_kind: 'carta-cv', source_ref: 'carta:cv:education:0',
			subject_entity_id: person.entity_id, actor_kind: 'import', actor_id: 'seed'
		});
		memory.confirmMemoryFactByHuman(cvFact.fact_id, 'owner');
		const hash = createHash('sha256').update('Bachelor of Science Informatik, 11.07.2003').digest('hex');
		const manifest: CareerEvidenceManifest = {
			schema: 'folio/career-evidence-import/v1',
			sources: [{
				relative_path: relativePath, sha256: hash,
				fact: {
					data_class: 'career_education', subject: 'Alex Beispiel', predicate: 'holds_degree',
					value: 'B.Sc. Informatik, Hochschule Darmstadt, 11.07.2003',
					source_excerpt: 'Bachelor of Science Informatik, 11.07.2003',
					supersedes_source_ref: 'carta:cv:education:0'
				}
			}]
		};

		expect(importer.validateCareerEvidenceManifest(manifest, vault)).toMatchObject({ sources: 1, replacements: 1, new_facts: 0 });
		expect(importer.importCareerEvidenceManifest(manifest, vault, 'owner')).toMatchObject({ proposed: 1, confirmed: 1, existing: 0 });
		expect(memory.getMemoryFact(cvFact.fact_id).status).toBe('superseded');
		const imported = memory.findMemoryFactBySource('career', `file:sha256:${hash}`)!;
		expect(imported).toMatchObject({ status: 'confirmed', subject_entity_id: person.entity_id, supersedes_fact_id: cvFact.fact_id });
		expect(sources.listActiveMemorySources()[0]).toMatchObject({ relative_path: relativePath, content_hash: hash });
		expect(importer.importCareerEvidenceManifest(manifest, vault, 'owner')).toMatchObject({ proposed: 0, confirmed: 0, existing: 1 });
	});
});
