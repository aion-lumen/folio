<!--
  2026-06-07 Progress: schmale Progress-Bar mit Zeilen-Prozent + ETA.
  Shimmer-Animation wenn pending (still laufend).
-->
<script lang="ts">
	let {
		done,
		total,
		unit = 'Mails',
		eta = null
	}: { done: number; total: number; unit?: string; eta?: string | null } = $props();

	const pct = $derived(total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0);
	const running = $derived(total > 0 && done < total);
</script>

<div class="prog">
	<div class="bar" class:running>
		<div class="fill" style="width: {pct}%"></div>
	</div>
	<div class="meta">
		<span>{done} / {total} {unit} geprüft{pct < 100 ? '' : ' · fertig'}</span>
		{#if eta}
			<span class="eta">ETA {eta}</span>
		{/if}
	</div>
</div>

<style>
	.prog { display: flex; flex-direction: column; gap: 5px; }
	.bar {
		height: 7px;
		border-radius: 999px;
		background: hsl(214 24% 92%);
		overflow: hidden;
		position: relative;
	}
	.fill {
		height: 100%;
		background: linear-gradient(90deg, hsl(217 80% 52%), hsl(217 90% 60%));
		border-radius: 999px;
		transition: width 0.4s ease-out;
	}
	.bar.running::after {
		content: '';
		position: absolute;
		top: 0; left: 0; right: 0; bottom: 0;
		background: linear-gradient(90deg, transparent, hsl(217 90% 70% / 0.4), transparent);
		background-size: 200% 100%;
		animation: shimmer 1.6s linear infinite;
	}
	@keyframes shimmer {
		0% { background-position: 200% 0; }
		100% { background-position: -200% 0; }
	}
	.meta {
		display: flex;
		justify-content: space-between;
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10.5px;
		color: hsl(215 16% 50%);
	}
	.eta { font-weight: 500; }
</style>
