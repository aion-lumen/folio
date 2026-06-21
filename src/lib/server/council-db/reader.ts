// Council V2 Cross-DB Reader (Bauteil 3, 2026-05-28).
// Folio liest ~/.council/council.db read-only (Pattern analog feedbackConn in
// /api/mail/correction/+server.ts:19-27).
//
// Schreibseite ist im council-Repo (Python-Worker). Folio nimmt nur read-Rolle —
// keine UPDATE/INSERT auf council.db hier.

import Database from 'better-sqlite3';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';
import { parse as parseYaml } from 'yaml';

import type {
	CouncilObjectRow,
	CouncilConsolidatedRow,
	CouncilRankingRow,
	CouncilTopObject,
	CouncilVoice,
	CouncilConsensusState,
	CouncilStatusTag,
	CouncilPersonaMeta,
	CouncilConfidence
} from './types.js';
import { getHeuristicMarkersForFeedbackId } from '../feedback/reader.js';
import { extractPlzInfo, haversineKm } from '$lib/util/distance.js';
import { getCouncilConfigPath, getCouncilDbPath, getHomePlz } from '../env.js';
import {
	resolveEffectiveSubstanceMap,
	type SubstanceProvenance
} from './cluster-substance.js';

// Mobile 1a: getRecentEvents aggregates across council.db AND folio.db.
// Importing folio-db's connection here is a deliberate cross-DB read on
// folio's owned tables (status overrides, user rankings, triggers, workflow).
import { getFolioDb } from '../folio-db/init.js';

// Desktop-Detail (2026-05-31 §A + Klausel 1): domain-agnostische LensReason.
import type { LensReason, LensConfidence } from '$lib/lens/types.js';

// Mobile-Aufraeumen (2026-05-31): ACK-Reconciliation. Pendant zum
// pending-ingest-worker im council-Repo.
export type IngestAckRow = {
	pending_ingest_id: number;
	council_object_id: string | null;
	status: 'processed' | 'failed' | 'duplicate';
	error_reason: string | null;
	processed_at: string;
};

/**
 * Reads council.ingest_acks read-only. Tolerant against the table being
 * absent (worker-branch may not yet be deployed in council.db) — returns
 * an empty array in that case so the pipeline loader keeps working.
 */
export function getRecentIngestAcks(): IngestAckRow[] {
	const db = getCouncilDb();
	if (!db) return [];
	try {
		return db
			.prepare(
				`SELECT pending_ingest_id, council_object_id, status, error_reason, processed_at
				 FROM ingest_acks
				 ORDER BY processed_at DESC`
			)
			.all() as IngestAckRow[];
	} catch {
		// ingest_acks table not yet created — council-worker hasn't been deployed.
		return [];
	}
}

let _conn: Database.Database | null = null;
function getCouncilDb(): Database.Database | null {
	if (_conn) return _conn;
	const dbPath = getCouncilDbPath();
	if (!existsSync(dbPath)) return null;
	_conn = new Database(dbPath, { readonly: true, fileMustExist: true });
	return _conn;
}

let _personasCache: CouncilPersonaMeta[] | null = null;
let _personasCachedAt = 0;
const PERSONA_TTL_MS = 5 * 60 * 1000;

export function loadPersonas(): CouncilPersonaMeta[] {
	const now = Date.now();
	if (_personasCache && now - _personasCachedAt < PERSONA_TTL_MS) return _personasCache;
	const personasPath = join(getCouncilConfigPath(), 'personas.yaml');
	if (!existsSync(personasPath)) {
		_personasCache = [];
		_personasCachedAt = now;
		return _personasCache;
	}
	try {
		const parsed = parseYaml(readFileSync(personasPath, 'utf-8')) as
			| {
					personas?: {
						id?: string;
						label?: string;
						bewertungsachse?: string;
						lm_studio_model?: string;
					}[];
			  }
			| null;
		const list = parsed?.personas ?? [];
		_personasCache = list.map((p) => ({
			id: p.id ?? '',
			label: p.label ?? p.id ?? '',
			bewertungsachse: p.bewertungsachse ?? '',
			lm_studio_model: p.lm_studio_model
		}));
	} catch {
		_personasCache = [];
	}
	_personasCachedAt = now;
	return _personasCache;
}

function shortLabel(id: string): string {
	// 'lens-baumeister' → 'Baumeister' (für Streifenkachel-Tooltip)
	if (id.startsWith('lens-')) {
		const base = id.slice(5);
		return base.charAt(0).toUpperCase() + base.slice(1);
	}
	return id;
}

function rankBucket(rank: number): 'top' | 'mid' | 'low' {
	if (rank <= 3) return 'top';
	if (rank <= 7) return 'mid';
	return 'low';
}

function computeConsensus(voices: CouncilVoice[]): CouncilConsensusState {
	const present = voices.filter((v): v is Extract<CouncilVoice, { kind: 'present' }> => v.kind === 'present');
	if (present.length <= 1) return 'ne-strong';
	const buckets = present.map((v) => v.score_bucket);
	const uniqueCount = new Set(buckets).size;
	if (uniqueCount === 1) return 'still';
	if (uniqueCount === 2) return 'ne';
	return 'ne-strong';
}

/**
 * Holt die latest consolidated_top10 (per MAX(computed_at)). Filter via
 * status-Argument: 'default' → alle nicht-archiv und nicht-verworfen,
 * 'all' → inkl. verworfen+archiv, 'kaufen'/'beobachten' → exakt.
 */
