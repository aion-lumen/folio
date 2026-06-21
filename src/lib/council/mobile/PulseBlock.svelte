<!--
  Mobile 1b (2026-05-30): Pulse-Header der Pipeline. Vier Chips +
  Partner-Activity-Zeile. Chips sind anchor-scroll-Targets in der Page.
-->
<script lang="ts">
	import type { PipelinePulse } from '$lib/server/council-db/reader.js';

	let { pulse }: { pulse: PipelinePulse } = $props();

	function fmtTime(iso: string): string {
		return new Date(iso).toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
	}

	const partnerInitials = $derived(
		pulse.partner ? pulse.partner.display_name.slice(0, 2).toUpperCase() : ''
	);
</script>

<div class="pulse">
	<a class="chip ember" href="#neu" title="Objekte mit Lens-Bewegung seit letztem Besuch">
		<span class="n">{pulse.bewegt}</span>
		<span class="lbl">Bewegt</span>
	</a>
	<a class="chip ember" href="#workflow" title="Beide in Top-3, ungeklickter Trigger">
		<span class="n">{pulse.konsens}</span>
		<span class="lbl">Konsens</span>
	</a>
	<a class="chip" href="#workflow" title="In Besichtigungs-Workflow">
		<span class="n">{pulse.pipeline}</span>
		<span class="lbl">In Pipeline</span>
	</a>
	<a class="chip" href="#neu" title="Neu bewertet, von dir ungesehen">
		<span class="n">+{pulse.neu}</span>
		<span class="lbl">Neu</span>
	</a>
</div>

{#if pulse.partner}
	<div class="partner-line">
		<span class="av">{partnerInitials}</span>
		<span>
			<b>{pulse.partner.display_name}</b> · zuletzt aktiv {fmtTime(pulse.partner.last_action_ts)} ·
			{pulse.partner.last_action_summary}
		</span>
	</div>
{/if}

<style>
	.pulse {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 6px;
	}
	.chip {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 9px;
		border-radius: 6px;
		background: var(--wf-bg, hsl(210 25% 98.5%));
		border: 1px solid var(--wf-line, hsl(214 20% 88%));
		color: inherit;
		text-decoration: none;
	}
	.chip.ember {
		background: hsl(28 95% 97%);
		border-color: var(--ember-border, hsl(28 80% 80%));
	}
	.chip .n {
		font-size: 18px;
		font-weight: 600;
		line-height: 1;
		letter-spacing: -0.02em;
	}
	.chip.ember .n {
		color: var(--ember-fg, hsl(28 80% 38%));
	}
	.chip .lbl {
		font-family: var(--font-mono);
		font-size: var(--text-xs, 10.5px);
		letter-spacing: 0.025em;
		text-transform: uppercase;
		color: var(--wf-muted, hsl(215 16% 50%));
		line-height: 1.25;
	}
	.partner-line {
		margin-top: 10px;
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--wf-muted, hsl(215 16% 50%));
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.partner-line :global(b) {
		color: hsl(222 47% 28%);
		font-weight: 500;
	}
	.av {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border-radius: 999px;
		background: hsl(220 35% 80%);
		font-size: 9px;
		color: hsl(222 47% 22%);
		font-weight: 500;
	}
</style>
