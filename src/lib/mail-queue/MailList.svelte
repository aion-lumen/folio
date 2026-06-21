<!--
  Lens-UI Stimmen-Streifen (Direktive lens-ui-2026-05-26): Konfidenz + Tier
  Spalten entfernt, durch Stimmen-Streifen ersetzt. Heuristik-vs-validator
  Row-Tint entfernt — Ember sitzt jetzt am Streifen-Container (siehe Salienz-
  Prinzip Direktive §1, keine Doppel-Alarme). Disagreement-Border-L bleibt
  (anderes Signal: User-vs-Heuristik-Mismatch, nicht Lens-Konsens).
  Spalten: EMPFANGEN | ACCT* | SENDER | BETREFF | DOMAIN·AKTION | STIMMEN | MARKER
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { createVirtualizer } from '@tanstack/svelte-virtual';
	import { mailQueueStore, isDisagreement } from '$lib/stores/mailQueue.svelte.js';
	import { mailDetailStore } from '$lib/stores/mailDetail.svelte.js';
	import {
		ACCOUNT_CLASS,
		ACTION_CLASS,
		ACTION_LABELS,
		DOMAIN_CLASS,
		DOMAIN_LABELS,
		ACTIONABILITY_ICONS,
		ACTIONABILITY_CLASS,
		ACTIONABILITY_LABELS,
		type DomainKey,
		type ActionabilityKey
	} from '$lib/util/mail-account.js';
	import StimmenStreifen from './StimmenStreifen.svelte';

	const rows = $derived(mailQueueStore.rows);
	const showAcct = $derived(mailQueueStore.filters.account === 'all');

	let scrollEl: HTMLDivElement | undefined = $state();

	const virtualizer = createVirtualizer<HTMLDivElement, HTMLLIElement>({
		count: 0,
		getScrollElement: () => scrollEl ?? null!,
		estimateSize: () => 40,
		overscan: 8
	});

	// Reactively update virtualizer when row-count or scrollEl changes.
	// untrack(): setOptions mutates virtualizer state which notifies subscribers.
	// Without untrack, $virtualizer auto-subscription would create read↔write loop
	// (effect_update_depth_exceeded). We track only rows.length + scrollEl explicitly.
	$effect(() => {
		const count = rows.length;
		const el = scrollEl;
		untrack(() => {
			$virtualizer.setOptions({
				count,
				getScrollElement: () => el ?? null!,
				estimateSize: () => 40,
				overscan: 8
			});
		});
	});

	function fmtTime(iso: string): string {
		try {
			const d = new Date(iso);
			const time = d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
			const date = d.toLocaleDateString('de-CH', { day: '2-digit', month: 'short' });
			return `${time}\n${date}`;
		} catch {
			return iso;
		}
	}

	// Lens-UI Spalten: Konfidenz + Tier raus, Stimmen-Streifen (110px) + Marker (32px) rein.
	const gridCols = $derived(
		showAcct
			? '80px 80px 200px 1fr 220px 110px 32px'
			: '80px 200px 1fr 220px 110px 32px'
	);
</script>

