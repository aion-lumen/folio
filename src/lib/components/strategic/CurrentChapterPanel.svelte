<script lang="ts">
	import type { Chapter } from '$lib/types/campaign.js';
	import { CircleCheck, Circle, LoaderCircle } from 'lucide-svelte';

	let { chapter }: { chapter: Chapter } = $props();

	const topObjectives = $derived(chapter.objectives.slice(0, 5));
	const progressPct = $derived(Math.round(chapter.progress * 100));

	const statusIcon = (status: string) => {
		if (status === 'done') return CircleCheck;
		if (status === 'in_progress') return LoaderCircle;
		return Circle;
	};

	const statusColor = (status: string) => {
		if (status === 'done') return 'text-green-500';
		if (status === 'in_progress') return 'text-blue-500';
		if (status === 'blocked') return 'text-red-500';
		return 'text-muted-foreground';
	};
</script>

<div class="rounded-xl border border-border bg-card p-5">
	<div class="mb-4 flex items-start justify-between">
		<div>
			<p class="text-xs text-muted-foreground uppercase tracking-wider">Aktuelles Kapitel</p>
			<h3 class="mt-1 text-lg font-semibold">
				{chapter.chapter_number}. {chapter.title}
			</h3>
			<p class="text-sm text-muted-foreground italic mt-0.5">{chapter.atmosphere}</p>
		</div>
		<div class="text-right">
			<span class="text-2xl font-bold">{progressPct}%</span>
			<p class="text-xs text-muted-foreground">Fortschritt</p>
		</div>
	</div>

	<!-- Progress bar -->
	<div class="mb-4 h-2 w-full rounded-full bg-muted">
		<div
			class="h-2 rounded-full bg-primary transition-all"
			style="width: {progressPct}%"
		></div>
	</div>

	<!-- Objectives -->
	<div class="space-y-2">
		<p class="text-xs font-medium text-muted-foreground uppercase tracking-wider">Minimum-Ziele</p>
		{#each topObjectives as obj}
			{@const Icon = statusIcon(obj.status)}
			<div class="flex items-start gap-2">
				<Icon size={14} class="mt-0.5 flex-shrink-0 {statusColor(obj.status)}" />
				<div class="flex-1 min-w-0">
					<p class="text-sm truncate">{obj.title}</p>
					{#if obj.deadline}
						<p class="text-xs text-muted-foreground">Deadline: {obj.deadline}</p>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>
