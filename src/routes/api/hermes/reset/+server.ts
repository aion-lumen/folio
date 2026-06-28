import { json } from '@sveltejs/kit';
import { resetConversation } from '$lib/server/hermes/client.js';
import type { RequestHandler } from './$types.js';

// "New chat": drop the active vault's gateway conversation pointer so the next
// turn starts with empty history (not the old, possibly large/cross-context chain).
export const POST: RequestHandler = async () => {
	resetConversation();
	return json({ ok: true });
};
