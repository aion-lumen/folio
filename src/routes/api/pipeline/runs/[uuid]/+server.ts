// 2026-06-07 UI-Pipeline-Ansicht: Detail eines Pipeline-Runs.
// Wird beim Aufklappen eines Verlauf-Eintrags gerufen (lazy-load).
// Liefert PipelineRunRow (inkl. summary) + logs (mail-side oder council-
// side, abhaengig von source).

import { error, json } from '@sveltejs/kit';
import { getPipelineRunDetail } from '$lib/server/folio-db/reader.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ params }) => {
	const uuid = params.uuid;
	if (!uuid) throw error(400, 'uuid fehlt');

	const detail = getPipelineRunDetail(uuid);
	if (!detail.row) throw error(404, `Pipeline-Run ${uuid} nicht gefunden`);

	return json(detail);
};
