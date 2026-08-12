<!--
  Panel-C Werkstatt §1.3 Karte 2: Active Rules expanded body.
  Liste der für diese Mail aktiven Regelwerk-Einträge (priorities, distance-threshold,
  fallback, time-decay, schutzklausel). Quelle: active_rules (server-side pre-computed).
-->
<script lang="ts">
	import type { ActiveRules } from '$lib/server/regelwerk/active-rules.js';
	import { formatDistanceKm } from '$lib/util/distance.js';

	let { activeRules }: { activeRules: ActiveRules | undefined } = $props();
</script>

{#if activeRules}
	{#if activeRules.final_blockers && activeRules.final_blockers.length > 0}
		<!-- 2026-06-05 Korrektur 3: final-blockers prominent vor den Rules.
		     Macht klar, dass UI-Marker wie tier2:location_whitelist von
		     diesem Blocker überschrieben wurden. -->
		<div class="blockers">
			<span class="bl-icon">⚠</span>
			<span class="bl-text">Archive-silent durch:</span>
			<span class="bl-marker">{activeRules.final_blockers.join(', ')}</span>
		</div>
	{/if}
	<ul class="rules" class:dimmed={activeRules.final_blockers && activeRules.final_blockers.length > 0}>
		{#if activeRules.active_priority}
			<li><span class="ico">🎯</span><span class="name">Aktive Priorität</span><span class="val">{activeRules.active_priority}</span></li>
		{/if}
		{#if activeRules.distance_threshold_km != null}
			<li>
				<span class="ico">📏</span>
				<span class="name">Distanz-Schwelle</span>
				<span class="val">
					≤ {activeRules.distance_threshold_km} km{#if activeRules.distance_actual_km != null} · gemessen: {formatDistanceKm(activeRules.distance_actual_km)}{#if activeRules.distance_actual_city} ({activeRules.distance_actual_city}){/if}{/if}
				</span>
			</li>
		{/if}
		{#if activeRules.fallback_unknown_plz}
			<li><span class="ico">❓</span><span class="name">Fallback unbekannte PLZ</span><span class="val">{activeRules.fallback_unknown_plz}</span></li>
		{/if}
		{#if activeRules.time_decay}
			<li><span class="ico">⏳</span><span class="name">Time-Decay</span><span class="val">actionable ≤ {activeRules.time_decay.actionable_within_days} d · archive ≤ {activeRules.time_decay.archive_within_days} d</span></li>
		{/if}
		<li><span class="ico">🛡️</span><span class="name">Schutzklausel</span><span class="val">{activeRules.protection_clause}</span></li>
	</ul>
{:else}
	<p class="muted">keine Regeln verfügbar</p>
{/if}

<style>
	.rules {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.rules li {
		display: grid;
		grid-template-columns: 18px 1fr auto;
		align-items: baseline;
		gap: 8px;
		font-size: 11.5px;
	}
	.ico {
		font-size: 11px;
	}
	.name {
		color: var(--color-foreground);
	}
	.val {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--color-muted-foreground);
		text-align: right;
	}
	.muted {
		color: var(--color-muted-foreground);
		font-style: italic;
		font-size: 11.5px;
	}
	.blockers {
		display: flex;
		align-items: baseline;
		gap: 6px;
		padding: 6px 8px;
		margin-bottom: 8px;
		background: var(--verdict-verwerfen-bg, hsl(0 70% 96%));
		border: 1px solid var(--verdict-verwerfen-bd, hsl(0 60% 84%));
		border-radius: 4px;
		font-size: 11.5px;
	}
	.bl-icon {
		color: var(--verdict-verwerfen-fg, hsl(0 65% 38%));
	}
	.bl-text {
		color: var(--verdict-verwerfen-fg, hsl(0 65% 38%));
	}
	.bl-marker {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--verdict-verwerfen-fg, hsl(0 65% 38%));
	}
	.rules.dimmed {
		opacity: 0.55;
	}
</style>
