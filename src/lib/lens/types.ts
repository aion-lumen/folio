// Domain-agnostische Lens-Types (Klausel 1 aus 2026-05-31).
// Heimathafen fuer Typen, die mehrere Lens-Domains teilen — heute Council,
// spaeter Mail-Lenses (silent-Klassifizierer, Validator, Korrekturen),
// Job-Lenses, Kampagne-Lenses. Reader bleiben domain-spezifisch; nur die
// Type-Shapes konvergieren hier.

export type LensConfidence = 'low' | 'medium' | 'high';

/**
 * Volltext-Begruendung einer Lens fuer ein einzelnes Objekt.
 * Source-DB variiert je Domain (council.lens_comparisons.reason,
 * mail.validator_opinions.reasoning, etc.) — Reader bringen ihre eigene
 * Aggregation, schicken aber alle dieselbe Shape ins UI.
 */
export type LensReason = {
	lens_id: string;
	label: string;
	reason: string | null;
	confidence: LensConfidence | null;
	rank: number | null;
	recorded_at: string;
};
