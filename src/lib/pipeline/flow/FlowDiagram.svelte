<!--
  2026-06-07 FlowDiagram: Hauptkomponente des Datenfluss-Blocks. Zwei
  Lanes (Mail-Klassifikation + Council) mit Übergabe-Punkt dazwischen.
  Aktive Stage wird hervorgehoben.

  Stage-State-Berechnung:
    - active = id matched active_stage-Prop
    - done   = vorher in der Lane + Lane hatte schon Aktivität
    - armed  = naechste in der Lane nach active (vorgeheizt)
    - idle   = sonst

  Counts kommen aus dem aktiven Run (live) ODER aus dem juengsten
  Run (idle-Fallback).
-->
<script lang="ts">
	import type { StageId, StageState, StageDef } from '../types.js';
	import type { WorkerRunSummaryRow } from '$lib/server/folio-db/types.js';
	import { STAGES } from '../types.js';
	import Lane from './Lane.svelte';

	let {
		activeStage = null,
		summary = null,
		hideCouncil = false
	}: {
		activeStage?: StageId | null;
		summary?: WorkerRunSummaryRow | null;
		hideCouncil?: boolean;
	} = $props();

	const mailStages = $derived(STAGES.filter((s) => s.lane === 'mail'));
	const councilStages = $derived(STAGES.filter((s) => s.lane === 'council'));

	// Stage-State-Map.
	const state = $derived.by(() => {
		const out: Record<StageId, StageState> = {
			imap: 'idle', worker: 'idle', valid: 'idle', auto: 'idle',
			ingest: 'idle', lens: 'idle'
		};
		if (!activeStage) {
			// Idle: alle Stages der juengsten Lane sind 'done' wenn ein
			// summary existiert. Sonst idle.
			if (summary) {
				out.imap = 'done'; out.worker = 'done'; out.valid = 'done'; out.auto = 'done';
			}
			return out;
		}
		// Active: alles vor active in derselben Lane = done; active = active;
		// danach in derselben Lane = armed.
		const stages = STAGES;
		const activeIdx = stages.findIndex((s) => s.id === activeStage);
		if (activeIdx < 0) return out;
		const activeLane = stages[activeIdx].lane;
		for (let i = 0; i < stages.length; i++) {
			const s = stages[i];
			if (s.lane !== activeLane) {
				// andere Lane bleibt idle (ausser wenn schon ein Summary
				// vorhanden ist — dann Mail-Lane done wenn Council aktiv).
				if (summary && s.lane === 'mail' && activeLane === 'council') {
					out[s.id] = 'done';
				}
				continue;
			}
			if (i < activeIdx) out[s.id] = 'done';
			else if (i === activeIdx) out[s.id] = 'active';
			else out[s.id] = 'armed';
		}
		return out;
	});

	// Counts pro Stage aus summary.
	const counts = $derived.by(() => {
		const out: Record<StageId, number | string> = {
			imap: '—', worker: '—', valid: '—', auto: '—', ingest: '—', lens: '—'
		};
		if (!summary) return out;
		const g = summary.geprueft ?? 0;
		out.imap = g;
		out.worker = g;
		out.valid = g > 0 ? g * 3 : '—'; // 3 Validator-Stimmen pro Mail
		out.auto = summary.uebernommen ?? 0;
		out.ingest = summary.council_objects ?? 0;
		out.lens = '—';
		return out;
	});

	const handoffLit = $derived(activeStage === 'ingest' || activeStage === 'lens');
</script>

<div class="flow2">
	<Lane stages={mailStages} caption="Mail-Klassifikation" tone="mail" {state} {counts} />

	{#if !hideCouncil}
		<div class="handoff">
			<div class="ho-lbl">übernommen</div>
			<div class="ho-line" class:lit={handoffLit}>
				<svg viewBox="0 0 56 12" preserveAspectRatio="none" aria-hidden="true">
					<path d="M0 6 H50" stroke="currentColor" stroke-width="1.5" stroke-dasharray="4 3" />
					<path d="M48 2 L54 6 L48 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
			</div>
			<div class="ho-lbl muted">:25 stündlich</div>
		</div>

		<Lane stages={councilStages} caption="Council" tone="council" {state} {counts} />
	{/if}
</div>

<style>
	.flow2 {
		background: white;
		border: 1px solid hsl(214 25% 90%);
		border-radius: 12px;
		padding: 16px 20px 20px;
		display: flex;
		gap: 12px;
		overflow-x: auto;
		box-shadow: 0 1px 2px rgb(0 0 0 / 0.05);
	}
	.handoff {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		min-width: 90px;
		margin-top: 28px;
	}
	.ho-lbl {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: hsl(215 16% 47%);
	}
	.ho-lbl.muted { opacity: 0.7; }
	.ho-line {
		color: hsl(214 20% 78%);
		width: 56px;
		height: 12px;
	}
	.ho-line.lit {
		color: hsl(22 90% 48%);
	}
	.ho-line svg {
		display: block;
		width: 100%;
		height: 100%;
	}
</style>
