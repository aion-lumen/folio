<!--
  Panel-C Werkstatt §1.3 Karte 1: vier Stimmen mit Begründungen.
  Pro Voice: 22×22 Streifenkachel (Label H/1/2/3) + 90-char-Begründung + Verdict+Conf.
  missing-Zeile: „[L2] · qwen3-30b · timeout" italic muted.
-->
<script lang="ts">
	import type { Voice } from '$lib/server/lenses/voices.js';

	let { voices }: { voices: Voice[] } = $props();

	function shortLabel(label: string): string {
		// 'H' bleibt 'H', 'L1'/'L2'/'L3' → '1'/'2'/'3'
		if (label.startsWith('L')) return label.slice(1);
		return label;
	}

	function clipReason(reason: string | undefined, max = 90): string {
		if (!reason) return '—';
		if (reason.length <= max) return reason;
		return reason.slice(0, max - 1) + '…';
	}

	function domainColorClass(d: string): string {
		// minimaler dot-color-mapping; passt zu Voice.domain (LensDomain)
		const map: Record<string, string> = {
			immo: 'voice-immo',
			job: 'voice-job',
			shop: 'voice-shop',
			finance: 'voice-finance',
			kontakt: 'voice-kontakt',
			werbung: 'voice-werbung',
			system: 'voice-system',
			unsorted: 'voice-unsorted'
		};
		return map[d] ?? 'voice-unsorted';
	}
</script>

<div class="voices">
	{#each voices as v}
		<div class="voice-row" class:missing={v.kind === 'missing'}>
			<span class="tile {v.kind === 'present' ? domainColorClass(v.domain) : 'voice-missing'}">
				<span class="tile-label">{shortLabel(v.label)}</span>
			</span>
			{#if v.kind === 'present'}
				<span class="reason" title={v.reasoning}>{clipReason(v.reasoning)}</span>
				<span class="verdict">
					{v.domain}{v.confidence != null ? ` · ${Math.round(v.confidence * 100)}%` : ''}
				</span>
			{:else}
				<span class="reason missing-text">
					[{v.label}] · {v.modelId ?? '—'} · {v.reason}
				</span>
				<span class="verdict missing-text">—</span>
			{/if}
		</div>
	{/each}
</div>

<style>
	.voices {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.voice-row {
		display: grid;
		grid-template-columns: 28px 1fr auto;
		align-items: center;
		gap: 10px;
		font-size: 11.5px;
	}
	.voice-row.missing {
		opacity: 0.75;
	}
	.tile {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: 3px;
		flex-shrink: 0;
	}
	.tile-label {
		font-family: var(--font-mono);
		font-size: 9.5px;
		font-weight: 600;
		color: white;
		text-shadow: 0 0 2px rgba(0, 0, 0, 0.35);
	}
	.voice-immo    { background: hsl(217 70% 60%); }
	.voice-job     { background: hsl(165 50% 45%); }
	.voice-shop    { background: hsl(38 80% 55%); }
	.voice-finance { background: hsl(0 65% 55%); }
	.voice-kontakt { background: hsl(280 50% 55%); }
	.voice-werbung { background: hsl(210 8% 60%); }
	.voice-system  { background: hsl(210 8% 50%); }
	.voice-unsorted { background: hsl(210 8% 75%); }
	.voice-missing { background: hsl(210 8% 85%); }
	.voice-missing .tile-label { color: hsl(210 8% 45%); text-shadow: none; }

	.reason {
		color: var(--color-foreground);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		min-width: 0;
	}
	.missing-text {
		color: var(--color-muted-foreground);
		font-style: italic;
	}
	.verdict {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--color-muted-foreground);
		flex-shrink: 0;
	}
</style>
