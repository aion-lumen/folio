// 2026-06-05 (C3): One-Liner-Zusammenfassung der Klassifikations-Entscheidung.
// UI-seitige Reduktion aus Markern + domain + actionability — Engineer-
// Empfehlung statt Worker-Refactor (Direktive Teil 3 Alternative).
// Wenn UI-Reduktion sich als zu fragil erweist: spaeter Worker-seitige
// `one_liner_explanation`-Spalte als Folge-Direktive.

const COUNTRY_LABELS: Record<string, string> = {
	FR: 'Frankreich',
	IT: 'Italien',
	AT: 'Österreich',
	LI: 'Liechtenstein'
};

export interface ClassificationContext {
	domain?: string | null;
	actionability?: string | null;
	effective_actionability?: string | null;
	heuristic_markers?: string[] | null;
}

function displayDomain(domain: string | null | undefined): string {
	if (domain === 'job-lead' || domain === 'job') return 'Job';
	return domain ?? '—';
}

export function summarizeClassification(ctx: ClassificationContext): string {
	const action = ctx.effective_actionability ?? ctx.actionability ?? 'actionable';
	const isArchive = action === 'archive-silent' || action === 'archive';
	const prefix = isArchive ? 'Archive' : 'Actionable';
	const markers = ctx.heuristic_markers ?? [];

	// Archive-Praezisierung: warum?
	if (isArchive) {
		// Hoechste Praezision: blocked_by-Marker (tier1-Blocker aus 2026-06-05)
		if (markers.includes('blocked_by:projektiert:true')) {
			return `${prefix}: Neubau-Projekt-Anbieter`;
		}
		if (markers.includes('blocked_by:zwangsversteigerung:true')) {
			return `${prefix}: Zwangsversteigerung`;
		}
		// PLZ-Country-Filter (2026-05-28)
		const oocMarker = markers.find((m) => m.startsWith('out_of_country:'));
		if (oocMarker) {
			const code = oocMarker.split(':')[1] ?? '?';
			return `${prefix}: ${COUNTRY_LABELS[code] ?? code}-Filter`;
		}
		// Sender-priorisiert always-archive
		const senderPrio = markers.find((m) => m.startsWith('sender_priority'));
		if (senderPrio) return `${prefix}: Sender-Priorität`;
		// Price ueber Schwelle
		const priceM = markers.find((m) => m.startsWith('tier2:price_over_threshold'));
		if (priceM) return `${prefix}: zu teuer`;
		// Ort nicht in Whitelist
		const locOut = markers.find((m) => m.startsWith('tier2:location_outside'));
		if (locOut) {
			const loc = locOut.split(':').slice(-1)[0];
			return `${prefix}: Ort nicht in Whitelist (${loc})`;
		}
		// System-Domain (werbung etc.)
		const sysDom = markers.find((m) => m.startsWith('system:domain'));
		if (sysDom) return `${prefix}: ${displayDomain(ctx.domain)}`;
		// Fallback: domain + erster Marker (vor dem Doppelpunkt)
		const firstMarker = markers[0];
		if (firstMarker) {
			const cat = firstMarker.split(':')[0];
			return `${prefix}: ${displayDomain(ctx.domain)} · ${cat}`;
		}
		return `${prefix}: ${displayDomain(ctx.domain)}`;
	}

	// Actionable-Praezisierung: woher?
	const portalM = markers.find((m) => m.startsWith('tier1:portal_domain'));
	const whitelistM = markers.find((m) => m.startsWith('tier2:location_whitelist'));
	const parts: string[] = [];
	if (ctx.domain) parts.push(displayDomain(ctx.domain));
	if (portalM) parts.push('Portal-Sender');
	if (whitelistM) {
		const loc = whitelistM.split(':').slice(-1)[0];
		parts.push(`Whitelist (${loc})`);
	}
	return parts.length > 0 ? `${prefix}: ${parts.join(' + ')}` : `${prefix}: ${displayDomain(ctx.domain)}`;
}
