import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	parsePublisherConfig,
	withPublicationLock,
	SonarPublicationBusyError,
	readPublicationState,
	reconcileManualPublication,
	reconcileManualReply,
	runPlacementPublisher,
	type PlacementPublisherConfig
} from '../../../../../scripts/sonar-placement-publish.js';
import { appendSonarPlacementAction, readSonarPlacementState } from './placements.js';
import { readSonarPublicationState } from './publications.js';

const NOW = new Date('2026-08-14T12:00:00Z');
const roots: string[] = [];

function tempRoot(): string {
	const root = mkdtempSync(join(tmpdir(), 'folio-sonar-publisher-'));
	roots.push(root);
	return root;
}

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW); });

afterEach(() => {
	vi.useRealTimers();
	for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function config(root: string): PlacementPublisherConfig {
	const binary = join(root, 'xurl');
	writeFileSync(binary, '#!/bin/sh\n', { encoding: 'utf8', mode: 0o700 });
	return {
		schema: 'folio/sonar-placement-publisher-config/v1',
		candidate_root: join(root, 'placements'),
		review_root: join(root, 'reviews'),
		state_root: join(root, 'publisher'),
		xurl: { binary, app: 'aion-lumen-publisher', expected_username: 'aion_lumen' },
		limits: { max_text_characters: 280 }
	};
}

function candidateDocument(text = 'A concise reply from personal experience.') {
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
			text: 'A useful public discussion.',
			published_at: '2026-08-14T07:30:00Z'
		},
		relevance: {
			domains: ['ai'],
			reason: 'The discussion matches direct operating experience.',
			suggested_angle: 'Contribute one concrete lesson.'
		},
		draft: {
			revision: 1,
			text,
			generated_at: '2026-08-14T08:01:00Z',
			generated_by: 'local:test'
		},
		trust: { derived_from_external: true, auto_publish_eligible: false }
	};
}

function approve(root: string, text?: string): PlacementPublisherConfig {
	const value = config(root);
	const inbox = join(value.candidate_root, 'inbox');
	mkdirSync(inbox, { recursive: true });
	writeFileSync(join(inbox, 'placement-x-123456.json'), JSON.stringify(candidateDocument(text)), 'utf8');
	const candidate = readSonarPlacementState(value.candidate_root, NOW, value.review_root).candidates[0];
	appendSonarPlacementAction(
		candidate.id,
		candidate.candidateHash,
		candidate.draft.revision,
		'approve',
		undefined,
		value.candidate_root,
		value.review_root,
		NOW
	);
	return value;
}

