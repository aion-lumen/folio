import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { semanticMaintenanceStatus } from '$lib/server/memory/semantic-runtime.js';

export const GET: RequestHandler = ({ locals }) => {
 if (locals.user.role !== 'owner') throw error(403, 'Owner access required');
 return json(semanticMaintenanceStatus(), { headers: { 'cache-control': 'no-store' } });
};
