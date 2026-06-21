<!--
  2026-06-10 ModelStatusPanel: full-width row of model cards between the
  Datenfluss header and the Aktive-Station block on the Pipeline page.

  Reflects two stacks:
    - Validator: gemma · control / qwen · plugin-lens / qwen · thinking
    - Council-Lens: lens · {persona}  (one card per persona)

  States are precomputed by the page-loader / +page.svelte $derived; this
  component is dumb display + the top progress bar (mails-checked / ETA).

  Permanently visible. When no run is active, cards render dimmed showing
  the last run's final states plus a small timestamp.
-->
<script lang="ts">
	import ModelStatusCard from './ModelStatusCard.svelte';
	import type { ModelCardState } from './ModelStatusCard.svelte';
	import Progress from './live/Progress.svelte';

	export type ModelEntry = {
		key: string;
		roleLabel: string;
		modelId: string;
		state: ModelCardState;
		stepIndex: number | null;
		stepTotal: number | null;
	};

	let {
		models,
		stack,
		active,
		progress = null,
		lastRunAt = null
	}: {
		models: ModelEntry[];
		/** 'validator' | 'lens' — drives the eyebrow caption. */
		stack: 'validator' | 'lens';
		/** True during a live run; cards are bright. False = dimmed idle look. */
		active: boolean;
		/** Progress bar inputs when active. unit='Mails' for validator, 'Objekte'
		 *  (or similar) for lens. Null → no bar (e.g. lens with unknown total). */
		progress?: { done: number; total: number; unit: string; eta?: string | null } | null;
		/** ISO timestamp of the last completed run — shown in idle state. */
		lastRunAt?: string | null;
	} = $props();

	const stackLabel = $derived(stack === 'validator' ? 'Validator-Stack' : 'Council-Lens-Stack');
	const eyebrow = $derived.by(() => {
		if (active) return `MODELL-STATUS · ${stackLabel} läuft`;
		if (lastRunAt) return `MODELL-STATUS · ${stackLabel}`;
		return `MODELL-STATUS · ${stackLabel}`;
	});

	function fmtTime(iso: string): string {
		const d = new Date(iso.replace(' ', 'T'));
		if (!Number.isFinite(d.getTime())) return iso;
		return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
	}
</script>

<section class="panel" class:dimmed={!active}>
	<div class="eyebrow">
		<span>{eyebrow}</span>
		{#if !active && lastRunAt}
			<span class="last-run">letzter Lauf {fmtTime(lastRunAt)}</span>
		{/if}
	</div>

	{#if active && progress}
		<Progress
			done={progress.done}
			total={progress.total}
			unit={progress.unit}
			eta={progress.eta ?? null}
		/>
	{/if}

	<div class="cards" style="--n: {Math.max(models.length, 1)}">
		{#each models as m (m.key)}
			<ModelStatusCard
				roleLabel={m.roleLabel}
				modelId={m.modelId}
				state={m.state}
				stepIndex={m.stepIndex}
				stepTotal={m.stepTotal}
				dimmed={!active}
			/>
		{/each}
	</div>
</section>

<style>
	.panel {
		display: flex;
		flex-direction: column;
		gap: 10px;
		transition: opacity 0.25s ease;
	}

	.eyebrow {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(215 16% 47%);
	}
	.last-run {
		font-size: 10.5px;
		color: hsl(215 16% 55%);
		text-transform: none;
		letter-spacing: 0;
	}

	.cards {
		display: grid;
		grid-template-columns: repeat(var(--n), minmax(0, 1fr));
		gap: 12px;
	}

	@media (max-width: 900px) {
		.cards { grid-template-columns: 1fr; }
	}
</style>
