// Bauteil-14 (2026-06-10): Read-through Cluster-Substanz-Resolution.
// Ersetzt Write-Time-Copy (Council→folio cluster_match) durch Read-Time-
// Auflösung: own user_action > Cluster-Bruder user_action > Council-Default.
// Notes: R1 pro Betrachter-user_id, R2 eine latest-Notiz über Cluster,
// R3 eigene Row (auch leer) blockiert Erbe, R4 Editor schreibt aufs Objekt.

import Database from 'better-sqlite3';
import { existsSync } from 'fs';
import { getFolioDb } from '../folio-db/init.js';
import { getCouncilDbPath } from '../env.js';

let _councilConn: Database.Database | null = null;

function getCouncilDb(): Database.Database | null {
	if (_councilConn) return _councilConn;
	const dbPath = getCouncilDbPath();
	if (!existsSync(dbPath)) return null;
	_councilConn = new Database(dbPath, { readonly: true, fileMustExist: true });
	return _councilConn;
}
import type { CouncilObjectRow } from './types.js';
import type {
	CouncilStatusTagAll,
	HauskaufWorkflowRow,
	ObjectNoteRow,
	ObjectStatusOverrideRow
} from '../folio-db/types.js';

export type SubstanceProvenanceKind = 'own' | 'inherited' | 'council';

export type SubstanceProvenance = {
	kind: SubstanceProvenanceKind;
	from_object_id?: string;
	from_portal?: string;
	cluster_id?: number;
};

export type EffectiveStatusValue = {
	status_tag: CouncilStatusTagAll;
	reason: string | null;
	source: 'override' | 'council' | 'inherited';
};

export type EffectiveSubstance = {
	status: { value: EffectiveStatusValue; provenance: SubstanceProvenance };
	note: { value: string | null; provenance: SubstanceProvenance };
	workflow: { value: HauskaufWorkflowRow | null; provenance: SubstanceProvenance };
};

function isUserActionSource(source: string | null | undefined): boolean {
	return source == null || source === 'user_action';
}

function getClusterMembersForAllObjects(
	objectIds: string[]
): Map<string, Array<{ id: string; portal: string }> | null> {
	const out = new Map<string, Array<{ id: string; portal: string }> | null>();
	const db = getCouncilDb();
	if (!db || objectIds.length === 0) return out;
	const rows = db
		.prepare(
			`SELECT cm.object_id AS query_id,
			        other_o.id AS other_id,
			        other_o.portal AS other_portal
			 FROM cluster_members cm
			 JOIN cluster_members other_cm ON other_cm.cluster_id = cm.cluster_id
			 JOIN objects other_o         ON other_o.id = other_cm.object_id
			 WHERE cm.object_id IN (${objectIds.map(() => '?').join(',')})
			   AND other_cm.object_id != cm.object_id`
		)
		.all(...objectIds) as Array<{
			query_id: string;
			other_id: string;
			other_portal: string;
		}>;
	for (const r of rows) {
		const existing = out.get(r.query_id) ?? [];
		existing.push({ id: r.other_id, portal: r.other_portal });
		out.set(r.query_id, existing);
	}
	for (const oid of objectIds) {
		if (!out.has(oid)) out.set(oid, null);
	}
	return out;
}

function getClusterIdMap(objectIds: string[]): Map<string, number> {
	const out = new Map<string, number>();
	const db = getCouncilDb();
	if (!db || objectIds.length === 0) return out;
	const rows = db
		.prepare(
			`SELECT object_id, cluster_id FROM cluster_members
			 WHERE object_id IN (${objectIds.map(() => '?').join(',')})`
		)
		.all(...objectIds) as Array<{ object_id: string; cluster_id: number }>;
	for (const r of rows) out.set(r.object_id, r.cluster_id);
	return out;
}

function loadCouncilObjectsMap(objectIds: string[]): Map<string, CouncilObjectRow> {
	const out = new Map<string, CouncilObjectRow>();
	const db = getCouncilDb();
	if (!db || objectIds.length === 0) return out;
	const rows = db
		.prepare(
			`SELECT * FROM objects WHERE id IN (${objectIds.map(() => '?').join(',')})`
		)
		.all(...objectIds) as CouncilObjectRow[];
	for (const r of rows) out.set(r.id, r);
	return out;
}

