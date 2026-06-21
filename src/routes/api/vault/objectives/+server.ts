import { json, error } from '@sveltejs/kit';
import { updateObjectiveStatus } from '$lib/server/vault/writer.js';
import type { ObjectiveStatus } from '$lib/types/campaign.js';
import type { RequestHandler } from './$types.js';

export const PATCH: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { slug, objectiveId, status } = body as {
		slug: string;
		objectiveId: string;
		status: ObjectiveStatus;
	};

	if (!slug || !objectiveId || !status) {
		throw error(400, 'slug, objectiveId, and status are required');
	}

	await updateObjectiveStatus(slug, objectiveId, status);
	return json({ ok: true });
}
