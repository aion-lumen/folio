import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('human mail-domain reviews', () => {
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
		init.getFolioDb();
		return import('./domain-reviews.js');
	}

	it('keeps one operational primary and at most two additive secondary domains', async () => {
		const reviews = await setup();
		const saved = reviews.recordMailDomainReview({
			run_id: 'run-a', feedback_id: 42, verdict: 'included', primary_domain: 'shopping',
			secondary_domains: ['finance', 'kontakt'], review_traits: ['boundary', 'cross_domain', 'detail_rich'],
			action_required: true, deadline_present: false,
			note: 'Bestellung mit Zahlungsbezug', reviewed_by_user_id: 1
		});
		expect(saved.secondary_domains).toEqual(['finance', 'kontakt']);
		expect(saved.review_traits).toEqual(['boundary', 'cross_domain', 'detail_rich']);
		expect(saved.action_required).toBe(true);
		expect(saved.deadline_present).toBe(false);
		expect(saved.label_schema).toBe('v2-multilabel');
		expect(reviews.mailDomainReviewMap('run-a')[42]).toEqual(expect.objectContaining({
			primary_domain: 'shopping', verdict: 'included'
		}));
		expect(() => reviews.recordMailDomainReview({
			run_id: 'run-a', feedback_id: 43, verdict: 'included', primary_domain: 'shopping',
			secondary_domains: ['shopping'], review_traits: ['cross_domain'], reviewed_by_user_id: 1
		})).toThrow('Sekundärdomänen');
	});

	it('preserves earlier reviews as operationally unrated instead of treating missing labels as false', async () => {
		const reviews = await setup();
		const saved = reviews.recordMailDomainReview({
			run_id: 'run-legacy', feedback_id: 7, verdict: 'included', primary_domain: 'finance',
			secondary_domains: [], review_traits: ['detail_rich'], reviewed_by_user_id: 1
		});
		expect(saved.action_required).toBeNull();
		expect(saved.deadline_present).toBeNull();
	});

	it('is append-only while the newest human decision wins', async () => {
		const reviews = await setup();
		reviews.recordMailDomainReview({
			run_id: 'run-b', feedback_id: 9, verdict: 'included', primary_domain: 'job',
			secondary_domains: [], review_traits: [], reviewed_by_user_id: 1
		});
		reviews.recordMailDomainReview({
			run_id: 'run-b', feedback_id: 9, verdict: 'excluded', primary_domain: 'job',
			secondary_domains: [], review_traits: [], reviewed_by_user_id: 1
		});
		expect(reviews.listLatestMailDomainReviews('run-b')).toEqual([
			expect.objectContaining({ feedback_id: 9, verdict: 'excluded' })
		]);
		const { getFolioDb } = await import('../folio-db/init.js');
		expect(() => getFolioDb().prepare('DELETE FROM memory_mail_domain_reviews').run())
			.toThrow('append-only');
	});

	it('requires cross-domain and secondary-domain labels to agree', async () => {
		const reviews = await setup();
		expect(() => reviews.recordMailDomainReview({
			run_id: 'run-c', feedback_id: 1, verdict: 'included', primary_domain: 'job',
			secondary_domains: [], review_traits: ['cross_domain'], reviewed_by_user_id: 1
		})).toThrow('mindestens eine Sekundärdomäne');
		expect(() => reviews.recordMailDomainReview({
			run_id: 'run-c', feedback_id: 2, verdict: 'included', primary_domain: 'job',
			secondary_domains: ['finance'], review_traits: [], reviewed_by_user_id: 1
		})).toThrow('domänenübergreifend');
	});

	it('merges a cumulative Gold lineage while the later human decision wins', async () => {
		const reviews = await setup();
		reviews.recordMailDomainReview({
			run_id: 'run-old', feedback_id: 1, verdict: 'included', primary_domain: 'job',
			secondary_domains: [], review_traits: [], reviewed_by_user_id: 1
		});
		reviews.recordMailDomainReview({
			run_id: 'run-old', feedback_id: 2, verdict: 'included', primary_domain: 'finance',
			secondary_domains: [], review_traits: [], reviewed_by_user_id: 1
		});
		reviews.recordMailDomainReview({
			run_id: 'run-new', feedback_id: 1, verdict: 'included', primary_domain: 'job',
			secondary_domains: ['kontakt'], review_traits: ['cross_domain'], reviewed_by_user_id: 1
		});

		const merged = reviews.mailDomainReviewMapForRuns(['run-old', 'run-new']);
		expect(Object.keys(merged)).toHaveLength(2);
		expect(merged[1].secondary_domains).toEqual(['kontakt']);
		expect(merged[2].primary_domain).toBe('finance');
	});
});
