<!--
  Mobile 1e (2026-05-30): Suche-Tab. Volltext über Council-Bestand +
  Status-Filter (effectiveStatusTag-gemerged). URL-basiert (?q=…&status=…)
  via goto/replaceState — bookmarkable, back/forward funktioniert.

  Debounce 250ms auf input — Tailscale-bewusst, kein POST pro Tastendruck.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page, navigating } from '$app/state';
	import ObjectCard from '$lib/council/mobile/ObjectCard.svelte';
	import StatusPill from '$lib/council/mobile/StatusPill.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// Local input mirror — debounced sync to URL.
	let q = $state(data.q);
	let status = $state(data.status);
	let timer: ReturnType<typeof setTimeout> | null = null;

	// Wenn URL-State sich ändert (back/forward), local angleichen.
	$effect(() => {
		if (data.q !== q && !timer) q = data.q;
		if (data.status !== status) status = data.status;
	});

	function pushUrl() {
		const url = new URL(page.url);
		if (q.trim()) url.searchParams.set('q', q.trim());
		else url.searchParams.delete('q');
		if (status !== 'alle') url.searchParams.set('status', status);
		else url.searchParams.delete('status');
		goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}

	// Mobile-Aufraeumen (2026-05-31): Debounce auf 400ms — Tailscale-RTT ist
	// 50-300ms, 400ms gibt dem Worker einen kompletten Tipprhythmus-Atemzug.
	function onInput() {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => {
			timer = null;
			pushUrl();
		}, 400);
	}

	function setStatus(s: typeof status) {
		status = s;
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		pushUrl();
	}

	function clear() {
		q = '';
		if (timer) clearTimeout(timer);
		timer = null;
		pushUrl();
	}

	type StatusFilter = 'alle' | 'beobachten' | 'kaufen' | 'archiv';
	const filters: { value: StatusFilter; label: string }[] = [
		{ value: 'alle', label: 'Alle' },
		{ value: 'kaufen', label: 'Kaufen' },
		{ value: 'beobachten', label: 'Beobachten' },
		{ value: 'archiv', label: 'Archiv' }
	];

	// Desktop-Bugs (2026-05-31): "Alle" zeigt jetzt vollen Bestand. Hint nur,
	// wenn der Bestand wirklich leer ist (DB ohne Objekte) UND keine Eingabe.
	const showEmptyHint = $derived(
		data.hits.length === 0 && q.trim() === '' && status === 'alle'
	);
	const showNoResults = $derived(!showEmptyHint && data.hits.length === 0);
	// Skeleton während goto() läuft (URL-Replace zur Suche-Route).
	const isSearching = $derived(
		navigating.to?.url.pathname === '/council/mobile/suche'
	);
</script>