export function readCouncilTop(
	status: 'default' | 'all' | CouncilStatusTag = 'default'
): CouncilTopObject[] {
	const db = getCouncilDb();
	if (!db) return [];

	// Latest computed_at finden, dann alle rows dieses Runs nehmen
	const latestRow = db
		.prepare('SELECT MAX(computed_at) AS ts FROM consolidated_top10')
		.get() as { ts: string | null } | undefined;
	const latestTs = latestRow?.ts;
	if (!latestTs) return [];

	const top10 = db
		.prepare(
			'SELECT * FROM consolidated_top10 WHERE computed_at = ? ORDER BY rank ASC'
		)
		.all(latestTs) as CouncilConsolidatedRow[];

	if (top10.length === 0) return [];

	const objectIds = top10.map((r) => r.object_id);
	const placeholders = objectIds.map(() => '?').join(',');

	// 2026-06-08 Bauteil 2.9 (E2): Status-Filter berücksichtigt jetzt
	// effective_status (council.objects.status_tag + folio.object_status_override
	// latest-wins). Vorher filterte nur SQL auf objects.status_tag und
	// ignorierte den User-Override → User-verworfene Objekte tauchten im
	// Borda-Ranking auf. Pattern aus readAllCouncilObjects:1115-1178.
	const objects = db
		.prepare(`SELECT * FROM objects WHERE id IN (${placeholders})`)
		.all(...objectIds) as CouncilObjectRow[];

	// Bauteil-14: Cluster-aware effective status (userId=0 — nur Status, keine Notes).
	const substanceMap = resolveEffectiveSubstanceMap(objectIds, 0, objects);

	const objectById = new Map<string, CouncilObjectRow>();
	for (const o of objects) {
		const eff = substanceMap.get(o.id)?.status.value.status_tag ?? o.status_tag;
		if (status === 'default' && (eff === 'archiv' || eff === 'verworfen')) continue;
		if (status !== 'default' && status !== 'all' && eff !== status) continue;
		objectById.set(o.id, o);
	}

	// Latest ranking pro (lens, object) für die Top-10-Objekte
	const rankings = db
		.prepare(`
			SELECT r1.participant_id, r1.object_id, r1.rank
			FROM rankings r1
			WHERE r1.participant_id LIKE 'lens-%'
			  AND r1.object_id IN (${placeholders})
			  AND r1.recorded_at = (
			      SELECT MAX(r2.recorded_at) FROM rankings r2
			      WHERE r2.participant_id = r1.participant_id
			        AND r2.object_id = r1.object_id
			  )
		`)
		.all(...objectIds) as Pick<CouncilRankingRow, 'participant_id' | 'object_id' | 'rank'>[];

	// Latest confidence pro (lens, object) aus lens_comparisons
	const confidences = db
		.prepare(`
			SELECT lc1.lens_id, lc1.obj_a_id AS object_id, lc1.confidence
			FROM lens_comparisons lc1
			WHERE lc1.obj_a_id IN (${placeholders})
			  AND lc1.recorded_at = (
			      SELECT MAX(lc2.recorded_at) FROM lens_comparisons lc2
			      WHERE lc2.lens_id = lc1.lens_id
			        AND lc2.obj_a_id = lc1.obj_a_id
			  )
			UNION ALL
			SELECT lc1.lens_id, lc1.obj_b_id AS object_id, lc1.confidence
			FROM lens_comparisons lc1
			WHERE lc1.obj_b_id IN (${placeholders})
			  AND lc1.recorded_at = (
			      SELECT MAX(lc2.recorded_at) FROM lens_comparisons lc2
			      WHERE lc2.lens_id = lc1.lens_id
			        AND lc2.obj_b_id = lc1.obj_b_id
			  )
		`)
		.all(...objectIds, ...objectIds) as { lens_id: string; object_id: string; confidence: string | null }[];

	const confidenceByLensObject = new Map<string, CouncilConfidence | null>();
	for (const c of confidences) {
		const key = `${c.lens_id}:${c.object_id}`;
		if (!confidenceByLensObject.has(key)) {
			confidenceByLensObject.set(
				key,
				(c.confidence as CouncilConfidence | null) ?? null
			);
		}
	}

	// Personas aus YAML für Label-Resolution
	const personas = loadPersonas();
	const personaLabels = new Map(personas.map((p) => [p.id, p.label]));
	// Wenn YAML leer/fehlt: Fallback aus rankings-DB (alle lens_ids die wir sehen)
	const seenLensIds = new Set(rankings.map((r) => r.participant_id));
	const lensIds = personas.length > 0
		? personas.map((p) => p.id)
		: Array.from(seenLensIds).sort();

	// 2026-06-09 Bauteil 2.9 (E5): Distance-Malus.
	// HomePlz aus user_context/env → cross-DB-distance pro Object via
	// feedback.heuristic_markers.plz_coords. Borda-Score wird post-borda
	// justiert (Council-Worker bleibt unverändert, Folio rechnet Malus
	// drauf). Schwellen orientieren sich am user_context-Such-Radius
	// (home_plz + ~50 km).
	const homePlz = getHomePlz();
	const homeCoords = homePlz ? { lat: homePlz.lat, lng: homePlz.lng } : null;
	function distanceWeight(km: number | null): number {
		if (km == null) return 1.0;  // unbekannt → neutral
		if (km <= 15) return 1.0;    // im Pendel-Radius
		if (km <= 30) return 0.92;   // moderat (User-Suchradius wohl)
		if (km <= 50) return 0.78;   // am Rand des Such-Radius (50km)
		return 0.55;                  // außerhalb
	}

	// Build CouncilTopObject pro consolidated row
	const out: CouncilTopObject[] = [];
	for (const row of top10) {
		const obj = objectById.get(row.object_id);
		if (!obj) continue; // war im Status-Filter rausgefallen

		const rankingsForObj = rankings.filter((r) => r.object_id === row.object_id);
		const rankByLens = new Map(rankingsForObj.map((r) => [r.participant_id, r.rank]));

		const voices: CouncilVoice[] = lensIds.map((lens_id) => {
			const rank = rankByLens.get(lens_id);
			const label = personaLabels.get(lens_id) ?? shortLabel(lens_id);
			if (rank === undefined) {
				return { kind: 'missing', lens_id, label };
			}
			return {
				kind: 'present',
				lens_id,
				label,
				rank,
				score_bucket: rankBucket(rank),
				confidence: confidenceByLensObject.get(`${lens_id}:${row.object_id}`) ?? null
			};
		});

		const distance_km = getDistanceKmForCouncilObject(obj.id, homeCoords);
		const distance_weight = distanceWeight(distance_km);
		const borda_score_adjusted = row.borda_score * distance_weight;

		out.push({
			object: obj,
			borda_score: row.borda_score,
			borda_rank: row.rank,
			distance_km,
			distance_weight,
			borda_score_adjusted,
			voices,
			consensus_state: computeConsensus(voices)
		});
	}

	// Re-sort nach adjusted-score DESC (Folio-UI-Reihenfolge — Council-
	// internal borda_rank bleibt im Output als Audit-Trail).
	out.sort((a, b) => b.borda_score_adjusted - a.borda_score_adjusted);
	return out;
}

/**
 * Desktop-Detail (2026-05-31 §A.1): Volltext-Begruendungen pro Lens fuer
 * EIN Object. Aggregation aus lens_comparisons.reason — pro Paar (a, b, lens)
 * existiert eine Reason; pro (lens, object) nehmen wir die juengste non-empty
 * Reason. Plus latest rankings.rank + latest confidence.
 *
 * Type-Heimathafen ist domain-agnostic (src/lib/lens/types.ts) — Reader bleibt
 * im Council-Modul, weil Datenquelle Council-spezifisch ist.
 */
