import { existsSync } from 'node:fs';
import {accounts} from '$lib/server/mail-intake/accounts.js';
import {normalizeAccountId, unregisteredMailAccounts} from '$lib/util/mail-account.js';
import { mailWorkContext } from '$lib/server/mail-intake/work-status.js';
import { MAIL_WORK_LABELS, type MailWorkState } from '$lib/util/mail-work-status.js';
// F.4.C — URL-Filter-Binding + Mock-Splice (P1 serverside Mock-Daten-Einspeisung).
// All configured accounts share the read-only feedback store.
// Filters aus URL parsen, Filter-aware fetching + sortieren.

import type { PageServerLoad } from './$types.js';
import { getFeedbackRowById, getFeedbackRows } from '$lib/server/feedback/reader.js';
import { companionMail } from '$lib/server/focus/mail.js';
import {
	getLatestCorrectionMap,
	getLatestMailOverrideMap,
	getReviewedIds,
	getValidatorOpinionMap,
	getValidatorOpinionsMap
} from '$lib/server/folio-db/reader.js';
import { applyTimeDecay, loadUserContext } from '$lib/server/feedback/time-decay.js';
import { loadRegelwerk } from '$lib/server/regelwerk/loader.js';
import { computeActiveRules } from '$lib/server/regelwerk/active-rules.js';
import { getHomePlz, getFeedbackDbPath } from '$lib/server/env.js';
import { hasModuleCapability } from '$lib/server/modules/index.js';
import { mailRelaySourceRef } from '$lib/server/relay/mail.js';
import { enforceRelayRetention, listRelayCases, listRelayMailDrafts } from '$lib/server/relay/store.js';
import { buildVotesForFeedback, stripeState } from '$lib/server/lenses/voices.js';
// F.8 BUG-F1 Fix: Mock-Hydration aus normalem Lade-Pfad entfernt.
// getStressRows bleibt für ?stress=N (Performance-Smoke). getMockRows nicht
// mehr importiert — Fresh-Start-Phase nutzt nur echte Worker-Daten.
import { getStressRows } from '$lib/util/mail-mock.js';
import {
	applyFilters,
	filtersFromUrl,
	unifyFeedbackRow,
	unifyMockRow,
	type UnifiedMailRow
} from '$lib/stores/mailQueue.svelte.js';
import type { ActionabilityKey } from '$lib/util/mail-account.js';
import type { FeedbackRow } from '$lib/server/feedback/types.js';

// SQLite-Standard "YYYY-MM-DD HH:MM:SS" (UTC, Space-Separator) vs ISO
// "YYYY-MM-DDTHH:MM:SS.sssZ". String-Vergleich kippt weil 'T'(84) > ' '(32)
// — beide Formate auf Millis normalisieren fuer korrekten Vergleich.
function parseTs(s: string): number {
	const iso = s.includes('T') ? s : s.replace(' ', 'T') + 'Z';
	return new Date(iso).getTime();
}

