<!--
  Mobile 1a (2026-05-30): single entry in the Verlauf-Feed. Glyph + when in
  the gutter, body on the right. Glyph kind drives color.
-->
<script lang="ts">
	let {
		when,
		glyph,
		kind = 'neutral',
		showTail = true,
		children
	}: {
		when: string;
		glyph: string;
		kind?: 'neutral' | 'ember' | 'self' | 'partner' | 'workflow';
		showTail?: boolean;
		children: import('svelte').Snippet;
	} = $props();
</script>

<div class="entry">
	<div class="gutter">
		<span class="when">{when}</span>
		<span class="glyph {kind}">{glyph}</span>
		{#if showTail}
			<span class="tail"></span>
		{/if}
	</div>
	<div class="body">
		{@render children()}
	</div>
</div>

<style>
	.entry {
		display: grid;
		grid-template-columns: 44px 1fr;
		gap: 10px;
		margin-bottom: 14px;
	}
	.gutter {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
	}
	.when {
		font-family: var(--font-mono);
		font-size: var(--text-xs, 10.5px);
		color: var(--wf-muted, hsl(215 16% 50%));
	}
	.glyph {
		width: 26px;
		height: 26px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-mono);
		font-size: var(--text-md, 15px);
		font-weight: var(--font-weight-medium, 500);
		background: var(--wf-fill, hsl(214 24% 94%));
		color: var(--wf-fg, hsl(222 30% 22%));
	}
	.glyph.ember {
		background: var(--ember-bg, hsl(28 95% 94%));
		color: var(--ember-fg, hsl(28 80% 38%));
		box-shadow: inset 0 0 0 1px var(--ember-border, hsl(28 80% 80%));
	}
	.glyph.partner {
		background: hsl(220 35% 90%);
		color: hsl(222 47% 28%);
	}
	.glyph.self {
		background: hsl(214 24% 94%);
		color: hsl(222 30% 22%);
		box-shadow: inset 0 0 0 1px hsl(214 20% 85%);
	}
	.glyph.workflow {
		background: var(--st-termin-bg, hsl(214 80% 96%));
		color: var(--st-termin-fg, hsl(217 70% 38%));
	}
	.tail {
		flex: 1;
		min-height: 8px;
		width: 1px;
		background: var(--wf-line, hsl(214 20% 88%));
	}
	.body {
		font-size: var(--text-base, 14px);
		line-height: 1.45;
		color: var(--wf-fg, hsl(222 30% 22%));
	}
	.body :global(b) {
		font-weight: 600;
	}
	.body :global(em) {
		font-style: normal;
		background: hsl(28 95% 95%);
		padding: 0 4px;
		border-radius: 3px;
		color: var(--ember-fg, hsl(28 80% 38%));
		font-weight: 500;
	}
</style>
