import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { COUNCIL_LENS_CONFIG } from '$lib/council/lens-config.server.js';
import { getLensRunStatus } from '$lib/server/lens-runner/status.js';
import { isBusy as isMailPipelineBusy } from '$lib/server/worker-runner/manager.js';
import { loadModelEvalCatalog } from '$lib/server/model-eval/catalog.js';
import { readMemoryEvalRunStatus } from '$lib/server/memory/eval-runner.js';
import { readMailSelectionRunStatus } from '$lib/server/memory/selection-runner.js';
import {
	ModelEvalBusyError,
	getRealModelEvalRunnerConfig,
	readLatestModelEvalResult,
	readModelEvalRunStatus,
	startModelEvalRun
} from '$lib/server/model-eval/runner.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (locals.user.role !== 'owner') throw error(403, 'Owner access required');
	const catalog = loadModelEvalCatalog();
	const latest = readLatestModelEvalResult();
	return json({
		catalog,
		status: readModelEvalRunStatus(),
		latest: latest?.suite.id === catalog.suite.id ? latest : null
	});
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (locals.user.role !== 'owner') throw error(403, 'Owner access required');
	if (isMailPipelineBusy() || getLensRunStatus(COUNCIL_LENS_CONFIG).running ||
		readMemoryEvalRunStatus().state === 'running' || readMailSelectionRunStatus().state === 'running' ||
		readModelEvalRunStatus(getRealModelEvalRunnerConfig()).state === 'running') {
		return json({ error: 'Mail- oder Council-Pipeline läuft. Modellvergleich später starten.' }, { status: 409 });
	}
	let body: unknown;
	try { body = await request.json(); } catch { throw error(400, 'Invalid JSON'); }
	const ids = (body as { candidate_ids?: unknown })?.candidate_ids;
	if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
		throw error(400, 'candidate_ids must be a string array');
	}
	try {
		return json(startModelEvalRun(ids, loadModelEvalCatalog()), { status: 202 });
	} catch (cause) {
		if (cause instanceof ModelEvalBusyError) return json(cause.status, { status: 409 });
		return json({ error: cause instanceof Error ? cause.message : 'Modellvergleich konnte nicht starten.' }, { status: 503 });
	}
};