function buildLatestOverrideMap(
	rows: ObjectStatusOverrideRow[]
): Map<string, ObjectStatusOverrideRow> {
	const out = new Map<string, ObjectStatusOverrideRow>();
	for (const r of rows) {
		if (!isUserActionSource(r.source)) continue;
		if (!out.has(r.council_object_id)) out.set(r.council_object_id, r);
	}
	return out;
}

function buildLatestNoteMapForUser(
	rows: ObjectNoteRow[],
	userId: number
): Map<string, ObjectNoteRow> {
	const out = new Map<string, ObjectNoteRow>();
	for (const r of rows) {
		if (r.user_id !== userId) continue;
		if (!isUserActionSource(r.source)) continue;
		if (!out.has(r.council_object_id)) out.set(r.council_object_id, r);
	}
	return out;
}

function buildLatestWorkflowMap(
	rows: HauskaufWorkflowRow[]
): Map<string, HauskaufWorkflowRow> {
	const out = new Map<string, HauskaufWorkflowRow>();
	for (const r of rows) {
		if (!isUserActionSource(r.source)) continue;
		if (!out.has(r.council_object_id)) out.set(r.council_object_id, r);
	}
	return out;
}

function clusterMemberIds(
	objectId: string,
	clusterMembers: Array<{ id: string; portal: string }> | null | undefined
): string[] {
	const ids = [objectId];
	if (clusterMembers) {
		for (const m of clusterMembers) ids.push(m.id);
	}
	return ids;
}

function resolveStatus(
	objectId: string,
	councilObj: CouncilObjectRow,
	memberIds: string[],
	overrideMap: Map<string, ObjectStatusOverrideRow>,
	councilMap: Map<string, CouncilObjectRow>,
	clusterId: number | undefined
): { value: EffectiveStatusValue; provenance: SubstanceProvenance } {
	const own = overrideMap.get(objectId);
	if (own && own.recorded_at > councilObj.last_updated) {
		return {
			value: {
				status_tag: own.status_tag,
				reason: own.reason ?? null,
				source: 'override'
			},
			provenance: { kind: 'own' }
		};
	}

	let bestBrother: ObjectStatusOverrideRow | null = null;
	let bestBrotherId: string | null = null;
	for (const mid of memberIds) {
		if (mid === objectId) continue;
		const ov = overrideMap.get(mid);
		if (!ov || ov.recorded_at <= councilObj.last_updated) continue;
		if (!bestBrother || ov.recorded_at > bestBrother.recorded_at) {
			bestBrother = ov;
			bestBrotherId = mid;
		}
	}
	if (bestBrother && bestBrotherId) {
		const fromPortal = councilMap.get(bestBrotherId)?.portal;
		return {
			value: {
				status_tag: bestBrother.status_tag,
				reason: bestBrother.reason ?? null,
				source: 'inherited'
			},
			provenance: {
				kind: 'inherited',
				from_object_id: bestBrotherId,
				from_portal: fromPortal,
				cluster_id: clusterId
			}
		};
	}

	return {
		value: {
			status_tag: councilObj.status_tag as CouncilStatusTagAll,
			reason: null,
			source: 'council'
		},
		provenance: { kind: 'council' }
	};
}

function resolveNote(
	objectId: string,
	memberIds: string[],
	noteMap: Map<string, ObjectNoteRow>,
	councilMap: Map<string, CouncilObjectRow>,
	clusterId: number | undefined
): { value: string | null; provenance: SubstanceProvenance } {
	const ownRow = noteMap.get(objectId);
	if (ownRow) {
		// R3: eigene Row gewinnt — auch wenn leer (kein Bruder-Fallback).
		return {
			value: ownRow.note_text === '' ? null : ownRow.note_text,
			provenance: { kind: 'own' }
		};
	}

	let best: ObjectNoteRow | null = null;
	for (const mid of memberIds) {
		if (mid === objectId) continue;
		const row = noteMap.get(mid);
		if (!row || row.note_text === '') continue;
		if (!best || row.recorded_at > best.recorded_at) best = row;
	}
	if (best) {
		const fromPortal = councilMap.get(best.council_object_id)?.portal;
		return {
			value: best.note_text,
			provenance: {
				kind: 'inherited',
				from_object_id: best.council_object_id,
				from_portal: fromPortal,
				cluster_id: clusterId
			}
		};
	}

	return { value: null, provenance: { kind: 'council' } };
}

