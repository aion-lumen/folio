<!--
  Council /council Listen-Ansicht (Bauteil 3 + Desktop-Update 2026-05-31).
  Vollbestand mit Filter-Pills (Status) + Sort-Pills (Eingang/Borda/Mine) +
  Detail-Panel-Slide-in fuer Bewerten + Pflegen.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import CouncilObjectCard from '$lib/council/CouncilObjectCard.svelte';
	import CouncilDetailPanel from '$lib/council/CouncilDetailPanel.svelte';
	import LensRunPanel from '$lib/lens/LensRunPanel.svelte';
	import type { CouncilListSort } from '$lib/server/council-db/reader.js';

	let { data } = $props();

	type StatusKey = 'alle' | 'kaufen' | 'beobachten' | 'verworfen' | 'archiv';
	const STATUS_FILTERS: { key: StatusKey; label: string }[] = [
		{ key: 'alle', label: 'Alle' },
		{ key: 'kaufen', label: 'Kaufen' },
		{ key: 'beobachten', label: 'Beobachten' },
		{ key: 'verworfen', label: 'Verworfen' },
		{ key: 'archiv', label: 'Archiv' }
	];

	const SORT_OPTIONS: { key: CouncilListSort; label: string }[] = [
		{ key: 'last_updated', label: 'Eingang' },
		{ key: 'borda', label: 'Council-Borda' },
		{ key: 'mine', label: 'Meine Top-10' }
	];

	function countFor(key: StatusKey): number {
		if (key === 'alle') {
			return (
				data.counts.neu +
				data.counts.kaufen +
				data.counts.beobachten +
				data.counts.verworfen +
				data.counts.archiv
			);
		}
		return data.counts[key as keyof typeof data.counts] ?? 0;
	}

	async function selectStatus(key: StatusKey) {
		const sp = new URLSearchParams(page.url.search);
		if (key === 'alle') sp.delete('status');
		else sp.set('status', key);
		const qs = sp.toString();
		await goto(qs ? `/council?${qs}` : '/council', { keepFocus: true, noScroll: true });
	}

	async function selectSort(key: CouncilListSort) {
		const sp = new URLSearchParams(page.url.search);
		if (key === 'last_updated') sp.delete('sort');
		else sp.set('sort', key);
		const qs = sp.toString();
		await goto(qs ? `/council?${qs}` : '/council', { keepFocus: true, noScroll: true });
	}

	// Detail-Panel state
	let openId: string | null = $state(null);
	const openItem = $derived(
		openId ? data.items.find((i) => i.object.id === openId) ?? null : null
	);
	const openVoices = $derived(openId ? data.voicesByObject[openId] : undefined);

	function openDetail(id: string) {
		openId = id;
	}
	function closeDetail() {
		openId = null;
	}
</script>

<svelte:head>
	<title>Folio · Council</title>
</svelte:head>

<div class="page">
	<header class="page-header">
		<div>
			<h1>Council</h1>
			<p class="hint">
				Bewerten, einstufen, Top-10 pflegen. Borda-Konsens läuft im Hintergrund (alle 4 h).
			</p>
		</div>
		<div class="head-right">
			<LensRunPanel domain="council" />
			<div class="user-badge">
				<span class="badge-label">eingeloggt als</span>
				<span class="badge-name">{data.user.display_name}</span>
				<span class="badge-role">{data.user.role}</span>
			</div>
		</div>
	</header>

	<div class="controls">
		<nav class="filter-bar" aria-label="Status-Filter">
			{#each STATUS_FILTERS as f (f.key)}
				{@const active = data.status === f.key}
				<button
					type="button"
					class="chip"
					class:active
					onclick={() => selectStatus(f.key)}
				>
					<span>{f.label}</span>
					<span class="count">{countFor(f.key)}</span>
				</button>
			{/each}
		</nav>
		<nav class="sort-bar" aria-label="Sortierung">
			<span class="sort-label">Sort</span>
			{#each SORT_OPTIONS as s (s.key)}
				{@const active = data.sort === s.key}
				<button
					type="button"
					class="chip subtle"
					class:active
					onclick={() => selectSort(s.key)}
				>
					{s.label}
				</button>
			{/each}
		</nav>
	</div>

	{#if data.items.length === 0}
		<section class="empty">
			<h2>Keine Objekte im aktuellen Filter</h2>
			<p>
				Status-Filter wechseln oder den Council-Lens-Lauf manuell anstoßen:
			</p>
			<p>
				<code>cd ~/Projects/aion-lumen/council && .venv/bin/python3 scripts/council_lens_run.py --no-llm</code>
			</p>
		</section>
	{:else}
		<div class="meta">{data.items.length} Objekte</div>
		<section class="list">
			{#each data.items as item (item.object.id)}
				{@const v = data.voicesByObject[item.object.id]}
				<CouncilObjectCard
					{item}
					voices={v?.voices}
					state={v?.state}
					onOpen={openDetail}
				/>
			{/each}
		</section>
	{/if}
</div>

{#if openItem}
	<CouncilDetailPanel
		item={openItem}
		voices={openVoices?.voices}
		voiceState={openVoices?.state}
		userRanks={data.userRanks}
		partnerRanks={data.partnerRanks}
		partner={data.partner}
		notes={data.notes}
		onClose={closeDetail}
	/>
{/if}

<style>
	.page {
		max-width: 1100px;
		margin: 0 auto;
		padding: 24px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}
	.page-header h1 {
		font-size: 24px;
		font-weight: 600;
		letter-spacing: -0.02em;
		margin: 0 0 4px;
		color: var(--color-foreground);
	}
	.hint {
		font-size: 13px;
		color: var(--color-muted-foreground);
		margin: 0;
		max-width: 60ch;
	}
	.head-right {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 10px;
	}
	.user-badge {
		display: inline-flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 2px;
		padding: 8px 12px;
		border: 1px solid var(--color-border);
		border-radius: 8px;
		background: var(--color-card);
		font-size: 11px;
	}
	.badge-label {
		font-family: var(--font-mono);
		font-size: 9.5px;
		color: var(--color-muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.badge-name {
		font-weight: 500;
	}
	.badge-role {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--color-muted-foreground);
	}

	.controls {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.filter-bar,
	.sort-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: center;
	}
	.sort-label {
		font-family: var(--font-mono);
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--color-muted-foreground);
		margin-right: 4px;
	}
	.chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 5px 11px;
		border-radius: 999px;
		font-size: 11.5px;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		color: var(--color-muted-foreground);
		cursor: pointer;
		transition: background 120ms, color 120ms, border-color 120ms;
	}
	.chip:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}
	.chip.active {
		background: hsl(222 47% 11%);
		color: hsl(210 40% 98%);
		border-color: hsl(222 47% 11%);
	}
	.chip.subtle {
		font-size: 11px;
		padding: 4px 10px;
	}
	.chip .count {
		font-family: var(--font-mono);
		font-size: 10px;
		opacity: 0.75;
	}

	.meta {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--color-muted-foreground);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.empty {
		border: 1px dashed var(--color-border);
		border-radius: 12px;
		padding: 24px;
		background: var(--color-card);
	}
	.empty h2 {
		margin: 0 0 12px;
		font-size: 16px;
	}
	.empty p {
		margin: 8px 0;
		font-size: 13px;
		color: var(--color-muted-foreground);
	}
	.empty code {
		font-family: var(--font-mono);
		font-size: 0.9em;
		padding: 1px 5px;
		background: var(--color-muted);
		border-radius: 3px;
	}
</style>
