<!--
  Desktop-Council Detail-Panel (Desktop-Update 2026-05-31).
  Slide-in von rechts mit Backdrop. Reuse der Mobile-Detail-Komponenten via
  .council-mobile-root-Wrapper (Token-Scope wird mitgenommen, Mobile-Optik).

  Inhalt: Foto + Eckdaten, Lens-Stimmen, Status-Tags, Notiz, Top-10-Picker,
  optionaler "Wer wo"-Mini-Block (Self/Partner/Council).
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import type { CouncilListItem } from '$lib/server/council-db/reader.js';
	import type { CouncilVoice, CouncilConsensusState } from '$lib/server/council-db/types.js';
	import type { LensReason } from '$lib/lens/types.js';
	import CouncilStimmenStreifen from './CouncilStimmenStreifen.svelte';
	import LensReasonsPanel from '$lib/lens/LensReasonsPanel.svelte';
	import StatusTagButtons from './mobile/detail/StatusTagButtons.svelte';
	import NoteEditor from './mobile/detail/NoteEditor.svelte';
	import TopTenPicker from './mobile/detail/TopTenPicker.svelte';
	import StatusPillen from '$lib/shared/StatusPillen.svelte';
	import { shortPortal } from '$lib/council/portalLabel.js';

	let {
		item,
		voices,
		voiceState,
		userRanks,
		partnerRanks,
		partner,
		notes,
		onClose
	}: {
		item: CouncilListItem;
		voices?: CouncilVoice[];
		voiceState?: CouncilConsensusState;
		userRanks: Record<string, number>;
		partnerRanks: Record<string, number>;
		partner: { id: number; display_name: string } | null;
		notes: Record<string, string>;
		onClose: () => void;
	} = $props();

	const o = $derived(item.object);
	const noteInitial = $derived(notes[o.id] ?? null);
	const inheritedNotePortal = $derived(
		item.note_provenance?.kind === 'inherited' && item.note_provenance.from_portal
			? shortPortal(item.note_provenance.from_portal)
			: null
	);
	const inheritedStatusPortal = $derived(
		item.status_provenance?.kind === 'inherited' && item.status_provenance.from_portal
			? shortPortal(item.status_provenance.from_portal)
			: null
	);
	const userRank = $derived<number | null>(userRanks[o.id] ?? null);
	const partnerRank = $derived<number | null>(partner ? (partnerRanks[o.id] ?? null) : null);

	// Lens-Begruendungen on-mount on-demand fetchen (statt fuer alle items im Loader).
	let lensReasons: LensReason[] = $state([]);
	let lensReasonsError: string | null = $state(null);

	onMount(async () => {
		try {
			const res = await fetch(`/api/council/${o.id}/lens-reasons`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = (await res.json()) as { reasons: LensReason[] };
			lensReasons = data.reasons;
		} catch (e) {
			lensReasonsError = (e as Error).message;
		}
	});

	function fmtPrice(value: number | null, currency: string | null): string {
		if (value == null) return '—';
		const n = value.toLocaleString('de-CH');
		return currency ? `${n} ${currency}` : n;
	}

	function onBackdropKey(e: KeyboardEvent) {
		if (e.key === 'Escape') onClose();
	}

	const hostname = $derived.by(() => {
		try {
			return new URL(o.source_url).hostname.replace(/^www\./, '');
		} catch {
			return o.portal;
		}
	});

	// Stammdaten-Fallback: wenn alle strukturierten Felder NULL sind, zeigen wir
	// den Roh-Title als Fallback. (Typ-Parser-Heuristik aus title/description ist
	// out-of-scope dieser Iteration — eigene Direktive.)
	const hasStructuredSpecs = $derived(
		o.price_value != null || o.qm != null || o.bj != null
	);
</script>

<svelte:window onkeydown={onBackdropKey} />

<div
	class="backdrop"
	role="button"
	tabindex="-1"
	aria-label="Detail schliessen"
	onclick={onClose}
	onkeydown={(e) => {
		if (e.key === 'Enter' || e.key === ' ') onClose();
	}}
></div>

<div class="panel council-mobile-root" role="dialog" aria-label="Objekt-Details">
	<header class="panel-head">
		<div class="head-text">
			<h2>{o.address ?? o.title ?? '—'}</h2>
		</div>
		<button type="button" class="close" onclick={onClose} aria-label="Schliessen">✕</button>
	</header>

	<div class="body">
		<section class="photo-row">
			{#if o.photo_url}
				<img src={o.photo_url} alt="" loading="lazy" />
			{:else}
				<div class="photo-placeholder" aria-label="kein Foto">⌂</div>
			{/if}
			<dl class="specs">
				{#if o.price_value != null}
					<dt>Preis</dt><dd>{fmtPrice(o.price_value, o.price_currency)}</dd>
				{/if}
				{#if o.qm != null}
					<dt>Fläche</dt><dd>{o.qm} m²</dd>
				{/if}
				{#if o.bj != null}
					<dt>Baujahr</dt><dd>{o.bj}</dd>
				{/if}
				<dt>Gesehen</dt><dd>{o.times_seen}×</dd>
			</dl>
		</section>

		<!-- B4 2026-06-05: Status-Pillen (qm/preis aus title-parser; distance
		     erfordert Cross-DB-Batch-Load fuer Liste — Folge-Direktive,
		     hier vorerst null). -->
		<!-- B2 2026-06-05: distance_km kommt aus list-loader-batch (Korrektur 2).
		     qm/preis aus title-parser. Schwellen aus regelwerk (heute noch
		     hardcoded — Konsolidierung Folge-Direktive). -->
		<section class="pillen-row">
			<StatusPillen
				entfernung={{ km: item.distance_km ?? null, threshold: 40 }}
				qm={{ value: o.qm ?? null, min: 100 }}
				preis={{ value: o.price_value ?? null, max: 500_000 }}
			/>
		</section>

		{#if o.source_url}
			<a
				class="inserat-link"
				href={o.source_url}
				target="_blank"
				rel="noopener noreferrer"
			>
				<span>Inserat auf Portal öffnen</span>
				<span class="link-host">{hostname}</span>
			</a>
		{/if}

		{#if voices && voiceState}
			<section class="voices">
				<h3>Lens-Stimmen</h3>
				<CouncilStimmenStreifen {voices} state={voiceState} />
			</section>
		{/if}

		<section class="where-mini">
			<h3>Wer wo</h3>
			<div class="where-row">
				<span class="where-lbl">Meine</span>
				<span class="where-val">{userRank ? `#${userRank}` : '—'}</span>
			</div>
			{#if partner}
				<div class="where-row">
					<span class="where-lbl">{partner.display_name}</span>
					<span class="where-val">{partnerRank ? `#${partnerRank}` : '—'}</span>
				</div>
			{/if}
			<div class="where-row">
				<span class="where-lbl">Council-Borda</span>
				<span class="where-val">{item.borda_rank ? `#${item.borda_rank}` : '—'}</span>
			</div>
		</section>

		<section class="actions">
			<h3>Status</h3>
			{#if inheritedStatusPortal}
				<p class="inherit-hint">Status übernommen von Bruder auf {inheritedStatusPortal}</p>
			{/if}
			<StatusTagButtons
				objectId={o.id}
				current={item.effective_status}
				currentReason={item.override_reason}
			/>

			<h3>Notiz</h3>
			{#if inheritedNotePortal}
				<p class="inherit-hint">Notiz übernommen von Bruder auf {inheritedNotePortal}</p>
			{/if}
			<NoteEditor objectId={o.id} initial={noteInitial} />

			<h3>Meine Top-10</h3>
			<TopTenPicker
				objectId={o.id}
				currentRank={userRank}
				topRanks={userRanks}
			/>
		</section>
	</div>
</div>

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: hsla(222 47% 11% / 0.35);
		z-index: 100;
		border: 0;
		padding: 0;
		cursor: pointer;
	}
	.panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: min(480px, 100vw);
		background: white;
		box-shadow: -8px 0 32px hsla(222 47% 11% / 0.2);
		z-index: 101;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		animation: slide-in 200ms ease-out;
	}
	@keyframes slide-in {
		from { transform: translateX(100%); }
		to { transform: translateX(0); }
	}

	.panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		padding: 14px 18px;
		border-bottom: 1px solid var(--wf-line, hsl(214 20% 88%));
	}
	.head-text {
		min-width: 0;
		flex: 1;
	}
	.panel-head h2 {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		letter-spacing: -0.01em;
		line-height: 1.3;
		color: var(--wf-fg, hsl(222 30% 22%));
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.title-fallback {
		font-family: var(--font-mono);
		font-size: 11.5px;
		color: var(--wf-muted, hsl(215 16% 50%));
		padding: 6px 10px;
		background: var(--wf-fill, hsl(214 24% 94%));
		border-radius: 4px;
		line-height: 1.4;
	}
	.pillen-row {
		padding: 0 14px;
	}
	.inserat-link {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 10px 14px;
		background: hsl(222 47% 11%);
		color: white;
		border-radius: 6px;
		text-decoration: none;
		font-size: 13px;
	}
	.inserat-link:hover {
		background: hsl(222 47% 22%);
	}
	.link-host {
		font-family: var(--font-mono);
		font-size: 11.5px;
		opacity: 0.8;
	}
	.link-cta {
		font-weight: 500;
	}
	.reasons-err {
		font-size: 12px;
		color: hsl(0 65% 38%);
		padding: 4px 0;
	}
	.reasons-empty {
		font-size: 12px;
		color: var(--wf-muted, hsl(215 16% 50%));
		font-style: italic;
		padding: 4px 0;
	}
	.close {
		background: transparent;
		border: 0;
		font-size: 18px;
		line-height: 1;
		padding: 4px 8px;
		cursor: pointer;
		color: var(--wf-muted, hsl(215 16% 50%));
		border-radius: 4px;
	}
	.close:hover {
		background: var(--wf-fill, hsl(214 24% 94%));
		color: var(--wf-fg, hsl(222 30% 22%));
	}

	.body {
		flex: 1;
		overflow-y: auto;
		padding: 16px 18px 32px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	.photo-row {
		display: grid;
		grid-template-columns: 140px 1fr;
		gap: 14px;
		align-items: start;
	}
	.photo-row img {
		width: 140px;
		height: 105px;
		object-fit: cover;
		border-radius: 6px;
		display: block;
	}
	.photo-placeholder {
		width: 140px;
		height: 105px;
		border-radius: 6px;
		background: var(--wf-fill, hsl(214 24% 94%));
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 32px;
		color: var(--wf-line-strong, hsl(214 25% 78%));
	}
	.specs {
		margin: 0;
		display: grid;
		grid-template-columns: max-content 1fr;
		gap: 4px 14px;
		font-size: 12px;
	}
	.specs dt {
		color: var(--wf-muted, hsl(215 16% 50%));
		font-family: var(--font-mono);
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.specs dd {
		margin: 0;
		color: var(--wf-fg, hsl(222 30% 22%));
		font-weight: 500;
	}

	h3 {
		margin: 0 0 6px;
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--wf-muted, hsl(215 16% 50%));
		font-weight: 500;
	}

	.voices,
	.where-mini,
	.actions {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.where-row {
		display: flex;
		justify-content: space-between;
		font-size: 12.5px;
		padding: 4px 0;
		border-bottom: 1px solid var(--wf-line, hsl(214 20% 88%));
	}
	.where-row:last-child {
		border-bottom: 0;
	}
	.where-lbl {
		color: var(--wf-muted, hsl(215 16% 50%));
	}
	.where-val {
		font-family: var(--font-mono);
		font-weight: 500;
		color: var(--wf-fg, hsl(222 30% 22%));
	}

	.inherit-hint {
		margin: 0 0 6px;
		font-family: var(--font-mono);
		font-size: 11px;
		font-style: italic;
		color: var(--wf-muted, hsl(215 16% 50%));
	}

	.actions h3 {
		margin-top: 14px;
	}
	.actions h3:first-of-type {
		margin-top: 0;
	}
</style>
