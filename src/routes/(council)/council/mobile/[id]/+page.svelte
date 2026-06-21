<!--
  Mobile 1a (2026-05-30): Detail-Ansicht read-only.
  Foto + Stammdaten → Konsens-Block (read) → Wer-wo (3-Spalten) →
  Einordnung-Stub → Lens-Beiträge (collapsed).

  Side-effect: upsertObjectView läuft im server-side loader, kein
  client-side fetch nötig.
-->
<script lang="ts">
	import CouncilStimmenStreifenMini from '$lib/council/CouncilStimmenStreifenMini.svelte';
	import ConsensusTriggerCard from '$lib/council/mobile/ConsensusTriggerCard.svelte';
	import StatusTagButtons from '$lib/council/mobile/detail/StatusTagButtons.svelte';
	import NoteEditor from '$lib/council/mobile/detail/NoteEditor.svelte';
	import TopTenPicker from '$lib/council/mobile/detail/TopTenPicker.svelte';
	import StatusPillen from '$lib/shared/StatusPillen.svelte';
	import { shortPortal } from '$lib/council/portalLabel.js';
	import { page } from '$app/state';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	const selfUser = $derived({
		id: page.data.user.id,
		display_name: page.data.user.display_name
	});
	const otherUsers = $derived(
		data.partner_user_id != null && data.partner_name
			? [{ id: data.partner_user_id, display_name: data.partner_name }]
			: []
	);

	let lensExpanded = $state(false);

	function priceFmt(v: number | null, c: string | null): string {
		if (v == null) return '—';
		const m = v / 1_000_000;
		const sym = c === 'CHF' || !c ? 'CHF' : c;
		return m >= 1 ? `${m.toFixed(2)} M ${sym}` : `${(v / 1000).toFixed(0)} k ${sym}`;
	}

	const consensusReady = $derived.by(() => {
		// Konsens-Bedingung: beide User haben object in Top-3, kein Workflow.
		if (data.workflow) return false;
		if (data.my_rank == null || data.my_rank > 3) return false;
		if (data.partner_rank == null || data.partner_rank > 3) return false;
		return true;
	});
</script>

<a class="back" href="/council/mobile">← Verlauf</a>

