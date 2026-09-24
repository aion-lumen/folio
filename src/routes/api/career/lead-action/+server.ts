import { error, json } from '@sveltejs/kit';
import { appendCareerLeadAction, CareerStoreError, listCareerLeads } from '$lib/server/career/store.js';
import type { CareerLeadAction } from '$lib/server/career/types.js';
import type { CareerLeadActionInput } from '$lib/server/career/store.js';
import { requireModuleCapability } from '$lib/server/modules/http.js';
import type { RequestHandler } from './$types.js';

const BASE_KEYS = [
	'action', 'lead_id', 'case_id', 'assessment_id', 'expected_revision',
	'availability_event_id', 'source_snapshot_hash', 'idempotency_key'
] as const;

function exactKeys(value: object, expected: readonly string[]): boolean {
	const actual = Object.keys(value).sort();
	const wanted = [...expected].sort();
	return actual.length === wanted.length && actual.every((key, index) => key === wanted[index]);
}

function hasAllowedKeys(value: object, action: CareerLeadAction): boolean {
	const alternatives: string[][] = action === 'snooze'
		? [[...BASE_KEYS, 'snooze_until'], [...BASE_KEYS, 'snooze_until', 'reason_code']]
		: action === 'confirm_submitted'
			? [[...BASE_KEYS, 'submitted_at', 'application_channel'], [...BASE_KEYS, 'submitted_at', 'application_channel', 'artifact_refs']]
			: action === 'decline'
				? [[...BASE_KEYS, 'reason_code'], [...BASE_KEYS, 'reason_code', 'note']]
				: [[...BASE_KEYS]];
	return alternatives.some((expected) => exactKeys(value, expected));
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (locals.user.role !== 'owner') throw error(403, 'Owner access required');
	requireModuleCapability('career', 'leads.read');
	requireModuleCapability('career', 'events.write');
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		throw error(400, 'Ungültige Karriereentscheidung');
	}
	if (!body || typeof body !== 'object') throw error(400, 'Ungültige Karriereentscheidung');
	const value = body as Record<string, unknown>;
	const action = value.action;
	if (!['acknowledge', 'snooze', 'start_application', 'confirm_submitted', 'decline'].includes(String(action))) {
		throw error(400, 'Ungültige Karriereentscheidung');
	}
	if (!hasAllowedKeys(value, action as CareerLeadAction)) throw error(400, 'Ungültige Karriereentscheidung');
	if (
		typeof value.lead_id !== 'string' || typeof value.case_id !== 'string' ||
		typeof value.assessment_id !== 'string' || !Number.isSafeInteger(value.expected_revision) ||
		typeof value.availability_event_id !== 'string' || typeof value.source_snapshot_hash !== 'string' ||
		typeof value.idempotency_key !== 'string'
	) throw error(400, 'Ungültige Karriereentscheidung');
	if (action === 'snooze' && (
		typeof value.snooze_until !== 'string' ||
		(value.reason_code !== undefined && !['later_today', 'tomorrow'].includes(String(value.reason_code)))
	)) {
		throw error(400, 'Ungültige Karriereentscheidung');
	}
	if (action === 'confirm_submitted' && (
		typeof value.submitted_at !== 'string' || typeof value.application_channel !== 'string' ||
		(value.artifact_refs !== undefined && (!Array.isArray(value.artifact_refs) || !value.artifact_refs.every((item) => typeof item === 'string')))
	)) throw error(400, 'Ungültige Karriereentscheidung');
	if (action === 'decline' && (
		!['not_interested', 'conditions', 'timing', 'duplicate', 'other'].includes(String(value.reason_code)) ||
		(value.note !== undefined && value.note !== null && typeof value.note !== 'string')
	)) throw error(400, 'Ungültige Karriereentscheidung');
	try {
		const event = appendCareerLeadAction(value as unknown as CareerLeadActionInput, `owner:${locals.user.id}`);
		const lead = listCareerLeads().find((item) => item.lead_id === event.lead_id);
		return json({ ok: true, event, lead });
	} catch (cause) {
		if (cause instanceof CareerStoreError) throw error(409, 'Der Lead hat sich verändert oder ist nicht mehr aktuell');
		throw cause;
	}
};
