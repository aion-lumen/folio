<!--
  2026-06-07 FlowNode: ein Pipeline-Stage-Knoten im Datenfluss-Diagramm.
  Icon-Ring + Label + Sub + Count + Unit. Vier visuelle States:
    done    — grün (Run abgeschlossen)
    active  — blau pulsierend (mail-lane) ODER ember (council-lane)
    armed   — getönt (vorgewärmt fuer den naechsten Run)
    idle    — neutral, Count „—"
-->
<script lang="ts">
	import type { StageDef, StageState } from '../types.js';
	import IcMail from '../icons/IcMail.svelte';
	import IcServer from '../icons/IcServer.svelte';
	import IcLens from '../icons/IcLens.svelte';
	import IcMerge from '../icons/IcMerge.svelte';
	import IcHouse from '../icons/IcHouse.svelte';

	let {
		stage,
		state,
		count
	}: {
		stage: StageDef;
		state: StageState;
		count: number | string;
	} = $props();

	const ICONS = { imap: IcMail, worker: IcServer, valid: IcLens, auto: IcMerge, ingest: IcHouse, lens: IcLens };
	const Icon = $derived(ICONS[stage.id]);
	const isEmber = $derived(stage.lane === 'council');
</script>

<div class="fnode" class:done={state === 'done'} class:active={state === 'active'} class:armed={state === 'armed'} class:ember={isEmber} class:idle={state === 'idle'}>
	<div class="ring">
		<Icon size={24} />
	</div>
	<div class="nl">{stage.label}</div>
	<div class="ns">{stage.sub}</div>
	<div class="nc">
		<b>{count}</b>
		<span class="nu">{stage.unit}</span>
	</div>
</div>

<style>
	.fnode {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		min-width: 100px;
		padding: 8px 4px;
	}
	.ring {
		width: 56px;
		height: 56px;
		border-radius: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(214 28% 96%);
		border: 1.5px solid hsl(214 25% 88%);
		color: hsl(215 16% 47%);
		transition: all 200ms;
	}
	.nl {
		font-size: 13px;
		font-weight: 600;
		color: hsl(222 47% 11%);
	}
	.ns {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10px;
		color: hsl(215 16% 50%);
	}
	.nc {
		display: flex;
		align-items: baseline;
		gap: 4px;
		margin-top: 2px;
	}
	.nc b {
		font-size: 15px;
		font-weight: 600;
		color: hsl(222 47% 11%);
	}
	.nc .nu {
		font-size: 9px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: hsl(215 16% 50%);
		font-family: ui-monospace, SF Mono, monospace;
	}

	/* done — grün */
	.fnode.done .ring {
		background: hsl(142 45% 95%);
		border-color: hsl(142 40% 78%);
		color: hsl(142 64% 36%);
	}

	/* armed — getönt (Lane-Farbe leicht) */
	.fnode.armed .ring {
		background: hsl(217 70% 96%);
		border-color: hsl(217 50% 82%);
		color: hsl(217 70% 44%);
	}
	.fnode.armed.ember .ring {
		background: hsl(28 95% 96%);
		border-color: hsl(28 60% 82%);
		color: hsl(22 90% 48%);
	}

	/* active — pulsierend (mail-lane blau, council-lane ember) */
	.fnode.active .ring {
		background: hsl(217 70% 92%);
		border-color: hsl(217 90% 60%);
		color: hsl(217 80% 35%);
		box-shadow: 0 0 0 6px hsl(217 90% 60% / 0.18);
		animation: flow-pulse 2s ease-in-out infinite;
	}
	.fnode.active.ember .ring {
		background: hsl(28 95% 92%);
		border-color: hsl(22 90% 55%);
		color: hsl(22 90% 35%);
		box-shadow: 0 0 0 6px hsl(22 90% 55% / 0.18);
	}
	@keyframes flow-pulse {
		0%, 100% { transform: scale(1); }
		50% { transform: scale(1.04); }
	}

	/* idle — Count grau */
	.fnode.idle .nc b {
		color: hsl(215 16% 60%);
	}
</style>
