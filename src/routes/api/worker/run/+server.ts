// F.7 — POST /api/worker/run
// Starts a new production_worker subprocess. Singleton enforcement: HTTP 409 if busy.

import { error, json } from '@sveltejs/kit';
import { isBusy, getActiveRun, startRun } from '$lib/server/worker-runner/manager.js';
import type { RequestHandler } from './$types.js';

interface PostBody {
	account: 'yahoo' | 'gmail' | 'mirhamed';
	mode: 'learning' | 'silent';
	tranche_size: number;
}

const VALID_ACCOUNTS = new Set(['yahoo', 'gmail', 'mirhamed']);
const VALID_MODES = new Set(['learning', 'silent']);

export const POST: RequestHandler = async ({ request }) => {
	let body: PostBody;
	try {
		body = (await request.json()) as PostBody;
	} catch {
		throw error(400, 'invalid JSON body');
	}
	if (!VALID_ACCOUNTS.has(body.account)) {
		throw error(400, `account must be one of: ${[...VALID_ACCOUNTS].join(', ')}`);
	}
	if (!VALID_MODES.has(body.mode)) {
		throw error(400, `mode must be one of: ${[...VALID_MODES].join(', ')}`);
	}
	// Cleanup 2026-05-27: board nicht mehr user-facing; manager generiert intern.
	const trancheSize = Number(body.tranche_size);
	if (!Number.isFinite(trancheSize) || trancheSize < 0 || trancheSize > 5000) {
		throw error(400, 'tranche_size must be 0..5000');
	}
	if (isBusy()) {
		return json(
			{ error: 'busy', current_run: getActiveRun() },
			{ status: 409 }
		);
	}
	try {
		const { uuid, board_slug } = startRun({
			account: body.account,
			mode: body.mode,
			trancheSize
		});
		return json({ run_uuid: uuid, board_slug }, { status: 201 });
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		throw error(500, `start failed: ${msg}`);
	}
};

export const GET: RequestHandler = () => {
	return json({ active: getActiveRun(), busy: isBusy() });
};
