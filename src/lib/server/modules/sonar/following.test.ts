import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	appendSonarFollowingReview,
	readSonarFollowingState,
	SonarFollowingError
} from './following.js';

function writeCache(root: string) {
	const cache = join(root, 'following-profile-cache-2026-08-08');
	mkdirSync(cache);
	writeFileSync(
		join(cache, 'manifest.json'),
		JSON.stringify({
			schema: 'aion-lumen/sonar-following-profile-cache/v1',
			retrieved_on: '2026-08-08',
			count: 2,
			privacy: {
				credentials_in_output: false,
				network_access_during_ui: false,
				public_metrics_stored: false
			}
		})
	);
	writeFileSync(
		join(cache, 'profiles.ndjson'),
		[
			{
				schema: 'aion-lumen/sonar-following-profile/v1',
				account_id: '10',
				username: 'local_ai',
				name: 'Local AI',
				description: 'Local models and agents',
				verified: true
			},
			{
				schema: 'aion-lumen/sonar-following-profile/v1',
				account_id: '20',
				username: 'public_policy',
				name: 'Public Policy',
				description: 'Swiss and European politics',
				verified: false
			}
		].map((entry) => JSON.stringify(entry)).join('\n') + '\n'
	);
}

describe('Sonar following review', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'folio-sonar-following-'));
		writeCache(root);
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('reads normalized profiles without opening X or metrics', () => {
		const state = readSonarFollowingState(root);
		expect(state.sourceHealthy).toBe(true);
		expect(state.ledgerHealthy).toBe(true);
		expect(state.skippedProfiles).toBe(0);
		expect(state.profiles).toEqual([
			expect.objectContaining({ accountId: '10', username: 'local_ai', category: null }),
			expect.objectContaining({ accountId: '20', username: 'public_policy', category: null })
		]);
	});

	it('degrades to an unavailable source instead of breaking the whole Sonar page', () => {
		writeFileSync(
			join(root, 'following-profile-cache-2026-08-08', 'manifest.json'),
			'{broken\n'
		);
		const state = readSonarFollowingState(root);
		expect(state.sourceHealthy).toBe(false);
		expect(state.profiles).toEqual([]);
	});

	it('appends decisions, keeps changed decisions auditable, and overlays the latest', () => {
		appendSonarFollowingReview('10', 'politics', root);
		appendSonarFollowingReview('10', 'ai', root);
		appendSonarFollowingReview('10', 'ai', root);
		const state = readSonarFollowingState(root);
		expect(state.profiles.find((profile) => profile.accountId === '10')?.category).toBe('ai');
		expect(readFileSync(join(root, 'following-reviews.ndjson'), 'utf8').trim().split('\n')).toHaveLength(2);
	});

	it('rejects decisions for profiles outside the cache', () => {
		expect(() => appendSonarFollowingReview('99', 'ai', root)).toThrow(SonarFollowingError);
	});

	it('keeps reading profiles but blocks writes when the review ledger is corrupt', () => {
		writeFileSync(join(root, 'following-reviews.ndjson'), '{broken\n');
		expect(readSonarFollowingState(root).ledgerHealthy).toBe(false);
		expect(() => appendSonarFollowingReview('10', 'ai', root)).toThrow();
	});
});
