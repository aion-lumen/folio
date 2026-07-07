import { scanInbox } from '$lib/server/inbox/scanner.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
	const scan = await scanInbox();
	return { scan };
};
