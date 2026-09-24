import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';
import { loadModelEvalCatalog } from '$lib/server/model-eval/catalog.js';
import { readLatestModelEvalResult, readModelEvalRunStatus } from '$lib/server/model-eval/runner.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user.role !== 'owner') throw error(403, 'Owner access required');
	const catalog = loadModelEvalCatalog();
	const latest = readLatestModelEvalResult();
	return {
		catalog,
		status: readModelEvalRunStatus(),
		latest: latest?.suite.id === catalog.suite.id ? latest : null
	};
};
