// 2026-05-25 Block 3 — Haversine-Distance + Format-Helper für DetailPanel.
// (Direktive bugs-links-distanz Block 3)

/** Earth radius in km */
const EARTH_R_KM = 6371;

/** Convert degrees to radians. */
function toRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

/**
 * Haversine-Luftlinie zwischen zwei (lat, lng)-Punkten in Kilometern.
 * Returnt eine Zahl (km) — kein Routing, nur Luftlinie.
 */
export function haversineKm(
	lat1: number,
	lng1: number,
	lat2: number,
	lng2: number
): number {
	const dLat = toRad(lat2 - lat1);
	const dLng = toRad(lng2 - lng1);
	const a =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return EARTH_R_KM * c;
}

/**
 * Format distance for UI: "~5 km" (< 10), "~12 km" (< 100), "~280 km" (>= 100).
 * Direktive: explizit als "Luftlinie" labeln (im DetailPanel).
 */
export function formatDistanceKm(km: number): string {
	if (km < 1) return '< 1 km';
	if (km < 10) return `~${km.toFixed(1)} km`;
	return `~${Math.round(km)} km`;
}

/**
 * Parse "lat,lng" string aus PLZ-Marker. Returnt {lat,lng} oder null.
 */
export function parseCoords(s: string | null | undefined): { lat: number; lng: number } | null {
	if (!s) return null;
	const m = s.match(/^(-?\d+\.?\d*),(-?\d+\.?\d*)$/);
	if (!m) return null;
	const lat = parseFloat(m[1]);
	const lng = parseFloat(m[2]);
	if (isNaN(lat) || isNaN(lng)) return null;
	return { lat, lng };
}

/**
 * Extract PLZ-Markers aus row.heuristic_markers array.
 * Marker-Format vom Worker:
 *   "plz:8000", "plz_city:Faro", "plz_country:PT", "plz_coords:37.0194,-7.9322"
 */
export interface PlzInfo {
	plz: string | null;
	city: string | null;
	country: string | null;
	coords: { lat: number; lng: number } | null;
}

export function extractPlzInfo(markers: string[] | null | undefined): PlzInfo {
	const out: PlzInfo = { plz: null, city: null, country: null, coords: null };
	if (!markers) return out;
	for (const m of markers) {
		if (m.startsWith('plz:')) out.plz = m.slice(4);
		else if (m.startsWith('plz_city:')) out.city = m.slice(9);
		else if (m.startsWith('plz_country:')) out.country = m.slice(12);
		else if (m.startsWith('plz_coords:')) out.coords = parseCoords(m.slice(11));
	}
	return out;
}
