<!--
  2026-06-07 BlockBreakdown: horizontale Balken aus reason_breakdown
  JSON. Max bestimmt 100%-Bar-Breite.
-->
<script lang="ts">
	let { reasonsJson }: { reasonsJson: string | null } = $props();

	type Entry = { key: string; count: number };
	const entries = $derived.by<Entry[]>(() => {
		if (!reasonsJson) return [];
		try {
			const obj = JSON.parse(reasonsJson) as Record<string, number>;
			return Object.entries(obj)
				.map(([key, count]) => ({ key, count: Number(count) || 0 }))
				.filter((e) => e.count > 0)
				.sort((a, b) => b.count - a.count);
		} catch {
			return [];
		}
	});

	const max = $derived(entries.length > 0 ? Math.max(...entries.map((e) => e.count)) : 1);

	function isFilterReason(key: string): boolean {
		return key.startsWith('out_of_corridor')
			|| key === 'projektiert'
			|| key === 'zwangsversteigerung'
			|| key === 'price_on_request'
			|| key.startsWith('blocked_by')
			|| key.startsWith('expired');
	}
</script>

{#if entries.length > 0}
	<div class="blocks">
		<div class="b-head">Block-Gründe</div>
		{#each entries as e}
			<div class="blockrow">
				<div class="b-key" title={e.key}>{e.key}</div>
				<div class="b-bar-wrap">
					<div class="b-bar" class:red={isFilterReason(e.key)} style="width: {Math.max(4, Math.round((e.count / max) * 100))}%"></div>
				</div>
				<div class="b-count">{e.count}</div>
			</div>
		{/each}
	</div>
{/if}

<style>
	.blocks {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-top: 8px;
	}
	.b-head {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(215 16% 47%);
		margin-bottom: 4px;
	}
	.blockrow {
		display: grid;
		grid-template-columns: 180px 1fr 36px;
		gap: 8px;
		align-items: center;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11px;
	}
	.b-key {
		color: hsl(215 16% 35%);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.b-bar-wrap {
		height: 10px;
		background: hsl(214 28% 95%);
		border-radius: 3px;
		overflow: hidden;
	}
	.b-bar {
		height: 100%;
		background: hsl(215 16% 55%);
		border-radius: 3px;
	}
	.b-bar.red {
		background: hsl(0 65% 55%);
	}
	.b-count {
		font-variant-numeric: tabular-nums;
		text-align: right;
		color: hsl(222 47% 11%);
		font-weight: 500;
	}
</style>