export function getLensReasonsForObject(objectId: string): LensReason[] {
	const db = getCouncilDb();
	if (!db) return [];

	// Juengste non-empty Reason pro (lens_id, object_id) via UNION der beiden
	// Paar-Positionen. SQLite hat keinen Korrelations-Trick fuer "first non-empty
	// per group ordered by recorded_at DESC" — wir holen alles, gruppieren JS-seitig.
	const rows = db
		.prepare(
			`SELECT lens_id, obj_a_id AS object_id, reason, confidence, recorded_at
			 FROM lens_comparisons
			 WHERE obj_a_id = ?
			 UNION ALL
			 SELECT lens_id, obj_b_id AS object_id, reason, confidence, recorded_at
			 FROM lens_comparisons
			 WHERE obj_b_id = ?
			 ORDER BY recorded_at DESC`
		)
		.all(objectId, objectId) as {
		lens_id: string;
		object_id: string;
		reason: string | null;
		confidence: LensConfidence | null;
		recorded_at: string;
	}[];

	// Juengste non-empty Reason pro Lens, plus juengste Confidence (kann aus
	// einer anderen Row kommen, falls die juengste Comparison keine Reason hat).
	const reasonByLens = new Map<string, { reason: string; recorded_at: string }>();
	const confidenceByLens = new Map<string, LensConfidence | null>();
	const latestRecordedByLens = new Map<string, string>();
	for (const r of rows) {
		if (!latestRecordedByLens.has(r.lens_id)) {
			latestRecordedByLens.set(r.lens_id, r.recorded_at);
			confidenceByLens.set(r.lens_id, r.confidence ?? null);
		}
		if (r.reason && r.reason.trim() && !reasonByLens.has(r.lens_id)) {
			reasonByLens.set(r.lens_id, { reason: r.reason, recorded_at: r.recorded_at });
		}
	}

	// Latest rank pro Lens fuer dieses Object aus rankings.
	const rankRows = db
		.prepare(
			`SELECT r1.participant_id AS lens_id, r1.rank
			 FROM rankings r1
			 WHERE r1.object_id = ?
			   AND r1.participant_id LIKE 'lens-%'
			   AND r1.recorded_at = (
			       SELECT MAX(r2.recorded_at) FROM rankings r2
			       WHERE r2.participant_id = r1.participant_id
			         AND r2.object_id = r1.object_id
			   )`
		)
		.all(objectId) as { lens_id: string; rank: number }[];
	const rankByLens = new Map(rankRows.map((r) => [r.lens_id, r.rank]));

	// Persona-Order + Labels aus YAML (Fallback shortLabel).
	const personas = loadPersonas();
	const personaLabels = new Map(personas.map((p) => [p.id, p.label]));
	const lensOrder = personas.length > 0
		? personas.map((p) => p.id)
		: Array.from(new Set([...latestRecordedByLens.keys()])).sort();

	const out: LensReason[] = [];
	for (const lens_id of lensOrder) {
		const reasonEntry = reasonByLens.get(lens_id);
		const recorded_at =
			reasonEntry?.recorded_at ?? latestRecordedByLens.get(lens_id) ?? '';
		out.push({
			lens_id,
			label: personaLabels.get(lens_id) ?? shortLabel(lens_id),
			reason: reasonEntry?.reason ?? null,
			confidence: confidenceByLens.get(lens_id) ?? null,
			rank: rankByLens.get(lens_id) ?? null,
			recorded_at
		});
	}
	return out;
}

/**
 * Bauteil 0 (2026-05-30): pro Object die jüngste Lens-Bewertung.
 * Hybrid: MAX(rankings.recorded_at) wo vorhanden, sonst objects.last_updated.
 * Wird in der Mobile-Pipeline gemerged mit object_views (folio.db) für
 * "ungesehen seit letzter Bewertung pro User".
 */
export function lastLensEvaluationMap(): Map<string, string> {
	const out = new Map<string, string>();
	const db = getCouncilDb();
	if (!db) return out;

	// MAX(recorded_at) per object_id über alle lens-rankings
	const rankingRows = db
		.prepare(
			`SELECT object_id, MAX(recorded_at) AS ts
			 FROM rankings
			 WHERE participant_id LIKE 'lens-%'
			 GROUP BY object_id`
		)
		.all() as { object_id: string; ts: string }[];
	for (const r of rankingRows) out.set(r.object_id, r.ts);

	// Fallback last_updated für Objekte ohne Lens-Rankings
	const fallbackRows = db
		.prepare('SELECT id, last_updated FROM objects')
		.all() as { id: string; last_updated: string }[];
	for (const r of fallbackRows) {
		if (!out.has(r.id)) out.set(r.id, r.last_updated);
	}
	return out;
}

/**
 * Mobile 1a (2026-05-30): single object lookup for the detail page.
 * Returns null if the id doesn't exist or the council.db is unreachable.
 */
export function getCouncilObjectById(id: string): CouncilObjectRow | null {
	const db = getCouncilDb();
	if (!db) return null;
	const row = db
		.prepare('SELECT * FROM objects WHERE id = ?')
		.get(id) as CouncilObjectRow | undefined;
	return row ?? null;
}

// 2026-06-05 (Korrektur 1, B3): Reverse-Lookup feedback_id → council-Object.
// Mail-Detail braucht qm/preis fuer Status-Pillen — kommt aus
// council.objects (title-parser-Output), mapped via from_feedback_ids.
// JSON-LIKE-Suche, ~41 Objects → negligible. Bei Skalierung später
// JSON1-Functions oder Sub-Tabelle.
export function getCouncilObjectByFirstFeedbackId(
	feedbackId: number
): CouncilObjectRow | null {
	const db = getCouncilDb();
	if (!db) return null;
	const rows = db
		.prepare('SELECT * FROM objects WHERE from_feedback_ids IS NOT NULL')
		.all() as CouncilObjectRow[];
	for (const r of rows) {
		if (!r.from_feedback_ids) continue;
		try {
			const ids = JSON.parse(r.from_feedback_ids);
			if (Array.isArray(ids) && ids.includes(feedbackId)) return r;
		} catch {
			continue;
		}
	}
	return null;
}


// 2026-06-06 Bauteil 2 Aufgabe 3 (Mail-zu-Council-Uebergang): Inserat-
// Marker, die der council-Worker pro Mail erzeugt (out_of_corridor:<plz>,
// expired:redirect_error, corridor_check_skipped:<portal>). Folio merged
// sie in die Mail-Detail-Marker-Liste — 1:N pro feedback_id.
export function getInseratMarkersForFeedback(feedbackId: number): string[] {
	const db = getCouncilDb();
	if (!db) return [];
	try {
		const rows = db
			.prepare(
				`SELECT marker FROM mail_inserat_markers
				 WHERE feedback_id = ?
				 ORDER BY recorded_at ASC`
			)
			.all(feedbackId) as Array<{ marker: string }>;
		return rows.map((r) => r.marker);
	} catch {
		// mail_inserat_markers existiert noch nicht (DB pre-C1) — leeres Array
		return [];
	}
}

