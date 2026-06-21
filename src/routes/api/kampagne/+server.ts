// 2026-06-08 Bauteil 2.7c: POST /api/kampagne.
//
// Append-only insert in folio.db.hauskauf_workflow. Jeder Status-Uebergang
// (offen → in_arbeit → erledigt, oder blockiert/zurueck) ist eine neue
// Zeile mit frischem recorded_at. Reader (listAllHauskaufWorkflow) macht
// latest-wins via ROW_NUMBER() OVER (PARTITION BY council_object_id
// ORDER BY recorded_at).
//
// Body:
//   {
//     council_object_id: string,
//     status: 'offen' | 'in_arbeit' | 'blockiert' | 'erledigt',
//     termin?: ISO-date,            -- required wenn status='in_arbeit'
//     verhandlungspreis?: number,   -- required wenn status='erledigt'
//     notes?: string,                -- block-grund wenn status='blockiert'
//     verdict?: 'favorisiert' | 'verworfen'  -- nur bei status='erledigt' (D9)
//   }

import { error, json } from '@sveltejs/kit';
import { insertHauskaufWorkflow } from '$lib/server/folio-db/writer.js';
import type { HauskaufStatus, HauskaufVerdict } from '$lib/server/folio-db/types.js';
import type { RequestHandler } from './$types.js';

const ALLOWED_STATUS: HauskaufStatus[] = ['offen', 'in_arbeit', 'blockiert', 'erledigt'];
const ALLOWED_VERDICT: HauskaufVerdict[] = ['favorisiert', 'verworfen'];

interface PostBody {
	council_object_id: string;
	status: HauskaufStatus;
	termin?: string | null;
	verhandlungspreis?: number | null;
	notes?: string | null;
	verdict?: HauskaufVerdict | null;
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

	if (typeof body.council_object_id !== 'string' || body.council_object_id.length === 0) {
		throw error(400, 'council_object_id muss non-empty string sein');
	}
	if (!ALLOWED_STATUS.includes(body.status)) {
		throw error(400, `status muss einer von [${ALLOWED_STATUS.join(', ')}] sein`);
	}

	// CHECK-constraint enforcement (sonst gibt SQLite SQLITE_CONSTRAINT zurueck —
	// hier explizit fuer bessere Fehlermeldung). 2026-06-08 Bauteil 2.7c:
	// Status-Vokabular umbenannt (terminiert→in_arbeit, besichtigt→erledigt,
	// plus neuer blockiert).
	if (body.status === 'in_arbeit' && !body.termin) {
		throw error(400, 'status=in_arbeit braucht termin (ISO-date)');
	}
	if (body.status === 'erledigt' && body.verhandlungspreis == null) {
		throw error(400, 'status=erledigt braucht verhandlungspreis (number)');
	}

	// 2026-06-08 Bauteil 2.7c (D9): verdict-validierung.
	// Verdict nur bei status=erledigt erlaubt (semantisch: ✓ favorisiert /
	// ✗ verworfen nach Besichtigung). null/undefined ist immer OK
	// (toggle-zurueck oder kein Verdikt gesetzt).
	let verdict: HauskaufVerdict | null = null;
	if (body.verdict != null) {
		if (!ALLOWED_VERDICT.includes(body.verdict)) {
			throw error(400, `verdict muss einer von [${ALLOWED_VERDICT.join(', ')}] sein`);
		}
		if (body.status !== 'erledigt') {
			throw error(400, 'verdict nur bei status=erledigt erlaubt');
		}
		verdict = body.verdict;
	}

	const notes =
		typeof body.notes === 'string' && body.notes.trim().length > 0 ? body.notes.trim() : null;

	const row = insertHauskaufWorkflow({
		council_object_id: body.council_object_id,
		status: body.status,
		termin: body.termin ?? null,
		verhandlungspreis: body.verhandlungspreis ?? null,
		notes,
		verdict,
		created_by_user_id: userId
	});

	return json({ ok: true, workflow: row }, { status: 201 });
};
