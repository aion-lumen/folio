<!--
  Mobile 1d (2026-05-30): Meine-10-Tab. Drag-Drop-Liste mit user_rankings.
  Reorder schreibt batched user_rankings — alle bewegten objekte in einer
  transaktion mit identischem recorded_at (Bauteil 0.5 mechanik).

  Mobile-Aufraeumen (2026-05-31): Toggle "Meine 10" / "Council-Borda".
  Bei Council-Borda zeigt der Tab die konsolidierte Borda-Liste read-only.
-->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import SortableList from '$lib/council/mobile/meine10/SortableList.svelte';
	import ObjectCard from '$lib/council/mobile/ObjectCard.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();
	let error = $state<string | null>(null);
	let view: 'mine' | 'borda' = $state('mine');

	type Item = (typeof data.items)[number] & { id: string };

	const sortableItems = $derived<Item[]>(
		data.items.map((it) => ({ ...it, id: it.object.id }))
	);

	async function commitReorder(newOrder: Item[]) {
		// neue ranks 1..N
		const batch: Array<{ object_id: string; rank: number }> = [];
		for (let i = 0; i < newOrder.length; i++) {
			const newRank = i + 1;
			const prevRank = data.items.find((x) => x.object.id === newOrder[i].id)?.rank ?? null;
			if (prevRank !== newRank) {
				batch.push({ object_id: newOrder[i].id, rank: newRank });
			}
		}
		if (batch.length === 0) return;
		error = null;
		try {
			const res = await fetch('/api/council/me/rankings', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ batch })
			});
			if (!res.ok) {
				const t = await res.text();
				throw new Error(t || `HTTP ${res.status}`);
			}
			await invalidateAll();
		} catch (e) {
			error = (e as Error).message;
			throw e; // re-throw damit SortableList revertiert
		}
	}

	function bordaHint(myRank: number, bordaRank: number | null): string | null {
		if (bordaRank == null) return null;
		const diff = bordaRank - myRank;
		if (diff > 3) return 'Borda niedriger';
		if (diff < -3) return 'Borda höher';
		return null;
	}
</script>

<div class="toggle" role="tablist" aria-label="Ansicht">
	<button
		type="button"
		role="tab"
		aria-selected={view === 'mine'}
		class="tab"
		class:active={view === 'mine'}
		onclick={() => (view = 'mine')}
	>
		Meine 10
	</button>
	<button
		type="button"
		role="tab"
		aria-selected={view === 'borda'}
		class="tab"
		class:active={view === 'borda'}
		onclick={() => (view = 'borda')}
	>
		Council-Borda
	</button>
</div>

{#if view === 'mine'}
	<div class="hint">Halten &amp; ziehen zum Umsortieren</div>

	{#if sortableItems.length === 0}
		<div class="empty">
			Noch keine Top-10. Pflege sie im Detail eines Objekts unter „In Top-10 verschieben".
		</div>
	{:else}
		<SortableList items={sortableItems} onReorder={commitReorder}>
			{#snippet itemSnippet({ value, gripAttrs })}
				<div class="row">
					<button class="grip" type="button" {...gripAttrs} aria-label="Verschieben">
						<span></span>
						<span></span>
						<span></span>
					</button>
					<div class="card-wrap">
						<ObjectCard
							object={value.object}
							voices={value.voices}
							state={value.state ?? undefined}
							photoSize={52}
							href="/council/mobile/{value.object.id}"
							extraLine={bordaHint(value.rank, value.borda_rank) ?? undefined}
						/>
					</div>
					<div class="rank">
						<b>#{value.rank}</b>
						{#if value.borda_rank != null}
							<span class="cb">· Council #{value.borda_rank}</span>
						{/if}
					</div>
				</div>
			{/snippet}
		</SortableList>
	{/if}

	{#if error}
		<div class="err">{error}</div>
	{/if}
{:else}
	<div class="hint">Konsolidierte Borda-Liste · read-only</div>

	{#if data.bordaItems.length === 0}
		<div class="empty">
			Noch keine Council-Bewertung — Borda-Worker läuft alle 4 h.
		</div>
	{:else}
		{#each data.bordaItems as b (b.object.id)}
			<div class="row borda-row">
				<div class="rank-badge">
					<b>#{b.borda_rank}</b>
				</div>
				<div class="card-wrap">
					<ObjectCard
						object={b.object}
						voices={b.voices}
						state={b.state}
						photoSize={52}
						href="/council/mobile/{b.object.id}"
					/>
				</div>
				<div class="rank">
					<span class="cb">{b.borda_score.toFixed(1)}</span>
				</div>
			</div>
		{/each}
	{/if}
{/if}

<style>
	.toggle {
		display: flex;
		gap: 6px;
		margin: 0 0 10px;
	}
	.tab {
		flex: 1;
		padding: 6px 10px;
		font-family: var(--font-mono);
		font-size: 11px;
		letter-spacing: 0.025em;
		background: white;
		color: var(--wf-muted, hsl(215 16% 50%));
		border: 1px solid var(--wf-line, hsl(214 20% 88%));
		border-radius: 999px;
		cursor: pointer;
	}
	.tab.active {
		background: hsl(222 47% 11%);
		color: white;
		border-color: hsl(222 47% 11%);
	}
	.hint {
		padding: 4px 2px 10px;
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--wf-muted, hsl(215 16% 50%));
	}
	.empty {
		padding: 32px 16px;
		text-align: center;
		font-size: 12.5px;
		color: var(--wf-muted, hsl(215 16% 50%));
		line-height: 1.5;
	}
	.row {
		display: grid;
		grid-template-columns: 26px 1fr auto;
		gap: 6px;
		align-items: center;
		padding: 0 0 0 4px;
	}
	.borda-row {
		grid-template-columns: 30px 1fr auto;
	}
	.grip {
		display: flex;
		flex-direction: column;
		gap: 3px;
		align-items: center;
		justify-content: center;
		padding: 6px 4px;
		background: transparent;
		border: 0;
		cursor: grab;
	}
	.grip span {
		width: 14px;
		height: 1.75px;
		background: var(--wf-line-strong, hsl(214 25% 78%));
		border-radius: 2px;
	}
	.rank-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono);
		font-size: 11px;
		color: hsl(222 47% 11%);
	}
	.rank-badge b {
		font-size: 13px;
		font-weight: 600;
	}
	.card-wrap :global(.pcard) {
		margin-bottom: 6px;
	}
	.rank {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		font-family: var(--font-mono);
		font-size: 10px;
		padding-right: 6px;
		gap: 2px;
		color: var(--wf-muted, hsl(215 16% 50%));
	}
	.rank b {
		color: hsl(222 47% 11%);
		font-size: 13px;
		font-weight: 600;
	}
	.cb {
		font-size: 9.5px;
	}
	.err {
		margin-top: 8px;
		padding: 6px 10px;
		font-size: 11.5px;
		color: var(--verdict-verwerfen-fg, hsl(0 65% 38%));
		background: var(--verdict-verwerfen-bg, hsl(0 70% 96%));
		border: 1px solid var(--verdict-verwerfen-bd, hsl(0 60% 84%));
		border-radius: 4px;
	}
</style>
