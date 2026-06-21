<script lang="ts">
	import type { Act } from '$lib/types/campaign.js';

	let { act, isActive }: { act: Act; isActive: boolean } = $props();

	const imgSrc = $derived(`/api/vault/images?name=chapter+${act.act_number}.png`);
	const fallbackSvg = $derived(
		`data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='176' height='112' viewBox='0 0 176 112'><rect width='176' height='112' fill='%23334155'/><text x='88' y='56' text-anchor='middle' dominant-baseline='middle' fill='%2394a3b8' font-size='20' font-family='sans-serif'>Akt ${act.act_number}</text></svg>`
	);
</script>

<div
	class="relative flex-shrink-0 w-44 rounded-xl overflow-hidden border-2 transition-all
		{isActive ? 'border-primary shadow-lg scale-105' : 'border-border opacity-60 hover:opacity-80'}"
>
	<img
		src={imgSrc}
		alt="Akt {act.act_number}"
		class="h-28 w-full object-cover"
		onerror={(e) => {
			(e.currentTarget as HTMLImageElement).src = fallbackSvg;
		}}
	/>
	<div class="bg-card p-2">
		<p class="text-xs font-semibold">
			{act.act_number}. {act.title}
		</p>
		<p class="text-xs text-muted-foreground">{act.horizon_start}–{act.horizon_end}</p>
	</div>
	{#if isActive}
		<div class="absolute top-1.5 right-1.5 rounded-full bg-primary px-1.5 py-0.5 text-xs text-primary-foreground font-medium">
			Aktiv
		</div>
	{/if}
</div>
