// Review-Followup D.10 2026-05-27: pre-compute der für eine konkrete Mail
// tatsächlich relevanten Regeln aus regelwerk + user_context. Wird im Page-
// Server-Loader pro Row attached, vom DetailPanel-Info-Icon angezeigt.
//
// Datenquelle: regelwerk.yaml + user_context.yaml (beide via existierende
// Loader). Keine Cross-Repo-Writes, reine Read-Compute.
//
// 2026-05-28 Aufräum-Iteration Bug 1: Distanz-Sichtbarkeit. ActiveRules trägt
// jetzt zusätzlich die tatsächlich gemessene Luftlinie (haversine(home, mail))
// + city-Label, gerendert in EvidenceRules neben der Schwelle.

import type { Actionability, Domain, TimeDecayConfig, UserContext } from '$lib/server/feedback/time-decay.js';
import type { Regelwerk } from '$lib/server/regelwerk/loader.js';
import { extractPlzInfo, haversineKm } from '$lib/util/distance.js';

const DOMAIN_PRIORITY_MAP: Partial<Record<Domain, string>> = {
	immo: 'hauskauf',
	job: 'jobsuche'
};

export interface ActiveRules {
	/** Priority-key (z.B. 'hauskauf') wenn diese Mail in einer aktiven
	 *  Lebenssituation liegt; null wenn Domain keine Priority hat oder
	 *  Priority nicht aktiv ist. */
	active_priority: string | null;
	/** Distanz-Schwelle in km aus priority_relevance — null wenn keine
	 *  Priority aktiv ist oder kein max_distance_km definiert ist. */
	distance_threshold_km: number | null;
	/** Tatsächlich gemessene Luftlinie aus haversine(home_plz_coords, mail_plz_coords).
	 *  null wenn keine plz_coords im marker-set ODER kein home-coord (User hat
	 *  keine PLZ gesetzt / nicht in HOME_COORDS-Map). 2026-05-28 Bug 1. */
	distance_actual_km: number | null;
	/** City aus plz_city-marker (für Anzeige neben der Distanz). 2026-05-28 Bug 1. */
	distance_actual_city: string | null;
	/** Was passiert bei unbekannter PLZ (priority_relevance.fallback_unknown_plz). */
	fallback_unknown_plz: Actionability | null;
	/** Time-Decay-Werte für die Domain dieser Mail (frisch aus user_context). */
	time_decay: TimeDecayConfig | null;
	/** Protection-Clause (global, gilt für alle Mails — bei Stimmen-Disagreement). */
	protection_clause: string;
	/** 2026-06-05 (Korrektur 3): Marker, die in der Pipeline final-
	 *  actionability ueberschrieben haben (Step 7/8/9 in
	 *  domain_actionability.py). Wenn non-empty → archive-silent. UI
	 *  rendert das als sichtbaren Status-Block damit Whitelist-Marker
	 *  nicht „passt" suggerieren, obwohl Mail blockiert ist. */
	final_blockers: string[];
}

export function computeActiveRules(
	domain: string | null,
	regelwerk: Regelwerk,
	userContext: UserContext,
	heuristicMarkers: string[] | null | undefined,
	homeCoords: { lat: number; lng: number } | null
): ActiveRules {
	const d = (domain ?? '') as Domain;
	const priorityKey = DOMAIN_PRIORITY_MAP[d] ?? null;
	const priorityActive =
		priorityKey != null && userContext.active_priorities.includes(priorityKey);
	const rule = priorityActive && priorityKey ? regelwerk.priority_relevance[priorityKey] : undefined;

	// 2026-05-28 Bug 1: gemessene Distanz aus plz_coords-Marker + home-Coord.
	const plz = extractPlzInfo(heuristicMarkers);
	let distance_actual_km: number | null = null;
	if (plz.coords && homeCoords) {
		distance_actual_km = haversineKm(homeCoords.lat, homeCoords.lng, plz.coords.lat, plz.coords.lng);
	}

	// 2026-06-05 (Korrektur 3): final_blockers aus heuristic_markers
	// extrahieren. Step 7/8/9 in domain_actionability.py setzen Marker mit
	// Prefix out_of_country/out_of_corridor/blocked_by, wenn sie
	// archive-silent triggern. UI rendert das als Status-Block.
	const blockerPrefixes = ['out_of_country:', 'out_of_corridor:', 'blocked_by:'];
	const final_blockers = (heuristicMarkers ?? []).filter((m) =>
		blockerPrefixes.some((p) => m.startsWith(p))
	);

	return {
		active_priority: priorityActive ? priorityKey : null,
		distance_threshold_km: rule?.max_distance_km ?? null,
		distance_actual_km,
		distance_actual_city: plz.city,
		fallback_unknown_plz: rule?.fallback_unknown_plz ?? null,
		time_decay: userContext.time_decay[d] ?? null,
		protection_clause: regelwerk.voice_consensus.protection_clause.on_disagreement,
		final_blockers
	};
}
