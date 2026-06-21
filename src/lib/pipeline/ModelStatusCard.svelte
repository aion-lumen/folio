<!--
  2026-06-10 ModelStatusCard: a single model card showing WARTET / LÄUFT n/m /
  FERTIG. Rendered inside ModelStatusPanel — three of these per run.

  Highlight border + colored dot when state='LÄUFT'. Dimmed look when the
  panel is idle (no active run; we still display the last run's final
  per-model states).
-->
<script lang="ts">
	export type ModelCardState = 'WARTET' | 'LÄUFT' | 'FERTIG';

	let {
		roleLabel,
		modelId,
		state,
		stepIndex = null,
		stepTotal = null,
		dimmed = false
	}: {
		/** e.g. 'gemma · control' or 'lens · baumeister' */
		roleLabel: string;
		/** e.g. 'gemma-4-26b-a4b-it-mlx' */
		modelId: string;
		state: ModelCardState;
		/** 1-based step in the sequential chain (for LÄUFT n/m sub-progress). */
		stepIndex?: number | null;
		/** Total chain length (denominator for n/m). */
		stepTotal?: number | null;
		/** True when shown after a run has ended (idle state with last final values). */
		dimmed?: boolean;
	} = $props();

	const running = $derived(state === 'LÄUFT');
	const done = $derived(state === 'FERTIG');
	const stateLabel = $derived.by(() => {
		if (state === 'LÄUFT' && stepIndex && stepTotal) {
			return `LÄUFT · ${stepIndex}/${stepTotal}`;
		}
		return state;
	});
</script>

<div class="card" class:running class:done class:dimmed>
	<div class="role">
		<span class="dot" class:running class:done></span>
		<span class="role-label">{roleLabel}</span>
	</div>
	<div class="model-id">{modelId}</div>
	<div class="state" class:running class:done>{stateLabel}</div>
</div>

<style>
	.card {
		background: white;
		border: 1px solid hsl(214 25% 90%);
		border-radius: 12px;
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 6px;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
		transition: border-color 0.25s ease, opacity 0.25s ease;
	}
	.card.running {
		border-color: hsl(217 85% 60%);
		box-shadow: 0 0 0 1px hsl(217 85% 60% / 0.35), 0 1px 2px rgb(0 0 0 / 0.05);
	}
	.card.dimmed {
		opacity: 0.55;
		filter: saturate(0.75);
	}

	.role {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(215 16% 47%);
	}
	.role-label {
		font-weight: 500;
	}
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: hsl(214 18% 78%);
		flex-shrink: 0;
	}
	.dot.running {
		background: hsl(217 85% 56%);
		animation: pulse 1.6s ease-in-out infinite;
	}
	.dot.done {
		background: hsl(142 60% 42%);
	}

	.model-id {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 13px;
		font-weight: 500;
		color: hsl(222 47% 11%);
		letter-spacing: -0.01em;
	}

	.state {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: hsl(215 16% 50%);
	}
	.state.running {
		color: hsl(217 85% 48%);
	}
	.state.done {
		color: hsl(142 60% 32%);
	}

	@keyframes pulse {
		0%, 100% { opacity: 1; transform: scale(1); }
		50% { opacity: 0.55; transform: scale(0.82); }
	}
</style>
