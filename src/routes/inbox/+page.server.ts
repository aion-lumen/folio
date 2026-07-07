import { getFolioAgentAuto } from '$lib/server/env.js';
import { checkTriagePreflight } from '$lib/server/agent/preflight.js';
import { getRecentInboxActivity } from '$lib/server/agent/recent.js';
import { scanInboxForDisplay } from '$lib/server/inbox/scanner.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
	const [scan, triagePreflight, lastActivity] = await Promise.all([
		scanInboxForDisplay(),
		checkTriagePreflight(),
		getRecentInboxActivity()
	]);
	return {
		scan,
		agentAuto: getFolioAgentAuto(),
		triagePreflight,
		lastActivity
	};
};
