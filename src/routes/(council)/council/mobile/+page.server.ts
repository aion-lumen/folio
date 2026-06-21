// Mobile 1a (2026-05-30): Verlauf-Tab loader. Cross-DB event-stream since
// the user's last detail-view, fallback to 48h ago.
// Mobile-Aufraeumen (2026-05-31): events now include Self actions; loader
// resolves user_ids to display names for renderer-side attribution.

import { getRecentEvents, getCouncilObjectById } from '$lib/server/council-db/reader.js';
import {
	getLatestViewedAtForUser,
	getUsersById
} from '$lib/server/folio-db/reader.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user.id;
	const lastView = getLatestViewedAtForUser(userId);
	const fallback = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
	const since = lastView ?? fallback;

	const events = getRecentEvents(since);

	// Resolve object stammdaten for cards inside the feed (one batch lookup).
	const objectIds = Array.from(
		new Set(events.flatMap((e) => ('object_id' in e ? [e.object_id] : [])))
	);
	const objectMap = new Map<string, ReturnType<typeof getCouncilObjectById>>();
	for (const id of objectIds) {
		objectMap.set(id, getCouncilObjectById(id));
	}

	// Resolve user_ids for Self-vs-Partner attribution.
	const userIds = events.flatMap((e) => ('user_id' in e ? [e.user_id] : []));
	const users = getUsersById(userIds);

	return {
		since,
		events,
		objects: Object.fromEntries(objectMap),
		users: Object.fromEntries(users),
		currentUserId: userId
	};
};