// 2026-06-07 Pre-Bauteil Pipeline-Persistenz: Cross-DB-Reader fuer
// council-side Run-Substanz (council_runs / council_run_logs /
// council_run_summary). Folio liest read-only und merged in
// listRecentPipelineRuns (folio-db/reader.ts).
import type {
	CouncilRunRow,
	CouncilRunLogRow,
	CouncilRunSummaryRow
} from '../folio-db/types.js';

export function listRecentCouncilRuns(limit = 30): CouncilRunRow[] {
	const db = getCouncilDb();
	if (!db) return [];
	try {
		return db
			.prepare(
				`SELECT * FROM council_runs ORDER BY started_at DESC LIMIT ?`
			)
			.all(limit) as CouncilRunRow[];
	} catch {
		return [];
	}
}

export function getCouncilRunByUuid(uuid: string): CouncilRunRow | null {
	const db = getCouncilDb();
	if (!db) return null;
	try {
		const row = db
			.prepare('SELECT * FROM council_runs WHERE run_uuid = ?')
			.get(uuid) as CouncilRunRow | undefined;
		return row ?? null;
	} catch {
		return null;
	}
}

export function getCouncilRunLogs(uuid: string): CouncilRunLogRow[] {
	const db = getCouncilDb();
	if (!db) return [];
	try {
		return db
			.prepare(
				'SELECT * FROM council_run_logs WHERE run_uuid = ? ORDER BY seq ASC'
			)
			.all(uuid) as CouncilRunLogRow[];
	} catch {
		return [];
	}
}

export function getCouncilRunSummary(uuid: string): CouncilRunSummaryRow | null {
	const db = getCouncilDb();
	if (!db) return null;
	try {
		const row = db
			.prepare('SELECT * FROM council_run_summary WHERE run_uuid = ?')
			.get(uuid) as CouncilRunSummaryRow | undefined;
		return row ?? null;
	} catch {
		return null;
	}
}

// 2026-06-05 (B4): Cross-DB distance fuer ein Council-Object.
// Liest erste feedback_id aus objects.from_feedback_ids → feedback-reader
// liefert heuristic_markers → plz_coords daraus → haversine gegen homeCoords.
// Returnt null wenn keine feedback_ids, kein plz_coords-Marker, oder
// keine homeCoords.
export function getDistanceKmForCouncilObject(
	objectId: string,
	homeCoords: { lat: number; lng: number } | null
): number | null {
	if (!homeCoords) return null;
	const db = getCouncilDb();
	if (!db) return null;
	const row = db
		.prepare('SELECT from_feedback_ids FROM objects WHERE id = ?')
		.get(objectId) as { from_feedback_ids: string | null } | undefined;
	if (!row?.from_feedback_ids) return null;
	let ids: number[];
	try {
		const parsed = JSON.parse(row.from_feedback_ids);
		ids = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'number') : [];
	} catch {
		return null;
	}
	if (ids.length === 0) return null;
	const markers = getHeuristicMarkersForFeedbackId(ids[0]);
	if (!markers.length) return null;
	const info = extractPlzInfo(markers);
	if (!info.coords) return null;
	return haversineKm(homeCoords.lat, homeCoords.lng, info.coords.lat, info.coords.lng);
}

/**
 * Mobile 1a (2026-05-30): event-stream for the Verlauf tab. Aggregates six
 * sources across council.db (lens movements, new ranking batches) and
 * folio.db (partner status overrides, partner top-10 changes, partner
 * triggers, workflow status changes). Sorted DESC by timestamp.
 *
 * Cross-DB by design — this lives in council-db/reader.ts because the
 * council side is the heavier read and the bucketing is per-object.
 */
// Mobile-Aufraeumen (2026-05-31): Self vs Partner is a render concern, not a
// data concern. Events carry plain `user_id`; the renderer decides attribution.
// Desktop-Bugs (2026-05-31): 'note' kind hinzugefuegt — object_notes-Pfad
// fehlte komplett (weder Self noch Partner).
export type VerlaufEvent =
	| { kind: 'lens-moved'; ts: string; object_id: string; lens_id: string; from_rank: number; to_rank: number }
	| { kind: 'status'; ts: string; object_id: string; user_id: number; status_tag: string }
	| { kind: 'top10'; ts: string; object_id: string; user_id: number; rank: number }
	| { kind: 'trigger'; ts: string; object_id: string; user_id: number }
	| { kind: 'note'; ts: string; object_id: string; user_id: number; note_text: string }
	| { kind: 'workflow'; ts: string; object_id: string; status: string; termin: string | null; verhandlungspreis: number | null }
	| { kind: 'new-batch'; ts: string; count: number };

