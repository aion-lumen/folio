<!--
  Mobile 1a (2026-05-30): Verlauf-Tab (default at /council/mobile).
  Reverse-chronological event stream, bucketed into "Heute / Gestern / Älter".
-->
<script lang="ts">
	import EventEntry from '$lib/council/mobile/EventEntry.svelte';
	import ObjectCard from '$lib/council/mobile/ObjectCard.svelte';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	// Mobile-Aufraeumen (2026-05-31): Self vs Partner attribution. The renderer
	// resolves the actor label from the users map; Self gets "Du", Partner gets
	// display_name. Visual kind (self/partner) drives the glyph color.
	function actorLabel(uid: number): { label: string; isSelf: boolean } {
		if (uid === data.currentUserId) return { label: 'Du', isSelf: true };
		const u = data.users[uid];
		return { label: u?.display_name ?? `User ${uid}`, isSelf: false };
	}

	function fmtTime(iso: string): string {
		const d = new Date(iso);
		return d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
	}

	function bucketOf(iso: string): string {
		const ts = new Date(iso);
		const now = new Date();
		const sameDay = ts.toDateString() === now.toDateString();
		const yesterday = new Date(now);
		yesterday.setDate(yesterday.getDate() - 1);
		const isYesterday = ts.toDateString() === yesterday.toDateString();
		const ageMs = now.getTime() - ts.getTime();
		if (sameDay) return ts.getHours() < 12 ? 'Heute morgen' : 'Heute';
		if (isYesterday) return ts.getHours() >= 18 ? 'Gestern abend' : 'Gestern';
		if (ageMs < 3 * 24 * 60 * 60 * 1000) return 'Vorgestern';
		return 'Älter';
	}

	type Event = (typeof data.events)[number];

	const grouped = $derived.by(() => {
		const order = ['Heute morgen', 'Heute', 'Gestern abend', 'Gestern', 'Vorgestern', 'Älter'];
		const map = new Map<string, Event[]>();
		for (const e of data.events) {
			const k = bucketOf(e.ts);
			const arr = map.get(k) ?? [];
			arr.push(e);
			map.set(k, arr);
		}
		return order.filter((k) => map.has(k)).map((k) => ({ bucket: k, items: map.get(k)! }));
	});

	function lensLabel(lensId: string): string {
		const short = lensId.startsWith('lens-') ? lensId.slice(5) : lensId;
		return short.charAt(0).toUpperCase() + short.slice(1);
	}

	function rankDelta(from: number, to: number): string {
		if (to < from) return `↑ #${from} → #${to}`;
		return `↓ #${from} → #${to}`;
	}

	function workflowSummary(e: Extract<Event, { kind: 'workflow' }>): string {
		if (e.status === 'in_arbeit' && e.termin) return `Termin gesetzt: ${e.termin}`;
		if (e.status === 'erledigt' && e.verhandlungspreis != null) {
			const m = e.verhandlungspreis / 1_000_000;
			return `erledigt · VHB ${m.toFixed(2)} M`;
		}
		if (e.status === 'blockiert') return `blockiert`;
		return `Status: ${e.status}`;
	}
</script>

