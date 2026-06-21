// F.4.C — Heuristik-Tier-Inferenz client-side (Plan v13 D5).
//
// feedback.db.heuristic_markers ist ein JSON-Array von strings.
// Prefix-Pattern: 'paketzustellung:*', 'tier1:*', 'tier2:*', 'privat:*', sonst T3.
// T0 (paketzustellung) share T1-Badge-Color per Token-Sign-off T4.

export type Tier = 'T0' | 'T1' | 'T2' | 'T3';

export function inferTier(markersJson: string | null | undefined): Tier {
	if (!markersJson) return 'T3';
	let m: string[];
	try {
		const parsed = JSON.parse(markersJson);
		if (!Array.isArray(parsed)) return 'T3';
		m = parsed;
	} catch {
		return 'T3';
	}
	if (m.some((x) => typeof x === 'string' && x.startsWith('paketzustellung:'))) return 'T0';
	if (m.some((x) => typeof x === 'string' && x.startsWith('tier1:'))) return 'T1';
	if (
		m.some((x) => typeof x === 'string' && (x.startsWith('tier2:') || x.startsWith('privat:')))
	)
		return 'T2';
	return 'T3';
}

// Tier-Color-Class-Mapping (Tailwind utility-classes, generiert aus app.css @theme).
// T0 share T1-Badge per Sign-off T4 (Engineer-Empfehlung Token-Mapping §6 T4).
export const TIER_CLASS: Record<Tier, { bg: string; fg: string; label: string }> = {
	T0: { bg: 'bg-tier-1-bg', fg: 'text-tier-1-fg', label: 'T0' },
	T1: { bg: 'bg-tier-1-bg', fg: 'text-tier-1-fg', label: 'T1' },
	T2: { bg: 'bg-tier-2-bg', fg: 'text-tier-2-fg', label: 'T2' },
	T3: { bg: 'bg-tier-3-bg', fg: 'text-tier-3-fg', label: 'T3' }
};