export const load: PageServerLoad = async ({ url }) => {
	const filters = filtersFromUrl(url.searchParams);
 const sourceAvailable=existsSync(getFeedbackDbPath());
	const searchQuery = url.searchParams.get('q')?.trim().slice(0, 200) ?? '';
	const feedbackParam = url.searchParams.get('feedback') ?? '';
	const selectedFeedbackId = /^[1-9]\d{0,8}$/.test(feedbackParam) ? Number(feedbackParam) : null;
	const selectedFeedback = selectedFeedbackId && sourceAvailable ? getFeedbackRowById(selectedFeedbackId) : null;
	const stressParam = url.searchParams.get('stress');
	const stressCount = stressParam ? parseInt(stressParam, 10) : 0;

	let allRows: UnifiedMailRow[];
	if (Number.isFinite(stressCount) && stressCount > 0) {
		// F.4.F Performance-Smoke: replace data with N synthetic rows.
		allRows = getStressRows(stressCount).map(unifyMockRow);
	} else {
		// Only imported rows; synthetic stress data requires an explicit query parameter.
		const yahooRowsRaw = !sourceAvailable ? [] : selectedFeedback ? [selectedFeedback] : searchQuery
			? companionMail(searchQuery, 100).sources.map((source) => getFeedbackRowById(source.feedbackId)).filter((row): row is FeedbackRow => row !== null)
			: getFeedbackRows({ limit: 5000 });
		// F.5 + F.7 In-Memory-JOINs: corrections, reviewed-set, validator-opinions.
		const correctionMap = getLatestCorrectionMap();
		// 2026-06-06 Bauteil 2: latest-wins User-Override fuer Mail-Status
		// (insb. manuelle „→ Übernommen"-Klicks). Hat Vorrang vor correction
		// und time-decay.
		const mailOverrideMap = getLatestMailOverrideMap();
		const reviewedIds = getReviewedIds();
		const validatorMap = getValidatorOpinionMap(); // singular, legacy für Detail-Panel
		// Lens-UI Stimmen-Streifen: multi-opinion + regelwerk-voice-order für die Liste.
		const validatorOpinionsMap = getValidatorOpinionsMap();
		const regelwerk = loadRegelwerk();
		const regelwerkVoices = (regelwerk.voice_consensus?.voices ?? []).map((v) => ({
			id: v.id,
			role: v.role,
			lm_studio_model: v.lm_studio_model ?? null,
			enabled: v.enabled
		}));
		// F.8 Apply Time-Decay dynamisch (Worker frozen actionability + user-context).
		const userContext = loadUserContext();
		// 2026-05-28 Bug 1: Home-Coords einmalig für Distanz-Berechnung pro Row.
		const homePlz = getHomePlz();
		const homeCoords = homePlz ? { lat: homePlz.lat, lng: homePlz.lng } : null;
		const relayBySource = new Map<string, ReturnType<typeof listRelayCases>[number]>();
		const relayDraftByCase = new Map<string, ReturnType<typeof listRelayMailDrafts>[number]>();
		if (hasModuleCapability('relay', 'retention.enforce')) enforceRelayRetention();
		if (hasModuleCapability('relay', 'cases.read')) {
			for (const relayCase of listRelayCases()) {
				if (relayCase.source_kind === 'mail' && !relayBySource.has(relayCase.source_ref)) {
					relayBySource.set(relayCase.source_ref, relayCase);
				}
			}
		}
		if (hasModuleCapability('relay', 'responses.read')) {
			for (const draft of listRelayMailDrafts()) relayDraftByCase.set(draft.case_id, draft);
		}
		const workContext=mailWorkContext();
		const yahooRows: UnifiedMailRow[] = yahooRowsRaw.map((r) => {
			const unified = unifyFeedbackRow(r);
			const relayCase = relayBySource.get(mailRelaySourceRef(r.account_id, r.imap_uid));
			const relayDraft = relayCase ? relayDraftByCase.get(relayCase.case_id) : undefined;
			// 2026-06-08 Bauteil 2.7 (Aufgabe 3): latest-wins zwischen Override
			// und Correction. Vorher: fixe Prioritaet override → correction →
			// time-decay. Bug: User „→ Übernommen" (override, t1), danach „A"
			// fuer Archiv-stumm (correction, t2 > t1) — uebernommen blieb
			// kleben weil override fix Vorrang hatte. Jetzt: Timestamp-
			// Vergleich entscheidet. Bei Equal-Tie wins Override (explizite
			// Aktion vor Korrektur). Correction ohne corrected_actionability
			// (z.B. nur domain) faellt durch zur Override-Wahl.
			//
			// FORMAT-MISMATCH-FALLE: recorded_at ist SQLite-Standard
			// „YYYY-MM-DD HH:MM:SS" (UTC, Space-Separator), corrected_at ist
			// ISO „YYYY-MM-DDTHH:MM:SS.sssZ". String-Vergleich kippt weil
			// 'T'(84) > ' '(32) — Correction würde IMMER groesser scheinen,
			// egal welche Uhrzeit. Loesung: parseTs() normalisiert beide
			// Formate auf Millis und vergleicht numerisch.
			const correctionRow = correctionMap.get(r.id);
			const mailOverride = mailOverrideMap.get(r.id);
			const overrideTs = mailOverride?.recorded_at;
			const correctionAct = correctionRow?.corrected_actionability;
			const correctionTs = correctionRow?.corrected_at;
			let userChosen: ActionabilityKey | null = null;
			if (overrideTs && correctionAct && correctionTs) {
				userChosen = parseTs(overrideTs) >= parseTs(correctionTs)
					? (mailOverride!.overridden_actionability as ActionabilityKey)
					: (correctionAct as ActionabilityKey);
			} else {
				userChosen =
					(mailOverride?.overridden_actionability as ActionabilityKey | undefined)
					?? (correctionAct as ActionabilityKey | undefined)
					?? null;
			}
			unified.effective_actionability =
				userChosen ??
				applyTimeDecay(r.domain, r.actionability, r.mail_date, userContext) ??
				unified.actionability ??
				null;
			// Lens-UI: build four base voices plus an optional disagreement review.
			const opinions = validatorOpinionsMap.get(r.id) ?? [];
			const voices = buildVotesForFeedback(
				{
					domain: r.domain,
					actionability: r.actionability,
					effective_actionability: unified.effective_actionability,
					heuristic_reason: r.heuristic_reason,
					heuristic_markers: unified.heuristic_markers
				},
				opinions.map((o) => ({
					validator_model: o.validator_model,
					validator_domain: o.validator_domain ?? null,
					validator_actionability: o.validator_actionability ?? null,
					validator_confidence: o.validator_confidence ?? null,
					validator_reasoning: o.validator_reasoning ?? null
				})),
				regelwerkVoices
			);
			const consensusState = stripeState(voices);
			// D.10: per-row active rules from regelwerk + user_context.
			// 2026-05-28 Bug 1: zusätzlich parsed-Markers (unified.heuristic_markers) +
			// home-Coords für gemessene Distanz im EvidenceRules-Display.
			const activeRules = computeActiveRules(
				r.domain,
				regelwerk,
				userContext,
				unified.heuristic_markers,
				homeCoords
			);
			return {
				...unified,
				relay_case_id: relayCase?.case_id ?? null,
				relay_status: relayCase?.status ?? null,
				relay_draft: relayDraft
					? {
						draft_id: relayDraft.draft_id,
						case_id: relayDraft.case_id,
						subject: relayDraft.subject,
						body: relayDraft.body,
						created_at: relayDraft.created_at,
						updated_at: relayDraft.updated_at
					}
					: null,
				correction: correctionMap.get(r.id) ?? null,
				reviewed: reviewedIds.has(r.id),
				work: workContext.status(r),
				validator_opinion: validatorMap.get(r.id) ?? null,
				voices,
				consensus_state: consensusState,
				active_rules: activeRules
			};
		});
		// F.8 BUG-F1: Keine Mock-Hydration mehr. allRows = nur echte Worker-Daten.
		allRows = yahooRows;
	}

	// F.7 Unreviewed-Filter (kann auch in applyFilters wandern; hier inline weil server-only)
	const unreviewedOnly = url.searchParams.get('unreviewed') === '1';
	let workingRows = allRows;
	if (unreviewedOnly) {
		workingRows = workingRows.filter((r) => !r.reviewed);
	}

	// Apply filters serverside (account, actions, sender, disagreement, sort)
	const workParam=url.searchParams.get('work')??'all';
	const workFilter=workParam in MAIL_WORK_LABELS?workParam as MailWorkState:'all';
	const scopeRows=applyFilters(workingRows,filters);
	const workCounts:Record<string,number>={all:scopeRows.length,decision:0,automatic:0,technical:0,inbox:0};
	for(const row of scopeRows)workCounts[row.work?.state??'inbox']++;
	const filteredRows=workFilter==='all'?scopeRows:scopeRows.filter(r=>r.work?.state===workFilter);

	// 4) Stats für AccountFilterRow (always all-accounts counts, even when filter active)
	const countsByAccount: Record<string, number> = {};
	const unreviewedByAccount: Record<string, number> = {};
	for (const r of allRows) {
		countsByAccount[r.account] = (countsByAccount[r.account] ?? 0) + 1;
		if (!r.reviewed) {
			unreviewedByAccount[r.account] = (unreviewedByAccount[r.account] ?? 0) + 1;
		}
	}

	// F.9 Block-2: recentRuns wandern auf /pipeline (eigene Route, eigener Load).
	const registeredAccounts = accounts();
	return {
		rows: filteredRows,workFilter,workCounts,
  mailAccounts:Object.fromEntries(registeredAccounts.map(a=>[normalizeAccountId(a.id),{id:normalizeAccountId(a.id),label:a.label,addr:'',desc:''}])),
  unregisteredAccounts: unregisteredMailAccounts(countsByAccount, registeredAccounts.map(a => a.id)),
		selectedFeedbackId: selectedFeedback?.id ?? null,
		sourceAvailable, allRowsCount: allRows.length,
		countsByAccount,
		unreviewedByAccount,
		filters,
		unreviewedOnly,
		searchQuery,
		// Council capability for this vault — gates the "→ Übernommen" action (demo = not registered).
		councilRegistered: hasModuleCapability('council', 'ingest.write')
	};
};