function resolveWorkflow(
	objectId: string,
	memberIds: string[],
	workflowMap: Map<string, HauskaufWorkflowRow>,
	councilMap: Map<string, CouncilObjectRow>,
	clusterId: number | undefined
): { value: HauskaufWorkflowRow | null; provenance: SubstanceProvenance } {
	const own = workflowMap.get(objectId);
	if (own) {
		return { value: own, provenance: { kind: 'own' } };
	}

	let best: HauskaufWorkflowRow | null = null;
	for (const mid of memberIds) {
		if (mid === objectId) continue;
		const row = workflowMap.get(mid);
		if (!row) continue;
		if (!best || row.recorded_at > best.recorded_at) best = row;
	}
	if (best) {
		const fromPortal = councilMap.get(best.council_object_id)?.portal;
		return {
			value: best,
			provenance: {
				kind: 'inherited',
				from_object_id: best.council_object_id,
				from_portal: fromPortal,
				cluster_id: clusterId
			}
		};
	}

	return { value: null, provenance: { kind: 'council' } };
}

/**
 * Batch-Resolution effektiver Cluster-Substanz für eine Objekt-Liste.
 * Council-Rows optional vorberechnet (Liste-Reader hat sie oft schon).
 */
export function resolveEffectiveSubstanceMap(
	objectIds: string[],
	userId: number,
	councilRows?: CouncilObjectRow[]
): Map<string, EffectiveSubstance> {
	const out = new Map<string, EffectiveSubstance>();
	if (objectIds.length === 0) return out;

	const clusterMembersMap = getClusterMembersForAllObjects(objectIds);

	const allMemberIds = new Set<string>(objectIds);
	for (const oid of objectIds) {
		const members = clusterMembersMap.get(oid);
		if (members) for (const m of members) allMemberIds.add(m.id);
	}
	const expandedIds = [...allMemberIds];

	const councilMap = councilRows
		? new Map(councilRows.map((r) => [r.id, r]))
		: loadCouncilObjectsMap(expandedIds);
	for (const id of expandedIds) {
		if (!councilMap.has(id)) {
			const loaded = loadCouncilObjectsMap([id]);
			const row = loaded.get(id);
			if (row) councilMap.set(id, row);
		}
	}

	const clusterIdMap = getClusterIdMap(expandedIds);
	const folio = getFolioDb();
	const ph = expandedIds.map(() => '?').join(',');

	const overrideRows = folio
		.prepare(
			`SELECT * FROM object_status_override
			 WHERE council_object_id IN (${ph})
			 ORDER BY recorded_at DESC`
		)
		.all(...expandedIds) as ObjectStatusOverrideRow[];
	const overrideMap = buildLatestOverrideMap(overrideRows);

	const noteRows = folio
		.prepare(
			`SELECT * FROM object_notes
			 WHERE user_id = ? AND council_object_id IN (${ph})
			 ORDER BY recorded_at DESC`
		)
		.all(userId, ...expandedIds) as ObjectNoteRow[];
	const noteMap = buildLatestNoteMapForUser(noteRows, userId);

	const workflowRows = folio
		.prepare(
			`SELECT * FROM hauskauf_workflow
			 WHERE council_object_id IN (${ph})
			 ORDER BY recorded_at DESC, id DESC`
		)
		.all(...expandedIds) as HauskaufWorkflowRow[];
	const workflowMap = buildLatestWorkflowMap(workflowRows);

	for (const objectId of objectIds) {
		const councilObj = councilMap.get(objectId);
		if (!councilObj) continue;

		const members = clusterMembersMap.get(objectId) ?? null;
		const memberIds = clusterMemberIds(objectId, members);
		const clusterId = clusterIdMap.get(objectId);

		const status = resolveStatus(
			objectId,
			councilObj,
			memberIds,
			overrideMap,
			councilMap,
			clusterId
		);
		const note = resolveNote(objectId, memberIds, noteMap, councilMap, clusterId);
		const workflow = resolveWorkflow(
			objectId,
			memberIds,
			workflowMap,
			councilMap,
			clusterId
		);

		out.set(objectId, { status, note, workflow });
	}

	return out;
}

/** Einzelobjekt-Shortcut für Detail-Loader. */
export function resolveEffectiveSubstance(
	objectId: string,
	userId: number,
	councilRow?: CouncilObjectRow
): EffectiveSubstance | null {
	const map = resolveEffectiveSubstanceMap(
		[objectId],
		userId,
		councilRow ? [councilRow] : undefined
	);
	return map.get(objectId) ?? null;
}
