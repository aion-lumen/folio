<script lang="ts">
	import type { Chapter, Act } from '$lib/types/campaign.js';
	import { selectionStore } from '$lib/stores/selection.svelte.js';
	import { hoverStore } from '$lib/stores/hover.svelte.js';
	import { campaignStore } from '$lib/stores/campaign.svelte.js';
	import type { HauskaufCard } from '$lib/kampagne/types.js';

	let {
		chapter,
		act,
		hauskaufCards
	}: {
		chapter: Chapter;
		act: Act | null;
		hauskaufCards?: HauskaufCard[];
	} = $props();

	// 2026-06-08 Bauteil 2.7c (R3): zusaetzliche Stat-Spalte fuer Hauskauf-
	// Kapitel — 'X Termine diese Woche'. Ersetzt nicht die existierenden
	// Stats, sondern ergaenzt rechts daneben.
	const isHauskaufChapter = $derived(
		chapter.chapter_number === 4 && chapter.parent_act === 2
	);
	const terminCount = $derived.by(() => {
		if (!isHauskaufChapter || !hauskaufCards) return 0;
		const now = new Date();
		const day = now.getDay();
		const daysFromMonday = (day + 6) % 7;
		const start = new Date(now);
		start.setHours(0, 0, 0, 0);
		start.setDate(start.getDate() - daysFromMonday);
		const endExclusive = new Date(start);
		endExclusive.setDate(endExclusive.getDate() + 7);
		const startMs = start.getTime();
		const endMs = endExclusive.getTime();
		let n = 0;
		for (const c of hauskaufCards) {
			if (c.workflow.status !== 'offen' && c.workflow.status !== 'in_arbeit') continue;
			if (!c.workflow.termin) continue;
			const iso = c.workflow.termin.includes('T')
				? c.workflow.termin
				: c.workflow.termin + 'T00:00:00';
			const t = new Date(iso).getTime();
			if (Number.isFinite(t) && t >= startMs && t < endMs) n++;
		}
		return n;
	});

	let collapsed = $state(false);

	const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI'];

	const actRoman = $derived(ROMAN[chapter.parent_act - 1] ?? String(chapter.parent_act));
	const actTitle = $derived(act?.title ?? '');

	const pathStats = $derived(
		(() => {
			const map = new Map<string, { done: number; total: number }>();
			for (const obj of chapter.objectives) {
				for (const goal of obj.related_goals) {
					if (!map.has(goal)) map.set(goal, { done: 0, total: 0 });
					const g = map.get(goal)!;
					g.total++;
					if (obj.status === 'done' || obj.status === 'archived') g.done++;
				}
			}
			return [...map.entries()]
				.map(([name, s]) => ({
					name,
					done: s.done,
					total: s.total,
					pct: s.total ? Math.round((s.done / s.total) * 100) : 0
				}))
				.filter((p) => p.total > 0)
				.sort((a, b) => b.total - a.total);
		})()
	);

	const progressPct = $derived(Math.round(chapter.progress * 100));
	const activeCount = $derived(
		chapter.objectives.filter((o) => o.status !== 'done' && o.status !== 'archived').length
	);

	// Cross-highlighting: derive active goals from selection + hover
	const selectedGoals = $derived(
		new Set(
			Array.from(selectionStore.selectedIds).flatMap(
				(id) => campaignStore.allObjectives.find((o) => o.id === id)?.related_goals ?? []
			)
		)
	);
	const hoveredGoals = $derived(
		new Set(
			campaignStore.allObjectives.find((o) => o.id === hoverStore.hoveredObjectiveId)
				?.related_goals ?? []
		)
	);

	function pathState(name: string): 'normal' | 'hovered' | 'selected' {
		if (selectedGoals.has(name)) return 'selected';
		if (selectionStore.selectedIds.size === 0 && hoveredGoals.has(name)) return 'hovered';
		return 'normal';
	}
</script>

