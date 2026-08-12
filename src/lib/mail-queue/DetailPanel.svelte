<!--
  Panel-C Werkstatt (Direktive 2, 2026-05-27) — Orchestrator.
  Hierarchie: Header → Verdikt-Bühne → 3 Karteikarten → Mail-Body.
  Disagreement-Signal: 4-px-Ember-Top-Border in VerdictStage (eine Quelle).
  Heutige Spezial-Behavior (mailDetailStore, deferred auto-mark, isFilteredOut)
  bleibt im Outer-Frame erhalten.
-->
<script lang="ts">
	import { onDestroy, onMount, untrack } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import { ArrowRight, Check, CircleAlert, Copy, LoaderCircle, Save } from 'lucide-svelte';
	import { page } from '$app/state';
	import { tlog } from '$lib/util/debug-trace.js';
	import { mailQueueStore } from '$lib/stores/mailQueue.svelte.js';
	import { mailDetailStore } from '$lib/stores/mailDetail.svelte.js';
	import { toastStore } from '$lib/stores/toast.svelte.js';
	import {
		DOMAIN_KEYS,
		DOMAIN_LABELS,
		type DomainKey,
		type ActionabilityKey
	} from '$lib/util/mail-account.js';

	import PanelHeader from './panel/PanelHeader.svelte';
	import VerdictStage from './panel/VerdictStage.svelte';
	import EvidenceCard from './panel/EvidenceCard.svelte';
	import EvidenceVoices from './panel/EvidenceVoices.svelte';
	import EvidenceRules from './panel/EvidenceRules.svelte';
	import EvidenceMarkers from './panel/EvidenceMarkers.svelte';
	import PanelBody from './panel/PanelBody.svelte';
	import { summarizeClassification } from './summarize-classification.js';
	import StatusPillen from '$lib/shared/StatusPillen.svelte';
	import { canReclassify } from '$lib/util/reclassify.js';

	type MarkerKey = 'zu-weit' | 'zu-klein';

	const open = $derived(mailDetailStore.selectedUid != null);
	const liveRow = $derived(
		mailDetailStore.selectedUid
			? (mailQueueStore.rows.find((r) => r.uid === mailDetailStore.selectedUid) ?? null)
			: null
	);
	const cachedSnap = $derived(
		mailDetailStore.cachedRow?.uid === mailDetailStore.selectedUid
			? (mailDetailStore.cachedRow?.row as typeof liveRow)
			: null
	);
	const row = $derived(liveRow ?? cachedSnap);
	const isFilteredOut = $derived(open && liveRow == null && cachedSnap != null);
	const body = $derived(mailDetailStore.current);
	// Gate re-classification on the real capability (numeric feedback_id, not a mock) —
	// NOT on an account name. The former `account === 'yahoo'` proxy broke silently once
	// demo mails were masked to konto-a/konto-b (Aufgabe 1.4). See util/reclassify.ts.
	const canReclassifyRow = $derived(canReclassify(row));
	// Council capability for the active vault — gates the "→ Übernommen" action (data effect,
	// council ingest). Demo does not register Council (Aufgabe 4b), so the action is removed,
	// not just hidden. Server also enforces this in /api/mail/override.
	const councilRegistered = $derived(
		(page.data as { councilRegistered?: boolean }).councilRegistered ?? true
	);

	// 2026-06-05 (Korrektur 1, B3): qm/preis fuer Pillen via on-demand
	// cross-DB lookup. Nur fetchen wenn echte Mail-Row (feedback_id da) +
	// active_rules da (immo-Domain mit priority-match).
	let qmPreis = $state<{ qm: number | null; price_value: number | null; price_currency: string | null } | null>(null);
	let qmPreisLoading = $state(false);
	// 2026-06-06 Bauteil 2: Inserat-Marker vom council-Worker
	// (out_of_corridor:<plz>, expired:redirect_error, corridor_check_skipped).
	let inseratMarkers = $state<string[]>([]);
	$effect(() => {
		// row.uid ist feedback.id-as-string fuer echte feedback-Rows (siehe
		// UnifiedMailRow type-comment). Mock-Rows haben uid='m_NNNN'
		// → canReclassifyRow=false filtert die schon raus.
		const feedbackId = row && canReclassifyRow ? parseInt(row.uid, 10) : NaN;
		if (!Number.isFinite(feedbackId) || !row?.active_rules) {
			qmPreis = null;
			inseratMarkers = [];
			return;
		}
		qmPreisLoading = true;
		fetch(`/api/council/object-by-feedback/${feedbackId}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (data && data.found) {
					qmPreis = {
						qm: data.qm,
						price_value: data.price_value,
						price_currency: data.price_currency
					};
				} else {
					qmPreis = null;
				}
				inseratMarkers = Array.isArray(data?.inserat_markers) ? data.inserat_markers : [];
			})
			.catch(() => {
				qmPreis = null;
				inseratMarkers = [];
			})
			.finally(() => {
				qmPreisLoading = false;
			});
	});

	// Deferred auto-mark-as-read (vor-existing pattern, behalten)
	let pendingMark = $state<{ uid: string; feedbackId: number } | null>(null);

	async function flushPendingMark(): Promise<void> {
		const p = pendingMark;
		if (!p) return;
		pendingMark = null;
		try {
			await fetch('/api/review/mark', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ feedback_id: p.feedbackId, source: 'auto-deferred', action: 'mark' })
			});
			tlog('detailPanel.invalidateAll', { reason: 'auto-mark-deferred', uid: p.uid });
			await invalidateAll();
		} catch {
			// silent
		}
	}

	let lastShownUid = $state<string | null>(null);
	$effect(() => {
		const curUid = mailDetailStore.selectedUid;
		if (curUid !== lastShownUid) {
			if (lastShownUid !== null && pendingMark?.uid === lastShownUid) {
				void flushPendingMark();
			}
			lastShownUid = curUid;
		}
		if (row && canReclassifyRow && !row.reviewed && pendingMark?.uid !== row.uid) {
			const feedbackId = parseInt(row.uid, 10);
			if (Number.isFinite(feedbackId)) {
				pendingMark = { uid: row.uid, feedbackId };
			}
		}
	});

	onDestroy(() => {
		void flushPendingMark();
	});

	// Apply-Correction Callback for VerdictStage (markers as array, joined CSV server-side)
	let saving = $state(false);
	let saveError = $state<string | null>(null);
	let relayLoading = $state(false);
	let relayError = $state<string | null>(null);
	let stagedRelay = $state<{
		caseId: string;
		status: string;
		targetLabel: string;
		bodyTruncated: boolean;
	} | null>(null);

	const correctedDomain = $derived(
		(row?.correction?.corrected_domain as string | undefined) ?? row?.domain ?? null
	);
	const careerRelayEligible = $derived(
		canReclassifyRow &&
		(correctedDomain === 'job' || correctedDomain === 'job-lead') &&
		(row?.effective_actionability ?? row?.actionability) === 'actionable'
	);
	const relayCaseId = $derived(stagedRelay?.caseId ?? row?.relay_case_id ?? null);
	const relayStatus = $derived(stagedRelay?.status ?? row?.relay_status ?? null);
	const relayDraft = $derived(row?.relay_draft ?? null);
	const relayDraftKey = $derived(`${row?.uid ?? ''}:${row?.relay_draft?.draft_id ?? ''}`);
	let draftSubject = $state('');
	let draftBody = $state('');
	let draftSaving = $state(false);
	let draftError = $state<string | null>(null);
	let draftSaved = $state(false);
	let draftCopied = $state(false);

	$effect(() => {
		row?.uid;
		stagedRelay = null;
		relayError = null;
	});

	$effect(() => {
		relayDraftKey;
		const initialDraft = untrack(() => relayDraft);
		draftSubject = initialDraft?.subject ?? '';
		draftBody = initialDraft?.body ?? '';
		draftError = null;
	});

	async function prepareCareerRelay(): Promise<void> {
		if (!row || !canReclassifyRow || relayLoading) return;
		const feedbackId = Number(row.uid);
		if (!Number.isInteger(feedbackId)) return;
		relayLoading = true;
		relayError = null;
		try {
			const response = await fetch('/api/relay/mail', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ feedback_id: feedbackId })
			});
			if (!response.ok) throw new Error((await response.text()).slice(0, 240));
			const result = await response.json() as {
				case_id: string; status: string; target_label: string; body_truncated: boolean;
			};
			stagedRelay = {
				caseId: result.case_id,
				status: result.status,
				targetLabel: result.target_label,
				bodyTruncated: result.body_truncated
			};
			toastStore.show('Übergabe zur Prüfung vorbereitet', 2500);
		} catch (cause) {
			relayError = cause instanceof Error ? cause.message : 'Übergabe konnte nicht vorbereitet werden.';
		} finally {
			relayLoading = false;
		}
	}

	function relayStatusLabel(status: string | null): string {
		if (status === 'detected') return 'Mail erkannt';
		if (status === 'staged') return 'Zur Freigabe bereit';
		if (status === 'approved') return 'Freigabe erteilt';
		if (status === 'answered') return 'Antwortentwurf bereit';
		if (status === 'applied') return relayDraft ? 'Antwortentwurf bereit' : 'Keine weitere Aktion nötig';
		if (status === 'shared' || status === 'claimed') return 'Session arbeitet daran';
		if (status === 'needs_context') return 'Rückfrage der Session';
		if (status === 'reviewed') return 'Antwort geprüft';
		if (status === 'closed') return 'Übergabe abgeschlossen';
		if (status === 'rejected') return 'Vorschlag verworfen';
		if (status === 'expired') return 'Übergabe abgelaufen';
		return 'Zur Freigabe bereit';
	}

	function relayStatusDescription(status: string | null): string {
		if (status === 'expired') {
			return 'Der frühere Laufzeitinhalt wurde entfernt. Bei Bedarf kannst du die Übergabe neu vorbereiten.';
		}
		if (status === 'needs_context') return 'Die Rückfrage wartet in Übergaben auf deine Antwort.';
		if (status === 'rejected') return 'Der verworfene Vorschlag und die Entscheidung bleiben in Übergaben sichtbar.';
		if (relayDraft) return 'Der angenommene Entwurf liegt jetzt lokal bei dieser Mail.';
		if (status === 'applied') return 'Die Empfehlung der Session wurde ohne Mailentwurf übernommen.';
		if (stagedRelay) return `Für ${stagedRelay.targetLabel} vorbereitet.`;
		return 'Antwort und Freigabe bleiben in Übergaben sichtbar.';
	}

	async function saveRelayDraft(): Promise<void> {
		if (!relayCaseId || !relayDraft || draftSaving) return;
		draftSaving = true;
		draftError = null;
		draftSaved = false;
		try {
			const response = await fetch(`/api/relay/mail-draft/${encodeURIComponent(relayCaseId)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ subject: draftSubject, body: draftBody })
			});
			if (!response.ok) throw new Error((await response.text()).slice(0, 240));
			await invalidateAll();
			draftSaved = true;
			setTimeout(() => { draftSaved = false; }, 1800);
			toastStore.show('Antwortentwurf lokal gespeichert', 2200);
		} catch (cause) {
			draftError = cause instanceof Error ? cause.message : 'Antwortentwurf konnte nicht gespeichert werden.';
		} finally {
			draftSaving = false;
		}
	}

	async function copyRelayDraft(): Promise<void> {
		draftError = null;
		try {
			await navigator.clipboard.writeText(draftBody);
			draftCopied = true;
			setTimeout(() => { draftCopied = false; }, 1800);
		} catch {
			draftError = 'Antworttext konnte nicht kopiert werden.';
		}
	}

	async function applyCorrection(
		dom: DomainKey,
		act: ActionabilityKey,
		note: string | null,
		markers: MarkerKey[]
	): Promise<void> {
		if (!row || !canReclassifyRow) return;
		const feedbackId = parseInt(row.uid, 10);
		if (!Number.isFinite(feedbackId)) {
			saveError =
				'Ungültige feedback-id (nur echte Mail-Rows mit feedback-id können re-klassifiziert werden)';
			return;
		}
		saving = true;
		saveError = null;
		try {
			const res = await fetch('/api/mail/correction', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					feedback_id: feedbackId,
					corrected_domain: dom,
					corrected_actionability: act,
					note,
					markers
				})
			});
			if (!res.ok) {
				const text = await res.text().catch(() => res.statusText);
				saveError = `HTTP ${res.status}: ${text.slice(0, 200)}`;
				return;
			}
			await invalidateAll();
			toastStore.show(`${DOMAIN_LABELS[dom]} · ${act}${markers.length ? ' · ' + markers.join(', ') : ''}`, 2500);
		} catch (e) {
			saveError = e instanceof Error ? e.message : String(e);
		} finally {
			saving = false;
		}
	}

	function close(): void {
		mailDetailStore.close();
	}

	// Stripe-State aus voices.ts pre-computed.
	const stripeStateValue = $derived(row?.consensus_state);

	// Keyboard: A (action toggle), 1-8 (domain), ? (toggle all evidence cards), Escape
	// EvidenceCard starts with lastBumpSeen=-1. Matching that sentinel avoids
	// treating the initial render as a "?" shortcut and opening every card.
	let cardBumpKey = $state(-1);

	function onKey(e: KeyboardEvent) {
		if (!open || !row) return;
		// Skip when typing in form fields
		const target = e.target as HTMLElement | null;
		const tag = target?.tagName?.toLowerCase();
		if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

		if (e.key === 'Escape') {
			e.preventDefault();
			close();
			return;
		}
		if (!canReclassifyRow) return;

		// Resolve current state (mirrors VerdictStage-Derivation)
		// 2026-06-08 Bauteil 2.7: effective_actionability first — Reader latest-
		// wins ueber Override + Correction. Sonst togglet die A-Taste auf einen
		// veralteten Zustand zurueck.
		const curDom = (row.correction?.corrected_domain as DomainKey | undefined)
			?? (row.domain as DomainKey | undefined) ?? 'unsorted';
		const curAct = (row.effective_actionability as ActionabilityKey | undefined)
			?? (row.correction?.corrected_actionability as ActionabilityKey | undefined)
			?? (row.actionability as ActionabilityKey | undefined) ?? 'actionable';
		const curMarkers = (row.correction?.correction_marker?.split(',').filter(Boolean) ?? []) as MarkerKey[];

		if (e.key.toLowerCase() === 'a') {
			e.preventDefault();
			const next: ActionabilityKey = curAct === 'archive-silent' ? 'actionable' : 'archive-silent';
			const nextMarkers = next === 'archive-silent' ? curMarkers : [];
			void applyCorrection(curDom, next, null, nextMarkers);
			return;
		}
		if (/^[1-9]$/.test(e.key)) {
			const idx = parseInt(e.key, 10) - 1;
			const dom = DOMAIN_KEYS[idx];
			if (!dom) return; // no n+1 yet
			e.preventDefault();
			void applyCorrection(dom, curAct, null, curMarkers);
			return;
		}
		if (e.key === '?') {
			e.preventDefault();
			cardBumpKey += 1;
			return;
		}
	}

	onMount(() => {
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});

	// Card-Summary derivations
	const presentVoiceCount = $derived(
		row?.voices ? row.voices.filter((v) => v.kind === 'present').length : 0
	);
	const missingVoiceCount = $derived(
		row?.voices ? row.voices.filter((v) => v.kind === 'missing').length : 0
	);
	const voicesSummary = $derived(
		stripeStateValue === 'still'
			? 'alle einig'
			: stripeStateValue === 'ne'
				? '1 abweichend'
				: missingVoiceCount > 0
					? `${missingVoiceCount} fehlend`
					: 'uneinig'
	);
	const rulesCount = $derived(() => {
		const ar = row?.active_rules;
		if (!ar) return 0;
		let n = 0;
		if (ar.active_priority) n++;
		if (ar.distance_threshold_km != null) n++;
		if (ar.fallback_unknown_plz) n++;
		if (ar.time_decay) n++;
		n++; // protection_clause always present
		return n;
	});
	const rulesSummary = $derived(() => {
		const ar = row?.active_rules;
		if (!ar) return '';
		const parts: string[] = [];
		if (ar.active_priority) parts.push(ar.active_priority);
		if (ar.distance_threshold_km != null) parts.push(`≤${ar.distance_threshold_km}km`);
		return parts.slice(0, 2).join(' · ');
	});
	const markersCount = $derived(() => {
		const h = row?.heuristic_markers?.length ?? 0;
		const c = row?.correction?.correction_marker?.split(',').filter(Boolean).length ?? 0;
		// 2026-06-06 Bauteil 2: Inserat-Marker aus council mitzählen.
		return h + c + inseratMarkers.length;
	});
	const markersSummary = $derived(() => {
		const h = row?.heuristic_markers ?? [];
		const all = [...h, ...inseratMarkers];
		return all.slice(0, 2).map((m) => m.split(':')[0]).join(' · ');
	});
	const decisionDetailsSummary = $derived(
		`${rulesCount()} Regeln · ${markersCount()} Signale`
	);
