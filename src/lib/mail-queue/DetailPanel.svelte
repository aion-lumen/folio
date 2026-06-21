<!--
  Panel-C Werkstatt (Direktive 2, 2026-05-27) — Orchestrator.
  Hierarchie: Header → Verdikt-Bühne → 3 Karteikarten → Mail-Body.
  Disagreement-Signal: 4-px-Ember-Top-Border in VerdictStage (eine Quelle).
  Heutige Spezial-Behavior (mailDetailStore, deferred auto-mark, isFilteredOut)
  bleibt im Outer-Frame erhalten.
-->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
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
	const isYahoo = $derived(row?.account === 'yahoo' && !row?.isMock);

	// 2026-06-05 (Korrektur 1, B3): qm/preis fuer Pillen via on-demand
	// cross-DB lookup. Nur fetchen wenn Mail (yahoo, feedback_id da) +
	// active_rules da (immo-Domain mit priority-match).
	let qmPreis = $state<{ qm: number | null; price_value: number | null; price_currency: string | null } | null>(null);
	let qmPreisLoading = $state(false);
	// 2026-06-06 Bauteil 2: Inserat-Marker vom council-Worker
	// (out_of_corridor:<plz>, expired:redirect_error, corridor_check_skipped).
	let inseratMarkers = $state<string[]>([]);
	$effect(() => {
		// row.uid ist feedback.id-as-string fuer yahoo-rows (siehe
		// UnifiedMailRow type-comment). Mock-Rows haben uid='m_NNNN'
		// → isYahoo=false filtert die schon raus.
		const feedbackId = row && isYahoo ? parseInt(row.uid, 10) : NaN;
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
		if (row && isYahoo && !row.reviewed && pendingMark?.uid !== row.uid) {
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

	async function applyCorrection(
		dom: DomainKey,
		act: ActionabilityKey,
		note: string | null,
		markers: MarkerKey[]
	): Promise<void> {
		if (!row || !isYahoo) return;
		const feedbackId = parseInt(row.uid, 10);
		if (!Number.isFinite(feedbackId)) {
			saveError = 'Ungültige feedback-id (nur yahoo-Rows können re-klassifiziert werden)';
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
	let cardBumpKey = $state(0);

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
		if (!isYahoo) return;

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

		{#if isYahoo}
			<VerdictStage
				{row}
				stripeState={stripeStateValue}
				onApply={applyCorrection}
				{saving}
				{saveError}
			/>
		{:else}
			<div class="non-yahoo-hint">Re-Klassifikation nur für Yahoo-Mails aktiviert.</div>
		{/if}

		{#if row.active_rules && row.active_rules.distance_threshold_km != null}
			<!-- B3 2026-06-05: Drei Pillen — qm/preis on-demand-geladen.
			     Wenn Mail noch nicht in council.objects ingested → qmPreis=null,
			     Pillen rendern grau "—". Schwellen heute hardcoded; Konsolidierung
			     mit regelwerk im Folge-Direktive-Scope. -->
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
				<span class="ev-h-tag">3 KARTEIKARTEN</span>
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
						label="{markersCount()} Marker"
						summary={markersSummary()}
						forceExpandKey={cardBumpKey}
					>
						{#snippet visual()}
							<span class="mini-block mini-{row.domain ?? 'unsorted'}"></span>
						{/snippet}
						<EvidenceMarkers {row} {inseratMarkers} />
					</EvidenceCard>
				</div>
			{/key}
		</section>

		<PanelBody body={body?.bodyText ?? null} />
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
</style>
