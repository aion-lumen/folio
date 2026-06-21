// Council /council Listen-Ansicht (Bauteil 3, 2026-05-28).
// Desktop-Update 2026-05-31: voller Bestand statt nur Borda-Top-10, Filter + Sort,
// Detail-Panel-Daten (user-top-ranks, partner-top-ranks).

import {
	readAllCouncilObjects,
	readCouncilTop,
	countObjectsByEffectiveStatus,
	type CouncilListSort
} from '$lib/server/council-db/reader.js';
import {
	getUserTopRanksFor,
	getLatestNotesMapForUser,
	listOtherUsers
} from '$lib/server/folio-db/reader.js';
import type { CouncilStatusTag, CouncilTopObject } from '$lib/server/council-db/types.js';
import { getHomePlz } from '$lib/server/env.js';
import type { PageServerLoad } from './$types.js';

const VALID_STATUS = new Set(['alle', 'neu', 'kaufen', 'beobachten', 'verworfen', 'archiv']);
const VALID_SORT = new Set(['last_updated', 'borda', 'mine']);

export const load: PageServerLoad = async ({ locals, url, depends }) => {
	depends('council:list');
	const userId = locals.user.id;

	const rawStatus = url.searchParams.get('status') ?? 'alle';
	const status: 'alle' | CouncilStatusTag = VALID_STATUS.has(rawStatus)
		? (rawStatus as 'alle' | CouncilStatusTag)
		: 'alle';

	const rawSort = url.searchParams.get('sort') ?? 'last_updated';
	const sort: CouncilListSort = VALID_SORT.has(rawSort)
		? (rawSort as CouncilListSort)
		: 'last_updated';

	// 2026-06-05 (Korrektur 2): homeCoords fuer distance-Batch im List-Loader.
	const homePlz = getHomePlz();
	const homeCoords = homePlz ? { lat: homePlz.lat, lng: homePlz.lng } : null;
	const items = readAllCouncilObjects(status, sort, userId, homeCoords);
	const counts = countObjectsByEffectiveStatus(userId);

	// Voices/consensus per object_id — nur fuer Objekte in der Borda-Top-10
	// vorhanden. Wird in der Karten-UI gemerged.
	const top = readCouncilTop('all');
	const voicesByObject: Record<string, { voices: CouncilTopObject['voices']; state: CouncilTopObject['consensus_state'] }> = {};
	for (const t of top) {
		voicesByObject[t.object.id] = {
			voices: t.voices,
			state: t.consensus_state
		};
	}

	// Detail-Panel: aktueller User Top-10 (fuer In-Top-10-Picker)
	const userRankMap = getUserTopRanksFor(userId);
	const userRanks: Record<string, number> = {};
	for (const [oid, rank] of userRankMap) userRanks[oid] = rank;

	// Detail-Panel: Cluster-aware Notizen fuer NoteEditor (Bauteil-14).
	const notesMap = getLatestNotesMapForUser(
		userId,
		items.map((i) => i.object.id)
	);
	const notes: Record<string, string> = {};
	for (const [oid, row] of notesMap) notes[oid] = row.note_text;

	// Partner-Top-10 (fuer "Wer wo"-Mini-Block, falls Partner existiert)
	const others = listOtherUsers(userId);
	const partner = others[0] ?? null;
	const partnerRanks: Record<string, number> = {};
	if (partner) {
		const partnerMap = getUserTopRanksFor(partner.id);
		for (const [oid, rank] of partnerMap) partnerRanks[oid] = rank;
	}

	return {
		user: {
			id: locals.user.id,
			display_name: locals.user.display_name,
			role: locals.user.role
		},
		items,
		counts,
		voicesByObject,
		userRanks,
		notes,
		partner: partner ? { id: partner.id, display_name: partner.display_name } : null,
		partnerRanks,
		status,
		sort
	};
};
