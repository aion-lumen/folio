import { json } from '@sveltejs/kit';
import { scanInbox } from '$lib/server/inbox/scanner.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
	const result = await scanInbox();
	return json(result);
};
