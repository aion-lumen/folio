// Lens-UI Stimmen-Streifen — server-side Voice/Domain types + stripeState.
//
// Quelle: Handoff 3 Bundle `Folio Mail-Queue - Stimmen-Streifen (final).html`
// §V Datenkontrakt + §I Berechnungsregel. UI-spezifisch (Bühnen-State); NICHT
// zu verwechseln mit voice_consensus.py (Python, Routing-Logik für Pipeline-
// Konsens auf domain×action). Per Bundle ist stripeState eine reine UI-Funktion
// auf der Domain-Verteilung der vorhandenen Lenses.
//
// Direktiven-Constraints (lens-ui-2026-05-26.md):
//  - §2.2: Server-side Mirror, pre-compute pro Mail
//  - §2.3: missing-Lens zählt nicht zur Stimmenzahl (3-von-3 einig = still)
//  - §VI: keine v3/v4-Reflexe (Ember = Disagreement, NICHT Reife)

import type {
	Domain as PipelineDomain,
	Actionability,
} from '$lib/server/feedback/time-decay.js';

// Bundle's Domain-Vokabular (final.html §V). Im Folio-Pipeline-Code heißen die
// Domains identisch außer "shopping" (Pipeline) vs. "shop" (Bundle).
export type LensDomain =
	| 'immo'
	| 'job'
	| 'werbung'
	| 'kontakt'
	| 'shop'
	| 'finance'
	| 'system'
	| 'unsorted';

export type LensReason = 'disabled' | 'swap_failed' | 'timeout' | 'error';

export type Voice =
	| {
			kind: 'present';
			label: string; // 'H' | 'L1' | 'L2' | 'L3'
			domain: LensDomain;
			confidence?: number;
			reasoning?: string; // panel-c werkstatt: für EvidenceVoices-Card
			modelId?: string | null; // panel-c werkstatt: missing-row zeigt model + reason
	  }
	| {
			kind: 'missing';
			label: string;
			reason: LensReason;
			modelId?: string | null; // panel-c werkstatt: „[L2] · qwen3-30b · timeout"
	  };

export type ConsensusState = 'still' | 'ne' | 'ne-strong';

/** Map Pipeline-Domain to UI-Domain. Pipeline uses "shopping", Bundle uses "shop". */
export function toLensDomain(d: PipelineDomain | string | null | undefined): LensDomain {
	if (d === 'shopping') return 'shop';
	// Legacy/worker alias used for mails sent to the dedicated job inbox.
	// It is provenance, not a ninth UI domain: show it consistently as Job.
	if (d === 'job-lead') return 'job';
	const known: LensDomain[] = ['immo', 'job', 'werbung', 'kontakt', 'shop', 'finance', 'system', 'unsorted'];
	return (known as string[]).includes(d as string) ? (d as LensDomain) : 'unsorted';
}

/**
 * Compute the Stripe-State per Bundle §I-V Berechnungsregel:
 *  - present.length <= 1  → ne-strong (nicht genug Voter)
 *  - alle gleich          → still
 *  - genau eine Abweichung → ne
 *  - sonst (Patt, fragmentiert) → ne-strong
 *
 * Missing voices zählen NICHT zur Gesamtzahl.
 */
export function stripeState(voices: Voice[]): ConsensusState {
	const present = voices.filter((v): v is Extract<Voice, { kind: 'present' }> => v.kind === 'present');
	if (present.length <= 1) return 'ne-strong';

	const counts = new Map<LensDomain, number>();
	for (const v of present) {
		counts.set(v.domain, (counts.get(v.domain) ?? 0) + 1);
	}
	const sorted = [...counts.values()].sort((a, b) => b - a);
	const top = sorted[0] ?? 0;
	const second = sorted[1] ?? 0;

	if (second === 0) return 'still'; // alle einig
	if (top > second && second === 1) return 'ne'; // genau eine Abweichung
	return 'ne-strong'; // Patt oder fragmentiert
}

/** Input row shape — minimal subset of UnifiedMailRow for vote-building. */
export interface VoteInputFeedback {
	domain?: string | null;
	actionability?: Actionability | string | null;
	effective_actionability?: Actionability | string | null;
}

export interface VoteInputOpinion {
	validator_model: string;
	validator_domain: string | null;
	validator_actionability: string | null;
	validator_confidence: number | null;
	validator_reasoning?: string | null; // panel-c werkstatt: für EvidenceVoices-Card
}

/** Heuristik-Voice braucht eigene reasoning-Quelle (feedback.heuristic_reason). */
export interface VoteInputFeedbackExtras {
	heuristic_reason?: string | null;
	heuristic_markers?: string[] | null;
}

const DOMAIN_LABELS: Record<LensDomain, string> = {
	immo: 'Immobilien',
	job: 'Job',
	werbung: 'Werbung',
	kontakt: 'Kontakt',
	shop: 'Shopping',
	finance: 'Finanzen',
	system: 'System',
	unsorted: 'Unsortiert'
};

