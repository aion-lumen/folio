import { error, json } from '@sveltejs/kit';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import {
	readSonarSearchRunStatus,
	SonarSearchBusyError,
	startSonarSearchRun
} from '$lib/server/modules/sonar/search-runner.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (locals.user?.role !== 'owner') throw error(403, 'Owner access required');
	requireModuleCapability('sonar', 'search.read');
	return json(readSonarSearchRunStatus());
};

export const POST: RequestHandler = async ({ locals }) => {
	if (locals.user?.role !== 'owner') throw error(403, 'Owner access required');
	requireModuleCapability('sonar', 'search.execute');
	try {
		return json(startSonarSearchRun(), { status: 202 });
	} catch (cause) {
		if (cause instanceof SonarSearchBusyError) return json(cause.status, { status: 409 });
		return json({ error: 'Sonar-Suchlauf konnte nicht gestartet werden.' }, { status: 503 });
	}
};