export function getRecentEvents(since: string): VerlaufEvent[] {
	const out: VerlaufEvent[] = [];

	// 1. Lens-Bewegungen (council.db rankings): pro (lens_id, object_id) die
	//    zwei jüngsten rankings, Event wenn rank ungleich.
	const db = getCouncilDb();
	if (db) {
		const lensRows = db
			.prepare(
				`SELECT participant_id AS lens_id, object_id, rank, recorded_at
				 FROM rankings
				 WHERE participant_id LIKE 'lens-%'
				   AND recorded_at >= ?
				 ORDER BY participant_id, object_id, recorded_at DESC`
			)
			.all(since) as { lens_id: string; object_id: string; rank: number; recorded_at: string }[];
		// in-memory: pro (lens, object) die zwei jüngsten, vergleichen
		const pairs = new Map<string, typeof lensRows>();
		for (const r of lensRows) {
			const key = `${r.lens_id}::${r.object_id}`;
			const arr = pairs.get(key) ?? [];
			if (arr.length < 2) {
				arr.push(r);
				pairs.set(key, arr);
			}
		}
		// für die "Vorgänger"-Werte brauchen wir auch ältere Rows — separat fetch
		// (nicht alle (lens,object) haben einen since-erwartbaren Vorgänger im Filter)
		const priorRows = db
			.prepare(
				`SELECT participant_id AS lens_id, object_id, rank, recorded_at
				 FROM rankings
				 WHERE participant_id LIKE 'lens-%'
				 ORDER BY participant_id, object_id, recorded_at DESC`
			)
			.all() as { lens_id: string; object_id: string; rank: number; recorded_at: string }[];
		const prevByPair = new Map<string, number>();
		for (const r of priorRows) {
			const key = `${r.lens_id}::${r.object_id}`;
			const cur = pairs.get(key);
			if (!cur || cur.length === 0) continue;
			const latest = cur[0];
			if (r.recorded_at < latest.recorded_at && !prevByPair.has(key)) {
				prevByPair.set(key, r.rank);
			}
		}
		for (const [key, arr] of pairs) {
			const latest = arr[0];
			const prev = prevByPair.get(key);
			if (prev === undefined) continue;
			if (prev !== latest.rank) {
				out.push({
					kind: 'lens-moved',
					ts: latest.recorded_at,
					object_id: latest.object_id,
					lens_id: latest.lens_id,
					from_rank: prev,
					to_rank: latest.rank
				});
			}
		}

		// 6. Neue Bewertungen aggregiert pro computed_at-batch
		const batchRows = db
			.prepare(
				`SELECT computed_at AS ts, COUNT(*) AS count
				 FROM consolidated_top10
				 WHERE computed_at >= ?
				 GROUP BY computed_at
				 ORDER BY computed_at DESC`
			)
			.all(since) as { ts: string; count: number }[];
		for (const b of batchRows) {
			out.push({ kind: 'new-batch', ts: b.ts, count: b.count });
		}
	}

	// 2-5. Folio-DB-Quellen — alle User (Self + Partner). Renderer trennt.
	const folio = getFolioDb();

	const statusRows = folio
		.prepare(
			`SELECT council_object_id AS object_id, user_id, status_tag, recorded_at
			 FROM object_status_override
			 WHERE recorded_at >= ?
			 ORDER BY recorded_at DESC`
		)
		.all(since) as { object_id: string; user_id: number; status_tag: string; recorded_at: string }[];
	for (const r of statusRows) {
		out.push({
			kind: 'status',
			ts: r.recorded_at,
			object_id: r.object_id,
			user_id: r.user_id,
			status_tag: r.status_tag
		});
	}

	const top10Rows = folio
		.prepare(
			`SELECT object_id, user_id, rank, recorded_at
			 FROM user_rankings
			 WHERE recorded_at >= ?
			 ORDER BY recorded_at DESC`
		)
		.all(since) as { object_id: string; user_id: number; rank: number; recorded_at: string }[];
	for (const r of top10Rows) {
		out.push({
			kind: 'top10',
			ts: r.recorded_at,
			object_id: r.object_id,
			user_id: r.user_id,
			rank: r.rank
		});
	}

	const triggerRows = folio
		.prepare(
			`SELECT object_id, user_id, triggered_at
			 FROM object_triggers
			 WHERE triggered_at >= ?
			 ORDER BY triggered_at DESC`
		)
		.all(since) as { object_id: string; user_id: number; triggered_at: string }[];
	for (const r of triggerRows) {
		out.push({
			kind: 'trigger',
			ts: r.triggered_at,
			object_id: r.object_id,
			user_id: r.user_id
		});
	}

	// Desktop-Bugs (2026-05-31): object_notes — Self+Partner. Leere Notizen
	// (User-cleared) NICHT im Verlauf zeigen.
	const noteRows = folio
		.prepare(
			`SELECT council_object_id AS object_id, user_id, note_text, recorded_at
			 FROM object_notes
			 WHERE recorded_at >= ? AND note_text != ''
			 ORDER BY recorded_at DESC`
		)
		.all(since) as { object_id: string; user_id: number; note_text: string; recorded_at: string }[];
	for (const r of noteRows) {
		out.push({
			kind: 'note',
			ts: r.recorded_at,
			object_id: r.object_id,
			user_id: r.user_id,
			note_text: r.note_text
		});
	}

	// 2026-06-08 Bauteil 2.7c: updated_at → recorded_at (Spalten-Rename
	// aus Bauteil 2 Append-only-Refactor). Bauteil 2.7 hat den
	// hauskauf-workflow-reader gefixt, diese Stelle wurde übersehen.
	// Append-only: liefert auch ältere Status-Übergänge eines Objekts
	// (für Verlauf-Feed gewünscht — jede status-Änderung ist ein event).
	const workflowRows = folio
		.prepare(
			`SELECT council_object_id AS object_id, status, termin, verhandlungspreis, recorded_at
			 FROM hauskauf_workflow
			 WHERE recorded_at >= ?
			 ORDER BY recorded_at DESC`
		)
		.all(since) as {
			object_id: string;
			status: string;
			termin: string | null;
			verhandlungspreis: number | null;
			recorded_at: string;
		}[];
	for (const r of workflowRows) {
		out.push({
			kind: 'workflow',
			ts: r.recorded_at,
			object_id: r.object_id,
			status: r.status,
			termin: r.termin,
			verhandlungspreis: r.verhandlungspreis
		});
	}

	// Final sort by ts DESC
	out.sort((a, b) => (a.ts < b.ts ? 1 : a.ts > b.ts ? -1 : 0));
	return out;
}

/**
 * Mobile 1b (2026-05-30): per-user "ungesehen UND neu" für den
 * Pipeline-Block "Neue Objekte". Joint status_tag='neu' mit folio.object_views.
 * Ein Objekt ist "ungesehen" wenn (kein view-eintrag) ODER (view älter als
 * council.last_updated). Sortiert nach last_updated DESC (jüngste oben).
 */
export function getUnseenCouncilObjectsForUser(userId: number): CouncilObjectRow[] {
	const db = getCouncilDb();
	if (!db) return [];

	const neuRows = db
		.prepare(
			`SELECT * FROM objects
			 WHERE status_tag = 'neu' AND object_class = 'annonce'
			 ORDER BY last_updated DESC`
		)
		.all() as CouncilObjectRow[];
	if (neuRows.length === 0) return [];

	const folio = getFolioDb();
	const viewRows = folio
		.prepare('SELECT object_id, last_viewed_at FROM object_views WHERE user_id = ?')
		.all(userId) as { object_id: string; last_viewed_at: string }[];
	const viewedAt = new Map(viewRows.map((r) => [r.object_id, r.last_viewed_at]));

	return neuRows.filter((o) => {
		const seen = viewedAt.get(o.id);
		if (!seen) return true;
		return seen < o.last_updated;
	});
}

/**
 * Mobile 1b: object_ids that are "konsens-ready" — both users have rank ≤ 3
 * in user_rankings AND there is no hauskauf_workflow row yet. Returns the
 * raw ids; page-loader resolves to CouncilObjectRow.
 */