<div class="banner" class:collapsed>
	<button class="toggle" onclick={() => (collapsed = !collapsed)} title={collapsed ? 'Ausklappen' : 'Einklappen'}>
		{collapsed ? '▾ Kapitel' : '▴ Kapitel'}
	</button>

	<!-- Immer sichtbare Kopfzeile -->
	<div class="bar-head">
		<span class="crumb">AKT {actRoman} · KAP {chapter.chapter_number}</span>
		<span class="motto-line">{chapter.title}{chapter.atmosphere ? ' · ' + chapter.atmosphere : ''}</span>
	</div>

	{#if !collapsed}
		<div class="body-full">
			<!-- Left: title block only -->
			<div class="left">
				<div class="breadcrumb">
					AKT {actRoman}{actTitle ? ' · ' + actTitle.toUpperCase() : ''} · KAPITEL {chapter.chapter_number}
				</div>
				<h2 class="chapter-title">{chapter.title}</h2>
				{#if chapter.atmosphere}
					<p class="chapter-motto">{chapter.atmosphere}</p>
				{/if}
			</div>

			<!-- Right: paths + KPIs stacked -->
			<div class="right-panel">
				{#if pathStats.length > 0}
					<div class="paths-strip">
						{#each pathStats as p}
							{@const state = pathState(p.name)}
							<div class="p-row p-{state}">
								<span class="p-name">{p.name}</span>
								<span class="p-count">{p.done}/{p.total}</span>
								<div class="p-bar"><span style="width: {p.pct}%"></span></div>
							</div>
						{/each}
					</div>
				{/if}

				<div class="stats">
					<div class="stat">
						<div class="stat-k">Fortschritt</div>
						<div class="stat-v">{progressPct}<small>%</small></div>
					</div>
					<div class="stat">
						<div class="stat-k">Aktive Ziele</div>
						<div class="stat-v">{activeCount}</div>
					</div>
					{#if isHauskaufChapter}
						<div class="stat">
							<div class="stat-k">Termine</div>
							<div class="stat-v">{terminCount}<small> diese Woche</small></div>
						</div>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.banner {
		position: relative;
		padding: 14px 20px 16px;
		border-bottom: 1px solid var(--color-border);
		background: var(--color-card);
		overflow: hidden;
	}

	.toggle {
		position: absolute;
		top: 10px;
		right: 16px;
		background: none;
		border: none;
		cursor: pointer;
		font-family: var(--font-mono);
		font-size: 10px;
		letter-spacing: 0.06em;
		color: var(--color-muted-foreground);
		padding: 2px 8px;
		border-radius: 4px;
		transition: background 150ms, color 150ms;
		z-index: 1;
	}
	.toggle:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
	}

	.bar-head {
		display: flex;
		align-items: center;
		gap: 10px;
		padding-right: 100px;
	}
	.crumb {
		font-family: var(--font-mono);
		font-size: 9px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--color-lumen);
		white-space: nowrap;
	}
	.motto-line {
		font-size: 12px;
		color: var(--color-muted-foreground);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.body-full {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
		gap: 20px 32px;
		margin-top: 14px;
		align-items: start;
	}
	.left {
		min-width: 0;
	}

	/* Stack below ~1100px effective content width */
	@media (max-width: 1100px) {
		.body-full {
			grid-template-columns: 1fr;
		}
	}

	.breadcrumb {
		font-family: var(--font-mono);
		font-size: 9px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--color-lumen);
		margin-bottom: 6px;
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.breadcrumb::before {
		content: '';
		display: inline-block;
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--color-lumen);
		box-shadow: 0 0 6px var(--color-lumen);
		flex-shrink: 0;
	}

	.chapter-title {
		font-size: 22px;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1.2;
		margin: 0 0 4px;
		color: var(--color-foreground);
	}
	.chapter-motto {
		font-size: 13px;
		font-style: italic;
		color: var(--color-muted-foreground);
		margin: 0;
		line-height: 1.4;
	}

	.right-panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		min-width: 0;
	}

	.paths-strip {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	/* Single-line layout: name | count | bar */
	.p-row {
		display: grid;
		grid-template-columns: minmax(60px, 1fr) 36px minmax(80px, 2fr);
		align-items: center;
		gap: 8px;
	}
	.p-name {
		font-size: 11px;
		font-weight: 500;
		color: var(--color-foreground);
		text-transform: capitalize;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.p-count {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--color-muted-foreground);
		text-align: right;
		white-space: nowrap;
	}
	.p-bar {
		height: 4px;
		background: var(--color-muted);
		border-radius: 2px;
		overflow: hidden;
	}
	.p-bar span {
		display: block;
		height: 100%;
		background: var(--color-primary);
		border-radius: 2px;
		transition: width 300ms ease, background 200ms ease-out, box-shadow 200ms ease-out;
	}

	/* Hover state — subtle warmth */
	.p-hovered .p-name {
		font-weight: 600;
		color: var(--color-foreground);
		transition: font-weight 200ms ease-out, color 200ms ease-out;
	}
	.p-hovered .p-bar span {
		background: color-mix(in srgb, var(--color-primary) 88%, var(--color-lumen) 12%);
	}

	/* Selected state — strong accent + glow */
	.p-selected .p-name {
		font-weight: 700;
		color: var(--color-lumen-ember);
		transition: font-weight 200ms ease-out, color 200ms ease-out;
	}
	.p-selected .p-count {
		color: var(--color-lumen-ember);
		transition: color 200ms ease-out;
	}
	.p-selected .p-bar {
		box-shadow: 0 0 0 1px hsl(32 100% 60% / 0.3);
		transition: box-shadow 200ms ease-out;
	}
	.p-selected .p-bar span {
		background: var(--color-lumen);
		box-shadow: 0 0 6px hsl(32 100% 60% / 0.45);
	}

	/* Smooth transition on all p-row children */
	.p-row .p-name,
	.p-row .p-count,
	.p-row .p-bar,
	.p-row .p-bar span {
		transition: color 200ms ease-out, font-weight 200ms ease-out,
			background 200ms ease-out, box-shadow 200ms ease-out;
	}

	.stats {
		display: flex;
		flex-direction: row;
		gap: 24px;
		padding-top: 8px;
		border-top: 1px solid var(--color-border);
	}
	.stat-k {
		font-size: 9px;
		font-weight: 500;
		text-transform: uppercase;
		letter-spacing: 0.12em;
		color: var(--color-muted-foreground);
		margin-bottom: 2px;
	}
	.stat-v {
		font-size: 20px;
		font-weight: 700;
		letter-spacing: -0.02em;
		line-height: 1;
		color: var(--color-foreground);
	}
	.stat-v small {
		font-size: 12px;
		font-weight: 500;
		color: var(--color-muted-foreground);
	}

	/* collapsed: nur bar-head + toggle sichtbar */
	.banner.collapsed .body-full {
		display: none;
	}
</style>
