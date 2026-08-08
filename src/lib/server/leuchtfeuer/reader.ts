// Leuchtfeuer — reads ~/.folio/metrics/ (daily site + github aggregates) for the Heute-hub card.
// Read-only, aggregate-only. No client-side tracking: the source is Caddy server logs (see
// docs/leuchtfeuer-metrics-schema.md). Degradation is first-class — missing files are not an error.
//
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { getModuleDatabasePath } from '../modules/index.js';
import type {
	DailyGithubMetric,
	DailySiteMetric,
	GithubSeries,
	LeuchtfeuerData,
	SiteSeries
} from '$lib/leuchtfeuer/types.js';

export type {
	DailyGithubMetric,
	DailySiteMetric,
	GithubSeries,
	LeuchtfeuerData,
	SiteSeries
} from '$lib/leuchtfeuer/types.js';

const SITES = ['aion-lumen.ch', 'frag-shifu.ch', 'noblecause.ai', 'mirhamed.ch'] as const;
const WINDOW = 30; // days of history kept for the 30-day sparkline (7-day is a slice of it)
const VERIFIED_RULE = 'get-200-deployed-route-v1';

function metricsDir(): string | null {
	return getModuleDatabasePath('leuchtfeuer', 'metrics', 'metrics.read');
}

/** Read + parse the last WINDOW daily json files in a metrics subdir, ascending by date. */
function readDaily<T>(subdir: string): T[] {
	const root = metricsDir();
	if (!root) return [];
	let files: string[];
	try {
		files = readdirSync(join(root, subdir));
	} catch {
		return []; // dir missing → degradation, not an error
	}
	const dated = files.filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
	const recent = dated.slice(-WINDOW);
	const out: T[] = [];
	for (const f of recent) {
		try {
			out.push(JSON.parse(readFileSync(join(root, subdir, f), 'utf-8')) as T);
		} catch {
			// skip a corrupt/partial file rather than failing the whole card
		}
	}
	return out;
}

function yesterdayISO(now: Date): string {
	const d = new Date(now.getTime() - 24 * 3600 * 1000);
	return d.toISOString().slice(0, 10);
}

function sumRanked<T extends string>(
	days: DailySiteMetric[],
	field: 'top_paths' | 'top_referrers',
	key: T
): Array<Record<T, string> & { hits: number }> {
	const totals = new Map<string, number>();
	for (const day of days) {
		for (const item of day[field] ?? []) {
			const value = field === 'top_paths' ? (item as { path: string }).path : (item as { referrer: string }).referrer;
			totals.set(value, (totals.get(value) ?? 0) + item.hits);
		}
	}
	return [...totals.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([value, hits]) => ({ [key]: value, hits }) as Record<T, string> & { hits: number });
}

export function readLeuchtfeuer(now: Date = new Date()): LeuchtfeuerData {
	const sites: SiteSeries[] = [];
	let latest: string | null = null;
	let verifiedThrough: string | null = null;

	for (const site of SITES) {
		const days = readDaily<DailySiteMetric>(site);
		if (days.length === 0) continue;
		const verifiedDays = days.filter((d) => d.eligibility_rule === VERIFIED_RULE);
		const dates = verifiedDays.map((d) => d.date);
		const visits = verifiedDays.map((d) => d.visits ?? 0);
		const last7 = verifiedDays.slice(-7);
		const door7 = last7.reduce(
			(acc, d) => ({
				story: acc.story + (d.door?.story ?? 0),
				folio: acc.folio + (d.door?.folio ?? 0)
			}),
			{ story: 0, folio: 0 }
		);
		const excluded7 = last7.reduce(
			(acc, d) => ({
				total: acc.total + (d.excluded?.total ?? 0),
				nonGet: acc.nonGet + (d.excluded?.non_get ?? 0),
				non200: acc.non200 + (d.excluded?.non_200 ?? 0),
				missingRoute: acc.missingRoute + (d.excluded?.missing_route ?? 0),
				uaBot: acc.uaBot + (d.excluded?.ua_bot ?? 0)
			}),
			{ total: 0, nonGet: 0, non200: 0, missingRoute: 0, uaBot: 0 }
		);
		const newest = days[days.length - 1];
		sites.push({
			site,
			dates,
			visits,
			door7,
			topPaths: sumRanked(last7, 'top_paths', 'path'),
			topReferrers: sumRanked(last7, 'top_referrers', 'referrer'),
			latestDate: newest.date,
			legacyDays: days.length - verifiedDays.length,
			deployedRoutes: verifiedDays.at(-1)?.deployed_routes ?? null,
			excluded7
		});
		if (!latest || newest.date > latest) latest = newest.date;
		const newestVerified = verifiedDays.at(-1);
		if (newestVerified && (!verifiedThrough || newestVerified.date > verifiedThrough)) {
			verifiedThrough = newestVerified.date;
		}
	}

	const ghDays = readDaily<DailyGithubMetric>('github');
	let github: GithubSeries | null = null;
	if (ghDays.length > 0) {
		const dates = ghDays.map((d) => d.date);
		const starsTotal = ghDays.map((d) =>
			Object.values(d.repos ?? {}).reduce((s, r) => s + (r.stars ?? 0), 0)
		);
		const viewsTotal = ghDays.map((d) =>
			Object.values(d.repos ?? {}).reduce((s, r) => s + (r.views ?? 0), 0)
		);
		const newest = ghDays[ghDays.length - 1];
		github = { dates, starsTotal, viewsTotal, latest: newest.repos ?? null };
		if (!latest || newest.date > latest) latest = newest.date;
	}

	return {
		generatedFrom: latest,
		stale: latest === null || latest < yesterdayISO(now),
		sites,
		verifiedThrough,
		github
	};
}