/**
 * The stored heuristic_reason predates the general domain classifier and is
 * often an Immo-only negative (for example "keine Immo-Indikatoren"). Such a
 * sentence is useful evidence for an Immo classification, but misleading as
 * the explanation of a Job/Finance/etc. vote. Prefer the deterministic signal
 * that actually selected the domain and keep the legacy detail for Immo only.
 */
export function deterministicVoiceReason(
	domain: PipelineDomain | string | null | undefined,
	legacyReason: string | null | undefined,
	markers: string[] | null | undefined
): string | undefined {
	const normalized = toLensDomain(domain);
	if (normalized === 'immo') return legacyReason ?? undefined;

	const aliasMarker = (markers ?? []).find((marker) =>
		marker.startsWith('override:recipient_alias:')
	);
	if (aliasMarker) {
		const aliasDomain = aliasMarker.slice('override:recipient_alias:'.length);
		return `Empfänger-Alias → ${DOMAIN_LABELS[toLensDomain(aliasDomain)]}`;
	}

	return `Deterministische Einordnung → ${DOMAIN_LABELS[normalized]}`;
}

export interface RegelwerkVoiceMeta {
	id: string;
	role: string; // 'deterministic' | 'primary_llm' | 'control_llm' | ...
	lm_studio_model: string | null;
	enabled?: boolean;
}

/**
 * Build the 4-Voice array per Direktiven-Reihenfolge:
 *   Slot 0 = Heuristik (immer Stimmenkontrakt-Slot, kind=present aus feedback-row,
 *            kind=missing nur falls feedback-row keine Domain hat)
 *   Slot 1..3 = LLM-Lenses in regelwerk-Reihenfolge (gemma, qwen3.6, qwen-thinking)
 *
 * Pro LLM-Lens:
 *  - opinion in validator_opinions → kind='present'
 *  - opinion fehlt + enabled=false → kind='missing' reason='disabled'
 *  - opinion fehlt + enabled=true  → kind='missing' reason='error' (swap-failed
 *    oder noch-nie-gelaufen — caller kennt den Unterschied nicht direkt; default 'error')
 */
export function buildVotesForFeedback(
	feedback: VoteInputFeedback & VoteInputFeedbackExtras,
	opinions: VoteInputOpinion[],
	regelwerkVoices: RegelwerkVoiceMeta[]
): Voice[] {
	const voices: Voice[] = [];

	// Slot 0 — Heuristik. Bundle Slot-Label 'H'.
	const heurDomainRaw = feedback.domain ?? null;
	if (heurDomainRaw) {
		voices.push({
			kind: 'present',
			label: 'H',
			domain: toLensDomain(heurDomainRaw),
			reasoning: deterministicVoiceReason(
				heurDomainRaw,
				feedback.heuristic_reason,
				feedback.heuristic_markers
			),
			modelId: null,
		});
	} else {
		voices.push({ kind: 'missing', label: 'H', reason: 'error', modelId: null });
	}

	// Slot 1..N — LLM-Lenses in regelwerk-Reihenfolge.
	const llmVoices = regelwerkVoices.filter(
		(v) => v.role === 'primary_llm' || v.role === 'control_llm'
	);

	// Build opinion-lookup by model for O(1) match. Opinions are pre-sorted
	// DESC by evaluated_at (reader.ts ORDER BY) → first-seen = latest-wins.
	// Explicit `has`-guard so future upstream order-changes don't silently
	// invert the precedence (review-followup A.1 2026-05-27).
	const opinionByModel = new Map<string, VoteInputOpinion>();
	for (const o of opinions) {
		if (!opinionByModel.has(o.validator_model)) {
			opinionByModel.set(o.validator_model, o);
		}
	}

	let lensIdx = 0;
	for (const lensMeta of llmVoices) {
		lensIdx += 1;
		const label = `L${lensIdx}`;
		const enabled = lensMeta.enabled !== false;
		const model = lensMeta.lm_studio_model;

		if (!enabled) {
			voices.push({ kind: 'missing', label, reason: 'disabled', modelId: model });
			continue;
		}
		if (!model) {
			voices.push({ kind: 'missing', label, reason: 'error', modelId: null });
			continue;
		}
		const opinion = opinionByModel.get(model);
		if (!opinion || !opinion.validator_domain) {
			voices.push({ kind: 'missing', label, reason: 'error', modelId: model });
			continue;
		}
		voices.push({
			kind: 'present',
			label,
			domain: toLensDomain(opinion.validator_domain),
			confidence: opinion.validator_confidence ?? undefined,
			reasoning: opinion.validator_reasoning ?? undefined,
			modelId: opinion.validator_model,
		});
	}

	return voices;
}
