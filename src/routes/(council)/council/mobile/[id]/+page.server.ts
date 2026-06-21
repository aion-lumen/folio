// Mobile 1a (2026-05-30): Detail-Ansicht loader. Reads council object +
// folio-side derived state. Side-effect: upsertObjectView server-side so
// the user marks this object as seen for the Verlauf since-filter.
//
// Schreib-Aktionen (Status-Tag, Notiz, Top-10) sind 1a out-of-scope —
// kommen mit Sub-Bauteil 1d. Diese Page rendert Lese-State + view-write.

import { error } from '@sveltejs/kit';
import {
	getCouncilObjectById,
	getDistanceKmForCouncilObject,
	readCouncilTop
} from '$lib/server/council-db/reader.js';
import {
	getUserTopRanksFor,
	getLatestNoteFor,
	getHauskaufWorkflowForObject,
	getTriggerSetForObject
} from '$lib/server/folio-db/reader.js';
import { resolveEffectiveSubstance } from '$lib/server/council-db/cluster-substance.js';
import { upsertObjectView } from '$lib/server/folio-db/writer.js';
import { getFolioDb } from '$lib/server/folio-db/init.js';
import { getHomePlz } from '$lib/server/env.js';
import { loadRegelwerk } from '$lib/server/regelwerk/loader.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ params, locals }) => {
	const objectId = params.id;
	const object = getCouncilObjectById(objectId);
	if (!object) throw error(404, 'Objekt nicht gefunden');

	// Side-effect: mark seen for the current user.
	upsertObjectView(objectId, locals.user.id);

	// Council borda-rank if this object is in the latest top-10.
	const top = readCouncilTop('all');
	const inTop = top.find((t) => t.object.id === objectId) ?? null;

	// Per-user ranks (self + partner). Partner = the other user, if any.
	const myRanks = getUserTopRanksFor(locals.user.id);
	const myRank = myRanks.get(objectId) ?? null;

	const db = getFolioDb();
	const otherUserRows = db
		.prepare('SELECT id, display_name FROM users WHERE id != ?')
		.all(locals.user.id) as { id: number; display_name: string }[];
	let partnerRank: number | null = null;
	let partnerName: string | null = null;
	if (otherUserRows.length > 0) {
		// Single-partner heuristic: take the first non-self user. Two-user world.
		const partner = otherUserRows[0];
		partnerName = partner.display_name;
		const pRanks = getUserTopRanksFor(partner.id);
		partnerRank = pRanks.get(objectId) ?? null;
	}

	// Bauteil-14: Read-through Cluster-Substanz (Status, Note, Workflow).
	const substance = resolveEffectiveSubstance(objectId, locals.user.id, object);
	const effective = substance?.status.value ?? {
		status_tag: object.status_tag,
		source: 'council' as const,
		reason: null
	};

	const note = getLatestNoteFor(locals.user.id, objectId);
	const workflow = getHauskaufWorkflowForObject(objectId, locals.user.id);
	const noteProvenance = substance?.note.provenance ?? null;
	const workflowProvenance = substance?.workflow.provenance ?? null;
	const triggerSet = getTriggerSetForObject(objectId);

	// 2026-06-05 (B4): Drei-Status-Pillen-Daten — distance cross-DB,
	// Schwellen aus regelwerk.priority_relevance.hauskauf.
	const homePlz = getHomePlz();
	const homeCoords = homePlz ? { lat: homePlz.lat, lng: homePlz.lng } : null;
	const distanceKm = getDistanceKmForCouncilObject(objectId, homeCoords);
	const rw = loadRegelwerk();
	const hk = rw.priority_relevance?.hauskauf as
		| { max_distance_km?: number; preis_max?: number; qm_min?: number }
		| undefined;
	const schwellen = {
		distance_threshold_km: hk?.max_distance_km ?? 40,
		preis_max: hk?.preis_max ?? 500_000,
		qm_min: hk?.qm_min ?? 100
	};

	// Mobile 1d: pass the user's whole current top-10 map to the TopTenPicker
	// so it can compute the displacement batch client-side without an extra
	// roundtrip.
	const myTopRanksMap: Record<string, number> = {};
	for (const [oid, r] of myRanks) myTopRanksMap[oid] = r;

	return {
		object,
		voices: inTop?.voices ?? [],
		consensus_state: inTop?.consensus_state ?? null,
		borda_rank: inTop?.borda_rank ?? null,
		my_rank: myRank,
		my_top_ranks: myTopRanksMap,
		partner_rank: partnerRank,
		partner_name: partnerName,
		partner_user_id: otherUserRows[0]?.id ?? null,
		effective_status: effective,
		status_provenance: substance?.status.provenance ?? null,
		note_text: note?.note_text ?? null,
		note_provenance: noteProvenance,
		workflow,
		workflow_provenance: workflowProvenance,
		trigger_user_ids: Array.from(triggerSet),
		distance_km: distanceKm,
		schwellen
	};
};
