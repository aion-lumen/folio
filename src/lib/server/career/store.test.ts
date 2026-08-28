import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('career cases', () => {
	let dir = '';

	afterEach(async () => {
		const { resetFolioDbForTests } = await import('../folio-db/init.js');
		resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	async function setup() {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db'));
		vi.resetModules();
		const init = await import('../folio-db/init.js');
		init.resetFolioDbForTests();
		return {
			db: init.getFolioDb(),
			memory: await import('../memory/store.js'),
			career: await import('./store.js')
		};
	}

	it('stores one stable case and append-only evidence-bound assessments', async () => {
		const { db, memory, career } = await setup();
		const fact = memory.proposeMemoryFact({
			domain: 'career', data_class: 'career_project_evidence', sensitivity: 'private',
			subject: 'PAX', predicate: 'demonstrates', value: 'SAP BW project leadership',
			source_kind: 'carta-cv', source_ref: 'carta:cv:timeline:3', actor_kind: 'import', actor_id: 'seed'
		});
		memory.confirmMemoryFactByHuman(fact.fact_id, 'owner');
		const identity = career.careerIdentityKey('freelancermap', null, 'https://example.invalid/job/1');
		const first = career.ensureCareerCase({
			identity_key: identity, source_kind: 'freelancermap', source_ref: 'carta:tracker:1',
			employer: 'Example', title: 'SAP Lead', source_url: 'https://example.invalid/job/1',
			checked_at: '2026-08-28T10:00:00Z'
		});
		expect(career.ensureCareerCase({
			identity_key: identity, source_kind: 'freelancermap', source_ref: 'carta:tracker:1',
			employer: 'Example', title: 'SAP Lead', source_url: 'https://example.invalid/job/1',
			checked_at: '2026-08-28T10:00:00Z'
		}).case_id).toBe(first.case_id);

		const assessment = career.recordCareerAssessment(first.case_id, [{
			text: 'Project leadership', class: 'MUST', evidence_state: 'PROVEN', evidence_fact_ids: [fact.fact_id]
		}], 'owner');
		expect(assessment.decision).toBe('APPLY');
		expect(career.latestCareerAssessment(first.case_id)?.context_fact_ids).toEqual([fact.fact_id]);
		expect(() => db.prepare('DELETE FROM career_assessments WHERE assessment_id = ?').run(assessment.assessment_id))
			.toThrow(/append-only/);
		expect(() => db.prepare('UPDATE career_cases SET title = ? WHERE case_id = ?').run('Changed', first.case_id))
			.toThrow(/immutable/);
	});

	it('refuses candidate, superseded or foreign-domain evidence', async () => {
		const { memory, career } = await setup();
		const candidate = memory.proposeMemoryFact({
			domain: 'career', data_class: 'career_project_evidence', sensitivity: 'private',
			subject: 'Claim', predicate: 'states', value: 'Unconfirmed', source_kind: 'carta-cv',
			source_ref: 'carta:cv:claim', actor_kind: 'import', actor_id: 'seed'
		});
		const position = career.ensureCareerCase({
			identity_key: career.careerIdentityKey('portal', '42'), source_kind: 'portal', source_ref: 'portal:42',
			external_id: '42', employer: 'Example', title: 'Role', checked_at: '2026-08-28T10:00:00Z'
		});
		expect(() => career.recordCareerAssessment(position.case_id, [{
			text: 'Claim', class: 'MUST', evidence_state: 'PROVEN', evidence_fact_ids: [candidate.fact_id]
		}], 'owner')).toThrow(/non-confirmed career facts/);
	});
});