<div class="flex h-full flex-col rounded-xl border border-border bg-card overflow-hidden">
	<!-- Header row (sticky outside scrollEl) -->
	<div
		class="grid items-center gap-3 px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground border-b border-border bg-card"
		style="grid-template-columns: {gridCols};"
	>
		<span>Empfangen</span>
		{#if showAcct}<span>Acct</span>{/if}
		<span>Sender</span>
		<span>Betreff</span>
		<span>Domain · Aktion</span>
		<!-- Stimmen-Header: H L1 L2 L3 als Mini-Labels (per Bundle §IV mockup) -->
		<span class="stimmen-hd inline-flex items-center gap-[3px] px-1.5 py-1">
			<span class="w-5 text-center font-mono text-[10px] tracking-wide font-normal">H</span>
			<span class="w-5 text-center font-mono text-[10px] tracking-wide font-normal">L1</span>
			<span class="w-5 text-center font-mono text-[10px] tracking-wide font-normal">L2</span>
			<span class="w-5 text-center font-mono text-[10px] tracking-wide font-normal">L3</span>
		</span>
		<span></span>
	</div>

	{#if rows.length === 0}
		<div class="px-3 py-8 text-center text-sm text-muted-foreground">
			Keine Mails mit aktuellen Filtern.
		</div>
	{:else}
		<!-- Virtual-Scroll-Container -->
		<div bind:this={scrollEl} class="flex-1 overflow-auto">
			<ul
				class="relative w-full divide-y divide-border"
				style="height: {$virtualizer.getTotalSize()}px;"
			>
				{#each $virtualizer.getVirtualItems() as v (rows[v.index]?.uid ?? `idx-${v.index}`)}
					{@const r = rows[v.index]}
					{#if r}
						{@const disagreement = isDisagreement(r)}
						{@const selected = mailDetailStore.selectedUid === r.uid}
						{@const action = r.correction?.corrected_action ?? r.user_final_action ?? r.heuristic_suggested_action ?? 'keep'}
						{@const actionCls = ACTION_CLASS[action] ?? ACTION_CLASS.keep}
						<li
						class="absolute inset-x-0 grid items-center gap-3 px-3 py-2 text-sm transition-colors cursor-pointer
						{selected ? 'bg-foreground/[0.08] ring-1 ring-inset ring-foreground/30' : 'hover:bg-muted'}
						{!r.reviewed ? 'font-semibold' : ''}
						{disagreement ? 'border-l-2 border-l-[color:var(--color-lumen)]' : 'border-l-2 border-l-transparent'}"
						style="grid-template-columns: {gridCols}; transform: translateY({v.start}px); height: {v.size}px;"
						tabindex="0"
						onclick={() => mailDetailStore.open(r.uid, r)}
						onkeydown={(e) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								mailDetailStore.open(r.uid, r);
							}
						}}
					>
						<span class="text-xs text-muted-foreground whitespace-pre font-mono">
							{fmtTime(r.received_at)}
						</span>
						{#if showAcct}
							<span class="inline-flex items-center gap-1.5">
								<span class="h-2 w-2 rounded-full {ACCOUNT_CLASS[r.account].dot}"></span>
								<span class="text-xs">{r.account === 'mirhamed_ch' ? 'mirhamed' : r.account}</span>
							</span>
						{/if}
						<span class="truncate text-xs font-mono text-muted-foreground" title={r.from_addr}>
							{r.from_addr}
						</span>
						<span class="truncate" title={r.subject}>{r.subject}</span>
						<!-- F.8 DOMAIN-Chip + ACTIONABILITY-Icon (replaces 5-Action-Pille).
						     F.8.5 BUG-K1: corrected_* prägt das Pill — User-Truth zuerst.
						     Reihenfolge: correction > heuristic-effective > heuristic-raw.
						     Validator-Opinion bleibt im DetailPanel-Audit-Trail (kein Effect-Override). -->
						<span class="inline-flex items-center gap-1.5 text-xs">
							{#if r.domain || r.correction?.corrected_domain}
								{@const dom = (r.correction?.corrected_domain ?? r.domain) as DomainKey}
								{@const domCls = DOMAIN_CLASS[dom] ?? DOMAIN_CLASS.unsorted}
								{@const eff = (r.effective_actionability
									?? r.correction?.corrected_actionability
									?? r.actionability
									?? 'actionable') as ActionabilityKey}
								{@const actCls = ACTIONABILITY_CLASS[eff] ?? ACTIONABILITY_CLASS.actionable}
								{@const isCorrected = r.correction?.corrected_domain != null}
								<span class="h-2 w-2 rounded-full {domCls.dot}"></span>
								<span
									class="rounded-md border px-2 py-0.5 {domCls.bg} {domCls.fg} border-current/20"
									title={isCorrected ? 'User-Korrektur' : 'Heuristik'}
								>
									{DOMAIN_LABELS[dom] ?? dom}
								</span>
								<span
									class={actCls}
									title={ACTIONABILITY_LABELS[eff] ?? eff}
								>{ACTIONABILITY_ICONS[eff] ?? ''}</span>
							{:else}
								<!-- Legacy / Mock rows -->
								<span class="h-2 w-2 rounded-full {actionCls.dot}"></span>
								<span class="rounded-md border px-2 py-0.5 {actionCls.bg} {actionCls.fg} {actionCls.border}">
									{ACTION_LABELS[action] ?? action}
								</span>
							{/if}
						</span>
						<!-- Stimmen-Streifen (Lens-UI): Heuristik + Lens-Voices + ember-Bühne bei Uneinigkeit.
						     server-side pre-computed (voices + consensus_state) per Direktive lens-ui-2026-05-26 §2.2. -->
						<span class="flex items-center">
							{#if r.voices && r.consensus_state}
								<StimmenStreifen voices={r.voices} state={r.consensus_state} />
							{:else}
								<span class="text-xs text-muted-foreground font-mono">—</span>
							{/if}
						</span>
						<!-- Marker-Spalte: nur Correction-Indicator (↻). Validator-⚖ entfällt —
						     der Streifen ist jetzt die Validator-Anzeige. -->
						<span class="flex items-center gap-1">
							{#if r.correction}
								<span
									class="text-xs leading-none text-muted-foreground"
									title="Re-klassifiziert · {r.correction.corrected_at.slice(0, 10)}"
								>↻</span>
							{/if}
						</span>
					</li>
					{/if}
				{/each}
			</ul>
		</div>
	{/if}
</div>
