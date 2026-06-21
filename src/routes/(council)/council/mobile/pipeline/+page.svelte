<!--
  Mobile 1b (2026-05-30): Pipeline-Tab. Vier Blöcke von oben nach unten:
  Puls · Link-Eingabe (Stub) · Neu · Workflow.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { invalidateAll } from '$app/navigation';
	import PulseBlock from '$lib/council/mobile/PulseBlock.svelte';
	import LinkInputBox from '$lib/council/mobile/LinkInputBox.svelte';
	import PendingIngestList from '$lib/council/mobile/PendingIngestList.svelte';
	import ObjectCard from '$lib/council/mobile/ObjectCard.svelte';
	import ConsensusTriggerCard from '$lib/council/mobile/ConsensusTriggerCard.svelte';
	import WorkflowGroup from '$lib/council/mobile/WorkflowGroup.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	const totalWf = $derived(
		data.workflowGroups.offen.length +
			data.workflowGroups.in_arbeit.length +
			data.workflowGroups.blockiert.length +
			data.workflowGroups.erledigt.length +
			data.consensusCards.length
	);

	// Mobile 1c: 30s-Polling solange unprozessierte pending_ingest-rows da sind.
	// invalidateAll() reloadt nur den Loader — kein Full-Page-Refresh.
	onMount(() => {
		let timer: ReturnType<typeof setInterval> | null = null;
		function tick() {
			if (data.pendingIngest.length > 0) invalidateAll();
		}
		timer = setInterval(tick, 30_000);
		return () => {
			if (timer) clearInterval(timer);
		};
	});
</script>

<PulseBlock pulse={data.pulse} />

<LinkInputBox />
<PendingIngestList rows={data.pendingIngest} />

<!-- ─── Neue Objekte ─── -->
<div id="neu" class="section-h">
	<span>Neu · noch nicht eingeordnet</span>
	{#if data.newObjects.length > 0}
		<span class="count">{data.newObjects.length}</span>
	{/if}
	<span class="rule"></span>
</div>

{#if data.newObjects.length === 0}
	<div class="empty">Nichts Neues für dich.</div>
{:else}
	{#each data.newObjects as n (n.object.id)}
		<ObjectCard
			object={n.object}
			voices={n.voices}
			state={n.state ?? undefined}
			href="/council/mobile/{n.object.id}"
		/>
	{/each}
{/if}

<!-- ─── Besichtigungs-Workflow ─── -->
<div id="workflow" class="section-h">
	<span>Besichtigungs-Workflow</span>
	{#if totalWf > 0}
		<span class="count">{totalWf}</span>
	{/if}
	<span class="rule"></span>
</div>

{#each data.consensusCards as c (c.object.id)}
	<ConsensusTriggerCard
		object={c.object}
		selfUser={data.selfUser}
		otherUsers={data.otherUsers}
		triggeredUserIds={c.triggered_user_ids}
	/>
{/each}

<WorkflowGroup
	status="in_arbeit"
	rows={data.workflowGroups.in_arbeit}
	objects={data.workflowObjects}
/>
<WorkflowGroup
	status="erledigt"
	rows={data.workflowGroups.erledigt}
	objects={data.workflowObjects}
/>
<WorkflowGroup
	status="blockiert"
	rows={data.workflowGroups.blockiert}
	objects={data.workflowObjects}
/>
<WorkflowGroup
	status="offen"
	rows={data.workflowGroups.offen}
	objects={data.workflowObjects}
/>

{#if data.consensusCards.length === 0 && totalWf === data.consensusCards.length}
	<div class="empty">Noch nichts im Workflow.</div>
{/if}

<style>
	.section-h {
		display: flex;
		align-items: baseline;
		gap: 8px;
		margin: 16px 0 8px;
		font-family: var(--font-mono);
		font-size: 10.5px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--wf-muted, hsl(215 16% 50%));
		font-weight: 500;
	}
	.section-h .count {
		color: hsl(222 47% 11%);
		background: var(--wf-fill, hsl(214 24% 94%));
		padding: 0 6px;
		border-radius: 999px;
		font-size: 10px;
	}
	.section-h .rule {
		flex: 1;
		height: 1px;
		background: var(--wf-line, hsl(214 20% 88%));
	}
	.empty {
		padding: 12px 4px;
		font-size: 12px;
		color: var(--wf-muted, hsl(215 16% 50%));
		font-style: italic;
	}
</style>
