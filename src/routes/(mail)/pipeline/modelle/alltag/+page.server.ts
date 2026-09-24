import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { buildRealMailEvalSuite, RealMailEvalUnavailable } from '$lib/server/model-eval/real-suite.js';
import { loadModelEvalCatalog } from '$lib/server/model-eval/catalog.js';
import {
	getRealModelEvalRunnerConfig,
	readLatestModelEvalResult,
	readModelEvalRunStatus
} from '$lib/server/model-eval/runner.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user.role !== 'owner') throw error(403, 'Owner access required');
	let suite;
	try { suite = buildRealMailEvalSuite(); } catch (cause) {
		if (!(cause instanceof RealMailEvalUnavailable)) throw cause;
		const base = loadModelEvalCatalog();
		return {
			unavailable: cause.message,
			catalog: { ...base, suite: { id: 'mail-triage-real-gold-v1', label: 'Alltagstest', cases: 0 } },
			cohort: { secondary_labeled: 0, action_labeled: 0, deadline_labeled: 0 },
			status: { state: 'idle' } as const, latest: null
		};
	}
	const config = getRealModelEvalRunnerConfig();
	const latest = readLatestModelEvalResult(config);
	return {
		unavailable: null,
		catalog: suite.catalog,
		cohort: suite.cohort.counts,
		status: readModelEvalRunStatus(config),
		latest: latest?.suite.id === suite.catalog.suite.id ? latest : null
	};
};
