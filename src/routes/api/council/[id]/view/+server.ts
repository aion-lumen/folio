// Bauteil 0 (2026-05-30): POST /api/council/[id]/view
// Upserts the per-user last_viewed_at for a council object. Called when a
// user opens the detail view of an object on mobile or desktop.

import { error, json } from '@sveltejs/kit';
import { upsertObjectView } from '$lib/server/folio-db/writer.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ params, locals }) => {
	const objectId = params.id;
	if (!objectId) throw error(400, 'missing object id');
	const view = upsertObjectView(objectId, locals.user.id);
	return json({ ok: true, viewed_at: view.last_viewed_at });
};