<div class="since-line">
	{#if data.events.length === 0}
		<span>Seit gestern keine Bewegung.</span>
	{:else}
		Seit <b>{new Date(data.since).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' })}</b>
		· <span class="count">{data.events.length} Ereignisse</span>
	{/if}
</div>

{#each grouped as g (g.bucket)}
	<div class="section-h">
		<span>{g.bucket}</span>
		<span class="rule"></span>
	</div>
	{#each g.items as e, idx (e.ts + ':' + ('object_id' in e ? e.object_id : 'batch'))}
		{@const isLast = idx === g.items.length - 1}
		{#if e.kind === 'lens-moved'}
			<EventEntry when={fmtTime(e.ts)} glyph="⟳" kind="ember" showTail={!isLast}>
				<span class="by">Lens · {lensLabel(e.lens_id)}</span>
				hat über
				{@const obj = data.objects[e.object_id]}
				<b>{obj?.address ?? e.object_id.slice(0, 8)}</b>
				umgedacht: <em>{rankDelta(e.from_rank, e.to_rank)}</em>.
				{#if obj}
					<div class="mini-card">
						<ObjectCard
							object={obj}
							photoSize={44}
							href="/council/mobile/{e.object_id}"
						/>
					</div>
				{/if}
			</EventEntry>
		{:else if e.kind === 'status'}
			{@const actor = actorLabel(e.user_id)}
			<EventEntry when={fmtTime(e.ts)} glyph="●" kind={actor.isSelf ? 'self' : 'partner'} showTail={!isLast}>
				{@const obj = data.objects[e.object_id]}
				<span class="by" class:partner={!actor.isSelf}>{actor.label}</span> hat
				<b>{obj?.address ?? e.object_id.slice(0, 8)}</b> als
				<em>{e.status_tag}</em> markiert.
			</EventEntry>
		{:else if e.kind === 'top10'}
			{@const actor = actorLabel(e.user_id)}
			<EventEntry when={fmtTime(e.ts)} glyph="★" kind={actor.isSelf ? 'self' : 'partner'} showTail={!isLast}>
				{@const obj = data.objects[e.object_id]}
				<span class="by" class:partner={!actor.isSelf}>{actor.label}</span> hat
				<b>{obj?.address ?? e.object_id.slice(0, 8)}</b> in Top-10
				{#if e.rank === 0}entfernt.{:else}auf <em>#{e.rank}</em> gesetzt.{/if}
			</EventEntry>
		{:else if e.kind === 'trigger'}
			{@const actor = actorLabel(e.user_id)}
			<EventEntry when={fmtTime(e.ts)} glyph="⊞" kind={actor.isSelf ? 'self' : 'partner'} showTail={!isLast}>
				{@const obj = data.objects[e.object_id]}
				<span class="by" class:partner={!actor.isSelf}>{actor.label}</span> hat
				<b>{obj?.address ?? e.object_id.slice(0, 8)}</b> <em>antriggert</em>.
			</EventEntry>
		{:else if e.kind === 'note'}
			{@const actor = actorLabel(e.user_id)}
			<EventEntry when={fmtTime(e.ts)} glyph="✎" kind={actor.isSelf ? 'self' : 'partner'} showTail={!isLast}>
				{@const obj = data.objects[e.object_id]}
				<span class="by" class:partner={!actor.isSelf}>{actor.label}</span> hat eine
				<b>Notiz</b> zu <b>{obj?.address ?? e.object_id.slice(0, 8)}</b> geschrieben:
				<em>{e.note_text.length > 60 ? e.note_text.slice(0, 60) + '…' : e.note_text}</em>
			</EventEntry>
		{:else if e.kind === 'workflow'}
			<EventEntry when={fmtTime(e.ts)} glyph="📅" kind="workflow" showTail={!isLast}>
				{@const obj = data.objects[e.object_id]}
				<b>{obj?.address ?? e.object_id.slice(0, 8)}</b> · {workflowSummary(e)}
			</EventEntry>
		{:else if e.kind === 'new-batch'}
			<EventEntry when={fmtTime(e.ts)} glyph="+{e.count}" showTail={!isLast}>
				<span class="by">Lenses</span> haben <b>{e.count} neue Objekte</b> bewertet.
			</EventEntry>
		{/if}
	{/each}
{/each}

<style>
	.since-line {
		padding: 4px 2px 12px;
		font-size: 12px;
		color: var(--wf-fg, hsl(222 30% 22%));
	}
	.since-line .count {
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--wf-muted, hsl(215 16% 50%));
	}
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
	.section-h .rule {
		flex: 1;
		height: 1px;
		background: var(--wf-line, hsl(214 20% 88%));
	}
	.by {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--wf-muted, hsl(215 16% 50%));
	}
	.by.partner {
		color: hsl(222 47% 28%);
		font-weight: 500;
	}
	.mini-card {
		margin-top: 6px;
	}
</style>
