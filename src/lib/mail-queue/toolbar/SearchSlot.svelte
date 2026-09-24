<script lang="ts">
	import { page } from '$app/state';
	let { compact = false }: { compact?: boolean } = $props();
	let query = $state(page.url.searchParams.get('q') ?? '');
</script>

<form method="GET" action="/mail-queue" class="search" class:compact aria-label="Importierte Mails durchsuchen">
	<input name="q" bind:value={query} maxlength="200" placeholder="Mail suchen …" aria-label="Suchbegriff" />
	<button type="submit" title="Importierte Mails durchsuchen" aria-label="Suchen">
		<svg class="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">
			<circle cx="7" cy="7" r="5" />
			<path d="M11 11 l3 3" stroke-linecap="round" />
		</svg>
		{#if !compact}<span>Suchen</span>{/if}
	</button>
	{#if page.url.searchParams.get('q')}<a href="/mail-queue" aria-label="Suche löschen">×</a>{/if}
</form>

<style>
	.search{display:flex;align-items:center;gap:5px}.search input{width:190px;min-height:32px;padding:5px 8px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-card);color:var(--color-foreground);font:inherit;font-size:12px}.search.compact input{width:130px}.search button{display:flex;align-items:center;gap:6px;min-height:32px;padding:5px 8px;border:1px solid var(--color-border);border-radius:6px;background:var(--color-card);color:var(--color-muted-foreground);cursor:pointer}.search a{padding:4px;color:var(--color-muted-foreground);text-decoration:none}@media(max-width:640px){.search input,.search.compact input{width:120px}}
</style>
