// Mobile 1d (2026-05-30): POST /api/council/[id]/note
// Append-only persönliche Notiz pro (user, object). Leere Note ='' meint
// User-cleared — Reader gibt null zurück, Audit-Trail bleibt vollständig.

import { error, json } from '@sveltejs/kit';
import { insertObjectNote } from '$lib/server/folio-db/writer.js';
import type { RequestHandler } from './$types.js';

interface PostBody {
	note_text?: string;
}

export const POST: RequestHandler = async ({ params, request, locals }) => {
	const objectId = params.id;
	if (!objectId) throw error(400, 'missing object id');
	let body: PostBody;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'JSON-Body fehlt');
	}
	const text = body.note_text ?? '';
	if (typeof text !== 'string') throw error(400, 'note_text muss string sein');
	if (text.length > 10_000) throw error(400, 'note_text > 10000 zeichen');
	const row = insertObjectNote(locals.user.id, objectId, text);
	return json({ ok: true, recorded_at: row.recorded_at });
};
