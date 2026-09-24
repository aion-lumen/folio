import { error } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types.js';

export const load: LayoutServerLoad = ({ locals }) => {
	if (locals.user.role !== 'owner') throw error(403, 'Ledger Books ist nur für den Owner sichtbar.');
	return {};
};
