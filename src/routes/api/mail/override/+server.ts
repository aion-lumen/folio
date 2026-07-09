// 2026-06-06 Bauteil 2 (Mail-zu-Council-Uebergang): POST /api/mail/override.
//
// User-Promotion einer Mail in einen anderen actionability-Status. Append-only
// Insert in folio.db.mail_actionability_override (analog object_status_
// override). Reader merged latest-wins.
//
// Body: { feedback_id: number, overridden_actionability: 'actionable' |
//         'uebernommen' | 'archive-silent' }
//
// Council-Mail-Ingest-Worker liest diese Tabelle cross-DB read-only und holt
// Mails mit overridden_actionability='uebernommen' (parallel zu
// feedback.actionability='uebernommen' aus Auto-Promotion).
//
// Separat von /api/mail/correction, weil semantisch unterschiedlich:
//   - correction = „die Klassifikation war falsch" (Lern-Signal).
//   - override   = „bitte in Council ingestieren" (User-Aktion).

import { error, json } from '@sveltejs/kit';
import { insertMailActionabilityOverride } from '$lib/server/folio-db/writer.js';
import { isCouncilRegistered } from '$lib/server/env.js';
import type { MailActionabilityOverride } from '$lib/server/folio-db/types.js';
import type { RequestHandler } from './$types.js';

const ALLOWED: MailActionabilityOverride[] = ['actionable', 'uebernommen', 'archive-silent'];

interface PostBody {
	feedback_id: number;
	overridden_actionability: MailActionabilityOverride;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	const userId = locals.user?.id;
	if (!userId) throw error(401, 'Nicht eingeloggt');

	let body: PostBody;
	try {
		body = (await request.json()) as PostBody;
	} catch {
		throw error(400, 'invalid JSON');
	}

	if (!Number.isFinite(body.feedback_id) || body.feedback_id <= 0) {
		throw error(400, 'feedback_id muss positive number sein');
	}
	if (!ALLOWED.includes(body.overridden_actionability)) {
		throw error(400, `overridden_actionability muss einer von [${ALLOWED.join(', ')}] sein`);
	}
	// 'uebernommen' = "please ingest into Council". If the active vault does not register
	// Council (demo), the target does not exist — remove the capability at the data-access
	// layer, not just in the UI. Guard the action against its own precondition.
	if (body.overridden_actionability === 'uebernommen' && !isCouncilRegistered()) {
		throw error(409, 'Council ist in diesem Vault nicht registriert — „Übernommen" nicht verfügbar.');
	}

	const row = insertMailActionabilityOverride(
		body.feedback_id,
		userId,
		body.overridden_actionability
	);

	return json({ ok: true, override: row }, { status: 201 });
};
