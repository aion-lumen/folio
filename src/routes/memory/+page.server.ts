import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = ({ locals }) => {
 if (locals.user?.role !== 'owner') throw error(403, 'Owner access required');
 throw redirect(307, '/memory/graph');
};