export function getConsensusReadyObjectIds(): string[] {
	const folio = getFolioDb();

	// inner: latest rank per (user_id, object_id). count distinct user_ids with rank in [1..3].
	const rows = folio
		.prepare(
			`SELECT object_id, COUNT(DISTINCT user_id) AS user_count
			 FROM (
			   SELECT ur.user_id, ur.object_id, ur.rank
			   FROM user_rankings ur
			   WHERE ur.recorded_at = (
			     SELECT MAX(ur2.recorded_at) FROM user_rankings ur2
			     WHERE ur2.user_id = ur.user_id AND ur2.object_id = ur.object_id
			   )
			     AND ur.rank BETWEEN 1 AND 3
			 ) tops
			 GROUP BY object_id
			 HAVING user_count >= 2`
		)
		.all() as { object_id: string; user_count: number }[];

	if (rows.length === 0) return [];

	const candidateIds = rows.map((r) => r.object_id);
	const placeholders = candidateIds.map(() => '?').join(',');
	const workflowRows = folio
		.prepare(
			`SELECT council_object_id FROM hauskauf_workflow WHERE council_object_id IN (${placeholders})`
		)
		.all(...candidateIds) as { council_object_id: string }[];
	const workflowSet = new Set(workflowRows.map((w) => w.council_object_id));

	return candidateIds.filter((id) => !workflowSet.has(id));
}

/**
 * Mobile 1b: hauskauf_workflow grouped by status. Each group lists rows
 * (with their council-object resolved by the page-loader since cross-DB
 * lookups stay outside this helper for clarity).
 */
import type { HauskaufStatus, HauskaufWorkflowRow } from '../folio-db/types.js';
import { listAllHauskaufWorkflow, getUserTopRanksFor } from '../folio-db/reader.js';

export function getWorkflowGrouped(): Record<HauskaufStatus, HauskaufWorkflowRow[]> {
	const all = listAllHauskaufWorkflow();
	const out: Record<HauskaufStatus, HauskaufWorkflowRow[]> = {
		offen: [],
		in_arbeit: [],
		blockiert: [],
		erledigt: []
	};
	for (const w of all) {
		out[w.status].push(w);
	}
	return out;
}

/**
 * Mobile 1b: aggregator-style pulse for the four pipeline header chips.
 * Mirrors getRecentEvents architecture: one call, one composed object.
 */
export type PipelinePulse = {
	bewegt: number;
	konsens: number;
	pipeline: number;
	neu: number;
	partner: {
		user_id: number;
		display_name: string;
		last_action_ts: string;
		last_action_summary: string;
	} | null;
};

export function getPipelinePulse(userId: number, since: string): PipelinePulse {
	const events = getRecentEvents(since);

	// bewegt: distinct object_ids that had a lens-moved event.
	const movedIds = new Set<string>();
	for (const e of events) {
		if (e.kind === 'lens-moved') movedIds.add(e.object_id);
	}

	const konsens = getConsensusReadyObjectIds().length;
	const pipeline = listAllHauskaufWorkflow().length;
	const neu = getUnseenCouncilObjectsForUser(userId).length;

	// partner: most-recent action event by someone OTHER than the current user.
	const partnerEvent = events.find(
		(e): e is Extract<VerlaufEvent, { kind: 'status' | 'top10' | 'trigger' }> =>
			(e.kind === 'status' || e.kind === 'top10' || e.kind === 'trigger') &&
			e.user_id !== userId
	);
	let partner: PipelinePulse['partner'] = null;
	if (partnerEvent) {
		const folio = getFolioDb();
		const u = folio
			.prepare('SELECT display_name FROM users WHERE id = ?')
			.get(partnerEvent.user_id) as { display_name: string } | undefined;
		if (u) {
			let summary = '';
			if (partnerEvent.kind === 'status') summary = `Status: ${partnerEvent.status_tag}`;
			else if (partnerEvent.kind === 'top10') summary = `Top-10 verschoben`;
			else summary = 'antriggert';
			partner = {
				user_id: partnerEvent.user_id,
				display_name: u.display_name,
				last_action_ts: partnerEvent.ts,
				last_action_summary: summary
			};
		}
	}

	return {
		bewegt: movedIds.size,
		konsens,
		pipeline,
		neu,
		partner
	};
}

/**
 * Mobile 1e (2026-05-30): Volltext-Suche über council.objects mit
 * effectiveStatusTag-Filter. LIKE-basiert (case-insensitive via LOWER),
 * Limit 50 results. Search-Felder: address + title (PLZ/Stadt steckt heute
 * dort drin; raw_og bleibt out — Performance + Rauschen).
 *
 * status: 'alle' | 'beobachten' | 'kaufen' | 'archiv' (UI-Filter aus
 * Direktive). Empty `q` ist erlaubt: bei status≠'alle' liefert das die
 * gesamte Liste dieses Status; bei q='' UND status='alle' → leer (UI
 * zeigt Hint statt 1000+ rows).
 */
export type SearchHit = {
	object: CouncilObjectRow;
	effective_status: CouncilStatusTag | 'abgelaufen';
	override_source: 'override' | 'council' | 'inherited';
	/** Bauteil-14: Provenance für Status-Erbe (Pille „übernommen von Bruder"). */
	status_provenance?: SubstanceProvenance;
	/** Bauteil-10 C4 (2026-06-10): Cross-Portal-Cluster-Mitglieder
	 *  (andere Objects im gleichen Cluster). Null = Single-Member.
	 *  Reuse getClusterMembersForAllObjects (Bauteil 9). */
	cluster_members: Array<{ id: string; portal: string }> | null;
	/** Bauteil-11 D3-B (2026-06-10): Cluster-Rank-Nachbar.
	 *  In SearchHit aktuell immer null — searchCouncilObjects hat
	 *  keinen userId-Context. V2 wenn Mobile-Such-Page Top-10-
	 *  Indikator braucht: userId-Parameter ergänzen.
	 */
	cluster_rank_neighbor: { object_id: string; rank: number; user_id: number } | null;
};

