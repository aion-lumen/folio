// F.7 — POST /api/validator/run
// Triggers validator_batch.py subprocess via runManager. Default scope=last-tranche.
// Cleanup 2026-05-27: scope `disagreements` raus (obsolet durch Drei-Lens-Architektur).

import { error, json } from '@sveltejs/kit';
import { isBusy, getActiveRun, startValidatorRun } from '$lib/server/worker-runner/manager.js';
import type { RequestHandler } from './$types.js';

interface PostBody {
	scope?: 'unreviewed' | 'all' | 'last-tranche';
}

const VALID_SCOPES = new Set(['unreviewed', 'all', 'last-tranche']);

export const POST: RequestHandler = async ({ request }) => {
	let body: PostBody = {};
	try {
		body = (await request.json().catch(() => ({}))) as PostBody;
	} catch {
		body = {};
	}
	const scope = body.scope ?? 'last-tranche';
	if (!VALID_SCOPES.has(scope)) {
		throw error(400, `scope must be one of: ${[...VALID_SCOPES].join(', ')}`);
	}
	if (isBusy()) {
		return json(
			{ error: 'busy', current_run: getActiveRun() },
			{ status: 409 }
		);
	}
	try {
		const { uuid } = startValidatorRun(scope, { triggeredBy: 'manual' });
		return json({ run_uuid: uuid, scope }, { status: 201 });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw error(500, `start failed: ${msg}`);
	}
};
