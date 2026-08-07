// Desktop-Detail (2026-05-31 §A.1): on-demand Lens-Begruendungen pro Object.
// Liefert LensReason[] aus council.db. Desktop-Detail-Panel ruft das beim
// Oeffnen, spart den Loader-Roundtrip fuer die ganze Liste.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getLensReasonsForObject } from '$lib/server/council-db/reader.js';
import { requireModuleCapability } from '$lib/server/modules/http.js';

export const GET: RequestHandler = async ({ params }) => {
	requireModuleCapability('council', 'records.read');
	const id = params.id;
	if (!id) {
		return json({ error: 'missing id' }, { status: 400 });
	}
	const reasons = getLensReasonsForObject(id);
	return json({ reasons });
};
