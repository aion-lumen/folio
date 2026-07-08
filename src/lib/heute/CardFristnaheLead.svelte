<!--
  "Fristnahe Leads" card im Heute-Hub — Job-Leads mit Deadline ≤ 48h.
  Top-Priorität: als erste Karte gerendert.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { Clock, ArrowRight } from 'lucide-svelte';
	import type { FristnaherLead } from '../../routes/+page.server.js';

	let { leads = [] }: { leads?: FristnaherLead[] } = $props();

	function fmtDeadline(iso: string): string {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) return iso;
		return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit' });
	}

	let nearest = $derived(leads[0]);
</script>

<button class="card" type="button" onclick={() => goto('/inbox')}>
	<header class="card-head">
		<Clock size={18} class="icon" />
		<span class="title">Fristnahe Leads</span>
		<ArrowRight size={14} class="arrow" />
	</header>
	{#if leads.length === 0}
		<p class="primary muted">Keine fristnahen Leads</p>
		<p class="hint">Leads mit Deadline ≤ 48h erscheinen hier zuerst</p>
	{:else}
		<p class="primary">
			<span class="counter">{leads.length}</span>
			<span class="counter-suffix">Deadline ≤ 48h</span>
		</p>
		<p class="hint">
			{#if nearest}
				Nächste: <strong>{nearest.rolle || nearest.filename}</strong>
				{#if nearest.quelle}({nearest.quelle}){/if} — bis {fmtDeadline(nearest.deadline)}
			{/if}
			· Review &amp; Commit auf /inbox
		</p>
	{/if}
</button>

<style>
	.card {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 20px;
		text-align: left;
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 12px;
		cursor: pointer;
		transition: border-color 150ms, transform 150ms;
		font-family: inherit;
		color: var(--color-foreground);
	}
	.card:hover {
		border-color: var(--color-foreground);
		transform: translateY(-1px);
	}
	.card-head {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.card-head :global(.icon) { color: var(--color-lumen-warm, hsl(28 92% 58%)); }
	.title {
		font-size: 13px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--color-muted-foreground);
		flex: 1;
	}
	.arrow { opacity: 0.4; color: var(--color-muted-foreground); transition: opacity 150ms, transform 150ms; }
	.card:hover .arrow { opacity: 1; transform: translateX(2px); }
	.primary {
		font-size: 14px;
		margin: 4px 0 4px;
		display: flex;
		align-items: baseline;
		gap: 8px;
		flex-wrap: wrap;
		color: var(--color-foreground);
	}
	.primary.muted {
		font-size: 18px;
		color: var(--color-muted-foreground);
	}
	.counter {
		font-size: 22px;
		font-weight: 600;
		color: var(--color-lumen-warm, hsl(28 92% 58%));
	}
	.counter-suffix {
		font-size: 13px;
		color: var(--color-muted-foreground);
	}
	.hint {
		font-size: 12px;
		color: var(--color-muted-foreground);
		margin: 0;
		line-height: 1.45;
	}
</style>
