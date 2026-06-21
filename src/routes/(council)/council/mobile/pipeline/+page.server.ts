// Mobile 1b (2026-05-30): Pipeline-Tab loader.
// Aggregator-Helper getPipelinePulse + lokale Resolves für die 4 Blocks.

import {
	getPipelinePulse,
	getUnseenCouncilObjectsForUser,
	getConsensusReadyObjectIds,
	getWorkflowGrouped,
	getCouncilObjectById,
	getRecentIngestAcks,
	readCouncilTop
} from '$lib/server/council-db/reader.js';
import {
	getLatestViewedAtForUser,
	listOtherUsers,
	getTriggerSetForObject,
	listPendingIngestUnprocessed
} from '$lib/server/folio-db/reader.js';
import { markPendingIngestProcessed } from '$lib/server/folio-db/writer.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async ({ locals }) => {
	const userId = locals.user.id;
	const lastView = getLatestViewedAtForUser(userId);
	const since = lastView ?? new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

	const pulse = getPipelinePulse(userId, since);
	const newObjects = getUnseenCouncilObjectsForUser(userId);

	// voices/state via readCouncilTop für die Stimmen-Streifen-Mini auf den Karten.
	const top = readCouncilTop('all');
	const voicesByObject = new Map(top.map((t) => [t.object.id, t]));

	const newWithVoices = newObjects.map((o) => {
		const t = voicesByObject.get(o.id);
		return {
			object: o,
			voices: t?.voices ?? [],
			state: t?.consensus_state ?? null
		};
	});

	// Konsens-Trigger-Kandidaten: id → resolved object + trigger-state
	const consensusIds = getConsensusReadyObjectIds();
	const otherUsers = listOtherUsers(userId).map((u) => ({
		id: u.id,
		display_name: u.display_name
	}));
	const consensusCards = consensusIds
		.map((id) => {
			const obj = getCouncilObjectById(id);
			if (!obj) return null;
			return {
				object: obj,
				triggered_user_ids: Array.from(getTriggerSetForObject(id))
			};
		})
		.filter((c): c is { object: NonNullable<ReturnType<typeof getCouncilObjectById>>; triggered_user_ids: number[] } => c !== null);

	// Workflow-Groups: resolve cross-DB für Foto + Adresse.
	const workflowGroups = getWorkflowGrouped();
	const workflowObjectIds = new Set<string>();
	for (const status of ['offen', 'in_arbeit', 'blockiert', 'erledigt'] as const) {
		for (const w of workflowGroups[status]) workflowObjectIds.add(w.council_object_id);
	}
	const workflowObjects: Record<string, ReturnType<typeof getCouncilObjectById>> = {};
	for (const id of workflowObjectIds) {
		workflowObjects[id] = getCouncilObjectById(id);
	}

	// Mobile-Aufraeumen (2026-05-31): ACK-Reconciliation vor dem Pending-Read.
	// Worker schreibt cross-DB-only nach council.ingest_acks; folio uebersetzt
	// jede neue ACK in einen eigenen UPDATE auf pending_ingest.processed_at.
	// Append-only + idempotenter UPDATE → keine race-conditions.
	const acks = getRecentIngestAcks();
	if (acks.length > 0) {
		const stillPending = new Set(
			listPendingIngestUnprocessed().map((r) => r.id)
		);
		for (const ack of acks) {
			if (stillPending.has(ack.pending_ingest_id)) {
				markPendingIngestProcessed(ack.pending_ingest_id, ack.processed_at);
			}
		}
	}

	const pendingIngest = listPendingIngestUnprocessed();

	return {
		pulse,
		newObjects: newWithVoices,
		consensusCards,
		workflowGroups,
		workflowObjects,
		pendingIngest,
		selfUser: { id: locals.user.id, display_name: locals.user.display_name },
		otherUsers
	};
};
