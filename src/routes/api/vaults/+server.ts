import { json } from '@sveltejs/kit';
import { listKnownVaults } from '$lib/server/vault/registry.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
	const data = await listKnownVaults();
	return json(data);
};
