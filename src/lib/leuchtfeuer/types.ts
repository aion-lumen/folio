// Client-safe Leuchtfeuer types (shared by the server reader and the Heute-hub card).
// Kept out of $lib/server so the card/detail route can import them without pulling server code.

export interface DailySiteMetric {
	site: string;
	date: string;
	visits: number;
	uniques_est: number;
	top_paths: Array<{ path: string; hits: number }>;
	door: { story: number; folio: number };
	top_referrers: Array<{ referrer: string; hits: number }>;
	bots_filtered: number;
}

export interface DailyGithubMetric {
	date: string;
	repos: Record<
		string,
		{ stars: number; views: number; views_unique: number; clones: number; clones_unique: number }
	>;
}

export interface SiteSeries {
	site: string;
	dates: string[]; // ascending
	visits: number[]; // aligned with dates
	door7: { story: number; folio: number }; // last-7-day totals
	topPaths: Array<{ path: string; hits: number }>; // latest day
	topReferrers: Array<{ referrer: string; hits: number }>; // latest day
}

export interface GithubSeries {
	dates: string[];
	starsTotal: number[];
	viewsTotal: number[];
	latest: DailyGithubMetric['repos'] | null;
}

export interface LeuchtfeuerData {
	generatedFrom: string | null; // latest metric date present anywhere, or null if no data at all
	stale: boolean; // true when generatedFrom is older than yesterday (or nothing present)
	sites: SiteSeries[];
	github: GithubSeries | null;
}
