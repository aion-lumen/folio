// Bauteil 0 (2026-05-30): POST /api/council/[id]/trigger
// Records a per-user "antriggern" click. When 2+ distinct users have
// triggered the same object, a hauskauf_workflow row is auto-created with
// status='offen'. The trigger UPSERT, consensus check, and workflow INSERT
// run inside one transaction (see writer.ts) so concurrent clicks from both
// users always observe each other.

import { error, json } from '@sveltejs/kit';
import { triggerObjectAndMaybeCreateWorkflow } from '$lib/server/folio-db/writer.js';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ params, locals }) => {
	requireModuleCapability('council', 'records.write');
	const objectId = params.id;
	if (!objectId) throw error(400, 'missing object id');
	const result = triggerObjectAndMaybeCreateWorkflow(objectId, locals.user.id);
	return json({ ok: true, ...result });
};
