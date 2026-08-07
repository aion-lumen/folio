// Direktive 6 (2026-05-28) — Council-Layout-Group.
// Guard: role IN ('owner', 'council_member'). Mitglieder ohne Rolle (sollte
// nicht existieren, da auto-upsert role='council_member' setzt) fliegen raus.

import { error } from '@sveltejs/kit';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async ({ locals }) => {
	requireModuleCapability('council', 'panel.render');
	const role = locals.user.role;
	if (role !== 'owner' && role !== 'council_member') {
		throw error(403, 'Council ist nur für Owner und Council-Members zugänglich');
	}
	return {
		user: {
			id: locals.user.id,
			display_name: locals.user.display_name,
			role: locals.user.role
		}
	};
};
