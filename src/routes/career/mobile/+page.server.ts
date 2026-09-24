import { error } from '@sveltejs/kit';
import { listCareerLeads } from '$lib/server/career/store.js';
import { hasModuleCapability } from '$lib/server/modules/index.js';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.user.role !== 'owner') throw error(403, 'Owner access required');
	requireModuleCapability('career', 'panel.render');
	requireModuleCapability('career', 'leads.read');
	requireModuleCapability('career', 'alerts.read');
	return {
		leads: listCareerLeads(),
		initialLeadId: url.searchParams.get('lead'),
		canWrite: hasModuleCapability('career', 'events.write')
	};
};
