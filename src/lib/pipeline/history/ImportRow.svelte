<!--
  2026-06-07 ImportRow: eine Mail-Zeile in der Worker-Imports-Liste.
  Tag = compact-string aus domain/actionability.
-->
<script lang="ts">
	type Sample = {
		id?: number;
		subject?: string;
		sender?: string;
		tag?: string;
	};

	let { sample }: { sample: Sample } = $props();

	const tagTone = $derived.by(() => {
		const tag = sample.tag ?? '';
		if (tag.includes('uebernommen')) return 'ueb';
		if (tag.includes('actionable')) return 'act';
		if (tag.includes('archive-silent') || tag.includes('archive')) return 'sil';
		return 'def';
	});
</script>

<div class="imp">
	<span class="dot dot-{tagTone}" aria-hidden="true"></span>
	<div class="body">
		<div class="isub" title={sample.subject ?? ''}>{sample.subject ?? '—'}</div>
		<div class="imeta">
			<span class="id">#{sample.id ?? '?'}</span>
			<span>· {sample.sender ?? '?'}</span>
		</div>
	</div>
	{#if sample.tag}
		<span class="tag tag-{tagTone}">{sample.tag}</span>
	{/if}
</div>

<style>
	.imp {
		display: grid;
		grid-template-columns: 10px 1fr auto;
		gap: 8px;
		align-items: center;
		padding: 6px 0;
		border-bottom: 1px solid hsl(214 30% 94%);
	}
	.imp:last-child { border-bottom: 0; }
	.dot {
		width: 7px;
		height: 7px;
		border-radius: 999px;
		background: hsl(215 16% 60%);
	}
	.dot-ueb { background: hsl(142 64% 42%); }
	.dot-act { background: hsl(217 80% 52%); }
	.dot-sil { background: hsl(215 16% 60%); opacity: 0.55; }
	.body { min-width: 0; }
	.isub {
		font-size: 12px;
		font-weight: 500;
		color: hsl(222 47% 11%);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.imeta {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 10px;
		color: hsl(215 16% 50%);
		display: flex;
		gap: 5px;
		margin-top: 1px;
	}
	.id { color: hsl(217 70% 38%); }
	.tag {
		font-family: ui-monospace, SF Mono, monospace;
		font-size: 9.5px;
		padding: 1px 6px;
		border-radius: 3px;
		background: hsl(214 28% 95%);
		color: hsl(215 16% 30%);
		text-transform: lowercase;
	}
	.tag-ueb { background: hsl(142 45% 95%); color: hsl(142 64% 28%); }
	.tag-act { background: hsl(217 70% 95%); color: hsl(217 80% 32%); }
	.tag-sil { background: hsl(214 28% 95%); color: hsl(215 16% 50%); }
</style>
