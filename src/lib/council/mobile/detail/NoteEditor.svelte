<!--
  Mobile 1d (2026-05-30): Notiz-Editor mit debounced-save (1.5s) und
  expliziter Save-Action. Empty-Text als User-Cleared (Bauteil 0.6).
  Tailscale-Latenz: kein POST pro Tastendruck.
-->
<script lang="ts">
	let {
		objectId,
		initial
	}: {
		objectId: string;
		initial: string | null;
	} = $props();

	let text = $state(initial ?? '');
	let lastSaved = $state(initial ?? '');
	let pending = $state(false);
	let error = $state<string | null>(null);
	let timer: ReturnType<typeof setTimeout> | null = null;

	const dirty = $derived(text !== lastSaved);

	async function persist() {
		if (!dirty || pending) return;
		const value = text;
		pending = true;
		error = null;
		try {
			const res = await fetch(`/api/council/${objectId}/note`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ note_text: value })
			});
			if (!res.ok) {
				const t = await res.text();
				throw new Error(t || `HTTP ${res.status}`);
			}
			lastSaved = value;
		} catch (e) {
			error = (e as Error).message;
		} finally {
			pending = false;
		}
	}

	function scheduleSave() {
		if (timer) clearTimeout(timer);
		timer = setTimeout(persist, 1500);
	}

	function saveNow() {
		if (timer) {
			clearTimeout(timer);
			timer = null;
		}
		persist();
	}

	function onInput() {
		error = null;
		scheduleSave();
	}
</script>

<div class="editor">
	<textarea
		bind:value={text}
		placeholder="Notiz schreiben …"
		oninput={onInput}
		rows="3"
		aria-label="Persönliche Notiz"
	></textarea>
	<div class="row">
		<span class="state" class:dirty class:saving={pending}>
			{#if pending}Speichert…{:else if dirty}ungespeichert{:else if text}gespeichert{:else}—{/if}
		</span>
		<button type="button" onclick={saveNow} disabled={!dirty || pending}>Speichern</button>
	</div>
	{#if error}
		<div class="err">{error} — Eingabe bleibt erhalten.</div>
	{/if}
</div>

<style>
	.editor {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 8px 10px;
		font-family: inherit;
		font-size: 13px;
		line-height: 1.4;
		border: 1px solid var(--wf-line, hsl(214 20% 88%));
		border-radius: 6px;
		background: white;
		color: var(--wf-fg, hsl(222 30% 22%));
		resize: vertical;
		min-height: 60px;
		outline: none;
	}
	textarea:focus {
		border-color: var(--wf-line-strong, hsl(214 25% 78%));
	}
	.row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}
	.state {
		font-family: var(--font-mono);
		font-size: 10px;
		color: var(--wf-muted, hsl(215 16% 50%));
	}
	.state.dirty {
		color: var(--ember-fg, hsl(28 80% 38%));
		animation: pulse 1.5s ease-in-out infinite;
	}
	.state.saving {
		color: var(--st-termin-fg, hsl(217 70% 38%));
		animation: none;
	}
	@keyframes pulse {
		0%, 100% { opacity: 1; }
		50% { opacity: 0.5; }
	}
	button {
		padding: 5px 12px;
		border: 1px solid var(--wf-line, hsl(214 20% 88%));
		border-radius: 4px;
		background: var(--wf-bg, hsl(210 25% 98.5%));
		color: var(--wf-fg, hsl(222 30% 22%));
		font-size: 11.5px;
		font-weight: 500;
		cursor: pointer;
		font-family: inherit;
	}
	button:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.err {
		font-size: 11px;
		color: var(--verdict-verwerfen-fg, hsl(0 65% 38%));
	}
</style>
