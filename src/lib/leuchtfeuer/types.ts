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
	eligibility_rule?: string;
	deployed_routes?: number;
	requests_seen?: number;
	excluded?: {
		total: number;
		non_get: number;
		non_200: number;
		missing_route: number;
		ua_bot: number;
	};
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
	topPaths: Array<{ path: string; hits: number }>; // summed over the latest 7 verified days
	topReferrers: Array<{ referrer: string; hits: number }>; // summed over the latest 7 verified days
	latestDate: string;
	legacyDays: number; // present in the window but intentionally excluded from verified totals
	deployedRoutes: number | null;
	excluded7: { total: number; nonGet: number; non200: number; missingRoute: number; uaBot: number };
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
	verifiedThrough: string | null; // latest structurally hardened site metric
	github: GithubSeries | null;
}
