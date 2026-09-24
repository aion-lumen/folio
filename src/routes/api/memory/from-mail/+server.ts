import { withMailModel, MailModelSessionError } from '$lib/server/mail-intake/model-session.js';
import { locked as intakeLocked } from '$lib/server/mail-intake/state.js';
import { memoryMailBody } from '$lib/server/mail-intake/source.js';
import { error, json } from '@sveltejs/kit';
import { resolveMailMemoryDomain } from '$lib/server/memory/mail-domain.js';
import { getFeedbackRowById } from '$lib/server/feedback/reader.js';
import { MailMemoryError, proposeMemoryFromMail } from '$lib/server/memory/mail-candidates.js';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (locals.user.role !== 'owner') throw error(403, 'Owner access required');
	if (intakeLocked()) throw error(409, 'Der automatische Maileingang nutzt gerade das lokale Modell. Bitte später erneut versuchen.');
	const value = (await request.json().catch(() => null)) as { feedback_id?: unknown } | null;
	if (!value || typeof value.feedback_id !== 'number' || !Number.isInteger(value.feedback_id)) {
		throw error(400, 'feedback_id muss eine Ganzzahl sein.');
	}
	const row = getFeedbackRowById(value.feedback_id);
	if (!row) throw error(404, 'Mail nicht gefunden.');
	const decision = resolveMailMemoryDomain(row);
	if (!decision.domain) return json({ error: 'Die Mail braucht eine vollständige, eindeutige Domänenprüfung.', domain_decision: decision }, { status: 409 });
	const body = memoryMailBody(row);
	if (!body) throw error(409, 'Für diese Mail liegt kein lokaler Inhaltsauszug vor.');
	try {
		const result = await withMailModel('primary_llm', () => proposeMemoryFromMail({
			feedback_id: row.id,
			account_id: row.account_id,
			imap_uid: row.imap_uid,
			sender: row.sender,
			subject: row.subject,
			body,
			mail_domain: decision.domain,
			received_at: row.mail_date
		}));
		return json({
			domain: result.domain,
			domain_decision: decision,
			created: result.created,
			count: result.facts.length,
			candidate_count: result.facts.filter((fact) => fact.status === 'candidate').length
		}, { status: result.created ? 201 : 200 });
	} catch (cause) {
		if(cause instanceof MailModelSessionError)throw error(503,cause.message);
		if (cause instanceof MailMemoryError) {
			throw error(cause.code === 'unavailable' ? 503 : 409, cause.message);
		}
		throw cause;
	}
};
