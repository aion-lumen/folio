<script lang="ts">
	import { chatStore } from '$lib/stores/chat.svelte.js';
	import { tick } from 'svelte';
	import { marked } from 'marked';

	marked.setOptions({ breaks: true });

	function renderMarkdown(text: string): string {
		return marked.parse(text) as string;
	}

	function formatArgs(args: Record<string, unknown>): string {
		const str = JSON.stringify(args);
		return str.length > 80 ? str.slice(0, 77) + '...' : str;
	}

	let scrollEl = $state<HTMLDivElement>();

	$effect(() => {
		chatStore.messages;
		tick().then(() => {
			if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
		});
	});
</script>

<div bind:this={scrollEl} class="h-full overflow-y-auto p-3 space-y-3">
	{#if chatStore.messages.length === 0}
		<p class="text-xs text-center text-muted-foreground pt-8">
			Hermes ist bereit. Stell eine Frage.
		</p>
	{/if}
	{#each chatStore.messages as msg (msg.id)}
		<div class="flex {msg.role === 'user' ? 'justify-end' : 'justify-start'}">
			<div class="max-w-[85%] space-y-1">
				{#each msg.events as event}
					{#if event.type === 'text'}
						<div
							class="rounded-lg px-3 py-2 text-sm
								{msg.role === 'user'
								? 'bg-primary text-primary-foreground'
								: 'bg-muted text-foreground'}"
						>
							{#if msg.role === 'user'}
								{event.content}
							{:else}
								<div class="markdown">{@html renderMarkdown(event.content ?? '')}</div>
							{/if}
						</div>
					{:else if event.type === 'tool_call'}
						<div class="rounded-md border border-border bg-background/50 px-2 py-1 text-xs text-muted-foreground font-mono">
							🔧 {event.name}({formatArgs(event.args ?? {})})
						</div>
					{:else if event.type === 'tool_result'}
						<details class="rounded-md border border-border bg-background/50 text-xs">
							<summary class="cursor-pointer px-2 py-1 text-muted-foreground select-none">
								📋 {event.name} — Ergebnis
							</summary>
							<pre class="px-2 pb-2 text-xs overflow-x-auto text-foreground/70 whitespace-pre-wrap">{event.output}</pre>
						</details>
					{:else if event.type === 'error'}
						<div class="rounded-lg px-3 py-2 text-sm bg-destructive/10 text-destructive border border-destructive/20">
							⚠ {event.content}
						</div>
					{/if}
				{/each}
				{#if msg.streaming}
					<div class="px-3 py-2">
						<span class="inline-flex gap-1">
							<span class="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style="animation-delay:0ms"></span>
							<span class="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style="animation-delay:150ms"></span>
							<span class="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" style="animation-delay:300ms"></span>
						</span>
					</div>
				{/if}
			</div>
		</div>
	{/each}
</div>

<style>
	.markdown :global(p) { margin: 0 0 0.5em; }
	.markdown :global(p:last-child) { margin-bottom: 0; }
	.markdown :global(strong) { font-weight: 600; }
	.markdown :global(em) { font-style: italic; }
	.markdown :global(code) {
		font-family: monospace;
		font-size: 0.85em;
		background: hsl(0 0% 0% / 0.15);
		padding: 0.1em 0.3em;
		border-radius: 3px;
	}
	.markdown :global(pre) {
		background: hsl(0 0% 0% / 0.2);
		padding: 0.6em 0.8em;
		border-radius: 6px;
		overflow-x: auto;
		margin: 0.4em 0;
	}
	.markdown :global(pre code) { background: none; padding: 0; }
	.markdown :global(ul), .markdown :global(ol) {
		padding-left: 1.25em;
		margin: 0.25em 0;
	}
	.markdown :global(li) { margin: 0.15em 0; }
	.markdown :global(h1), .markdown :global(h2), .markdown :global(h3) {
		font-weight: 600;
		margin: 0.5em 0 0.25em;
	}
	.markdown :global(h1) { font-size: 1.1em; }
	.markdown :global(h2) { font-size: 1.05em; }
	.markdown :global(h3) { font-size: 1em; }
	.markdown :global(hr) { border-color: currentColor; opacity: 0.2; margin: 0.5em 0; }
</style>
