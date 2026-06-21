// Mobile 1d (2026-05-30): POST /api/council/[id]/status
// Append-only status-tag override für ein Council-Objekt.
// effectiveStatusTag-Merge im Reader picks den jüngeren Schreiber.

import { error, json } from '@sveltejs/kit';
import { insertStatusOverride } from '$lib/server/folio-db/writer.js';
import type { CouncilStatusTagAll } from '$lib/server/folio-db/types.js';
import type { RequestHandler } from './$types.js';

const ALLOWED: CouncilStatusTagAll[] = [
	'neu',
	'kaufen',
	'beobachten',
	'verworfen',
	'archiv',
	'abgelaufen'
];

// 2026-06-05: Verwerfen-Sub-Optionen. reason ist nur bei status_tag='verworfen'
// erlaubt, sonst 400. Werteset bewusst eng — Erweiterung via Code-Update,
// nicht via freitext (Auswertbarkeit).
const ALLOWED_VERWORFEN_REASONS = ['zu weit', 'zu klein'] as const;

interface PostBody {
	status_tag?: string;
	reason?: string;
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
	const tag = body.status_tag as CouncilStatusTagAll | undefined;
	if (!tag || !ALLOWED.includes(tag)) {
		throw error(400, `Ungültiger status_tag: ${tag}`);
	}
	let reason: string | null = null;
	if (body.reason != null) {
		if (tag !== 'verworfen') {
			throw error(400, `reason nur bei status_tag='verworfen' erlaubt`);
		}
		if (!(ALLOWED_VERWORFEN_REASONS as readonly string[]).includes(body.reason)) {
			throw error(400, `Ungültige reason: ${body.reason}`);
		}
		reason = body.reason;
	}
	const row = insertStatusOverride(objectId, locals.user.id, tag, reason);
	return json({
		ok: true,
		recorded_at: row.recorded_at,
		status_tag: row.status_tag,
		reason: row.reason
	});
};
