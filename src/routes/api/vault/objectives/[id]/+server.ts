import { json, error } from '@sveltejs/kit';
import { updateObjective } from '$lib/server/vault/writer.js';
import type { ObjectiveStatus } from '$lib/types/campaign.js';
import type { RequestHandler } from './$types.js';

const ALLOWED_FIELDS = ['status', 'progress_note', 'deadline'] as const;
const VALID_STATUSES = new Set<string>([
	'todo',
	'not_started',
	'in_progress',
	'blocked',
	'done',
	'archived'
]);

export const PATCH: RequestHandler = async ({ params, request }) => {
	const { id } = params;
	if (!id || !/^obj-\d+[a-z]?-\d+$/.test(id)) throw error(400, 'Invalid objective id');

	const body = await request.json();
	const patch: Record<string, string> = {};
	for (const field of ALLOWED_FIELDS) {
		if (field in body) patch[field] = body[field];
	}

	if (patch.status && !VALID_STATUSES.has(patch.status)) {
		throw error(400, `Invalid status: ${patch.status}`);
	}

	await updateObjective(id, patch as { status?: ObjectiveStatus; progress_note?: string; deadline?: string });
	return json({ ok: true });
};