<div class="search-bar">
	<input
		type="search"
		bind:value={q}
		oninput={onInput}
		placeholder="Adresse · PLZ · Stadt …"
		aria-label="Suche"
		autocomplete="off"
	/>
	{#if q}
		<button type="button" class="clear" onclick={clear} aria-label="Suche löschen">✕</button>
	{/if}
</div>

<div class="filters" role="tablist" aria-label="Status-Filter">
	{#each filters as f (f.value)}
		<button
			type="button"
			role="tab"
			aria-selected={status === f.value}
			class="filter"
			class:active={status === f.value}
			onclick={() => setStatus(f.value)}
		>
			{f.label}
		</button>
	{/each}
</div>

{#if isSearching}
	<div class="meta">…</div>
	{#each [0, 1, 2, 3] as i (i)}
		<div class="skeleton" aria-hidden="true">
			<div class="sk-photo"></div>
			<div class="sk-body">
				<div class="sk-line sk-title"></div>
				<div class="sk-line sk-spec"></div>
			</div>
		</div>
	{/each}
{:else if showEmptyHint}
	<div class="hint">Suche nach Adresse, PLZ oder Stadt — oder wähle einen Status-Filter, um den Bestand zu browsen.</div>
{:else if showNoResults}
	<div class="hint">Keine Treffer für „{q}"{status !== 'alle' ? ` mit Status „${status}"` : ''}.</div>
{:else}
	<div class="meta">{data.hits.length} Treffer</div>
	{#each data.hits as h (h.object.id)}
		<div class="hit">
			<ObjectCard
				object={h.object}
				href="/council/mobile/{h.object.id}"
				clusterMembers={h.cluster_members}
				statusProvenance={h.status_provenance}
			/>
			<div class="hit-foot">
				<StatusPill
					variant={h.effective_status === 'abgelaufen' ? 'verworfen' : h.effective_status === 'neu' ? 'neu' : (h.effective_status as 'kaufen' | 'beobachten' | 'verworfen')}
					label={h.effective_status}
				/>
				{#if h.override_source === 'override'}
					<span class="src">eigene Einstufung</span>
				{:else if h.override_source === 'inherited'}
					<span class="src">Cluster-Erbe</span>
				{/if}
			</div>
		</div>
	{/each}
{/if}

<style>
	.search-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		background: white;
		border: 1px solid var(--wf-line, hsl(214 20% 88%));
		border-radius: 8px;
		padding: 6px 10px;
		margin-bottom: 10px;
	}
	input[type='search'] {
		flex: 1;
		min-width: 0;
		border: 0;
		font-family: var(--font-mono);
		font-size: 12px;
		color: var(--wf-fg, hsl(222 30% 22%));
		outline: none;
		background: transparent;
		appearance: none;
		-webkit-appearance: none;
	}
	input::placeholder {
		color: var(--wf-muted, hsl(215 16% 50%));
	}
	.clear {
		background: var(--wf-fill, hsl(214 24% 94%));
		border: 0;
		border-radius: 999px;
		width: 20px;
		height: 20px;
		font-size: 11px;
		line-height: 1;
		color: var(--wf-muted, hsl(215 16% 50%));
		cursor: pointer;
	}
	.filters {
		display: flex;
		gap: 6px;
		margin-bottom: 14px;
		flex-wrap: wrap;
	}
	.filter {
		padding: 5px 10px;
		font-family: var(--font-mono);
		font-size: 10.5px;
		letter-spacing: 0.025em;
		background: white;
		color: var(--wf-muted, hsl(215 16% 50%));
		border: 1px solid var(--wf-line, hsl(214 20% 88%));
		border-radius: 999px;
		cursor: pointer;
	}
	.filter.active {
		background: hsl(222 47% 11%);
		color: white;
		border-color: hsl(222 47% 11%);
	}
	.hint {
		padding: 24px 16px;
		text-align: center;
		font-size: 12.5px;
		color: var(--wf-muted, hsl(215 16% 50%));
		line-height: 1.5;
	}
	.meta {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--wf-muted, hsl(215 16% 50%));
		margin-bottom: 6px;
	}
	.hit {
		margin-bottom: 8px;
	}
	.hit-foot {
		display: flex;
		align-items: center;
		gap: 6px;
		margin: -4px 4px 0;
		font-size: 11px;
	}
	.src {
		font-family: var(--font-mono);
		font-size: 9.5px;
		color: var(--ember-fg, hsl(28 80% 38%));
	}
	.skeleton {
		display: grid;
		grid-template-columns: auto 1fr;
		gap: 10px;
		padding: 9px 10px;
		background: white;
		border: 1px solid var(--wf-line, hsl(214 20% 88%));
		border-radius: 8px;
		margin-bottom: 8px;
	}
	.sk-photo {
		width: 60px;
		height: 60px;
		border-radius: 6px;
		background: hsl(214 20% 92%);
		animation: sk-pulse 1.4s ease-in-out infinite;
	}
	.sk-body {
		display: flex;
		flex-direction: column;
		gap: 6px;
		padding-top: 4px;
	}
	.sk-line {
		height: 10px;
		border-radius: 3px;
		background: hsl(214 20% 92%);
		animation: sk-pulse 1.4s ease-in-out infinite;
	}
	.sk-title {
		width: 70%;
	}
	.sk-spec {
		width: 45%;
		height: 8px;
		animation-delay: 0.15s;
	}
	@keyframes sk-pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.55; }
	}
</style>
