/** Supported single-fact edits; graph-linked application objects need a separate review. */
export const CORRECTION_KINDS = [
	{ predicate: 'decided', dataClass: 'decision', label: 'Entscheidung / Bewilligung' },
	{ predicate: 'committed_to', dataClass: 'commitment', label: 'Zusage' },
	{ predicate: 'has_context', dataClass: 'context', label: 'Kontext' },
	{ predicate: 'scheduled_for', dataClass: 'appointment', label: 'Termin' },
	{ predicate: 'paid', dataClass: 'transaction', label: 'Tatsächlich erfolgte Zahlung' },
	{ predicate: 'available_at', dataClass: 'availability', label: 'Verfügbarkeit' },
	{ predicate: 'prefers', dataClass: 'preference', label: 'Präferenz' },
	{ predicate: 'has_profile_fact', dataClass: 'profile', label: 'Profilangabe' },
	{ predicate: 'has_project_fact', dataClass: 'project_fact', label: 'Projektangabe' }
] as const;
