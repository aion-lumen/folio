// F.7 — GET /api/worker/run/[runId] status + DELETE cancel.

import { error, json } from '@sveltejs/kit';
import { getActiveRun, cancelActiveRun } from '$lib/server/worker-runner/manager.js';
import { getWorkerRunByUuid } from '$lib/server/folio-db/reader.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = ({ params }) => {
	const uuid = params.runId;
	if (!uuid) throw error(400, 'runId required');
	const row = getWorkerRunByUuid(uuid);
	if (!row) throw error(404, `no run with uuid ${uuid}`);
	const active = getActiveRun();
	return json({
		run: row,
		is_active: active?.uuid === uuid
	});
};

export const DELETE: RequestHandler = ({ params }) => {
	const uuid = params.runId;
	if (!uuid) throw error(400, 'runId required');
	const active = getActiveRun();
	if (!active || active.uuid !== uuid) {
		throw error(409, `run ${uuid} is not active`);
	}
	const ok = cancelActiveRun();
	return json({ cancelled: ok });
};
