import { error } from '@sveltejs/kit';
import { buildMemoryGraph } from '$lib/server/memory/graph.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = ({ locals }) => {
 // Page and layout loads can run concurrently: guard before reading any data.
 if (locals.user?.role !== 'owner') throw error(403, 'Owner access required');
 return { graph: buildMemoryGraph() };
};
