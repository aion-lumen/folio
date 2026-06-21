<!--
  Mobile 1b (2026-05-30): ember-bordierte Konsens-Trigger-Karte.
  Zeigt Trigger-Status pro User, CTA für self. Click → POST /api/council/[id]/trigger,
  Response invalidiert die Page für sofort-update der Workflow-Sektion.
-->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import ObjectCard from './ObjectCard.svelte';
	import type { CouncilObjectRow } from '$lib/server/council-db/types.js';
	import type { UserRow } from '$lib/server/folio-db/types.js';

	let {
		object,
		selfUser,
		otherUsers,
		triggeredUserIds
	}: {
		object: CouncilObjectRow;
		selfUser: { id: number; display_name: string };
		otherUsers: Pick<UserRow, 'id' | 'display_name'>[];
		triggeredUserIds: number[];
	} = $props();

	let pending = $state(false);
	let error = $state<string | null>(null);

	const selfTriggered = $derived(triggeredUserIds.includes(selfUser.id));

	async function trigger() {
		pending = true;
		error = null;
		try {
			const res = await fetch(`/api/council/${object.id}/trigger`, { method: 'POST' });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			await invalidateAll();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			pending = false;
		}
	}
</script>

<div class="consensus">
	<div class="head"><span class="dot" aria-hidden="true"></span>Konsens · beide in Top-3</div>

	<div class="card-wrap">
		<ObjectCard {object} photoSize={48} href="/council/mobile/{object.id}" />
	</div>

	<div class="status-rows">
		{#each [selfUser, ...otherUsers] as u (u.id)}
			{@const done = triggeredUserIds.includes(u.id)}
			<div class="ask" class:done>
				<span class="who" class:done>{done ? '✓' : '○'}</span>
				<span>
					{#if u.id === selfUser.id}Du{:else}{u.display_name}{/if}
					{#if done}· getriggert{:else}· noch nicht{/if}
				</span>
			</div>
		{/each}
	</div>

	{#if !selfTriggered}
		<button class="trigger" type="button" onclick={trigger} disabled={pending}>
			{pending ? 'Sende…' : 'Auch antriggern → in Workflow'}
		</button>
	{:else}
		<div class="trigger waiting">Warte auf {otherUsers[0]?.display_name ?? 'Partner'} …</div>
	{/if}

	{#if error}
		<div class="error">Fehler: {error}</div>
	{/if}
</div>

<style>
	.consensus {
		padding: 11px 13px;
		background: hsl(28 95% 98.5%);
		border: 1px solid var(--ember-border, hsl(28 80% 80%));
		border-left: 3px solid hsl(28 80% 60%);
		border-radius: 8px;
		margin-bottom: 8px;
	}
	.head {
		font-family: var(--font-mono);
		font-size: 9.5px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--ember-fg, hsl(28 80% 38%));
		font-weight: 500;
		margin-bottom: 8px;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.head .dot {
		width: 5px;
		height: 5px;
		border-radius: 999px;
		background: var(--color-lumen-warm, hsl(22 95% 52%));
	}
	.card-wrap :global(.pcard) {
		margin-bottom: 0;
	}
	.status-rows {
		margin-top: 8px;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.ask {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 5px 9px;
		background: white;
		border: 1px solid var(--ember-border, hsl(28 80% 80%));
		border-radius: 6px;
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--wf-fg, hsl(222 30% 22%));
	}
	.ask.done {
		color: var(--verdict-kaufen-fg, hsl(142 65% 25%));
	}
	.who {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 15px;
		height: 15px;
		border-radius: 999px;
		background: hsl(220 35% 85%);
		font-size: 9px;
		color: hsl(222 47% 25%);
	}
	.who.done {
		background: var(--verdict-kaufen, hsl(142 60% 42%));
		color: white;
	}
	.trigger {
		display: block;
		width: 100%;
		margin-top: 10px;
		padding: 9px 12px;
		background: hsl(222 47% 11%);
		color: white;
		border-radius: 6px;
		border: 0;
		font-size: 12px;
		font-weight: 500;
		text-align: center;
		letter-spacing: -0.02em;
		cursor: pointer;
		font-family: inherit;
	}
	.trigger:disabled {
		opacity: 0.6;
		cursor: wait;
	}
	.trigger.waiting {
		background: var(--wf-fill-strong, hsl(214 24% 88%));
		color: var(--wf-muted, hsl(215 16% 50%));
		font-style: italic;
		cursor: default;
	}
	.error {
		margin-top: 6px;
		font-size: 11px;
		color: var(--verdict-verwerfen-fg, hsl(0 65% 38%));
	}
</style>
