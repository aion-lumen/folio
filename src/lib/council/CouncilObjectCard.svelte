<!--
  CouncilObjectCard — Listen-Item für /council Liste (Bauteil 3 + Desktop-Update 2026-05-31).

  Layout: links Rang + Borda-Score (optional), Mitte Foto, rechts Status-Pill +
  Stammdaten + Voices-Streifen (optional). Click öffnet Detail-Panel.
-->
<script lang="ts">
	import type {
		CouncilStatusTag,
		CouncilVoice,
		CouncilConsensusState
	} from '$lib/server/council-db/types.js';
	import type { CouncilListItem } from '$lib/server/council-db/reader.js';
	import CouncilStimmenStreifen from './CouncilStimmenStreifen.svelte';
	import { shortPortal } from '$lib/council/portalLabel.js';

	let {
		item,
		voices,
		state,
		onOpen
	}: {
		item: CouncilListItem;
		voices?: CouncilVoice[];
		state?: CouncilConsensusState;
		onOpen?: (id: string) => void;
	} = $props();

	const o = $derived(item.object);

	function fmtPrice(value: number | null, currency: string | null): string {
		if (value == null) return '—';
		const n = value.toLocaleString('de-CH');
		return currency ? `${n} ${currency}` : n;
	}

	const STATUS_CLASS: Record<string, string> = {
		neu: 'status-neu',
		kaufen: 'status-kaufen',
		beobachten: 'status-beobachten',
		verworfen: 'status-verworfen',
		archiv: 'status-archiv',
		abgelaufen: 'status-archiv'
	};
	const STATUS_LABEL: Record<string, string> = {
		neu: 'Neu',
		kaufen: 'Kaufen',
		beobachten: 'Beobachten',
		verworfen: 'Verworfen',
		archiv: 'Archiv',
		abgelaufen: 'Abgelaufen'
	};

	const inheritedFromPortal = $derived(
		item.status_provenance?.kind === 'inherited' && item.status_provenance.from_portal
			? shortPortal(item.status_provenance.from_portal)
			: null
	);

	const hostname = $derived.by(() => {
		try {
			return new URL(o.source_url).hostname.replace(/^www\./, '');
		} catch {
			return o.portal;
		}
	});

	function handleOpen() {
		onOpen?.(o.id);
	}

	function handleKey(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ' ') {
			e.preventDefault();
			handleOpen();
		}
	}
</script>

<div
	class="council-card"
	role="button"
	tabindex="0"
	onclick={handleOpen}
	onkeydown={handleKey}
