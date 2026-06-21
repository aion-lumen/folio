// Mobile 1d (2026-05-30): Meine-10-Tab loader. user_rankings (folio.db) +
// council-objects (cross-DB) + voices/borda für Display.
// Mobile-Aufraeumen (2026-05-31): zusätzlich bordaItems für den
// Council-Borda-Toggle innerhalb des Tabs.

import {
	readCouncilTop,
	getCouncilObjectById
} from '$lib/server/council-db/reader.js';
import { getUserTopRanksFor } from '$lib/server/folio-db/reader.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user.id;
	const ranksMap = getUserTopRanksFor(userId);

	// voices + borda-rank via readCouncilTop('all')
	const top = readCouncilTop('all');
	const topByObject = new Map(top.map((t) => [t.object.id, t]));

	const items = Array.from(ranksMap.entries())
		.map(([oid, rank]) => {
			const obj = getCouncilObjectById(oid);
			if (!obj) return null;
			const t = topByObject.get(oid);
			return {
				object: obj,
				rank,
				voices: t?.voices ?? [],
				state: t?.consensus_state ?? null,
				borda_rank: t?.borda_rank ?? null
			};
		})
		.filter((x): x is NonNullable<typeof x> => x !== null)
		.sort((a, b) => a.rank - b.rank);

	// Council-Borda — top is already sorted by borda_rank ASC by the reader.
	const bordaItems = top
		.filter((t) => t.borda_rank > 0 && t.borda_rank <= 10)
		.map((t) => ({
			object: t.object,
			borda_rank: t.borda_rank,
			borda_score: t.borda_score,
			voices: t.voices,
			state: t.consensus_state
		}));

	return { items, bordaItems };
};