describe('Sonar placement publisher', () => {
 it.each([false, true])('does not publish an expired approval (dry-run=%s)', dryRun => {
  const value = approve(tempRoot());
  expect(runPlacementPublisher(value, new Date('2026-08-16T08:00:00Z'), () => { throw Error('must not call X'); }, dryRun)).toEqual({ status: 'idle' });
  expect(readPublicationState(value.state_root).size).toBe(0);
 });
 it('rechecks expiry after identity lookup before claiming or sending', () => {
  const value = approve(tempRoot()); const calls: string[][] = [];
  expect(() => runPlacementPublisher(value, NOW, (_binary, args) => {
   calls.push(args); vi.setSystemTime(new Date('2026-08-16T08:00:00Z'));
   return JSON.stringify({ data: { username: 'aion_lumen' } });
  })).toThrow('Approved placement changed');
  expect(calls).toHaveLength(1); expect(calls[0]).toContain('whoami');
  expect(readPublicationState(value.state_root).size).toBe(0);
 });
 it('serializes withdrawal with the active publisher lock and releases it after errors', () => {
  const value = approve(tempRoot());
  expect(() => withPublicationLock(value.state_root, () => { throw Error('withdrawal failed'); })).toThrow('withdrawal failed');
  const result = runPlacementPublisher(value, NOW, (_binary, args) => {
   if (args.includes('whoami')) return JSON.stringify({ data: { username: 'aion_lumen' } });
   let touched = false;
   expect(() => withPublicationLock(value.state_root, () => { touched = true; })).toThrow(SonarPublicationBusyError);
   expect(touched).toBe(false);
   return JSON.stringify({ data: { id: '987654' } });
  });
  expect(result.status).toBe('published');
  expect(withPublicationLock(value.state_root, () => 'released')).toBe('released');
 });
	it('parses an exact credential-free publisher config', () => {
		const root = tempRoot();
		const value = config(root);
		const path = join(root, 'publisher.json');
		writeFileSync(path, JSON.stringify(value), 'utf8');
		expect(parsePublisherConfig(path)).toEqual(value);
		writeFileSync(path, JSON.stringify({ ...value, token: 'not-allowed' }), 'utf8');
		expect(() => parsePublisherConfig(path)).toThrow('Invalid Sonar publisher config');
	});

	it('keeps a missing publication ledger healthy and fails a malformed one closed', () => {
		const root = tempRoot();
		expect(readSonarPublicationState(join(root, 'missing'))).toEqual({ byCandidate: {}, healthy: true });
		const stateRoot = join(root, 'publisher');
		mkdirSync(stateRoot);
		writeFileSync(join(stateRoot, 'placement-publications.ndjson'), '{broken\n', 'utf8');
		expect(readSonarPublicationState(stateRoot)).toEqual({ byCandidate: {}, healthy: false });
	});

	it('dry-runs one approved revision without calling X or claiming it', () => {
		const root = tempRoot();
		const value = approve(root);
		const result = runPlacementPublisher(value, NOW, () => {
			throw new Error('dry-run must not call xurl');
		}, true);
		expect(result).toEqual({ status: 'ready', candidateId: 'x-123456' });
		expect(readPublicationState(value.state_root).size).toBe(0);
	});

	it('verifies the authenticated identity before recording a claim', () => {
		const root = tempRoot();
		const value = approve(root);
		expect(() => runPlacementPublisher(value, NOW, () => JSON.stringify({ data: { username: 'wrong_user' } })))
			.toThrow('X identity mismatch');
		expect(readPublicationState(value.state_root).size).toBe(0);
	});

	it('publishes exactly the approved text once and records the returned post URL', () => {
		const root = tempRoot();
		const value = approve(root, 'I have tested this boundary in Folio.');
		const calls: string[][] = [];
		const result = runPlacementPublisher(value, NOW, (_binary, args) => {
			calls.push(args);
			return args.includes('whoami')
				? JSON.stringify({ data: { username: 'aion_lumen' } })
				: JSON.stringify({ data: { id: '987654' } });
		});
		expect(result).toEqual({
			status: 'published',
			candidateId: 'x-123456',
			externalUrl: 'https://x.com/aion_lumen/status/987654'
		});
		expect(calls[1]).toEqual([
			'--app',
			'aion-lumen-publisher',
			'reply',
			'123456',
			'I have tested this boundary in Folio.'
		]);
		const publication = readPublicationState(value.state_root).get('x-123456');
		expect(publication).toMatchObject({ status: 'published', externalPostId: '987654' });
		expect(runPlacementPublisher(value, NOW, () => {
			throw new Error('published approval must not run twice');
		})).toEqual({ status: 'idle' });
	});

	it('marks a post-attempt unclear and refuses an automatic retry', () => {
		const root = tempRoot();
		const value = approve(root);
		let calls = 0;
		const first = runPlacementPublisher(value, NOW, (_binary, args) => {
			calls += 1;
			if (args.includes('whoami')) return JSON.stringify({ data: { username: 'aion_lumen' } });
			throw new Error('connection dropped');
		});
		expect(first).toEqual({ status: 'unclear', candidateId: 'x-123456' });
		expect(readPublicationState(value.state_root).get('x-123456')).toMatchObject({ status: 'unclear' });
		expect(runPlacementPublisher(value, NOW, () => {
			throw new Error('unclear attempt must not auto-retry');
		})).toEqual({ status: 'idle' });
		expect(calls).toBe(2);
	});

	it('falls back to a prefilled X intent for the known self-service reply restriction', () => {
		const root = tempRoot();
		const value = approve(root, 'One bounded lesson from Folio.');
		const result = runPlacementPublisher(value, NOW, (_binary, args) => {
			if (args.includes('whoami')) return JSON.stringify({ data: { username: 'aion_lumen' } });
			throw Object.assign(new Error('X rejected reply'), {
				stderr: JSON.stringify({
					status: 403,
					detail: 'You can only reply to or quote posts where you are mentioned or are the author.'
				})
			});
		});
		expect(result).toEqual({ status: 'manual_required', candidateId: 'x-123456' });
		const publication = readPublicationState(value.state_root).get('x-123456');
		expect(publication).toMatchObject({
			status: 'manual_required',
			manualReason: 'api_reply_requires_mention_or_author'
		});
		const intent = new URL(publication!.intentUrl!);
		expect(intent.origin + intent.pathname).toBe('https://x.com/intent/tweet');
		expect(intent.searchParams.get('in_reply_to')).toBe('123456');
		expect(intent.searchParams.get('text')).toBe('One bounded lesson from Folio.');
	});

	it('reconciles an independently verified unclear attempt to the manual reply path', () => {
		const root = tempRoot();
		const value = approve(root);
		runPlacementPublisher(value, NOW, (_binary, args) => {
			if (args.includes('whoami')) return JSON.stringify({ data: { username: 'aion_lumen' } });
			throw new Error('connection dropped');
		});
		expect(reconcileManualReply(value, 'x-123456', NOW)).toEqual({
			status: 'manual_required',
			candidateId: 'x-123456'
		});
		expect(readPublicationState(value.state_root).get('x-123456')).toMatchObject({
			status: 'manual_required'
		});
		expect(() => reconcileManualReply(value, 'x-123456', NOW)).toThrow('approved unclear publication');
	});

	it('records a manually finished reply only after X confirms the exact approved publication', () => {
		const root = tempRoot();
		const value = approve(root, 'One bounded lesson from Folio.');
		runPlacementPublisher(value, NOW, (_binary, args) => {
			if (args.includes('whoami')) return JSON.stringify({ data: { username: 'aion_lumen' } });
			throw Object.assign(new Error('X rejected reply'), {
				stderr: JSON.stringify({
					status: 403,
					detail: 'You can only reply to or quote posts where you are mentioned or are the author.'
				})
			});
		});
		const calls: string[][] = [];
		const result = reconcileManualPublication(value, 'x-123456', '987654', NOW, (_binary, args) => {
			calls.push(args);
			return args.includes('whoami')
				? JSON.stringify({ data: { id: '42', username: 'aion_lumen' } })
				: JSON.stringify({
					data: {
						id: '987654',
						author_id: '42',
						conversation_id: '123456',
						referenced_tweets: [{ id: '123456', type: 'replied_to' }],
						text: '@example One bounded lesson from Folio.'
					}
				});
		});
		expect(result).toEqual({
			status: 'published',
			candidateId: 'x-123456',
			externalUrl: 'https://x.com/aion_lumen/status/987654'
		});
		expect(calls[1]).toEqual(['--app', 'aion-lumen-publisher', 'read', '987654']);
		expect(readPublicationState(value.state_root).get('x-123456')).toMatchObject({
			status: 'published',
			externalPostId: '987654'
		});
		expect(() => reconcileManualPublication(value, 'x-123456', '987654', NOW, () => ''))
			.toThrow('approved manual publication');
	});

	it('rejects a manual receipt that is not the approved reply by the expected account', () => {
		const root = tempRoot();
		const value = approve(root);
		runPlacementPublisher(value, NOW, (_binary, args) => {
			if (args.includes('whoami')) return JSON.stringify({ data: { username: 'aion_lumen' } });
			throw Object.assign(new Error('X rejected reply'), {
				stderr: '{"status":403,"detail":"You can only reply to or quote posts where you are mentioned or are the author."}'
			});
		});
		expect(() => reconcileManualPublication(value, 'x-123456', '987654', NOW, (_binary, args) =>
			args.includes('whoami')
				? JSON.stringify({ data: { id: '42', username: 'aion_lumen' } })
				: JSON.stringify({
					data: {
						id: '987654',
						author_id: '99',
						conversation_id: '123456',
						referenced_tweets: [{ id: '123456', type: 'replied_to' }],
						text: '@example A concise reply from personal experience.'
					}
				})
		)).toThrow('does not match the approved placement');
		expect(readPublicationState(value.state_root).get('x-123456')).toMatchObject({ status: 'manual_required' });
	});

	it('does not publish a target-account mismatch or an oversized reply', () => {
		const root = tempRoot();
		const value = approve(root, 'x'.repeat(281));
		expect(() => runPlacementPublisher(value, NOW, () => ''))
			.toThrow('configured X character limit');
		expect(readFileSync(join(value.candidate_root, 'inbox', 'placement-x-123456.json'), 'utf8')).toContain('x'.repeat(281));
	});
});
