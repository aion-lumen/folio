import { error, json } from '@sveltejs/kit';
import { isDemoVaultActive } from '$lib/server/env.js';
import { getLatestCorrectionForFeedback } from '$lib/server/folio-db/reader.js';
import { getFeedbackRowById } from '$lib/server/feedback/reader.js';
import { lookupMailBody } from '$lib/server/hermes/mail-body.js';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import { MailRelayError, stageCareerMailRelay } from '$lib/server/relay/mail.js';
import { RelayStoreError } from '$lib/server/relay/store.js';
import { loadSessionTargets } from '$lib/server/relay/targets.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
	requireModuleCapability('relay', 'cases.read');
	requireModuleCapability('relay', 'cases.stage');
	const value = (await request.json().catch(() => null)) as { feedback_id?: unknown; target_id?: unknown } | null;
	if (!value || typeof value.feedback_id !== 'number' || !Number.isInteger(value.feedback_id)) {
		throw error(400, 'feedback_id muss eine Ganzzahl sein.');
	}
	if (value.target_id !== undefined && typeof value.target_id !== 'string') {
		throw error(400, 'target_id muss eine Zeichenfolge sein.');
	}
	const row = getFeedbackRowById(value.feedback_id);
	if (!row) throw error(404, 'Mail nicht gefunden.');
	const correctedDomain = getLatestCorrectionForFeedback(row.id)?.corrected_domain ?? row.domain;
	const extracted = lookupMailBody(row.task_id);
	const demoBody = isDemoVaultActive()
		? `[Synthetischer Demo-Auszug]\n\n${row.subject}\n\nBitte prüfen und einen passenden Antwortentwurf vorbereiten.`
		: null;
	const body = extracted.bodyText ?? row.body_excerpt ?? demoBody;
	const bodyTruncated = extracted.bodyText ? extracted.bodyTruncated : body != null;
	try {
		const result = stageCareerMailRelay({
			feedback_id: row.id,
			account_id: row.account_id,
			imap_uid: row.imap_uid,
			sender: row.sender,
			to_addr: row.to_addr,
			subject: row.subject,
			received_at: row.mail_date ?? row.created_at,
			domain: correctedDomain,
			body,
			body_truncated: bodyTruncated,
			target_id: value.target_id
		}, loadSessionTargets());
		return json({
			case_id: result.case.case_id,
			status: result.case.status,
			target_label: result.target.label,
			created: result.created,
			body_truncated: result.body_truncated
		}, { status: result.created ? 201 : 200 });
	} catch (cause) {
		if (cause instanceof MailRelayError || cause instanceof RelayStoreError) {
			throw error(409, cause.message);
		}
		throw cause;
	}
};
