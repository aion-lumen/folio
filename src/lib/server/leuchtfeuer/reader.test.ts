import { mkdirSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readLeuchtfeuer } from './reader.js';

describe('readLeuchtfeuer', () => {
	let home: string;
	let prevHome: string | undefined;
	let prevDisabled: string | undefined;

	function writeSite(site: string, date: string, obj: Record<string, unknown>) {
		const dir = join(home, '.folio', 'metrics', site);
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, `${date}.json`), JSON.stringify(obj), 'utf-8');
	}

	beforeEach(() => {
		home = join(tmpdir(), `folio-lf-${Date.now()}-${Math.random().toString(36).slice(2)}`);
		mkdirSync(home, { recursive: true });
		prevHome = process.env.HOME;
		prevDisabled = process.env.FOLIO_DISABLED_MODULES;
		process.env.HOME = home;
		delete process.env.FOLIO_DISABLED_MODULES;
	});

	afterEach(() => {
		if (prevHome === undefined) delete process.env.HOME;
		else process.env.HOME = prevHome;
		if (prevDisabled === undefined) delete process.env.FOLIO_DISABLED_MODULES;
		else process.env.FOLIO_DISABLED_MODULES = prevDisabled;
		rmSync(home, { recursive: true, force: true });
	});

	it('no metrics dir → graceful degradation (null/stale, empty)', () => {
		const d = readLeuchtfeuer(new Date('2026-07-10T12:00:00Z'));
		expect(d.generatedFrom).toBeNull();
		expect(d.stale).toBe(true);
			expect(d.sites).toEqual([]);
		expect(d.verifiedThrough).toBeNull();
		expect(d.github).toBeNull();
	});

	it('aggregates visits + door totals + reports latest date, fresh when recent', () => {
		writeSite('aion-lumen.ch', '2026-07-09', {
			site: 'aion-lumen.ch',
			date: '2026-07-09',
			visits: 10,
			eligibility_rule: 'get-200-deployed-route-v1',
			deployed_routes: 7,
			excluded: { total: 4, non_get: 1, non_200: 1, missing_route: 1, ua_bot: 1 },
			door: { story: 3, folio: 2 },
			top_paths: [{ path: '/', hits: 8 }],
			top_referrers: [{ referrer: 'github.com', hits: 4 }]
		});
		writeSite('aion-lumen.ch', '2026-07-10', {
			site: 'aion-lumen.ch',
			date: '2026-07-10',
			visits: 15,
			eligibility_rule: 'get-200-deployed-route-v1',
			deployed_routes: 8,
			excluded: { total: 8, non_get: 1, non_200: 2, missing_route: 3, ua_bot: 2 },
			door: { story: 5, folio: 1 },
			top_paths: [{ path: '/folio', hits: 9 }],
			top_referrers: [{ referrer: '', hits: 6 }]
		});

		const d = readLeuchtfeuer(new Date('2026-07-10T12:00:00Z'));
		expect(d.generatedFrom).toBe('2026-07-10');
		expect(d.stale).toBe(false); // latest == today
		expect(d.verifiedThrough).toBe('2026-07-10');
		expect(d.sites).toHaveLength(1);
		const s = d.sites[0];
		expect(s.visits).toEqual([10, 15]); // ascending by date
		expect(s.door7).toEqual({ story: 8, folio: 3 }); // summed over present days
		expect(s.topPaths[0].path).toBe('/folio'); // leading path across the verified window
		expect(s.excluded7).toEqual({ total: 12, nonGet: 2, non200: 3, missingRoute: 4, uaBot: 3 });
		expect(s.deployedRoutes).toBe(8);
	});

	it('sums path and referrer resonance over the latest verified days', () => {
		for (const [date, home, story] of [
			['2026-07-09', 4, 2],
			['2026-07-10', 3, 5]
		] as const) {
			writeSite('aion-lumen.ch', date, {
				site: 'aion-lumen.ch', date, visits: home + story,
				eligibility_rule: 'get-200-deployed-route-v1',
				top_paths: [{ path: '/', hits: home }, { path: '/story', hits: story }],
				top_referrers: [{ referrer: 'github.com', hits: story }]
			});
		}
		const site = readLeuchtfeuer(new Date('2026-07-10T12:00:00Z')).sites[0];
		expect(site.topPaths).toEqual([{ path: '/', hits: 7 }, { path: '/story', hits: 7 }]);
		expect(site.topReferrers).toEqual([{ referrer: 'github.com', hits: 7 }]);
	});

	it('keeps legacy aggregates visible as history but out of verified totals', () => {
		writeSite('aion-lumen.ch', '2026-07-09', {
			site: 'aion-lumen.ch', date: '2026-07-09', visits: 418, door: { story: 1, folio: 10 }
		});
		const d = readLeuchtfeuer(new Date('2026-07-10T12:00:00Z'));
		expect(d.sites[0].visits).toEqual([]);
		expect(d.sites[0].door7).toEqual({ story: 0, folio: 0 });
		expect(d.sites[0].legacyDays).toBe(1);
		expect(d.verifiedThrough).toBeNull();
	});

	it('stale when latest metric is older than yesterday', () => {
		writeSite('mirhamed.ch', '2026-07-01', { site: 'mirhamed.ch', date: '2026-07-01', visits: 3 });
		const d = readLeuchtfeuer(new Date('2026-07-10T12:00:00Z'));
		expect(d.generatedFrom).toBe('2026-07-01');
		expect(d.stale).toBe(true);
	});

	it('sums github stars/views across repos into series', () => {
		const dir = join(home, '.folio', 'metrics', 'github');
		mkdirSync(dir, { recursive: true });
		writeFileSync(
			join(dir, '2026-07-10.json'),
			JSON.stringify({
				date: '2026-07-10',
				repos: {
					folio: { stars: 12, views: 30, views_unique: 8, clones: 3, clones_unique: 2 },
					'multi-agent-lab': { stars: 4, views: 10, views_unique: 3, clones: 1, clones_unique: 1 }
				}
			}),
			'utf-8'
		);
		const d = readLeuchtfeuer(new Date('2026-07-10T12:00:00Z'));
		expect(d.github?.starsTotal).toEqual([16]);
		expect(d.github?.viewsTotal).toEqual([40]);
	});

	it('returns no metrics when the module kill switch is active', () => {
		writeSite('aion-lumen.ch', '2026-07-10', {
			site: 'aion-lumen.ch',
			date: '2026-07-10',
			visits: 15
		});
		process.env.FOLIO_DISABLED_MODULES = 'leuchtfeuer';
		const d = readLeuchtfeuer(new Date('2026-07-10T12:00:00Z'));
		expect(d.sites).toEqual([]);
		expect(d.github).toBeNull();
		expect(d.stale).toBe(true);
	});
});
