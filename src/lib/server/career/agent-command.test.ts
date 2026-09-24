import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('career agent command boundary', () => {
	let dir = '';

	afterEach(async () => {
		const { resetFolioDbForTests } = await import('../folio-db/init.js');
		resetFolioDbForTests();
		if (dir) rmSync(dir, { recursive: true, force: true });
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	async function setupLead() {
		dir = join(process.cwd(), 'src/lib/server/folio-db/.test-tmp', randomUUID());
		mkdirSync(dir, { recursive: true });
		vi.stubEnv('FOLIO_DB_PATH', join(dir, 'folio.db'));
		vi.resetModules();
		const init = await import('../folio-db/init.js');
		init.resetFolioDbForTests();
		const memory = await import('../memory/store.js');
		const career = await import('./store.js');
		const agent = await import('./agent-command.js');
		const factIds = ['Delivery', 'Folio'].map((subject) => {
			const fact = memory.proposeMemoryFact({
				domain: 'career', data_class: 'profile', sensitivity: 'private', subject,
				predicate: 'demonstrates', value: subject, source_kind: 'owner',
				source_ref: `owner:${subject}`, actor_kind: 'human', actor_id: 'owner'
			});
			memory.confirmMemoryFactByHuman(fact.fact_id, 'owner');
			return fact.fact_id;
		});
		const position = career.ensureCareerCase({
			identity_key: career.careerIdentityKey('portal', 'agent-command-1'), source_kind: 'portal',
			source_ref: 'portal:agent-command-1', external_id: 'agent-command-1', employer: 'Example AG',
			title: 'Senior Data Lead', checked_at: '2026-09-14T08:00:00Z'
		});
		const assessment = career.recordCareerAssessment(position.case_id, [{
			text: 'Enterprise delivery', class: 'MUST', evidence_state: 'PROVEN', evidence_fact_ids: factIds
		}], 'carta-session', 9);
		career.createCareerLead({
			case_id: position.case_id, assessment_id: assessment.assessment_id, fit_score: 9,
			availability: 'OPEN', availability_event_id: 'availability:agent-command:1',
			availability_checked_at: '2026-09-14T08:01:00Z', source_snapshot_ref: 'file:agent-command.json',
			source_snapshot_hash: createHash('sha256').update('agent-command').digest('hex'),
			strongest_fact_ids: factIds, next_step: 'Bewerbung beginnen.', idempotency_key: 'lead-create:agent-command',
			occurred_at: '2026-09-14T08:02:00Z'
		});
		return { db: init.getFolioDb(), career, agent, lead: career.listCareerLeads(new Date('2026-09-14T09:00:00Z'))[0] };
	}

	it('only recognizes explicit low-risk local commands', async () => {
		const { parseCareerAgentCommand } = await import('./agent-command.js');
		expect(parseCareerAgentCommand('Bitte markiere den Lead als gesehen.')).toEqual({ action: 'acknowledge' });
		expect(parseCareerAgentCommand('Erinnere mich morgen')).toEqual({ action: 'snooze', delay: 'tomorrow' });
		expect(parseCareerAgentCommand('Bewerbung beginnen')).toEqual({ action: 'start_application' });
		expect(parseCareerAgentCommand('Please start my application.')).toEqual({ action: 'start_application' });
		expect(parseCareerAgentCommand('Soll ich die Bewerbung beginnen?')).toBeNull();
		expect(parseCareerAgentCommand('Bewerbung nicht beginnen')).toBeNull();
		expect(parseCareerAgentCommand('Als eingereicht markieren')).toBeNull();
		expect(parseCareerAgentCommand('Lead ablehnen')).toBeNull();
	});

	it('writes an explicit command through the existing evidence-bound ledger', async () => {
		const { db, agent, lead } = await setupLead();
		const result = agent.executeCareerAgentCommand(
			'Bewerbung beginnen', lead.lead_id, 'command_1234567890abcdef', 'owner:local-agent:test',
			new Date('2026-09-14T09:05:00Z')
		);
		expect(result).toMatchObject({ handled: true, executed: true, lead: { status: 'started', revision: 2 } });
		const event = db.prepare('SELECT event_type, actor_id FROM career_lead_events WHERE lead_id = ? ORDER BY rowid DESC LIMIT 1').get(lead.lead_id);
		expect(event).toMatchObject({ event_type: 'APPLICATION_STARTED', actor_id: 'owner:local-agent:test' });
	});

	it('does not write when the message is advice or ambiguous', async () => {
		const { career, agent, lead } = await setupLead();
		const result = agent.executeCareerAgentCommand(
			'Soll ich die Bewerbung beginnen?', lead.lead_id, 'command_1234567890abcdef', 'owner:local-agent:test',
			new Date('2026-09-14T09:05:00Z')
		);
		expect(result).toEqual({ handled: false, executed: false });
		expect(career.listCareerLeads(new Date('2026-09-14T09:05:00Z'))[0]).toMatchObject({ status: 'unacknowledged', revision: 1 });
	});
});
