import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	appendSonarPlacementAction,
	readSonarPlacementState,
	SonarPlacementStoreError
} from './placements.js';

const NOW = new Date('2026-08-14T10:00:00Z');
const roots: string[] = [];

function tempRoot(): string {
	const root = mkdtempSync(join(tmpdir(), 'folio-sonar-placements-'));
	roots.push(root);
	return root;
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function document(overrides: Record<string, unknown> = {}) {
	return {
		schema: 'folio/sonar-placement-candidate/v1',
		id: 'x-123456',
		channel: 'x',
		target_account: 'aion_lumen',
		discovered_at: '2026-08-14T08:00:00Z',
		expires_at: '2026-08-16T08:00:00Z',
		source: {
			external_id: '123456',
			url: 'https://x.com/example/status/123456',
			author_handle: 'example',
			author_name: 'Example Author',
			text: 'A public discussion about local AI systems.',
			published_at: '2026-08-14T07:30:00Z'
		},
		relevance: {
			domains: ['ai'],
			reason: 'Direkter Bezug zu lokal betriebenen Agentensystemen.',
			suggested_angle: 'Mit einer konkreten Erfahrung aus Folio antworten.'
		},
		draft: {
			revision: 1,
			text: 'A concise, useful reply.',
			generated_at: '2026-08-14T08:01:00Z',
			generated_by: 'local:test'
		},
		trust: { derived_from_external: true, auto_publish_eligible: false },
		...overrides
	};
}

function writeCandidate(root: string, value = document(), name = 'placement-x-123456.json') {
	const inbox = join(root, 'inbox');
	mkdirSync(inbox, { recursive: true });
	writeFileSync(join(inbox, name), JSON.stringify(value), 'utf8');
}

describe('Sonar placement candidates', () => {
	it('reads a valid channel-neutral candidate without granting publish state', () => {
		const root = tempRoot();
		writeCandidate(root);
		const state = readSonarPlacementState(root, NOW);
		expect(state).toMatchObject({ healthy: true, ledgerHealthy: true, skippedCandidates: 0 });
		expect(state.candidates).toHaveLength(1);
		expect(state.candidates[0]).toMatchObject({
			id: 'x-123456',
			channel: 'x',
			status: 'open',
			targetAccount: 'aion_lumen'
		});
		expect(state.candidates[0]).not.toHaveProperty('trust');
	});

	it('marks stale opportunities expired instead of silently dropping them', () => {
		const root = tempRoot();
		writeCandidate(
			root,
			document({
				discovered_at: '2026-08-12T08:00:00Z',
				expires_at: '2026-08-13T08:00:00Z'
			})
		);
		expect(readSonarPlacementState(root, NOW).candidates[0]?.status).toBe('expired');
	});

	it('skips schema widening and an id that is not bound to the filename', () => {
		const root = tempRoot();
		writeCandidate(root, document({ unexpected: 'field' }));
		writeCandidate(root, document({ id: 'x-mismatch' }), 'placement-x-other.json');
		const state = readSonarPlacementState(root, NOW);
		expect(state.candidates).toEqual([]);
		expect(state.skippedCandidates).toBe(2);
	});

	it('fails the source closed when the inbox is a symlink', () => {
		const root = tempRoot();
		const outside = tempRoot();
		mkdirSync(outside, { recursive: true });
		symlinkSync(outside, join(root, 'inbox'));
		expect(readSonarPlacementState(root, NOW)).toEqual({
			candidates: [],
			skippedCandidates: 0,
			healthy: false,
			ledgerHealthy: false
		});
	});

	it('stores a human edit as a new revision bound to the candidate bytes', () => {
		const root = tempRoot();
		writeCandidate(root);
		const original = readSonarPlacementState(root, NOW).candidates[0];
		const record = appendSonarPlacementAction(
			original.id,
			original.candidateHash,
			original.draft.revision,
			'revise',
			'A more precise local reply.',
			root,
			root,
			NOW
		);
		expect(record).toMatchObject({ action: 'draft_revised', previous_revision: 1, revision: 2 });
		const reviewed = readSonarPlacementState(root, NOW, root);
		expect(reviewed.ledgerHealthy).toBe(true);
		expect(reviewed.candidates[0]).toMatchObject({
			status: 'open',
			draft: { revision: 2, text: 'A more precise local reply.', generatedBy: 'human:folio' }
		});
	});

	it('rejects a stale browser decision after the producer changes the candidate', () => {
		const root = tempRoot();
		writeCandidate(root);
		const original = readSonarPlacementState(root, NOW).candidates[0];
		writeCandidate(root, document({ target_account: 'another_account' }));
		expect(() =>
			appendSonarPlacementAction(
				original.id,
				original.candidateHash,
				1,
				'dismiss',
				undefined,
				root,
				root,
				NOW
			)
		).toThrow(SonarPlacementStoreError);
	});

	it('rejects a second tab that still targets the previous draft revision', () => {
		const root = tempRoot();
		writeCandidate(root);
		const original = readSonarPlacementState(root, NOW).candidates[0];
		appendSonarPlacementAction(
			original.id,
			original.candidateHash,
			1,
			'revise',
			'First tab wins.',
			root,
			root,
			NOW
		);
		expect(() =>
			appendSonarPlacementAction(
				original.id,
				original.candidateHash,
				1,
				'revise',
				'Stale second tab.',
				root,
				root,
				NOW
			)
		).toThrow(SonarPlacementStoreError);
	});

	it('keeps old revisions auditable but does not apply them to a replaced candidate', () => {
		const root = tempRoot();
		writeCandidate(root);
		const original = readSonarPlacementState(root, NOW).candidates[0];
		appendSonarPlacementAction(
			original.id,
			original.candidateHash,
			1,
			'revise',
			'Old candidate revision.',
			root,
			root,
			NOW
		);
		writeCandidate(root, document({ target_account: 'another_account' }));
		const replaced = readSonarPlacementState(root, NOW, root);
		expect(replaced.ledgerHealthy).toBe(true);
		expect(replaced.candidates[0]).toMatchObject({
			targetAccount: 'another_account',
			draft: { revision: 1, text: 'A concise, useful reply.' }
		});
	});

	it('records dismissal without deleting the candidate and blocks later edits', () => {
		const root = tempRoot();
		writeCandidate(root);
		const original = readSonarPlacementState(root, NOW).candidates[0];
		appendSonarPlacementAction(
			original.id,
			original.candidateHash,
			1,
			'dismiss',
			undefined,
			root,
			root,
			NOW
		);
		const dismissed = readSonarPlacementState(root, NOW, root).candidates[0];
		expect(dismissed).toMatchObject({ status: 'dismissed', draft: { revision: 1 } });
		expect(() =>
			appendSonarPlacementAction(
				dismissed.id,
				dismissed.candidateHash,
				1,
				'revise',
				'Too late.',
				root,
				root,
				NOW
			)
		).toThrow(SonarPlacementStoreError);
	});

	it('records a revision-bound publishing approval without granting a network action', () => {
		const root = tempRoot();
		writeCandidate(root);
		const original = readSonarPlacementState(root, NOW).candidates[0];
		appendSonarPlacementAction(
			original.id,
			original.candidateHash,
			1,
			'revise',
			'I have been testing this pattern locally.',
			root,
			root,
			NOW
		);
		const revised = readSonarPlacementState(root, NOW, root).candidates[0];
		const approval = appendSonarPlacementAction(
			revised.id,
			revised.candidateHash,
			revised.draft.revision,
			'approve',
			undefined,
			root,
			root,
			NOW
		);
		expect(approval).toMatchObject({ action: 'publish_approved', revision: 2 });
		expect(approval).toHaveProperty('draft_hash', expect.stringMatching(/^[a-f0-9]{64}$/));
		const approved = readSonarPlacementState(root, new Date('2026-08-18T10:00:00Z'), root).candidates[0];
		expect(approved).toMatchObject({ status: 'approved', draft: { revision: 2 } });
		expect(() =>
			appendSonarPlacementAction(
				approved.id,
				approved.candidateHash,
				2,
				'revise',
				'Too late.',
				root,
				root,
				NOW
			)
		).toThrow(SonarPlacementStoreError);
	});

	it('allows an unclaimed publishing approval to be revoked and revised again', () => {
		const root = tempRoot();
		writeCandidate(root);
		const original = readSonarPlacementState(root, NOW).candidates[0];
		appendSonarPlacementAction(original.id, original.candidateHash, 1, 'approve', undefined, root, root, NOW);
		const approved = readSonarPlacementState(root, NOW, root).candidates[0];
		const revoked = appendSonarPlacementAction(
			approved.id,
			approved.candidateHash,
			approved.draft.revision,
			'revoke',
			undefined,
			root,
			root,
			new Date('2026-08-14T12:05:00Z')
		);
		expect(revoked).toMatchObject({ action: 'publish_approval_revoked', revision: 1 });
		const reopened = readSonarPlacementState(root, NOW, root).candidates[0];
		expect(reopened.status).toBe('open');
		expect(() =>
			appendSonarPlacementAction(
				reopened.id,
				reopened.candidateHash,
				1,
				'revise',
				'A corrected reply.',
				root,
				root,
				new Date('2026-08-14T12:06:00Z')
			)
		).not.toThrow();
	});

	it('shows immutable candidates but locks decisions when the ledger is malformed', () => {
		const root = tempRoot();
		writeCandidate(root);
		writeFileSync(join(root, 'placement-reviews.ndjson'), '{broken\n', 'utf8');
		const state = readSonarPlacementState(root, NOW, root);
		expect(state).toMatchObject({ healthy: true, ledgerHealthy: false });
		expect(state.candidates).toHaveLength(1);
	});
});
