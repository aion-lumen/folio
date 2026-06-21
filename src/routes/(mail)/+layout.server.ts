// F.9 Block-3 — Mail-Layout-Group ohne Vault-Gate.
// 2026-05-25 Block 3 — home_plz für Distance-Anzeige im DetailPanel.
// Direktive 6 (2026-05-28) — Owner-Guard: Mail-Layer ist nur für role='owner'.

import { error } from '@sveltejs/kit';
import { getHomePlz } from '$lib/server/env.js';
import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (locals.user.role !== 'owner') {
		throw error(403, 'Mail-Layer ist nur für Owner zugänglich');
	}
	return {
		homePlz: getHomePlz()
	};
};
