// Desktop-Detail (2026-05-31 §B): lens-run trigger + status endpoints.
// Spawnt scripts/council_lens_run.py via lens-runner-framework. Lockfile-
// schutz im worker selbst (fcntl.flock); 409 wenn busy.

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { COUNCIL_LENS_CONFIG } from '$lib/council/lens-config.server.js';
import { spawnLensRun } from '$lib/server/lens-runner/spawn.js';
import { getLensRunStatus } from '$lib/server/lens-runner/status.js';
import { LensBusyError } from '$lib/server/lens-runner/types.js';
import { requireModuleCapability } from '$lib/server/modules/http.js';

export const GET: RequestHandler = async () => {
	requireModuleCapability('council', 'worker.run');
	const status = getLensRunStatus(COUNCIL_LENS_CONFIG);
	return json(status);
};

export const POST: RequestHandler = async () => {
	requireModuleCapability('council', 'worker.run');
	try {
		const result = spawnLensRun(COUNCIL_LENS_CONFIG);
		return json({ running: true, ...result });
	} catch (e) {
		if (e instanceof LensBusyError) {
			return json(e.status, { status: 409 });
		}
		const msg = (e as Error).message;
		return json({ error: msg }, { status: 500 });
	}
};
