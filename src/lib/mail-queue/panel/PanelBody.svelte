<!--
  Panel-C Werkstatt §1.4: Mail-Inhalt-Sektion, letzter Block.
  Sektions-Header (Mono caps: „MAIL-INHALT · ERSTE 1000 Z.") + body.
  Links bleiben Links, sonst keine Dekoration.
-->
<script lang="ts">
	let { body }: { body: string | null | undefined } = $props();

	// auto-linkify simple http(s) URLs
	function linkify(text: string): string {
		const escaped = text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;');
		return escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
	}
</script>

<section class="panel-body">
	<header class="body-head">
		<span class="head-label">Mail-Inhalt</span>
		<span class="head-tag">erste 1000 Z.</span>
	</header>
	<div class="body-text">
		{#if body}
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			{@html linkify(body)}
		{:else}
			<p class="muted">Kein Body-Excerpt verfügbar (pre-I2-Mail oder Worker-Skip).</p>
		{/if}
	</div>
</section>

<style>
	.panel-body {
		border-top: 1px solid var(--color-border);
	}
	.body-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		padding: 9px 16px 8px;
		background: hsl(210 25% 96%);
		border-bottom: 1px dashed var(--color-border);
	}
	.head-label {
		font-family: var(--font-mono);
		font-size: 10.5px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: var(--color-muted-foreground);
		font-weight: 500;
	}
	.head-tag {
		font-family: var(--font-mono);
		font-size: 9.5px;
		color: var(--color-muted-foreground);
	}
	.body-text {
		padding: 12px 16px 16px;
		font-size: 13px;
		line-height: 1.6;
		color: var(--color-foreground);
		white-space: pre-wrap;
		word-break: break-word;
	}
	.body-text :global(a) {
		color: var(--color-foreground);
		text-decoration: underline;
		text-decoration-color: var(--color-border);
	}
	.body-text :global(a:hover) {
		text-decoration-color: var(--color-foreground);
	}
	.muted {
		color: var(--color-muted-foreground);
		font-style: italic;
	}
</style>
