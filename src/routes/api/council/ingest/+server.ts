// Mobile 1c (2026-05-30): POST /api/council/ingest
// Validates the submitted URL (format + portal whitelist) and inserts a
// pending_ingest row in folio.db. The council-worker picks it up on its
// next 4h tick (separate council-repo direktive).

import { error, json } from '@sveltejs/kit';
import { isSupportedPortalUrl } from '$lib/server/council-db/portals.js';
import { insertPendingIngest } from '$lib/server/folio-db/writer.js';
import type { RequestHandler } from './$types.js';

interface PostBody {
	url?: string;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	let body: PostBody;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'JSON-Body fehlt');
	}
	const url = (body.url ?? '').trim();
	if (!url) throw error(400, 'URL fehlt');

	const check = isSupportedPortalUrl(url);
	if (!check.ok) throw error(400, check.reason ?? 'URL nicht akzeptiert');

	const row = insertPendingIngest(url, locals.user.id);
	return json({ ok: true, id: row.id, url: row.url, submitted_at: row.submitted_at });
};
