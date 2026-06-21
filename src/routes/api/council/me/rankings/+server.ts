// Mobile 1d (2026-05-30): POST /api/council/me/rankings
// Batched user_rankings-write: alle bewegten Objekte in einer Transaktion,
// identisches recorded_at. rank=0 ist das Removal-Sentinel (Bauteil 0.5).

import { error, json } from '@sveltejs/kit';
import { insertUserRankingBatch } from '$lib/server/folio-db/writer.js';
import type { RequestHandler } from './$types.js';

interface PostBody {
	batch?: Array<{ object_id: string; rank: number }>;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	let body: PostBody;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'JSON-Body fehlt');
	}
	const batch = body.batch;
	if (!Array.isArray(batch) || batch.length === 0) {
		throw error(400, 'batch muss nicht-leeres array sein');
	}
	for (const item of batch) {
		if (typeof item.object_id !== 'string' || !item.object_id) {
			throw error(400, 'object_id fehlt oder ungültig');
		}
		if (!Number.isInteger(item.rank) || item.rank < 0 || item.rank > 10) {
			throw error(400, `rank muss integer 0..10 sein, war ${item.rank}`);
		}
	}
	insertUserRankingBatch(locals.user.id, batch);
	return json({ ok: true, applied: batch.length });
};
