import { mkdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendSonarReview, readSonarState, SonarStoreError } from './store.js';

function note(id: string, overrides = ''): string {
	return `---
schema: "aion-lumen/sonar-vault-note/v1"
type: sonar-note
source: x
source_post_id: "${id}"
source_url: "https://x.com/i/web/status/${id}"
published_at: "2026-08-01T12:00:00Z"
imported_on: "2026-08-07"
domains: ["ai"]
signals: ["bookmark"]
derived_from_external: true
review_status: pending
auto_commit_eligible: false
${overrides}---

# A useful local AI signal

[Original post on X](https://x.com/i/web/status/${id})

## Why it was retained

It connects local models with explicit capability boundaries.

## Original post

> Tools need narrow, inspectable permissions.
`;
}

describe('Sonar vault store', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'folio-sonar-'));
		mkdirSync(join(root, 'inbox'), { mode: 0o700 });
	});

	afterEach(() => rmSync(root, { recursive: true, force: true }));

	it('reads guarded notes and never renders markdown as HTML', () => {
		writeFileSync(join(root, 'inbox', 'twitter-10.md'), note('10'), { mode: 0o600 });
		const state = readSonarState(root);
		expect(state.ledgerHealthy).toBe(true);
		expect(state.skippedNotes).toBe(0);
		expect(state.notes).toEqual([
			expect.objectContaining({
				postId: '10',
				title: 'A useful local AI signal',
				body: 'Tools need narrow, inspectable permissions.',
				status: 'pending'
			})
		]);
	});

	it('appends human decisions and overlays the latest audit record', () => {
		writeFileSync(join(root, 'inbox', 'twitter-20.md'), note('20'), { mode: 0o600 });
		appendSonarReview('20', 'deferred', root);
		appendSonarReview('20', 'accepted', root);
		appendSonarReview('20', 'accepted', root);
		const state = readSonarState(root);
		expect(state.notes[0].status).toBe('accepted');
		// Identical retries are idempotent; a changed decision remains auditable.
		expect(readFileSync(join(root, 'reviews.ndjson'), 'utf8').trim().split('\n')).toHaveLength(2);
		expect(statSync(join(root, 'reviews.ndjson')).mode & 0o777).toBe(0o600);
	});

	it('fails closed for a corrupt ledger and refuses further writes', () => {
		writeFileSync(join(root, 'inbox', 'twitter-30.md'), note('30'), { mode: 0o600 });
		writeFileSync(join(root, 'reviews.ndjson'), '{broken\n', { mode: 0o600 });
		expect(readSonarState(root).ledgerHealthy).toBe(false);
		expect(() => appendSonarReview('30', 'accepted', root)).toThrow(SonarStoreError);
	});

	it('skips schema mismatches and does not follow note symlinks', () => {
		writeFileSync(join(root, 'outside.md'), note('40'), { mode: 0o600 });
		symlinkSync(join(root, 'outside.md'), join(root, 'inbox', 'twitter-40.md'));
		writeFileSync(join(root, 'inbox', 'twitter-50.md'), note('51'), { mode: 0o600 });
		const state = readSonarState(root);
		expect(state.notes).toHaveLength(0);
		expect(state.skippedNotes).toBe(1);
	});
});
