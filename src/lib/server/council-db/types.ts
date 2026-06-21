// Council V2 Cross-DB Types (Bauteil 3, 2026-05-28).
// Folio liest council.db read-only — Schreibseite ist im council-Repo
// (council_lens_run.py + council_borda.py + ingest_from_mail.py --write-db).

export type CouncilObjectClass = 'annonce' | 'update' | 'transaktion';
export type CouncilStatusTag = 'neu' | 'kaufen' | 'beobachten' | 'verworfen' | 'archiv';

export interface CouncilObjectRow {
	id: string;
	source_url: string;
	portal: string;
	address: string | null;
	qm: number | null;
	bj: number | null;
	price_value: number | null;
	price_currency: string | null;
	photo_url: string | null;
	object_class: CouncilObjectClass;
	status_tag: CouncilStatusTag;
	times_seen: number;
	last_seen: string;
	title: string | null;
	description: string | null;
	/** JSON-Array von feedback_ids (multi-agent.feedback.id) — durch
	 *  ingest_from_mail.py gesetzt. Folio liest für Reverse-Lookup
	 *  feedback_id → council-object (Mail-Detail qm/preis-Pillen). */
	from_feedback_ids: string | null;
	created_at: string;
	last_updated: string;
}

export interface CouncilConsolidatedRow {
	id: number;
	object_id: string;
	borda_score: number;
	rank: number;
	computed_at: string;
}

export interface CouncilRankingRow {
	id: number;
	participant_id: string;
	object_id: string;
	rank: number;
	recorded_at: string;
}

// Council-Voice für 3-Lens-Streifen-Display in Folio. Parallel zu Mail-Voice
// in $lib/server/lenses/voices.ts — unterschiedliche Datenachse (score vs domain).
export type CouncilConfidence = 'low' | 'medium' | 'high';

export type CouncilVoice =
	| {
			kind: 'present';
			lens_id: string; // z.B. 'lens-baumeister'
			label: string; // z.B. 'Baumeister'
			rank: number; // 1..10 in der Lens-eigenen Top-10
			score_bucket: 'top' | 'mid' | 'low'; // abgeleitet aus rank (1-3 / 4-7 / 8-10)
			confidence: CouncilConfidence | null;
	  }
	| {
			kind: 'missing';
			lens_id: string;
			label: string;
	  };

// Konsens-State analog Mail: still wenn alle 3 Lenses gleicher Bucket,
// ne bei 1 Abweicher, ne-strong bei drei verschiedenen Buckets oder ≤1 voter.
export type CouncilConsensusState = 'still' | 'ne' | 'ne-strong';

export interface CouncilTopObject {
	// Object-Stammdaten
	object: CouncilObjectRow;
	// Borda-Position (raw, ohne Distance-Justage)
	borda_score: number;
	borda_rank: number;
	// 2026-06-09 Bauteil 2.9 (E5): Distance-Malus.
	// distance_km: null wenn keine plz_coords aus feedback oder kein homePlz.
	// distance_weight: 1.0 (nah) bis 0.55 (>50km) — siehe distanceWeight().
	// borda_score_adjusted: borda_score * distance_weight.
	// UI sortiert nach adjusted (CouncilTopObject[]-Reihenfolge), zeigt raw
	// borda_rank als Audit-Trail.
	distance_km: number | null;
	distance_weight: number;
	borda_score_adjusted: number;
	// Lens-Stimmen (genau 3 Slots, missing-Stimmen für nicht-gerankt-bei-dieser-Lens)
	voices: CouncilVoice[];
	consensus_state: CouncilConsensusState;
}

export interface CouncilPersonaMeta {
	id: string; // z.B. 'lens-baumeister'
	label: string; // z.B. 'Der Baumeister'
	bewertungsachse: string;
	lm_studio_model?: string; // z.B. 'qwen3-30b-a3b-thinking-2507'
}