</script>

{#if open && row}
	<aside class="panel-c-frame" aria-label="Mail-Detail">
		{#if isFilteredOut}
			<div class="filtered-banner">
				<span>Diese Mail ist nicht mehr in der aktuellen Filter-Sicht (z.B. nach Auto-Mark-as-Read oder Re-Klassifikation).</span>
				<button type="button" class="filtered-close" onclick={close}>Schließen</button>
			</div>
		{/if}

		<PanelHeader {row} onClose={close} />

		{#if canReclassifyRow}
			<VerdictStage
				{row}
				stripeState={stripeStateValue}
				onApply={applyCorrection}
				{saving}
				{saveError}
				{councilRegistered}
			/>
		{:else}
			<div class="non-yahoo-hint">Re-Klassifikation nur für echte Mail-Rows verfügbar.</div>
		{/if}

		{#if row.active_rules && row.active_rules.distance_threshold_km != null && row.domain === 'immo'}
			<!-- B3 2026-06-05: Drei Pillen — qm/preis on-demand-geladen.
			     Wenn Mail noch nicht in council.objects ingested → qmPreis=null,
			     Pillen rendern grau "—". Schwellen heute hardcoded; Konsolidierung
			     mit regelwerk im Folge-Direktive-Scope.
			     Interim 08c: Council-Felder (ENTFERNUNG/QM²/PREIS) nur bei domain==='immo'
			     rendern — Übergangs-Filterung gegen leere Pillen bei Job/Shopping/Finance.
			     Wird in 08c durch die Council-Registrierungs-API ersetzt, NICHT erweitert. -->
			<section class="pillen-section">
				<StatusPillen
					entfernung={{
						km: row.active_rules.distance_actual_km,
						threshold: row.active_rules.distance_threshold_km
					}}
					qm={{ value: qmPreis?.qm ?? null, min: 100 }}
					preis={{ value: qmPreis?.price_value ?? null, max: 500_000 }}
				/>
			</section>
		{/if}

		<section class="evidence-section">
			<header class="evidence-head">
				<span class="ev-h-label">WARUM SO?</span>
				<span class="ev-h-tag">
					{row.domain === 'immo' ? 'STIMMEN · REGELN · SIGNALE' : 'STIMMEN · DETAILS'}
				</span>
			</header>
			<div class="ev-one-liner">{summarizeClassification(row)}</div>
			<!-- B1 2026-06-05: {#key row.uid} forciert Re-Mount der EvidenceCards
			     bei Mail-Wechsel. Sonst persistiert lokales expanded-state
			     (defaultExpanded=false greift nur beim ersten Mount). -->
			{#key row.uid}
				<div class="evidence-cards">
					<EvidenceCard
						label="{presentVoiceCount + missingVoiceCount} Stimmen"
						summary={voicesSummary}
						forceExpandKey={cardBumpKey}
					>
						{#snippet visual()}
							<span class="mini-stripe">
								{#each row.voices ?? [] as v}
									<span class="mini-tile mini-{v.kind === 'present' ? v.domain : 'missing'}"></span>
								{/each}
							</span>
						{/snippet}
						<EvidenceVoices voices={row.voices ?? []} />
					</EvidenceCard>


					{#if row.domain === 'immo'}
						<!-- Immo keeps the richer inspection layout: distance and
						     listing signals are meaningful primary evidence here. -->
						<EvidenceCard
							label="{rulesCount()} Regeln aktiv"
							summary={rulesSummary()}
							forceExpandKey={cardBumpKey}
						>
							{#snippet visual()}
								<span class="mini-checkbox"></span>
							{/snippet}
							<EvidenceRules activeRules={row.active_rules} />
						</EvidenceCard>

						<EvidenceCard
							label="{markersCount()} Signale"
							summary={markersSummary()}
							forceExpandKey={cardBumpKey}
						>
							{#snippet visual()}
								<span class="mini-block mini-{row.domain ?? 'unsorted'}"></span>
							{/snippet}
							<EvidenceMarkers {row} {inseratMarkers} />
						</EvidenceCard>
					{:else}
						<!-- For all other domains the full audit trail remains one click
						     away without letting Immo-era implementation detail dominate. -->
						<EvidenceCard
							label="Entscheidungsdetails"
							summary={decisionDetailsSummary}
							forceExpandKey={cardBumpKey}
						>
							{#snippet visual()}
								<span class="mini-block mini-{row.domain ?? 'unsorted'}"></span>
							{/snippet}
							<div class="decision-details">
								<h4>Aktive Regeln</h4>
								<EvidenceRules activeRules={row.active_rules} />
								<div class="decision-divider"></div>
								<h4>Signale</h4>
								<EvidenceMarkers {row} {inseratMarkers} />
							</div>
						</EvidenceCard>
					{/if}
				</div>
			{/key}
		</section>

		<PanelBody body={body?.bodyText ?? null} />

		{#if careerRelayEligible || relayCaseId}
			<section class="relay-handoff">
				<div class="relay-copy">
					<span class="relay-eyebrow">Session Relay</span>
					{#if relayCaseId}
						<strong>
							{#if relayStatus === 'expired'}<CircleAlert size={15} />{:else}<Check size={15} />{/if}
							{relayStatusLabel(relayStatus)}
						</strong>
						<p>{relayStatusDescription(relayStatus)}</p>
					{:else}
						<strong>Mit der Karriere-Session bearbeiten</strong>
						<p>Folio bereitet Mailauszug und passenden bestätigten Kontext zur Prüfung vor.</p>
					{/if}
					{#if stagedRelay?.bodyTruncated}<small>Die Vollständigkeit des lokalen Worker-Auszugs ist nicht belegt; Folio kennzeichnet das im Fall.</small>{/if}
					{#if relayError}<small class="relay-error">{relayError}</small>{/if}
				</div>
				{#if relayCaseId && relayStatus !== 'expired'}
					<a class="relay-link" href="/relay">Übergaben öffnen <ArrowRight size={14} /></a>
				{:else if careerRelayEligible}
					<button class="relay-button" type="button" disabled={relayLoading} onclick={prepareCareerRelay}>
						{#if relayLoading}<LoaderCircle class="spin" size={14} />{:else}<ArrowRight size={14} />{/if}
						{relayStatus === 'expired' ? 'Neu vorbereiten' : 'Übergabe vorbereiten'}
					</button>
				{/if}
				{#if relayDraft}
					<div class="relay-draft-editor">
						<label>
							<span>Betreff</span>
							<input bind:value={draftSubject} maxlength="500" />
						</label>
						<label>
							<span>Antwortentwurf</span>
							<textarea bind:value={draftBody} rows="7" maxlength="50000"></textarea>
						</label>
						<div class="relay-draft-footer">
							<small>Lokale Arbeitskopie · nichts wurde versendet.</small>
							<div class="relay-draft-actions">
								<button type="button" class="relay-secondary" onclick={copyRelayDraft}>
									{#if draftCopied}<Check size={14} /> Kopiert{:else}<Copy size={14} /> Text kopieren{/if}
								</button>
								<button type="button" class="relay-button" disabled={draftSaving} onclick={saveRelayDraft}>
									{#if draftSaving}<LoaderCircle class="spin" size={14} />{:else if draftSaved}<Check size={14} />{:else}<Save size={14} />{/if}
									{draftSaved ? 'Gespeichert' : 'Speichern'}
								</button>
							</div>
						</div>
						{#if draftError}<small class="relay-error">{draftError}</small>{/if}
					</div>
				{/if}
			</section>
		{/if}
	</aside>
{/if}

<style>
	.panel-c-frame {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow-y: auto;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: var(--radius-xl, 12px);
	}

	.filtered-banner {
		padding: 8px 16px;
		font-size: 11px;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		background: color-mix(in srgb, hsl(28 100% 60%) 12%, transparent);
		border-bottom: 1px solid var(--color-border);
	}
	.filtered-close {
		padding: 2px 8px;
		font-size: 10px;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		cursor: pointer;
	}

	.non-yahoo-hint {
		padding: 18px 16px;
		font-size: 12px;
		color: var(--color-muted-foreground);
		font-style: italic;
		background: white;
		border-bottom: 1px solid var(--color-border);
	}

	.evidence-section {
		display: flex;
		flex-direction: column;
	}
	.evidence-head {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 9px 16px 8px;
		background: hsl(210 25% 96%);
		border-bottom: 1px dashed var(--color-border);
	}
	.ev-h-label {
		font-family: var(--font-mono);
		font-size: 10.5px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--color-muted-foreground);
		font-weight: 500;
	}
	.ev-h-tag {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 9.5px;
		color: var(--color-muted-foreground);
	}
	.pillen-section {
		padding: 0 16px;
	}
	.ev-one-liner {
		padding: 6px 16px 0;
		font-family: var(--font-mono);
		font-size: 11.5px;
		color: var(--color-foreground, hsl(222 47% 11%));
		line-height: 1.4;
	}
	.evidence-cards {
		padding: 10px 16px 14px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.decision-details {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.decision-details h4 {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 9.5px;
		font-weight: 600;
		letter-spacing: .05em;
		text-transform: uppercase;
		color: var(--color-muted-foreground);
	}
	.decision-divider {
		height: 1px;
		background: var(--color-border);
	}

	.mini-stripe {
		display: inline-flex;
		gap: 1px;
		padding: 2px;
		background: white;
		border: 1px solid var(--color-border);
		border-radius: 3px;
	}
	.mini-tile {
		width: 10px;
		height: 14px;
		border-radius: 1px;
	}
	.mini-immo     { background: hsl(217 70% 60%); }
	.mini-job      { background: hsl(165 50% 45%); }
	.mini-shop, .mini-shopping { background: hsl(38 80% 55%); }
	.mini-finance  { background: hsl(0 65% 55%); }
	.mini-kontakt  { background: hsl(280 50% 55%); }
	.mini-werbung  { background: hsl(210 8% 60%); }
	.mini-system   { background: hsl(210 8% 50%); }
	.mini-unsorted { background: hsl(210 8% 75%); }
	.mini-missing  { background: hsl(210 8% 85%); }

	.mini-checkbox {
		display: inline-block;
		width: 14px;
		height: 14px;
		border: 1.5px solid var(--color-border);
		border-radius: 3px;
	}
	.mini-block {
		display: inline-block;
		width: 14px;
		height: 14px;
		border-radius: 3px;
		background: hsl(217 60% 85%);
	}
	.relay-handoff {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		align-items: center;
		gap: 18px;
		margin: 14px 16px 16px;
		padding: 14px;
		border: 1px solid hsl(205 42% 84%);
		border-radius: 11px;
		background: hsl(205 48% 97%);
	}
	.relay-copy { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
	.relay-eyebrow { color: hsl(205 52% 34%); font-family: var(--font-mono); font-size: 9.5px; font-weight: 650; letter-spacing: .07em; text-transform: uppercase; }
	.relay-copy strong { display: flex; align-items: center; gap: 6px; font-size: 12px; }
	.relay-copy p, .relay-copy small { margin: 0; color: var(--color-muted-foreground); font-size: 10.5px; line-height: 1.45; }
	.relay-copy small { color: hsl(28 66% 38%); }
	.relay-copy small.relay-error { color: hsl(0 56% 38%); }
	.relay-button, .relay-link {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		flex: 0 0 auto;
		border: 0;
		border-radius: 8px;
		padding: 9px 11px;
		background: hsl(205 52% 34%);
		color: white;
		font: inherit;
		font-size: 10.5px;
		font-weight: 650;
		text-decoration: none;
		cursor: pointer;
	}
	.relay-button:disabled { cursor: not-allowed; opacity: .45; }
	.relay-draft-editor {
		display: flex;
		grid-column: 1 / -1;
		flex-direction: column;
		gap: 9px;
		padding-top: 12px;
		border-top: 1px solid hsl(205 35% 87%);
	}
	.relay-draft-editor label { display: flex; flex-direction: column; gap: 4px; }
	.relay-draft-editor label > span {
		color: hsl(205 38% 31%);
		font-family: var(--font-mono);
		font-size: 9.5px;
		font-weight: 650;
		letter-spacing: .04em;
		text-transform: uppercase;
	}
	.relay-draft-editor input, .relay-draft-editor textarea {
		box-sizing: border-box;
		width: 100%;
		border: 1px solid hsl(205 30% 80%);
		border-radius: 7px;
		background: white;
		color: var(--color-foreground);
		font: inherit;
		font-size: 11.5px;
		line-height: 1.5;
		padding: 8px 9px;
	}
	.relay-draft-editor textarea { min-height: 116px; resize: vertical; }
	.relay-draft-editor input:focus, .relay-draft-editor textarea:focus {
		border-color: hsl(205 52% 45%);
		outline: 2px solid hsl(205 52% 45% / .13);
	}
	.relay-draft-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
	.relay-draft-footer small { color: var(--color-muted-foreground); font-size: 10px; }
	.relay-draft-actions { display: flex; gap: 7px; }
	.relay-secondary {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		border: 1px solid hsl(205 30% 75%);
		border-radius: 8px;
		padding: 8px 10px;
		background: white;
		color: hsl(205 45% 31%);
		font: inherit;
		font-size: 10.5px;
		font-weight: 650;
		cursor: pointer;
	}
	.relay-draft-editor small.relay-error { color: hsl(0 56% 38%); }
	.spin { animation: spin 1s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	@media (max-width: 900px) {
		.relay-handoff { align-items: stretch; grid-template-columns: minmax(0, 1fr); }
		.relay-button, .relay-link { width: 100%; }
		.relay-draft-footer { align-items: stretch; flex-direction: column; }
		.relay-draft-actions { width: 100%; }
		.relay-draft-actions > button { flex: 1; width: auto; }
	}
</style>
