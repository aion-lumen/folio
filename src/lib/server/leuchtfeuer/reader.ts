// Leuchtfeuer — reads ~/.folio/metrics/ (daily site + github aggregates) for the Heute-hub card.
// Read-only, aggregate-only. No client-side tracking: the source is Caddy server logs (see
// docs/leuchtfeuer-metrics-schema.md). Degradation is first-class — missing files are not an error.
//
// 08c migration note: Leuchtfeuer is built as a NORMAL card, not via the module-registry API. Once
// 08c lands the registration API, this reader becomes its SECOND consumer (a test, not a blocker) —
// move metrics access behind the registered-module boundary then. Do not add that dependency now.
import { readdirSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
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

function metricsDir(): string {
	return join(homedir(), '.folio', 'metrics');
}

/** Read + parse the last WINDOW daily json files in a metrics subdir, ascending by date. */
function readDaily<T>(subdir: string): T[] {
	let files: string[];
	try {
		files = readdirSync(join(metricsDir(), subdir));
	} catch {
		return []; // dir missing → degradation, not an error
	}
	const dated = files.filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
	const recent = dated.slice(-WINDOW);
	const out: T[] = [];
	for (const f of recent) {
		try {
			out.push(JSON.parse(readFileSync(join(metricsDir(), subdir, f), 'utf-8')) as T);
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

export function readLeuchtfeuer(now: Date = new Date()): LeuchtfeuerData {
	const sites: SiteSeries[] = [];
	let latest: string | null = null;

	for (const site of SITES) {
		const days = readDaily<DailySiteMetric>(site);
		if (days.length === 0) continue;
		const dates = days.map((d) => d.date);
		const visits = days.map((d) => d.visits ?? 0);
		const last7 = days.slice(-7);
		const door7 = last7.reduce(
			(acc, d) => ({
				story: acc.story + (d.door?.story ?? 0),
				folio: acc.folio + (d.door?.folio ?? 0)
			}),
			{ story: 0, folio: 0 }
		);
		const newest = days[days.length - 1];
		sites.push({
			site,
			dates,
			visits,
			door7,
			topPaths: newest.top_paths ?? [],
			topReferrers: newest.top_referrers ?? []
		});
		if (!latest || newest.date > latest) latest = newest.date;
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
		github
	};
}