<!-- FOTO + STAMMDATEN -->
<div class="hero">
	<div class="photo" class:empty={!data.object.photo_url}>
		{#if data.object.photo_url}
			<img src={data.object.photo_url} alt="" />
		{:else}
			<span class="empty-glyph">⌂</span>
		{/if}
	</div>
	<div class="meta">
		<div class="addr">{data.object.address ?? data.object.title ?? data.object.id.slice(0, 12)}</div>
		<dl>
			{#if data.object.bj != null}
				<span class="k">Baujahr</span><span class="v">{data.object.bj}</span>
			{/if}
			{#if data.object.qm != null}
				<span class="k">Fläche</span><span class="v">{data.object.qm} m²</span>
			{/if}
			{#if data.object.price_value != null}
				<span class="k">Preis</span><span class="v">{priceFmt(data.object.price_value, data.object.price_currency)}</span>
			{/if}
			<span class="k">Portal</span><span class="v">{data.object.portal}</span>
		</dl>
		{#if data.object.source_url}
			<a class="portal" href={data.object.source_url} target="_blank" rel="noopener noreferrer">
				↗ {data.object.source_url.slice(0, 32)}…
			</a>
		{/if}
	</div>
</div>

<!-- B4 2026-06-05: Drei Status-Pillen (Entfernung / qm² / Preis) mit Schwellen-Farbe -->
<div class="pillen-wrap">
	<StatusPillen
		entfernung={{ km: data.distance_km, threshold: data.schwellen.distance_threshold_km }}
		qm={{ value: data.object.qm, min: data.schwellen.qm_min }}
		preis={{ value: data.object.price_value, max: data.schwellen.preis_max }}
	/>
</div>

<!-- KONSENS-BLOCK mit CTA (1b) -->
{#if consensusReady}
	<ConsensusTriggerCard
		object={data.object}
		{selfUser}
		{otherUsers}
		triggeredUserIds={data.trigger_user_ids}
	/>
{/if}

<!-- STIMMEN-STREIFEN + STATUS-PILLE -->
{#if data.voices.length > 0 && data.consensus_state}
	<div class="block stripe-row">
		<CouncilStimmenStreifenMini voices={data.voices} state={data.consensus_state} />
		<div class="status-line">
			<span class="status-tag status-{data.effective_status.status_tag}">
				{data.effective_status.status_tag}
			</span>
			{#if data.effective_status.source === 'override'}
				<span class="src">(eigene Einstufung)</span>
			{/if}
		</div>
	</div>
{/if}

<!-- WER WO (3 Spalten) -->
<div class="block werwo">
	<div class="c">
		<div class="k">Meine</div>
		<div class="v">{data.my_rank ? `#${data.my_rank}` : '—'}</div>
	</div>
	<div class="c">
		<div class="k">{data.partner_name ?? 'Partner'}</div>
		<div class="v">{data.partner_rank ? `#${data.partner_rank}` : '—'}</div>
	</div>
	<div class="c">
		<div class="k">Council</div>
		<div class="v">{data.borda_rank ? `#${data.borda_rank}` : '—'} <small>Borda</small></div>
	</div>
</div>

<!-- WORKFLOW-Indikator falls vorhanden -->
{#if data.workflow}
	<div class="block workflow">
		<div class="head">Im Workflow · {data.workflow.status}</div>
		{#if data.workflow.termin}
			<div class="row">Termin: <b>{data.workflow.termin}</b></div>
		{/if}
		{#if data.workflow.verhandlungspreis != null}
			<div class="row">VHB: <b>{priceFmt(data.workflow.verhandlungspreis, data.object.price_currency)}</b></div>
		{/if}
	</div>
{/if}

<!-- NOTIZ (read) -->
{#if data.note_text}
	<div class="section-h"><span>Notiz</span><span class="rule"></span></div>
	<div class="block note">
		{#if data.note_provenance?.kind === 'inherited' && data.note_provenance.from_portal}
			<p class="inherit-hint">
				übernommen von Bruder auf {shortPortal(data.note_provenance.from_portal)}
			</p>
		{/if}
		<p>{data.note_text}</p>
	</div>
{/if}

<!-- EINORDNUNG (1d) -->
<div class="section-h"><span>Einordnen</span><span class="rule"></span></div>
<div class="block einordnung">
	<NoteEditor objectId={data.object.id} initial={data.note_text} />
	<StatusTagButtons
		objectId={data.object.id}
		current={data.effective_status.status_tag}
		currentReason={data.effective_status.reason}
	/>
	<TopTenPicker
		objectId={data.object.id}
		currentRank={data.my_rank}
		topRanks={data.my_top_ranks}
	/>
</div>

<!-- LENS-BEITRÄGE (collapsed) -->
<div class="section-h"><span>Lens-Beiträge</span><span class="rule"></span></div>
<button class="collapse" onclick={() => (lensExpanded = !lensExpanded)} type="button">
	<span>{data.voices.length} Lenses</span>
	<span class="chev">{lensExpanded ? 'zuklappen ›' : 'aufklappen ›'}</span>
</button>
{#if lensExpanded}
	<div class="block lens-details">
		{#each data.voices as v (v.lens_id)}
			<div class="lens-row">
				<b>{v.label}</b>
				{#if v.kind === 'present'}
					· Rang #{v.rank}{v.confidence ? ` · ${v.confidence}` : ''}
				{:else}
					· nicht bewertet
				{/if}
			</div>
		{/each}
	</div>
{/if}

<style>
	.back {
		display: inline-block;
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--wf-muted, hsl(215 16% 50%));
		margin-bottom: 10px;
		text-decoration: none;
	}
	.pillen-wrap {
		padding: 8px 16px 4px;
	}
	.hero {
		display: grid;
		grid-template-columns: 110px 1fr;
		gap: 12px;
		margin-bottom: 12px;
	}
	.photo {
		width: 110px;
		height: 84px;
		border-radius: 6px;
		overflow: hidden;
		position: relative;
		background: repeating-linear-gradient(135deg, hsl(210 18% 90%) 0 5px, hsl(210 18% 94%) 5px 10px);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.photo.empty {
		background: hsl(214 20% 96%);
		border: 1px dashed var(--wf-line-strong, hsl(214 25% 78%));
	}
	.photo img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.empty-glyph {
		font-size: 24px;
		color: var(--wf-line-strong, hsl(214 25% 78%));
	}
	.meta .addr {
		font-size: 14px;
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1.25;
		margin-bottom: 6px;
	}
	.meta dl {
		margin: 0;
		display: grid;
		grid-template-columns: auto auto;
		gap: 2px 10px;
		font-family: var(--font-mono);
		font-size: 10px;
	}
	.meta .k {
		color: var(--wf-muted, hsl(215 16% 50%));
	}
	.meta .v {
		color: var(--wf-fg, hsl(222 30% 22%));
		text-align: right;
	}
	.meta .portal {
		display: block;
		margin-top: 6px;
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--st-termin-fg, hsl(217 70% 38%));
		text-decoration: none;
	}
	.block {
		padding: 10px 12px;
		background: white;
		border: 1px solid var(--wf-line, hsl(214 20% 88%));
		border-radius: 8px;
		margin-bottom: 8px;
	}
	.stripe-row {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-wrap: wrap;
	}
	.status-line {
		font-size: 11.5px;
		display: flex;
		gap: 6px;
		align-items: center;
	}
	.status-tag {
		display: inline-block;
		padding: 1px 8px;
		border-radius: 999px;
		font-family: var(--font-mono);
		font-size: 10.5px;
		font-weight: 500;
		background: var(--wf-fill, hsl(214 24% 94%));
		color: var(--wf-fg, hsl(222 30% 22%));
		border: 1px solid var(--wf-line, hsl(214 20% 88%));
	}
	.status-tag.status-kaufen {
		background: var(--verdict-kaufen-bg, hsl(142 50% 95%));
		color: var(--verdict-kaufen-fg, hsl(142 65% 25%));
		border-color: var(--verdict-kaufen-bd, hsl(142 40% 80%));
	}
	.status-tag.status-beobachten {
		background: var(--verdict-beobachten-bg, hsl(32 90% 95%));
		color: var(--verdict-beobachten-fg, hsl(32 80% 32%));
		border-color: var(--verdict-beobachten-bd, hsl(32 80% 78%));
	}
	.status-tag.status-verworfen {
		background: var(--verdict-verwerfen-bg, hsl(0 70% 96%));
		color: var(--verdict-verwerfen-fg, hsl(0 65% 38%));
		border-color: var(--verdict-verwerfen-bd, hsl(0 60% 84%));
	}
	.status-tag.status-neu {
		background: var(--st-neu-bg, hsl(265 60% 96%));
		color: var(--st-neu-fg, hsl(265 50% 42%));
		border-color: var(--st-neu-bd, hsl(265 45% 84%));
	}
	.src {
		font-family: var(--font-mono);
		font-size: 9.5px;
		color: var(--wf-muted, hsl(215 16% 50%));
	}
	.werwo {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr;
		gap: 10px;
		text-align: center;
	}
	.werwo .c .k {
		font-size: 9.5px;
		font-family: var(--font-mono);
		color: var(--wf-muted, hsl(215 16% 50%));
		text-transform: uppercase;
		letter-spacing: 0.025em;
	}
	.werwo .c .v {
		font-size: 16px;
		font-weight: 600;
		letter-spacing: -0.02em;
	}
	.werwo .c .v small {
		font-size: 9px;
		font-family: var(--font-mono);
		color: var(--wf-muted, hsl(215 16% 50%));
		font-weight: 400;
	}
	.workflow .head {
		font-family: var(--font-mono);
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--st-termin-fg, hsl(217 70% 38%));
		margin-bottom: 6px;
	}
	.workflow .row {
		font-size: 12px;
		margin-bottom: 2px;
	}
	.note p {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.45;
	}
	.section-h {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin: 16px 0 8px;
		font-family: var(--font-mono);
		font-size: 10.5px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--wf-muted, hsl(215 16% 50%));
		font-weight: 500;
	}
	.section-h .rule {
		flex: 1;
		height: 1px;
		background: var(--wf-line, hsl(214 20% 88%));
	}
	.einordnung {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.collapse {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		padding: 9px 12px;
		background: var(--wf-bg, hsl(210 25% 98.5%));
		border: 1px solid var(--wf-line, hsl(214 20% 88%));
		border-radius: 8px;
		font-size: 12px;
		font-weight: 500;
		color: var(--wf-fg, hsl(222 30% 22%));
		cursor: pointer;
		font-family: inherit;
	}
	.collapse .chev {
		font-family: var(--font-mono);
		color: var(--wf-muted, hsl(215 16% 50%));
	}
	.lens-details {
		margin-top: 6px;
	}
	.lens-row {
		font-size: 12px;
		padding: 4px 0;
		border-bottom: 1px dashed var(--wf-line, hsl(214 20% 88%));
	}
	.lens-row:last-child {
		border-bottom: 0;
	}
</style>