export function searchCouncilObjects(
	q: string,
	status: 'alle' | 'beobachten' | 'kaufen' | 'archiv'
): SearchHit[] {
	const db = getCouncilDb();
	if (!db) return [];
	const query = q.trim();
	// Desktop-Bugs (2026-05-31): die alte Wache `return []` bei leerer query +
	// status='alle' versteckte den vollen Bestand. Jetzt: 'alle' zeigt wirklich
	// alles, auch ohne query.

	// LIKE-Pattern. SQLite LIKE ist case-insensitive für ASCII (default
	// PRAGMA case_sensitive_like=OFF). Für Umlaute reicht das nicht — also
	// LOWER() auf beiden Seiten.
	const pattern = `%${query.toLowerCase()}%`;
	let rows: CouncilObjectRow[];
	if (query) {
		rows = db
			.prepare(
				`SELECT * FROM objects
				 WHERE object_class = 'annonce'
				   AND (LOWER(COALESCE(address,'')) LIKE ?
				     OR LOWER(COALESCE(title,'')) LIKE ?)
				 ORDER BY last_updated DESC
				 LIMIT 200`
			)
			.all(pattern, pattern) as CouncilObjectRow[];
	} else {
		// kein query → status filter alone, iterate status (ohne 'alle' Fall)
		rows = db
			.prepare(
				`SELECT * FROM objects
				 WHERE object_class = 'annonce'
				 ORDER BY last_updated DESC
				 LIMIT 500`
			)
			.all() as CouncilObjectRow[];
	}

	if (rows.length === 0) return [];

	// Bauteil-14: Cluster-aware effective status (userId=0 — Search hat keinen User-Context).
	const substanceMap = resolveEffectiveSubstanceMap(
		rows.map((o) => o.id),
		0,
		rows
	);

	// Bauteil-10 C4 (2026-06-10) Cluster-Mitglieder-Batch (reuse aus B9).
	const clusterMap = getClusterMembersForAllObjects(rows.map((o) => o.id));

	const hits: SearchHit[] = [];
	for (const o of rows) {
		const sub = substanceMap.get(o.id);
		const effective = sub?.status.value.status_tag ?? o.status_tag;
		const source = sub?.status.value.source ?? 'council';

		if (!effectiveMatchesFilter(effective, status as 'alle' | CouncilStatusTag)) continue;

		hits.push({
			object: o,
			effective_status: effective as CouncilStatusTag | 'abgelaufen',
			override_source: source,
			status_provenance: sub?.status.provenance,
			cluster_members: clusterMap.get(o.id) ?? null,
			cluster_rank_neighbor: null  // Search-Hit: kein userId-Context → null
		});
		if (hits.length >= 50) break;
	}
	return hits;
}

// Desktop-Update (2026-05-31): Vollbestand-Reader für Desktop-/council.
// `readCouncilTop` ist hardcoded auf consolidated_top10 limitiert (Top-10-only);
// für den Desktop-Bewerten-Workflow brauchen wir alle Objekte mit
// effective-Status-Merge + flexiblen Sort-Schluesseln. Pattern aus
// searchCouncilObjects (effective-status-merge per object_status_override).

// Desktop-Bugs (2026-05-31): zentraler Mapping-Helper fuer status-filter.
// 'archiv' ist Umbrella fuer lifecycle-tote objekte (archiv + abgelaufen);
// 'verworfen' bleibt user-authority eigene pille, kein lifecycle. Counts
// und Liste laufen durch diesen Helper — eine Wahrheit.
function effectiveMatchesFilter(
	effective: string,
	filter: 'alle' | CouncilStatusTag
): boolean {
	if (filter === 'alle') return true;
	if (filter === 'archiv') return effective === 'archiv' || effective === 'abgelaufen';
	return effective === filter;
}

export type CouncilListSort = 'last_updated' | 'borda' | 'mine';

export type CouncilListItem = {
	object: CouncilObjectRow;
	effective_status: CouncilStatusTag | 'abgelaufen';
	override_source: 'override' | 'council' | 'inherited';
	/** Bauteil-14: Provenance für Status-Erbe (Pille „übernommen von Bruder"). */
	status_provenance?: SubstanceProvenance;
	/** Bauteil-14: Provenance für vererbte Notiz (Detail-Panel). */
	note_provenance?: SubstanceProvenance;
	/** 2026-06-08 Bauteil 2.7d: Grund-Tag aus object_status_override
	 *  (heute typisch 'zu weit' / 'zu klein' via Quick-Reason-Buttons,
	 *  optional frei via API). Null wenn override_source='council' oder
	 *  override ohne reason. */
	override_reason: string | null;
	borda_rank: number | null; // null wenn nicht in consolidated_top10
	user_rank: number | null; // null wenn nicht in user_rankings des aktuellen Users
	/** 2026-06-05 Korrektur 2: vorberechnete Distance pro Object via
	 *  Cross-DB-Batch (feedback.heuristic_markers → plz_coords →
	 *  haversine). null wenn keine feedback-id / kein plz_coords-Marker /
	 *  keine homeCoords. */
	distance_km: number | null;
	/** Bauteil-9 (2026-06-09) Cross-Portal-Cluster-Mitglieder.
	 *  null wenn Object Single-Member. Sonst Liste der anderen Cluster-
	 *  Mitglieder mit (id, portal). UI rendert „auch auf: <portal-1>,
	 *  <portal-2>"-Pille wenn vorhanden.
	 */
	cluster_members: Array<{ id: string; portal: string }> | null;
	/** Bauteil-11 D3 Variante B (2026-06-10) Cluster-Rank-Nachbar.
	 *  Gefüllt wenn dieses Object KEINEN user_rank hat aber ein
	 *  Cluster-Bruder einen rank>0 hat (höchster gewinnt). UI
	 *  rendert „Bruder auf #X in Top-10"-Pille. Null wenn entweder
	 *  Object selbst gerankt ist (Redundanz vermeiden) oder kein
	 *  Cluster-Bruder gerankt ist.
	 */
	cluster_rank_neighbor: { object_id: string; rank: number; user_id: number } | null;
};

// 2026-06-05 (Korrektur 2): Batch-Helper fuer Desktop-List-Loader.
// Pro Object 1 cross-DB-feedback-read; bei aktuell ~41 Objects negligible.
// Bei spaeterer Skalierung (>1000): denormalisierung in council.objects.
export function getDistancesForAllCouncilObjects(
	homeCoords: { lat: number; lng: number } | null
): Map<string, number | null> {
	const out = new Map<string, number | null>();
	if (!homeCoords) return out;
	const db = getCouncilDb();
	if (!db) return out;
	const rows = db
		.prepare('SELECT id, from_feedback_ids FROM objects')
		.all() as Array<{ id: string; from_feedback_ids: string | null }>;
	for (const r of rows) {
		if (!r.from_feedback_ids) {
			out.set(r.id, null);
			continue;
		}
		let ids: number[];
		try {
			const parsed = JSON.parse(r.from_feedback_ids);
			ids = Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'number') : [];
		} catch {
			out.set(r.id, null);
			continue;
		}
		if (ids.length === 0) {
			out.set(r.id, null);
			continue;
		}
		const markers = getHeuristicMarkersForFeedbackId(ids[0]);
		const info = extractPlzInfo(markers);
		out.set(
			r.id,
			info.coords
				? haversineKm(homeCoords.lat, homeCoords.lng, info.coords.lat, info.coords.lng)
				: null
		);
	}
	return out;
}

// Bauteil-9 (2026-06-09) Cross-Portal-Cluster-Reader.
// Liefert pro object_id eine Liste der ANDEREN Cluster-Mitglieder
// (id + portal) zur UI-Darstellung der „auch auf: ..."-Pille.
// Single-Member-Cluster werden mit null zurückgegeben (UI rendert
// dann nichts).
export function getClusterMembersForAllObjects(
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
	// Single-Member-Objects: explizit null setzen (UI-Konvention)
	for (const oid of objectIds) {
		if (!out.has(oid)) out.set(oid, null);
	}
	return out;
}

