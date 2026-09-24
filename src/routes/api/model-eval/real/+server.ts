import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { COUNCIL_LENS_CONFIG } from '$lib/council/lens-config.server.js';
import { getLensRunStatus } from '$lib/server/lens-runner/status.js';
import { isBusy as isMailPipelineBusy } from '$lib/server/worker-runner/manager.js';
import { readMemoryEvalRunStatus } from '$lib/server/memory/eval-runner.js';
import { readMailSelectionRunStatus } from '$lib/server/memory/selection-runner.js';
import { buildRealMailEvalSuite, RealMailEvalUnavailable } from '$lib/server/model-eval/real-suite.js';
import {
	getRealModelEvalRunnerConfig,
	ModelEvalBusyError,
	readLatestModelEvalResult,
	readModelEvalRunStatus,
	startModelEvalRun
} from '$lib/server/model-eval/runner.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (locals.user.role !== 'owner') throw error(403, 'Owner access required');
	let suite;
	try { suite = buildRealMailEvalSuite(); } catch (cause) {
		if (!(cause instanceof RealMailEvalUnavailable)) throw cause;
		return json({ error: cause.message, unavailable: true }, { status: 409 });
	}
	const config = getRealModelEvalRunnerConfig();
	const latest = readLatestModelEvalResult(config);
	return json({
		catalog: suite.catalog,
		cohort: suite.cohort.counts,
		status: readModelEvalRunStatus(config),
		latest: latest?.suite.id === suite.catalog.suite.id ? latest : null
	});
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (locals.user.role !== 'owner') throw error(403, 'Owner access required');
	const realConfig = getRealModelEvalRunnerConfig();
	if (
		isMailPipelineBusy() || getLensRunStatus(COUNCIL_LENS_CONFIG).running ||
		readMemoryEvalRunStatus().state === 'running' || readMailSelectionRunStatus().state === 'running' ||
		readModelEvalRunStatus().state === 'running' || readModelEvalRunStatus(realConfig).state === 'running'
	) {
		return json({ error: 'Eine Mail-, Council- oder Modellprüfung läuft bereits.' }, { status: 409 });
	}
	let body: unknown;
	try { body = await request.json(); } catch { throw error(400, 'Invalid JSON'); }
	const ids = (body as { candidate_ids?: unknown })?.candidate_ids;
	if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
		throw error(400, 'candidate_ids must be a string array');
	}
	try {
		const suite = buildRealMailEvalSuite();
		return json(startModelEvalRun(ids, suite.catalog, realConfig, {
			cases: suite.cohort.cases,
			baseline_run_ids: suite.baselineRunIds
		}), { status: 202 });
	} catch (cause) {
		if (cause instanceof ModelEvalBusyError) return json(cause.status, { status: 409 });
		return json({ error: cause instanceof Error ? cause.message : 'Alltagstest konnte nicht starten.' }, { status: 503 });
	}
};
