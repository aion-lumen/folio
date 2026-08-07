// 2026-06-05 (Korrektur 1, B3): On-demand cross-DB lookup für
// Mail-Detail-Panel. Liefert qm/preis/distance für die Mail (feedback_id)
// aus dem zugehörigen council.object (via from_feedback_ids).
//
// Wird nur gerufen wenn Mail-Detail-Panel öffnet — kein List-Loader-
// overhead. Performance: 1 cross-DB-Query pro Detail-Open.

import { error, json } from '@sveltejs/kit';
import {
	getCouncilObjectByFirstFeedbackId,
	getInseratMarkersForFeedback
} from '$lib/server/council-db/reader.js';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ params }) => {
	requireModuleCapability('council', 'records.read');
	const feedbackId = parseInt(params.id, 10);
	if (!Number.isFinite(feedbackId)) throw error(400, 'feedback_id must be int');
	const obj = getCouncilObjectByFirstFeedbackId(feedbackId);
	// 2026-06-06 Bauteil 2: Inserat-Marker aus council.mail_inserat_markers
	// auch dann liefern, wenn kein Object existiert (z.B. alle Inserate
	// out-of-corridor → kein Object aber mehrere Marker).
	const inseratMarkers = getInseratMarkersForFeedback(feedbackId);
	if (!obj) {
		return json({ found: false, inserat_markers: inseratMarkers });
	}
	return json({
		found: true,
		qm: obj.qm ?? null,
		price_value: obj.price_value ?? null,
		price_currency: obj.price_currency ?? null,
		council_object_id: obj.id,
		inserat_markers: inseratMarkers
	});
};
