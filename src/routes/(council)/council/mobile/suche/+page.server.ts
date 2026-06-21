// Mobile 1e (2026-05-30): Suche-Tab loader. URL-basiert (?q=…&status=…)
// für bookmarkable + back/forward-Verhalten. Debounce passiert client-side.

import { searchCouncilObjects } from '$lib/server/council-db/reader.js';
import type { PageServerLoad } from './$types.js';

const STATUS_VALUES = ['alle', 'beobachten', 'kaufen', 'archiv'] as const;
type Status = (typeof STATUS_VALUES)[number];

export const load: PageServerLoad = async ({ url }) => {
	const q = url.searchParams.get('q') ?? '';
	const statusParam = url.searchParams.get('status') ?? 'alle';
	const status: Status = (STATUS_VALUES as readonly string[]).includes(statusParam)
		? (statusParam as Status)
		: 'alle';

	const hits = searchCouncilObjects(q, status);

	return { q, status, hits };
};