export function readAllCouncilObjects(
	status: 'alle' | CouncilStatusTag,
	sort: CouncilListSort,
	userId: number,
	homeCoords: { lat: number; lng: number } | null = null
): CouncilListItem[] {
	const db = getCouncilDb();
	if (!db) return [];

	const rows = db
		.prepare(
			`SELECT * FROM objects
			 WHERE object_class = 'annonce'
			 LIMIT 500`
		)
		.all() as CouncilObjectRow[];
	if (rows.length === 0) return [];

	// Bauteil-14: Cluster-aware effective status + reason.
	const substanceMap = resolveEffectiveSubstanceMap(
		rows.map((o) => o.id),
		userId,
		rows
	);

	// Borda-Rang aus letztem consolidated_top10-Lauf.
	const latestRow = db
		.prepare('SELECT MAX(computed_at) AS ts FROM consolidated_top10')
		.get() as { ts: string | null } | undefined;
	const bordaMap = new Map<string, number>();
	if (latestRow?.ts) {
		const top10Rows = db
			.prepare('SELECT object_id, rank FROM consolidated_top10 WHERE computed_at = ?')
			.all(latestRow.ts) as { object_id: string; rank: number }[];
		for (const r of top10Rows) bordaMap.set(r.object_id, r.rank);
	}

	// User-Rang fuer "mine"-Sort (cross-DB folio.user_rankings).
	const userRankMap = getUserTopRanksFor(userId);

	// 2026-06-05 (Korrektur 2): Distance-Map vorberechnen (Batch).
	const distanceMap = getDistancesForAllCouncilObjects(homeCoords);

	// Bauteil-9 (2026-06-09) Cluster-Mitglieder-Map (Batch cross-DB).
	const clusterMap = getClusterMembersForAllObjects(rows.map((o) => o.id));

	const items: CouncilListItem[] = [];
	for (const o of rows) {
		const sub = substanceMap.get(o.id);
		const effective = sub?.status.value.status_tag ?? o.status_tag;
		const source = sub?.status.value.source ?? 'council';
		const reason = sub?.status.value.reason ?? null;

		if (!effectiveMatchesFilter(effective, status)) continue;

		// Bauteil-11 D3-B (2026-06-10): cluster_rank_neighbor —
		// nur wenn dieses Object KEINEN user_rank hat aber ein Cluster-
		// Bruder einen rank>0 hat. Höchster Rang gewinnt (= niedrigste
		// Rang-Zahl, weil rank=1 ist Top).
		const ownRank = userRankMap.get(o.id) ?? null;
		const clusterMembersForObj = clusterMap.get(o.id) ?? null;
		let rankNeighbor: { object_id: string; rank: number; user_id: number } | null = null;
		if (ownRank == null && clusterMembersForObj) {
			let bestRank: number | null = null;
			let bestObj: string | null = null;
			for (const m of clusterMembersForObj) {
				const mr = userRankMap.get(m.id);
				if (mr != null && mr > 0 && (bestRank == null || mr < bestRank)) {
					bestRank = mr;
					bestObj = m.id;
				}
			}
			if (bestRank != null && bestObj != null) {
				rankNeighbor = { object_id: bestObj, rank: bestRank, user_id: userId };
			}
		}

		items.push({
			object: o,
			effective_status: effective as CouncilStatusTag | 'abgelaufen',
			override_source: source,
			status_provenance: sub?.status.provenance,
			note_provenance:
				sub?.note.provenance.kind === 'inherited' ? sub.note.provenance : undefined,
			override_reason: reason,
			borda_rank: bordaMap.get(o.id) ?? null,
			user_rank: ownRank,
			distance_km: distanceMap.get(o.id) ?? null,
			cluster_members: clusterMembersForObj,
			cluster_rank_neighbor: rankNeighbor
		});
	}

	// Sort: NULLS LAST fuer borda und mine.
	if (sort === 'borda') {
		items.sort((a, b) => {
			if (a.borda_rank == null && b.borda_rank == null) return 0;
			if (a.borda_rank == null) return 1;
			if (b.borda_rank == null) return -1;
			return a.borda_rank - b.borda_rank;
		});
	} else if (sort === 'mine') {
		items.sort((a, b) => {
			if (a.user_rank == null && b.user_rank == null) return 0;
			if (a.user_rank == null) return 1;
			if (b.user_rank == null) return -1;
			return a.user_rank - b.user_rank;
		});
	}
	// last_updated (default): SQL hat bereits keinen ORDER — wir sortieren JS-seitig
	else {
		items.sort((a, b) => {
			if (a.object.last_updated < b.object.last_updated) return 1;
			if (a.object.last_updated > b.object.last_updated) return -1;
			return 0;
		});
	}

	return items;
}

/** Gesamt-Counts pro status_tag für Filter-UI-Anzeige (alle 5 Werte). */
export function countObjectsByStatus(): Record<CouncilStatusTag, number> {
	const db = getCouncilDb();
	const out: Record<CouncilStatusTag, number> = {
		neu: 0,
		kaufen: 0,
		beobachten: 0,
		verworfen: 0,
		archiv: 0
	};
	if (!db) return out;
	const rows = db
		.prepare("SELECT status_tag, COUNT(*) AS n FROM objects WHERE object_class='annonce' GROUP BY status_tag")
		.all() as { status_tag: CouncilStatusTag; n: number }[];
	for (const r of rows) {
		out[r.status_tag] = r.n;
	}
	return out;
}

/**
 * Desktop-Bugs (2026-05-31): Counts ueber effective-status, mit Override-Merge.
 * countObjectsByStatus zaehlt naive council.status_tag — diskrepant zur Liste,
 * die effective_status zeigt. Hier delegieren wir an readAllCouncilObjects
 * fuer eine konsistente Wahrheit. 'abgelaufen' faellt unter 'archiv' fuer die
 * UI (keine eigene Filter-Pill).
 */
export function countObjectsByEffectiveStatus(
	userId: number
): Record<CouncilStatusTag, number> {
	const items = readAllCouncilObjects('alle', 'last_updated', userId);
	const out: Record<CouncilStatusTag, number> = {
		neu: 0,
		kaufen: 0,
		beobachten: 0,
		verworfen: 0,
		archiv: 0
	};
	const buckets: CouncilStatusTag[] = ['neu', 'kaufen', 'beobachten', 'verworfen', 'archiv'];
	for (const it of items) {
		for (const b of buckets) {
			if (effectiveMatchesFilter(it.effective_status, b)) {
				out[b]++;
				break;
			}
		}
	}
	return out;
}
