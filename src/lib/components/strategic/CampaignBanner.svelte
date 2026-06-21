<script lang="ts">
	import type { Act } from '$lib/types/campaign.js';
	import ActCard from './ActCard.svelte';

	let { acts, currentAct }: { acts: Act[]; currentAct: number } = $props();
</script>

<section class="mb-6">
	<h2 class="mb-3 text-sm font-medium uppercase tracking-widest text-muted-foreground">Kampagne</h2>
	<div class="flex gap-3 overflow-x-auto pb-2">
		{#each acts as act}
			<ActCard {act} isActive={act.act_number === currentAct} />
		{/each}
	</div>
</section>
