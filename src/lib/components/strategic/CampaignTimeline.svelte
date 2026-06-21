<script lang="ts">
	import type { Act, Campaign } from '$lib/types/campaign.js';
	import { layoutStore } from '$lib/stores/layout.svelte.js';

	let { acts, campaign }: { acts: Act[]; campaign: Campaign } = $props();

	function selectAct(actNumber: number) {
		layoutStore.setSelectedAct(actNumber);
	}

	let collapsed = $state(false);

	const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

	function monthsSince(dateStr: string): number {
		const start = new Date(dateStr);
		const now = new Date();
		return (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
	}

	const startYear = $derived(new Date(campaign?.campaign_start ?? '2026-01-01').getFullYear());

	// Vault stores horizon values as years (e.g. 2026, 2027).
	// Convert to month offsets from campaign start when values look like years.
	function toMonthOffset(value: number): number {
		return value > 1000 ? (value - startYear) * 12 : value;
	}

	const processedActs = $derived(
		acts.map((a) => ({
			...a,
			horizon_start: toMonthOffset(a.horizon_start),
			horizon_end: toMonthOffset(a.horizon_end)
		}))
	);

	const totalMonths = $derived(
		processedActs.length ? processedActs[processedActs.length - 1].horizon_end : 120
	);
	const nowMonth = $derived(
		campaign?.campaign_start
			? Math.max(0, Math.min(monthsSince(campaign.campaign_start), totalMonths))
			: 0
	);
	const nowPct = $derived((nowMonth / totalMonths) * 100);

	const ticks = $derived([
		...processedActs.map((a) => ({
			label: String(startYear + Math.floor(a.horizon_start / 12)),
			pct: (a.horizon_start / totalMonths) * 100
		})),
		{
			label: String(startYear + Math.floor(totalMonths / 12)),
			pct: 100
		}
	]);
</script>

<div class="tl-wrap">
	<div class="tl-head">
		<span class="tl-label">Kampagne</span>
		<span class="tl-meta">{totalMonths} Monate · Monat {nowMonth}</span>
		<span class="tl-range">{startYear} — {startYear + Math.floor(totalMonths / 12)}</span>
		<button class="tl-toggle" onclick={() => (collapsed = !collapsed)}>
			{collapsed ? '▾ Zeitlinie' : '▴ Zeitlinie'}
		</button>
	</div>

	{#if !collapsed}
		<div class="tl-acts">
			{#each processedActs as act, i}
				{@const duration = act.horizon_end - act.horizon_start}
				{@const isActive = act.status === 'active'}
				{@const isCompleted = act.status === 'completed'}
				{@const done = isActive
					? Math.max(0, nowMonth - act.horizon_start)
					: isCompleted
						? duration
						: 0}
				{@const fillPct = Math.max(0, Math.min((done / duration) * 100, 100))}
				<button
					class="tl-act"
					class:active={isActive}
					class:done={isCompleted}
					class:selected={act.act_number === layoutStore.selectedAct}
					style="flex: {duration} {duration} 0"
					title="{act.title} · {duration} Monate"
					onclick={() => selectAct(act.act_number)}
					aria-label="Akt {ROMAN[i] ?? act.act_number} wählen: {act.title}"
				>
					<div class="act-bar">
						<div class="act-fill" style="width: {fillPct}%"></div>
					</div>
					<div class="act-roman">AKT {ROMAN[i] ?? act.act_number}</div>
					<div class="act-label">{act.title}</div>
				</button>
			{/each}
			<div class="tl-now" style="left: {nowPct}%" title="Jetzt · Monat {nowMonth}"></div>
		</div>

		<div class="tl-ticks">
			{#each ticks as t}
				<span style="left: {t.pct}%">{t.label}</span>
			{/each}
		</div>
	{/if}
</div>

<style>
	.tl-wrap {
		padding: 12px 20px 10px;
		border-bottom: 1px solid var(--color-border);
		background: hsl(210 40% 99%);
	}

	.tl-head {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 10px;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		font-weight: 500;
		color: var(--color-muted-foreground);
	}
	.tl-meta {
		font-family: var(--font-mono);
		color: var(--color-foreground);
		letter-spacing: 0.05em;
		text-transform: none;
		font-size: 11px;
	}
	.tl-range {
		margin-left: auto;
		font-family: var(--font-mono);
		letter-spacing: 0.02em;
		text-transform: none;
		font-size: 11px;
	}
	.tl-toggle {
		background: none;
		border: none;
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.05em;
		color: var(--color-muted-foreground);
		padding: 2px 8px;
		border-radius: 4px;
		transition: background 150ms, color 150ms;
	}
	.tl-toggle:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}

	.tl-acts {
		display: flex;
		gap: 3px;
		position: relative;
		margin-bottom: 4px;
	}
	.tl-act {
		position: relative;
		padding-top: 26px;
		padding-bottom: 6px;
		cursor: pointer;
		border-radius: 6px;
		transition: background 150ms, box-shadow 150ms;
		min-width: 0;
		/* button reset */
		background: none;
		border: none;
		font-family: inherit;
		text-align: left;
	}
	.tl-act:hover {
		background: hsl(210 40% 97%);
	}
	.tl-act.selected:not(.active) {
		box-shadow: 0 0 0 1.5px var(--color-lumen, hsl(45 96% 55%));
	}

	.act-bar {
		position: absolute;
		top: 10px;
		left: 4px;
		right: 4px;
		height: 6px;
		background: var(--color-muted);
		border-radius: 3px;
		overflow: hidden;
	}
	.tl-act.active .act-bar {
		background: hsl(32 100% 60% / 0.18);
		box-shadow: 0 0 0 1px hsl(32 100% 60% / 0.35);
	}
	.act-fill {
		position: absolute;
		inset: 0;
		background: var(--color-primary);
		border-radius: 3px;
		transform-origin: left;
	}
	.tl-act.active .act-fill {
		background: var(--color-lumen);
		box-shadow: 0 0 8px hsl(32 100% 60% / 0.55);
	}
	.tl-act.done .act-fill {
		background: var(--color-primary);
		opacity: 0.6;
	}

	.act-roman {
		font-family: var(--font-mono);
		font-size: 9px;
		color: var(--color-muted-foreground);
		letter-spacing: 0.1em;
		padding: 0 6px;
		margin-bottom: 2px;
		text-transform: uppercase;
	}
	.tl-act.active .act-roman {
		color: var(--color-lumen);
	}

	.act-label {
		font-size: 11px;
		font-weight: 500;
		color: var(--color-muted-foreground);
		padding: 0 6px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.tl-act.active .act-label,
	.tl-act.done .act-label {
		color: var(--color-foreground);
		font-weight: 600;
	}

	.tl-now {
		position: absolute;
		top: 2px;
		width: 2px;
		height: 22px;
		background: var(--color-lumen);
		border-radius: 1px;
		box-shadow: 0 0 6px hsl(32 100% 60% / 0.65);
		transform: translateX(-50%);
		pointer-events: none;
	}

	.tl-ticks {
		position: relative;
		height: 14px;
	}
	.tl-ticks span {
		position: absolute;
		font-family: var(--font-mono);
		font-size: 9px;
		color: var(--color-muted-foreground);
		letter-spacing: 0.06em;
		transform: translateX(-50%);
	}
</style>
