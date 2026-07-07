import { json } from '@sveltejs/kit';
import { scanInboxForDisplay } from '$lib/server/inbox/scanner.js';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
	const result = await scanInboxForDisplay();
	return json(result);
};
