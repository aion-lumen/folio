<!--
  2026-06-08 Bauteil 2.7c-Hotfix: Lens-Run-Fortschritts-Anzeige.
  Dezent, Mono-Stil analog TallyChips/LiveLog/Progress. Wird nur
  gerendert wenn lensStatus.running=true.

  Anatomie (eine Zeile):
    Council-Lens · 5m / ~22m   ⬤ baumeister  ✓ rechner  ◯ ortskundige

  - Globale Zeit (elapsed / ETA) links
  - Persona-Dots rechts: ◯ pending, ⬤ active (pulsiert), ✓ done
  - Hover/Title: persona-id + model + per-persona-elapsed
-->
<script lang="ts">
	import type { LensRunStatus, LensPersonaStatus } from '$lib/server/lens-runner/types.js';

	let { status }: { status: LensRunStatus } = $props();

	function fmtDuration(seconds: number): string {
		if (seconds < 60) return `${seconds}s`;
		const m = Math.floor(seconds / 60);
		const s = seconds % 60;
		if (m < 60) return s > 0 ? `${m}m ${s}s` : `${m}m`;
		const h = Math.floor(m / 60);
		const mm = m % 60;
		return mm > 0 ? `${h}h ${mm}m` : `${h}h`;
	}

	function shortPersona(id: string): string {
		// 'lens-baumeister' → 'baumeister'
		return id.replace(/^lens-/, '');
	}

	function dotChar(p: LensPersonaStatus): string {
		if (p.phase === 'done') return '✓';
		if (p.phase === 'evaluating' || p.phase === 'model_loading') return '⬤';
		return '◯';
	}

	function personaTitle(p: LensPersonaStatus): string {
		const parts = [`${p.id}`];
		if (p.model) parts.push(`model=${p.model}`);
		if (p.phase === 'model_loading') parts.push('lädt model');
		if (p.phase === 'evaluating') parts.push(`evaluiert seit ${fmtDuration(p.elapsed_seconds)}`);
		if (p.phase === 'done') parts.push(`done in ${fmtDuration(p.elapsed_seconds)} · scored=${p.scored ?? '?'}/${p.scored ?? '?'}`);
		return parts.join(' · ');
	}

	const phaseLabel = $derived.by(() => {
		if (!status.running) return '';
		if (!status.progress) return 'läuft';
		const ph = status.progress.phase;
		if (ph === 'starting') return 'startet';
		if (ph === 'borda') return 'aggregiert';
		if (ph === 'done') return 'fertig';
		return 'läuft';
	});
</script>

{#if status.running}
	<div class="lp">
		<span class="lp-label">Council-Lens · {phaseLabel}</span>
		<span class="lp-time">
			{fmtDuration(status.elapsed_seconds)}
			{#if status.progress?.eta_seconds != null && status.progress.eta_seconds > 0}
				<span class="lp-eta">/ ~{fmtDuration(status.progress.eta_seconds)}</span>
			{/if}
		</span>
		{#if status.progress}
			<span class="lp-dots">
				{#each status.progress.personas as p (p.id)}
					<span
						class="lp-dot"
						class:active={p.phase === 'evaluating' || p.phase === 'model_loading'}
						class:done={p.phase === 'done'}
						title={personaTitle(p)}
					>
						{dotChar(p)} <span class="lp-name">{shortPersona(p.id)}</span>
					</span>
				{/each}
			</span>
		{/if}
	</div>
{/if}

<style>
	.lp {
		display: inline-flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
		padding: 6px 12px;
		border: 1px solid hsl(28 60% 86%);
		background: hsl(28 95% 98%);
		border-radius: 999px;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 11px;
		color: hsl(22 70% 30%);
	}
	.lp-label {
		font-weight: 500;
	}
	.lp-time {
		color: hsl(215 16% 45%);
	}
	.lp-eta {
		color: hsl(215 16% 55%);
	}
	.lp-dots {
		display: inline-flex;
		gap: 8px;
		border-left: 1px solid hsl(28 60% 86%);
		padding-left: 10px;
	}
	.lp-dot {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		color: hsl(215 16% 60%);
	}
	.lp-dot.active {
		color: hsl(28 90% 45%);
		animation: pulse 1.8s ease-in-out infinite;
	}
	.lp-dot.done {
		color: hsl(142 60% 35%);
	}
	.lp-name {
		font-size: 10.5px;
		opacity: 0.85;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}
</style>
