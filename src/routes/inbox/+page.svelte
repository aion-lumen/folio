<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { InboxScanItem } from '$lib/server/inbox/types.js';

	let { data } = $props();
	let busy = $state(false);
	let message = $state<string | null>(null);
	let error = $state<string | null>(null);

	const validItems = $derived(data.scan.items.filter((i: InboxScanItem) => i.status === 'valid'));

	async function commitAll() {
		busy = true;
		message = null;
		error = null;
		try {
			const res = await fetch('/api/inbox/commit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ allValid: true })
			});
			const payload = await res.json();
			if (!res.ok) throw new Error(payload?.message ?? `HTTP ${res.status}`);
			message = `Importiert: ${payload.committed}, übersprungen: ${payload.skipped}`;
			await invalidateAll();
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>Folio · Inbox</title>
</svelte:head>

<div class="page">
	<header>
		<h1>Import-Inbox</h1>
		<p class="sub">Staging für Folio Interchange Format v1 — Commit nur nach Bestätigung.</p>
	</header>

	<section class="summary">
		<div class="stat"><span class="n">{data.scan.valid}</span> bereit</div>
		<div class="stat"><span class="n">{data.scan.duplicate}</span> Duplikat</div>
		<div class="stat"><span class="n">{data.scan.invalid}</span> abgewiesen</div>
	</section>

	{#if message}<p class="msg ok">{message}</p>{/if}
	{#if error}<p class="msg err">{error}</p>{/if}

	{#if validItems.length > 0}
		<button class="commit" type="button" disabled={busy} onclick={commitAll}>
			{busy ? 'Importiere…' : `${validItems.length} Dokument(e) importieren`}
		</button>
	{/if}

	<ul class="list">
		{#each data.scan.items as item}
			<li class="item {item.status}">
				<div class="row">
					<span class="badge">{item.status}</span>
					<strong>{item.title ?? item.filename}</strong>
				</div>
				<div class="meta">
					{#if item.type}<span>{item.type}</span>{/if}
					{#if item.target}<span>→ {item.target}</span>{/if}
					{#if item.id}<span>id:{item.id}</span>{/if}
				</div>
				{#if item.error}<p class="err-line">{item.error}</p>{/if}
			</li>
		{/each}
	</ul>

	{#if data.scan.items.length === 0}
		<p class="empty">Keine Dateien in ~/.folio/inbox/. Lege eine .md-Datei gemäss FOLIO-IMPORT.md ab.</p>
	{/if}
</div>

<style>
	.page { max-width: 720px; margin: 0 auto; padding: 48px 32px; }
	header { margin-bottom: 24px; }
	h1 { margin: 0 0 8px; font-size: 28px; }
	.sub { margin: 0; color: var(--color-muted-foreground); font-size: 14px; }
	.summary { display: flex; gap: 16px; margin-bottom: 20px; }
	.stat { font-size: 13px; color: var(--color-muted-foreground); }
	.n { font-size: 20px; font-weight: 600; color: var(--color-foreground); display: block; }
	.commit {
		margin-bottom: 20px; padding: 10px 16px; border-radius: 8px;
		background: var(--color-foreground); color: var(--color-background);
		border: none; cursor: pointer; font-weight: 600;
	}
	.commit:disabled { opacity: 0.6; cursor: wait; }
	.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
	.item {
		padding: 14px 16px; border: 1px solid var(--color-border);
		border-radius: 10px; background: var(--color-card);
	}
	.item.valid { border-left: 3px solid hsl(142 60% 40%); }
	.item.duplicate { border-left: 3px solid hsl(38 80% 50%); }
	.item.invalid { border-left: 3px solid hsl(0 60% 50%); opacity: 0.85; }
	.row { display: flex; align-items: center; gap: 8px; margin-bottom: 6px; }
	.badge {
		font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em;
		padding: 2px 6px; border-radius: 4px; background: var(--color-muted);
	}
	.meta { font-size: 12px; font-family: var(--font-mono); color: var(--color-muted-foreground); display: flex; gap: 12px; flex-wrap: wrap; }
	.err-line { margin: 8px 0 0; font-size: 12px; color: hsl(0 60% 45%); }
	.msg { padding: 10px 12px; border-radius: 8px; font-size: 13px; }
	.msg.ok { background: hsl(142 40% 92%); color: hsl(142 40% 25%); }
	.msg.err { background: hsl(0 40% 92%); color: hsl(0 50% 30%); }
	.empty { color: var(--color-muted-foreground); font-size: 14px; }
</style>