>
	<div class="rank-col">
		{#if item.borda_rank != null}
			<div class="rank-num">#{item.borda_rank}</div>
			<div class="rank-score" title="Borda-Rang">Borda</div>
		{:else if item.user_rank != null}
			<div class="rank-num user">#{item.user_rank}</div>
			<div class="rank-score" title="Eigene Top-10-Position">Meine</div>
		{:else}
			<div class="rank-num placeholder">·</div>
		{/if}
	</div>

	<div class="photo-col">
		{#if o.photo_url}
			<img src={o.photo_url} alt="" loading="lazy" />
		{:else}
			<div class="photo-placeholder" aria-label="kein Foto">—</div>
		{/if}
	</div>

	<div class="content-col">
		<div class="header-row">
			<span class="status-pill {STATUS_CLASS[item.effective_status] ?? 'status-neu'}">
				{STATUS_LABEL[item.effective_status] ?? item.effective_status}
			</span>
			{#if item.override_source === 'override'}
				<span class="source" title="Eigene Einstufung überschreibt Lens-Tag">eigene</span>
			{:else if inheritedFromPortal}
				<span class="source inherited" title="Vom Cluster-Bruder übernommen (Bauteil 14)">
					von {inheritedFromPortal}
				</span>
			{/if}
			{#if voices && state}
				<CouncilStimmenStreifen {voices} {state} />
			{/if}
			<span class="seen" title="So oft im Mail-Korpus gesehen">{o.times_seen}×</span>
		</div>

		<h3 class="title" title={o.title ?? ''}>
			{o.address ?? o.title ?? '—'}
		</h3>

		<div class="stammdaten">
			{#if o.qm}<span>{o.qm} m²</span>{/if}
			{#if o.bj}<span>BJ {o.bj}</span>{/if}
			{#if o.price_value != null}<span class="price">{fmtPrice(o.price_value, o.price_currency)}</span>{/if}
			<span class="portal">{hostname}</span>
			<a
				class="ext"
				href={o.source_url}
				target="_blank"
				rel="noopener noreferrer"
				onclick={(e) => e.stopPropagation()}
				title="Inserat öffnen"
			>↗</a>
		</div>
	</div>
</div>

<style>
	.council-card {
		display: grid;
		grid-template-columns: 60px 100px 1fr;
		gap: 12px;
		padding: 12px;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 8px;
		align-items: start;
		cursor: pointer;
		transition: border-color 120ms, background 120ms;
	}
	.council-card:hover {
		border-color: hsl(222 47% 30%);
		background: hsl(214 30% 98%);
	}
	.council-card:focus-visible {
		outline: 2px solid hsl(222 47% 30%);
		outline-offset: 2px;
	}

	.rank-col {
		text-align: center;
		font-family: var(--font-mono);
	}
	.rank-num {
		font-size: 18px;
		font-weight: 600;
		color: var(--color-foreground);
		line-height: 1.1;
	}
	.rank-num.user {
		color: hsl(28 80% 38%);
	}
	.rank-num.placeholder {
		color: var(--color-muted-foreground);
		opacity: 0.4;
	}
	.rank-score {
		font-size: 9.5px;
		color: var(--color-muted-foreground);
		margin-top: 2px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.photo-col {
		width: 100px;
		aspect-ratio: 4 / 3;
		overflow: hidden;
		border-radius: 6px;
		background: hsl(210 8% 92%);
	}
	.photo-col img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	.photo-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(210 8% 55%);
		font-size: 18px;
	}

	.content-col {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.header-row {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.seen {
		margin-left: auto;
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--color-muted-foreground);
	}
	.source {
		font-family: var(--font-mono);
		font-size: 9.5px;
		color: hsl(28 80% 38%);
		letter-spacing: 0.04em;
	}

	.status-pill {
		font-family: var(--font-mono);
		font-size: 9.5px;
		font-weight: 500;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 7px;
		border-radius: 999px;
		border: 1px solid;
	}
	.status-neu {
		background: hsl(210 25% 96%);
		color: hsl(210 25% 32%);
		border-color: hsl(210 25% 85%);
	}
	.status-kaufen {
		background: hsl(140 50% 96%);
		color: hsl(140 50% 28%);
		border-color: hsl(140 40% 75%);
	}
	.status-beobachten {
		background: hsl(45 80% 95%);
		color: hsl(45 60% 30%);
		border-color: hsl(45 60% 80%);
	}
	.status-verworfen {
		background: hsl(0 8% 96%);
		color: hsl(0 8% 45%);
		border-color: hsl(0 8% 80%);
	}
	.status-archiv {
		background: hsl(210 8% 95%);
		color: hsl(210 8% 50%);
		border-color: hsl(210 8% 80%);
	}

	.title {
		font-size: 14px;
		font-weight: 500;
		margin: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		line-height: 1.3;
		color: var(--color-foreground);
	}

	.stammdaten {
		display: flex;
		flex-wrap: wrap;
		gap: 12px;
		font-size: 11.5px;
		color: var(--color-muted-foreground);
	}
	.stammdaten .price {
		color: var(--color-foreground);
		font-weight: 500;
	}
	.stammdaten .portal {
		font-family: var(--font-mono);
		font-size: 10.5px;
	}
	.stammdaten .ext {
		margin-left: auto;
		text-decoration: none;
		color: var(--color-muted-foreground);
		font-size: 14px;
		padding: 0 4px;
	}
	.stammdaten .ext:hover {
		color: var(--color-foreground);
	}
</style>
