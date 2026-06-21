<!--
  Mobile 1c (2026-05-30): aktive Inserat-Link-Eingabe.
  POST → /api/council/ingest validiert URL + portal-whitelist, schreibt
  pending_ingest. Nach Erfolg: invalidateAll() → Pipeline-Loader liest
  die neue pending-Zeile, Polling im Page checkt processed_at.
-->
<script lang="ts">
	import { invalidateAll } from '$app/navigation';

	let url = $state('');
	let pending = $state(false);
	let error = $state<string | null>(null);

	async function submit() {
		const u = url.trim();
		if (!u) return;
		pending = true;
		error = null;
		try {
			const res = await fetch('/api/council/ingest', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ url: u })
			});
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || `HTTP ${res.status}`);
			}
			url = '';
			await invalidateAll();
		} catch (e) {
			error = (e as Error).message;
		} finally {
			pending = false;
		}
	}

	function onKey(e: KeyboardEvent) {
		if (e.key === 'Enter' && !pending) {
			e.preventDefault();
			submit();
		}
	}
</script>

<div class="linkbox" aria-label="Inserat erfassen">
	<div class="h">＋ Inserat erfassen</div>
	<div class="field">
		<span class="ic" aria-hidden="true"></span>
		<input
			type="url"
			placeholder="Inserat-Link einfügen …"
			bind:value={url}
			onkeydown={onKey}
			disabled={pending}
		/>
		<button class="go" type="button" onclick={submit} disabled={pending || !url.trim()}>
			{pending ? '…' : 'Bewerten'}
		</button>
	</div>
	{#if error}
		<div class="err">{error}</div>
	{/if}
</div>

<style>
	.linkbox {
		margin-top: 14px;
		padding: 12px 13px;
		background: hsl(222 47% 11%);
		border-radius: 8px;
		color: white;
	}
	.h {
		font-family: var(--font-mono);
		font-size: 9.5px;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: hsl(210 30% 72%);
		margin-bottom: 8px;
	}
	.field {
		display: flex;
		align-items: center;
		gap: 8px;
		background: white;
		border-radius: 6px;
		padding: 6px 10px;
	}
	.ic {
		width: 14px;
		height: 14px;
		border-radius: 3px;
		background: var(--wf-fill-strong, hsl(214 24% 88%));
		flex-shrink: 0;
	}
	input {
		flex: 1;
		min-width: 0;
		border: 0;
		background: transparent;
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: var(--wf-fg, hsl(222 30% 22%));
		outline: none;
	}
	input::placeholder {
		color: var(--wf-muted, hsl(215 16% 50%));
	}
	input:disabled {
		opacity: 0.55;
	}
	.go {
		background: var(--color-lumen-warm, hsl(22 95% 52%));
		color: white;
		font-size: 11px;
		font-weight: 500;
		padding: 4px 10px;
		border-radius: 4px;
		border: 0;
		white-space: nowrap;
		cursor: pointer;
	}
	.go:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
	.err {
		margin-top: 8px;
		font-family: var(--font-mono);
		font-size: 10.5px;
		color: hsl(0 70% 80%);
		background: hsl(0 50% 25%);
		padding: 6px 8px;
		border-radius: 4px;
	}
</style>
