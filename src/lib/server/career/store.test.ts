import { createHash, randomUUID } from 'node:crypto';
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

	it('projects a high-fit lead and records terminal owner claims without any external action', async () => {
		const { db, memory, career } = await setup();
		const facts = ['Enterprise Data', 'Folio'].map((subject, index) => {
			const fact = memory.proposeMemoryFact({
				domain: 'career', data_class: 'career_project_evidence', sensitivity: 'private',
				subject, predicate: 'demonstrates', value: index ? 'Local-first agentic AI system' : '20 years of BI delivery',
				source_kind: 'carta-cv', source_ref: `carta:test:${index}`, actor_kind: 'import', actor_id: 'seed'
			});
			memory.confirmMemoryFactByHuman(fact.fact_id, 'owner');
			return fact;
		});
		const position = career.ensureCareerCase({
			identity_key: career.careerIdentityKey('portal', 'high-fit-1'), source_kind: 'portal',
			source_ref: 'portal:high-fit-1', external_id: 'high-fit-1', employer: 'Example AG',
			title: 'Senior Consultant AI & Data', source_url: 'https://example.invalid/jobs/high-fit-1',
			checked_at: '2026-09-02T08:00:00Z'
		});
		const assessment = career.recordCareerAssessment(position.case_id, [{
			text: 'Enterprise data delivery', class: 'MUST', evidence_state: 'PROVEN', evidence_fact_ids: facts.map((fact) => fact.fact_id)
		}], 'carta-session', 9);
		const snapshotHash = createHash('sha256').update('open-source-snapshot').digest('hex');
		const created = career.createCareerLead({
			case_id: position.case_id, assessment_id: assessment.assessment_id, fit_score: 9,
			availability: 'OPEN', availability_event_id: 'availability:high-fit-1:1',
			availability_checked_at: '2026-09-02T08:01:00Z', source_snapshot_ref: 'file:career/high-fit-1.json',
			source_snapshot_hash: snapshotHash, strongest_fact_ids: facts.map((fact) => fact.fact_id),
			location: 'Basel', workload: '80–100 %', contract_type: 'Festanstellung',
			next_step: 'Unterlagen prüfen und Bewerbung beginnen.', idempotency_key: 'lead-create:high-fit-1',
			occurred_at: '2026-09-02T08:02:00Z'
		});
		let lead = career.listCareerLeads(new Date('2026-09-02T09:00:00Z'))[0];
		expect(lead).toMatchObject({ lead_id: created.lead_id, fit_score: 9, status: 'unacknowledged', revision: 1 });
		expect(lead.strongest_facts.map((fact: { fact_id: string }) => fact.fact_id)).toEqual(facts.map((fact) => fact.fact_id));

		const started = career.appendCareerLeadAction({
			action: 'start_application', lead_id: lead.lead_id, case_id: lead.case_id,
			assessment_id: lead.assessment_id, expected_revision: lead.revision,
			availability_event_id: lead.availability_event_id, source_snapshot_hash: lead.source_snapshot_hash,
			idempotency_key: 'start:high-fit-1'
		}, 'owner', new Date('2026-09-02T09:05:00Z'));
		expect(career.appendCareerLeadAction({
			action: 'start_application', lead_id: lead.lead_id, case_id: lead.case_id,
			assessment_id: lead.assessment_id, expected_revision: lead.revision,
			availability_event_id: lead.availability_event_id, source_snapshot_hash: lead.source_snapshot_hash,
			idempotency_key: 'start:high-fit-1'
		}, 'owner', new Date('2026-09-02T09:06:00Z')).event_id).toBe(started.event_id);
		lead = career.listCareerLeads(new Date('2026-09-02T09:06:00Z'))[0];
		expect(lead).toMatchObject({ status: 'started', revision: 2 });
		expect(() => career.appendCareerLeadAction({
			action: 'snooze', lead_id: lead.lead_id, case_id: lead.case_id,
			assessment_id: lead.assessment_id, expected_revision: lead.revision,
			availability_event_id: lead.availability_event_id, source_snapshot_hash: lead.source_snapshot_hash,
			idempotency_key: 'snooze-after-start:high-fit-1', snooze_until: '2026-09-02T13:00:00Z'
		}, 'owner', new Date('2026-09-02T09:07:00Z'))).toThrow(/cannot be snoozed/);

		career.appendCareerLeadAction({
			action: 'confirm_submitted', lead_id: lead.lead_id, case_id: lead.case_id,
			assessment_id: lead.assessment_id, expected_revision: lead.revision,
			availability_event_id: lead.availability_event_id, source_snapshot_hash: lead.source_snapshot_hash,
			idempotency_key: 'submitted:high-fit-1', submitted_at: '2026-09-02T09:10:00Z',
			application_channel: 'portal', artifact_refs: ['cv:2026-09-01']
		}, 'owner', new Date('2026-09-02T09:11:00Z'));
		lead = career.listCareerLeads(new Date('2026-09-02T09:12:00Z'))[0];
		expect(lead).toMatchObject({ status: 'submitted', revision: 3, time_to_apply_ms: 4_080_000 });
		expect(() => db.prepare('DELETE FROM career_lead_events WHERE lead_id = ?').run(lead.lead_id)).toThrow(/append-only/);
	});

	it('rejects stale lead bindings and keeps CLARIFY separate from application start', async () => {
		const { memory, career } = await setup();
		const factIds = ['One', 'Two'].map((subject) => {
			const fact = memory.proposeMemoryFact({
				domain: 'career', data_class: 'profile', sensitivity: 'private', subject,
				predicate: 'states', value: subject, source_kind: 'owner', source_ref: `owner:${subject}`,
				actor_kind: 'human', actor_id: 'owner'
			});
			memory.confirmMemoryFactByHuman(fact.fact_id, 'owner');
			return fact.fact_id;
		});
		const position = career.ensureCareerCase({
			identity_key: career.careerIdentityKey('portal', 'clarify-1'), source_kind: 'portal',
			source_ref: 'portal:clarify-1', external_id: 'clarify-1', employer: 'Example', title: 'Consultant',
			checked_at: '2026-09-02T08:00:00Z'
		});
		const assessment = career.recordCareerAssessment(position.case_id, [{
			text: 'Travel', class: 'MUST', evidence_state: 'UNCLEAR', evidence_fact_ids: []
		}, {
			text: 'Data', class: 'SHOULD', evidence_state: 'PROVEN', evidence_fact_ids: factIds
		}], 'carta-session', 9);
		const hash = createHash('sha256').update('clarify').digest('hex');
		career.createCareerLead({
			case_id: position.case_id, assessment_id: assessment.assessment_id, fit_score: 9,
			availability: 'OPEN', availability_event_id: 'availability:clarify:1', availability_checked_at: '2026-09-02T08:01:00Z',
			source_snapshot_ref: 'file:clarify.json', source_snapshot_hash: hash, strongest_fact_ids: factIds,
			clarify_question: 'Ist Reisebereitschaft in der Deutschschweiz gegeben?', next_step: 'Frage klären.',
			idempotency_key: 'lead-create:clarify', occurred_at: '2026-09-02T08:02:00Z'
		});
		const lead = career.listCareerLeads()[0];
		expect(() => career.appendCareerLeadAction({
			action: 'start_application', lead_id: lead.lead_id, case_id: lead.case_id,
			assessment_id: lead.assessment_id, expected_revision: lead.revision,
			availability_event_id: lead.availability_event_id, source_snapshot_hash: lead.source_snapshot_hash,
			idempotency_key: 'clarify:start'
		})).toThrow(/CLARIFY/);
		expect(() => career.appendCareerLeadAction({
			action: 'acknowledge', lead_id: lead.lead_id, case_id: lead.case_id,
			assessment_id: lead.assessment_id, expected_revision: 99,
			availability_event_id: lead.availability_event_id, source_snapshot_hash: lead.source_snapshot_hash,
			idempotency_key: 'clarify:stale'
		})).toThrow(/changed/);
	});
});
