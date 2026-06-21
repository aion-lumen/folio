import { json, error } from '@sveltejs/kit';
import { getLeuchtfeuer, toggleLeuchtfeuer } from '$lib/server/vault/leuchtfeuer.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
	return json(await getLeuchtfeuer());
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { objective_id } = body as { objective_id?: string };
	if (!objective_id) throw error(400, 'objective_id required');
	return json(await toggleLeuchtfeuer(objective_id));
};
